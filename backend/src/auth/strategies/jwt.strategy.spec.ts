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
      passwordHash: 'hash',
    });
    const strategy = new JwtStrategy(configService as any, usersService as any);

    await expect(strategy.validate({ sub: 'u1' })).resolves.toEqual({
      id: 'u1',
      email: 'user@test.dev',
      role: 'admin',
    });
  });

  it('throws unauthorized when user does not exist', async () => {
    configService.get.mockReturnValue(undefined);
    usersService.findOneById.mockResolvedValue(null);
    const strategy = new JwtStrategy(configService as any, usersService as any);

    await expect(strategy.validate({ sub: 'missing' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
