import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  HttpCode,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from '../common/decorators/public.decorator';
import { CaptchaService } from './services/captcha.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly captchaService: CaptchaService,
  ) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    const ipAddress = this.getRequestIp(req);
    const requiresCaptcha = this.authService.requiresCaptchaForLogin(
      loginDto.email,
      ipAddress,
    );

    await this.captchaService.assertValidToken(
      loginDto.captchaToken,
      ipAddress,
      requiresCaptcha,
    );

    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) {
      this.authService.registerFailedLogin(loginDto.email, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.authService.clearLoginFailures(loginDto.email, ipAddress);
    return this.authService.login(user);
  }

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Req() req: any) {
    const ipAddress = this.getRequestIp(req);
    await this.captchaService.assertValidToken(
      registerDto.captchaToken,
      ipAddress,
      true,
    );
    return this.authService.register(registerDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  getProfile(@Request() req: any) {
    return req.user;
  }

  private getRequestIp(req: any): string | undefined {
    const forwardedFor = req?.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() || undefined;
    }
    return req?.ip;
  }
}
