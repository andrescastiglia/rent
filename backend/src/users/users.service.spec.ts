import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  genSalt: jest.fn(),
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  const mockUsersRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
    mockedBcrypt.genSalt.mockResolvedValue('salt' as never);
    mockedBcrypt.hash.mockResolvedValue('hashed' as never);
    mockedBcrypt.compare.mockResolvedValue(true as never);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a user normalizing email and hashing password', async () => {
    const dto = {
      email: '  TEST@Mail.com ',
      password: 'Secret123',
      firstName: 'John',
      lastName: 'Doe',
      role: 'admin',
    } as any;
    mockUsersRepository.create.mockReturnValue({ id: 'u1' });
    mockUsersRepository.save.mockResolvedValue({ id: 'u1' });

    const result = await service.create(dto);

    expect(mockedBcrypt.genSalt).toHaveBeenCalled();
    expect(mockedBcrypt.hash).toHaveBeenCalledWith('Secret123', 'salt');
    expect(mockUsersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@mail.com',
        passwordHash: 'hashed',
      }),
    );
    expect(result).toEqual({ id: 'u1' });
  });

  it('findAll returns paginated response', async () => {
    const users = [{ id: 'u1' }] as any;
    mockUsersRepository.findAndCount.mockResolvedValue([users, 1]);

    const result = await service.findAll(2, 5);

    expect(mockUsersRepository.findAndCount).toHaveBeenCalledWith({
      skip: 5,
      take: 5,
      order: { createdAt: 'DESC' },
    });
    expect(result).toEqual({ data: users, total: 1, page: 2, limit: 5 });
  });

  it('findOneByEmail and findOneById delegate to repository', async () => {
    mockUsersRepository.findOne.mockResolvedValueOnce({ id: 'u1' });
    mockUsersRepository.findOne.mockResolvedValueOnce({ id: 'u2' });

    await expect(service.findOneByEmail('e@x.com')).resolves.toEqual({
      id: 'u1',
    });
    await expect(service.findOneById('u2')).resolves.toEqual({ id: 'u2' });
    expect(mockUsersRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { email: 'e@x.com' },
    });
    expect(mockUsersRepository.findOne).toHaveBeenNthCalledWith(2, {
      where: { id: 'u2' },
    });
  });

  it('update throws when user does not exist', async () => {
    mockUsersRepository.findOne.mockResolvedValue(null);
    await expect(service.update('missing', {} as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update applies normalized fields and saves', async () => {
    const user = { id: 'u1', email: 'old@mail.com' } as any;
    mockUsersRepository.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(null);
    mockUsersRepository.save.mockResolvedValue(user);

    const result = await service.update('u1', {
      email: ' NEW@MAIL.COM ',
      firstName: ' Ana ',
      lastName: ' Perez ',
      phone: ' 123 ',
      avatarUrl: '  ',
      language: 'es',
    } as any);

    expect(result).toBe(user);
    expect(user.email).toBe('new@mail.com');
    expect(user.firstName).toBe('Ana');
    expect(user.lastName).toBe('Perez');
    expect(user.phone).toBe('123');
    expect(user.avatarUrl).toBeNull();
    expect(user.language).toBe('es');
  });

  it('update throws conflict when target email belongs to another user', async () => {
    const user = { id: 'u1', email: 'old@mail.com' } as any;
    mockUsersRepository.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ id: 'u2', email: 'used@mail.com' });

    await expect(
      service.update('u1', { email: 'used@mail.com' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updateProfile reuses update', async () => {
    const spy = jest
      .spyOn(service, 'update')
      .mockResolvedValue({ id: 'u1' } as any);
    const result = await service.updateProfile('u1', { firstName: 'A' } as any);
    expect(spy).toHaveBeenCalledWith('u1', { firstName: 'A' });
    expect(result).toEqual({ id: 'u1' });
  });

  it('remove throws when user does not exist', async () => {
    mockUsersRepository.findOne.mockResolvedValue(null);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('remove performs softDelete for existing user', async () => {
    mockUsersRepository.findOne.mockResolvedValue({ id: 'u1' });
    await service.remove('u1');
    expect(mockUsersRepository.softDelete).toHaveBeenCalledWith('u1');
  });

  it('changePassword throws when user is missing', async () => {
    mockUsersRepository.findOne.mockResolvedValue(null);
    await expect(
      service.changePassword('u1', 'old', 'new'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('changePassword throws when current password is wrong', async () => {
    mockUsersRepository.findOne.mockResolvedValue({
      id: 'u1',
      passwordHash: 'x',
    });
    mockedBcrypt.compare.mockResolvedValue(false as never);
    await expect(
      service.changePassword('u1', 'old', 'new'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('changePassword hashes and saves when current password is valid', async () => {
    const user = { id: 'u1', passwordHash: 'x' } as any;
    mockUsersRepository.findOne.mockResolvedValue(user);
    await service.changePassword('u1', 'old', 'new-pass');
    expect(mockedBcrypt.hash).toHaveBeenCalledWith('new-pass', 'salt');
    expect(user.passwordHash).toBe('hashed');
    expect(mockUsersRepository.save).toHaveBeenCalledWith(user);
  });

  it('setActivation throws on missing user and saves when found', async () => {
    mockUsersRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.setActivation('x', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const user = { id: 'u1', isActive: false } as any;
    mockUsersRepository.findOne.mockResolvedValueOnce(user);
    mockUsersRepository.save.mockResolvedValue(user);
    const result = await service.setActivation('u1', true);
    expect(result.isActive).toBe(true);
  });

  it('resetPassword throws on missing user', async () => {
    mockUsersRepository.findOne.mockResolvedValue(null);
    await expect(service.resetPassword('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resetPassword uses provided password when valid length', async () => {
    const user = { id: 'u1' } as any;
    mockUsersRepository.findOne.mockResolvedValue(user);
    const result = await service.resetPassword('u1', '  provided123  ');
    expect(mockedBcrypt.hash).toHaveBeenCalledWith('provided123', 'salt');
    expect(result.temporaryPassword).toBe('provided123');
  });

  it('resetPassword generates random temporary password when not provided', async () => {
    const user = { id: 'u2' } as any;
    mockUsersRepository.findOne.mockResolvedValue(user);
    const result = await service.resetPassword('u2', ' short ');
    expect(result.temporaryPassword).toHaveLength(16);
    expect(mockUsersRepository.save).toHaveBeenCalledWith(user);
  });
});
