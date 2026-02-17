import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly loginFailures = new Map<
    string,
    { count: number; lastFailedAt: number }
  >();
  private readonly loginFailuresTtlMs =
    (Number.parseInt(process.env.LOGIN_CAPTCHA_WINDOW_MINUTES ?? '60', 10) ||
      60) *
    60 *
    1000;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (user && (await bcrypt.compare(pass, user.passwordHash))) {
      if (!user.isActive) {
        throw new UnauthorizedException('user.blocked');
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      companyId: user.companyId,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        language: user.language,
        isActive: user.isActive,
        companyId: user.companyId,
      },
    };
  }

  requiresCaptchaForLogin(email: string, ipAddress?: string): boolean {
    const key = this.buildLoginAttemptKey(email, ipAddress);
    const current = this.loginFailures.get(key);
    if (!current) {
      return false;
    }

    if (Date.now() - current.lastFailedAt > this.loginFailuresTtlMs) {
      this.loginFailures.delete(key);
      return false;
    }

    return current.count >= 1;
  }

  registerFailedLogin(email: string, ipAddress?: string): void {
    const key = this.buildLoginAttemptKey(email, ipAddress);
    const current = this.loginFailures.get(key);
    const nextCount = current ? current.count + 1 : 1;
    this.loginFailures.set(key, { count: nextCount, lastFailedAt: Date.now() });
  }

  clearLoginFailures(email: string, ipAddress?: string): void {
    const key = this.buildLoginAttemptKey(email, ipAddress);
    this.loginFailures.delete(key);
  }

  private buildLoginAttemptKey(email: string, ipAddress?: string): string {
    return `${email.trim().toLowerCase()}|${(ipAddress ?? 'unknown').trim()}`;
  }

  async register(userData: any) {
    // Captcha token is validated in controller and should not be persisted.

    const { captchaToken: _captchaToken, ...safeUserData } = userData;

    if (
      safeUserData.role &&
      ![UserRole.OWNER, UserRole.TENANT].includes(safeUserData.role)
    ) {
      throw new BadRequestException('Only owner or tenant roles are allowed');
    }

    const existingUser = await this.usersService.findOneByEmail(
      safeUserData.email,
    );
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const newUser = await this.usersService.create({
      ...safeUserData,
      role: safeUserData.role ?? UserRole.TENANT,
      isActive: false,
    });

    return {
      pendingApproval: true,
      userId: newUser.id,
      message: 'registration.pendingApproval',
    };
  }
}
