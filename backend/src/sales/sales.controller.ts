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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SalesService } from './sales.service';
import { CreateSaleFolderDto } from './dto/create-sale-folder.dto';
import { CreateSaleAgreementDto } from './dto/create-sale-agreement.dto';
import { CreateSaleReceiptDto } from './dto/create-sale-receipt.dto';
import { SaleAgreementsQueryDto } from './dto/sale-agreements-query.dto';
import { DocumentsService } from '../documents/documents.service';

interface AuthenticatedRequest {
  user: {
    companyId?: string;
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
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  createFolder(
    @Body() dto: CreateSaleFolderDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.salesService.createFolder(dto, req.user);
  }

  @Get('folders')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  listFolders(@Request() req: AuthenticatedRequest) {
    return this.salesService.listFolders(req.user);
  }

  @Post('agreements')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  createAgreement(
    @Body() dto: CreateSaleAgreementDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.salesService.createAgreement(dto, req.user);
  }

  @Get('agreements')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  listAgreements(
    @Query() query: SaleAgreementsQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.salesService.listAgreements(req.user, query.folderId);
  }

  @Get('agreements/:id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  getAgreement(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.salesService.getAgreement(id, req.user);
  }

  @Get('agreements/:id/receipts')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  listReceipts(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.salesService.listReceipts(id, req.user);
  }

  @Post('agreements/:id/receipts')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  createReceipt(
    @Param('id') id: string,
    @Body() dto: CreateSaleReceiptDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.salesService.createReceipt(id, dto, req.user);
  }

  @Get('receipts/:receiptId/pdf')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  async downloadReceipt(
    @Param('receiptId') receiptId: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const receipt = await this.salesService.getReceipt(receiptId, req.user);

    if (!receipt.pdfUrl) {
      return res.status(404).json({ message: 'Receipt PDF not found' });
    }

    const { buffer, contentType } = await this.documentsService.downloadByS3Key(
      receipt.pdfUrl,
    );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="recibo-venta-${receipt.receiptNumber}.pdf"`,
    });

    return res.send(buffer);
  }
}
