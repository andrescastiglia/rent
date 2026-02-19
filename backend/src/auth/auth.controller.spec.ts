import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './services/captcha.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    validateUser: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    requiresCaptchaForLogin: jest.fn(),
    registerFailedLogin: jest.fn(),
    clearLoginFailures: jest.fn(),
  };

  const mockCaptchaService = {
    assertValidToken: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: CaptchaService,
          useValue: mockCaptchaService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('login success: validates captcha, user and returns token payload', async () => {
    const req = {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
      ip: '9.9.9.9',
    };
    const dto = {
      email: 'a@test.dev',
      password: 'secret',
      captchaToken: 'token-1',
    };
    mockAuthService.requiresCaptchaForLogin.mockReturnValue(true);
    mockCaptchaService.assertValidToken.mockResolvedValue(undefined);
    mockAuthService.validateUser.mockResolvedValue({ id: 'u1' });
    mockAuthService.login.mockResolvedValue({ access_token: 'jwt' });

    const result = await controller.login(dto as any, req as any);

    expect(mockAuthService.requiresCaptchaForLogin).toHaveBeenCalledWith(
      'a@test.dev',
      '1.1.1.1',
    );
    expect(mockCaptchaService.assertValidToken).toHaveBeenCalledWith(
      'token-1',
      '1.1.1.1',
      true,
    );
    expect(mockAuthService.clearLoginFailures).toHaveBeenCalledWith(
      'a@test.dev',
      '1.1.1.1',
    );
    expect(result).toEqual({ access_token: 'jwt' });
  });

  it('login failure: registers failed login and throws UnauthorizedException', async () => {
    const req = { ip: '8.8.8.8' };
    mockAuthService.requiresCaptchaForLogin.mockReturnValue(false);
    mockCaptchaService.assertValidToken.mockResolvedValue(undefined);
    mockAuthService.validateUser.mockResolvedValue(null);

    await expect(
      controller.login(
        {
          email: 'nope@test.dev',
          password: 'bad',
          captchaToken: 'token-2',
        } as any,
        req as any,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockAuthService.registerFailedLogin).toHaveBeenCalledWith(
      'nope@test.dev',
      '8.8.8.8',
    );
    expect(mockAuthService.clearLoginFailures).not.toHaveBeenCalled();
  });

  it('register validates captcha with required=true and delegates to service', async () => {
    mockCaptchaService.assertValidToken.mockResolvedValue(undefined);
    mockAuthService.register.mockResolvedValue({ id: 'new-user' });

    const result = await controller.register(
      {
        email: 'new@test.dev',
        password: 'pw',
        captchaToken: 'captcha-register',
      } as any,
      { headers: { 'x-forwarded-for': '7.7.7.7' } } as any,
    );

    expect(mockCaptchaService.assertValidToken).toHaveBeenCalledWith(
      'captcha-register',
      '7.7.7.7',
      true,
    );
    expect(mockAuthService.register).toHaveBeenCalled();
    expect(result).toEqual({ id: 'new-user' });
  });

  it('getProfile returns request user', () => {
    expect(controller.getProfile({ user: { id: 'u1' } })).toEqual({ id: 'u1' });
  });

  it('getRequestIp helper handles forwarded header and fallbacks', () => {
    expect(
      (controller as any).getRequestIp({
        headers: { 'x-forwarded-for': '3.3.3.3, 4.4.4.4' },
      }),
    ).toBe('3.3.3.3');

    expect(
      (controller as any).getRequestIp({
        headers: { 'x-forwarded-for': '   ' },
        ip: '5.5.5.5',
      }),
    ).toBeUndefined();

    expect((controller as any).getRequestIp({ ip: '6.6.6.6' })).toBe('6.6.6.6');
  });
});
