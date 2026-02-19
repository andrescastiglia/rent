import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

  const mockUsersService = {
    findOneByEmail: jest.fn(),
    create: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('validateUser returns user without password hash for active valid credentials', async () => {
    mockUsersService.findOneByEmail.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      passwordHash: 'hash',
      isActive: true,
    });
    mockedBcrypt.compare.mockResolvedValue(true as never);

    const result = await service.validateUser('a@b.com', 'pass');

    expect(result).toEqual({
      id: 'u1',
      email: 'a@b.com',
      isActive: true,
    });
  });

  it('validateUser throws when user is blocked', async () => {
    mockUsersService.findOneByEmail.mockResolvedValue({
      id: 'u2',
      email: 'x@y.com',
      passwordHash: 'hash',
      isActive: false,
    });
    mockedBcrypt.compare.mockResolvedValue(true as never);

    await expect(
      service.validateUser('x@y.com', 'pass'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validateUser returns null on invalid credentials', async () => {
    mockUsersService.findOneByEmail.mockResolvedValue({
      id: 'u1',
      passwordHash: 'hash',
      isActive: true,
    });
    mockedBcrypt.compare.mockResolvedValue(false as never);
    await expect(service.validateUser('a@b.com', 'bad')).resolves.toBeNull();
  });

  it('login returns token and user payload', async () => {
    mockJwtService.sign.mockReturnValue('token-1');
    const user = {
      id: 'u1',
      email: 'a@b.com',
      role: UserRole.ADMIN,
      companyId: 'c1',
      firstName: 'A',
      lastName: 'B',
      phone: null,
      avatarUrl: null,
      language: 'es',
      isActive: true,
    };

    const result = await service.login(user);

    expect(mockJwtService.sign).toHaveBeenCalledWith({
      email: 'a@b.com',
      sub: 'u1',
      role: UserRole.ADMIN,
      companyId: 'c1',
    });
    expect(result.accessToken).toBe('token-1');
    expect(result.user.id).toBe('u1');
  });

  it('tracks failed login and clears entries', () => {
    expect(service.requiresCaptchaForLogin('a@b.com', '1.1.1.1')).toBe(false);
    service.registerFailedLogin('a@b.com', '1.1.1.1');
    expect(service.requiresCaptchaForLogin('a@b.com', '1.1.1.1')).toBe(true);
    service.clearLoginFailures('a@b.com', '1.1.1.1');
    expect(service.requiresCaptchaForLogin('a@b.com', '1.1.1.1')).toBe(false);
  });

  it('expires captcha requirement after ttl window', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(0);
    service.registerFailedLogin('ttl@test.dev', '2.2.2.2');
    nowSpy.mockReturnValue(61 * 60 * 1000);
    expect(service.requiresCaptchaForLogin('ttl@test.dev', '2.2.2.2')).toBe(
      false,
    );
    nowSpy.mockRestore();
  });

  it('register validates role restriction', async () => {
    await expect(
      service.register({ email: 'a@b.com', role: UserRole.ADMIN }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('register throws conflict when email already exists', async () => {
    mockUsersService.findOneByEmail.mockResolvedValue({ id: 'existing' });
    await expect(
      service.register({ email: 'a@b.com', role: UserRole.TENANT }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('register creates pending user with default tenant role', async () => {
    mockUsersService.findOneByEmail.mockResolvedValue(null);
    mockUsersService.create.mockResolvedValue({ id: 'new-user' });

    const result = await service.register({
      email: 'new@user.dev',
      password: 'Password123',
      firstName: 'New',
      lastName: 'User',
      captchaToken: 'captcha',
    });

    expect(mockUsersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@user.dev',
        role: UserRole.TENANT,
        isActive: false,
      }),
    );
    expect(result).toEqual({
      pendingApproval: true,
      userId: 'new-user',
      message: 'registration.pendingApproval',
    });
  });
});
