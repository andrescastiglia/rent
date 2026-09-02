import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    get: jest.fn(),
  };
  const usersService = {
    findOneById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates payload and strips passwordHash', async () => {
    configService.get.mockReturnValue('jwt-secret');
    usersService.findOneById.mockResolvedValue({
      id: 'u1',
      email: 'user@test.dev',
      role: 'admin',
      isActive: true,
      passwordHash: 'hash',
    });
    const strategy = new JwtStrategy(configService as any, usersService as any);

    await expect(strategy.validate({ sub: 'u1' })).resolves.toEqual({
      id: 'u1',
      email: 'user@test.dev',
      role: 'admin',
      isActive: true,
    });
  });

  it('throws unauthorized when user does not exist', async () => {
    configService.get.mockReturnValue('jwt-secret');
    usersService.findOneById.mockResolvedValue(null);
    const strategy = new JwtStrategy(configService as any, usersService as any);

    await expect(strategy.validate({ sub: 'missing' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws unauthorized when the user is inactive', async () => {
    configService.get.mockReturnValue('jwt-secret');
    usersService.findOneById.mockResolvedValue({ id: 'u1', isActive: false });
    const strategy = new JwtStrategy(configService as any, usersService as any);

    await expect(strategy.validate({ sub: 'u1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('fails startup when JWT_SECRET is missing', () => {
    configService.get.mockReturnValue(undefined);
    expect(
      () => new JwtStrategy(configService as any, usersService as any),
    ).toThrow('JWT_SECRET is required');
  });
});
