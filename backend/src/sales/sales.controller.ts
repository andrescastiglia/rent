import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
  Headers,
  Patch,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CancelSaleReceiptDto } from './dto/cancel-sale-receipt.dto';
import { SalesService } from './sales.service';
import { CreateSaleFolderDto } from './dto/create-sale-folder.dto';
import { CreateSaleAgreementDto } from './dto/create-sale-agreement.dto';
import { CreateSaleReceiptDto } from './dto/create-sale-receipt.dto';
import { SaleAgreementsQueryDto } from './dto/sale-agreements-query.dto';
import { DocumentsService } from '../documents/documents.service';

interface AuthenticatedRequest {
  user: {
    companyId?: string;
    id?: string;
    role?: UserRole;
    roles?: UserRole[];
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Post('folders')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  createFolder(
    @Body() dto: CreateSaleFolderDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.salesService.createFolder(dto, req.user, executionKey);
  }

  @Get('folders')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  listFolders(@Request() req: AuthenticatedRequest) {
    return this.salesService.listFolders(req.user);
  }

  @Post('agreements')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  createAgreement(
    @Body() dto: CreateSaleAgreementDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.salesService.createAgreement(dto, req.user, executionKey);
  }

  @Get('agreements')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.BUYER)
  listAgreements(
    @Query() query: SaleAgreementsQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.salesService.listAgreements(req.user, query.folderId);
  }

  @Get('agreements/page')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.BUYER)
  pageAgreements(
    @Query() query: SaleAgreementsQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.salesService.pageAgreements(req.user, query);
  }

  @Get('agreements/:id')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.BUYER)
  getAgreement(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.salesService.getAgreement(id, req.user);
  }

  @Get('agreements/:id/receipts')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.BUYER)
  listReceipts(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.salesService.listReceipts(id, req.user);
  }

  @Post('agreements/:id/receipts')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  createReceipt(
    @Param('id') id: string,
    @Body() dto: CreateSaleReceiptDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.salesService.createReceipt(id, dto, req.user, executionKey);
  }

  @Patch('receipts/:receiptId/cancel')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  cancelReceipt(
    @Param('receiptId') receiptId: string,
    @Body() dto: CancelSaleReceiptDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.salesService.cancelReceipt(
      receiptId,
      dto,
      req.user,
      executionKey,
    );
  }

  @Get('agreements/:id/schedule')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.BUYER)
  getSchedule(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('asOf') asOf?: string,
  ) {
    return this.salesService.getSchedule(id, req.user, page, limit, asOf);
  }

  @Get('receipts/:receiptId/pdf')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.BUYER)
  async downloadReceipt(
    @Param('receiptId') receiptId: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const receipt = await this.salesService.getReceipt(receiptId, req.user);

    if (!receipt.pdfUrl) {
      return res.status(404).json({ message: 'Receipt PDF not found' });
    }

    const { buffer, contentType } =
      await this.documentsService.downloadByFileUrl(receipt.pdfUrl, {
        companyId: req.user.companyId ?? '',
        entityType: 'sale_receipt',
        entityId: receipt.id,
      });

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="recibo-venta-${receipt.receiptNumber}.pdf"`,
    });

    return res.send(buffer);
  }
}
