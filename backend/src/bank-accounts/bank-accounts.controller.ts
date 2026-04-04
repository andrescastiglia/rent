import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
  };
}

@Controller('bank-accounts')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.bankAccountsService.findAll(
      req.user.companyId,
      req.user,
      ownerId,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.bankAccountsService.findOne(id, req.user.companyId);
  }

  @Post()
  async create(
    @Body() dto: CreateBankAccountDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.bankAccountsService.create(dto, req.user.companyId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankAccountDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.bankAccountsService.update(id, dto, req.user.companyId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.bankAccountsService.remove(id, req.user.companyId, req.user);
  }
}
