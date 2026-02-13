import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetUserActivationDto } from './dto/set-user-activation.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { I18n, I18nContext } from 'nestjs-i18n';

@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() createUserDto: CreateUserDto) {
    const created = await this.usersService.create(createUserDto);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = created;
    return safeUser;
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(@Query() query: UserListQueryDto) {
    const result = await this.usersService.findAll(query.page, query.limit);
    return {
      ...result,
      data: result.data.map((user) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash, ...safeUser } = user;
        return safeUser;
      }),
    };
  }

  @Get('profile/me')
  getProfile(@Request() req: any) {
    return req.user;
  }

  @Patch('profile/me')
  async updateProfile(
    @Request() req: any,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const updated = await this.usersService.updateProfile(
      req.user.id,
      updateUserDto,
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }

  @Post('profile/change-password')
  async changePassword(
    @Request() req: any,
    @Body() changePasswordDto: ChangePasswordDto,
    @I18n() i18n: I18nContext,
  ) {
    await this.usersService.changePassword(
      req.user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
    return { message: await i18n.t('user.passwordChanged') };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findOneById(id);
    if (!user) return user;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    const updated = await this.usersService.update(id, updateUserDto);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }

  @Patch(':id/activation')
  @Roles(UserRole.ADMIN)
  async setActivation(
    @Param('id') id: string,
    @Body() dto: SetUserActivationDto,
  ) {
    const updated = await this.usersService.setActivation(id, dto.isActive);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = updated;
    return safeUser;
  }

  @Post(':id/reset-password')
  @Roles(UserRole.ADMIN)
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @I18n() i18n: I18nContext,
  ) {
    const result = await this.usersService.resetPassword(id, dto.newPassword);
    return {
      message: await i18n.t('user.passwordChanged'),
      temporaryPassword: result.temporaryPassword,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string, @I18n() i18n: I18nContext) {
    await this.usersService.remove(id);
    return { message: await i18n.t('user.deleted') };
  }
}
