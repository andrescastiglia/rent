import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SaleFolder } from './entities/sale-folder.entity';
import { SaleAgreement } from './entities/sale-agreement.entity';
import { SaleReceipt } from './entities/sale-receipt.entity';
import { SaleReceiptPdfService } from './sale-receipt-pdf.service';
import { CreateSaleFolderDto } from './dto/create-sale-folder.dto';
import { CreateSaleAgreementDto } from './dto/create-sale-agreement.dto';
import { CreateSaleReceiptDto } from './dto/create-sale-receipt.dto';

interface UserContext {
  companyId?: string;
}

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SaleFolder)
    private foldersRepository: Repository<SaleFolder>,
    @InjectRepository(SaleAgreement)
    private agreementsRepository: Repository<SaleAgreement>,
    @InjectRepository(SaleReceipt)
    private receiptsRepository: Repository<SaleReceipt>,
    private readonly receiptPdfService: SaleReceiptPdfService,
  ) {}

  async createFolder(dto: CreateSaleFolderDto, user: UserContext) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    const folder = this.foldersRepository.create({
      companyId: user.companyId,
      name: dto.name,
      description: dto.description,
    });

    return this.foldersRepository.save(folder);
  }

  async listFolders(user: UserContext) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    return this.foldersRepository.find({
      where: { companyId: user.companyId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async createAgreement(dto: CreateSaleAgreementDto, user: UserContext) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    const folder = await this.foldersRepository.findOne({
      where: { id: dto.folderId, companyId: user.companyId, deletedAt: IsNull() },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    const agreement = this.agreementsRepository.create({
      companyId: user.companyId,
      folderId: dto.folderId,
      buyerName: dto.buyerName,
      buyerPhone: dto.buyerPhone,
      totalAmount: dto.totalAmount,
      currency: dto.currency || 'ARS',
      installmentAmount: dto.installmentAmount,
      installmentCount: dto.installmentCount,
      startDate: dto.startDate,
      dueDay: dto.dueDay ?? 10,
      notes: dto.notes,
    });

    return this.agreementsRepository.save(agreement);
  }

  async listAgreements(user: UserContext, folderId?: string) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    const query = this.agreementsRepository
      .createQueryBuilder('agreement')
      .leftJoinAndSelect('agreement.folder', 'folder')
      .where('agreement.company_id = :companyId', { companyId: user.companyId })
      .andWhere('agreement.deleted_at IS NULL');

    if (folderId) {
      query.andWhere('agreement.folder_id = :folderId', { folderId });
    }

    return query.orderBy('agreement.created_at', 'DESC').getMany();
  }

  async getAgreement(id: string, user: UserContext) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    const agreement = await this.agreementsRepository.findOne({
      where: { id, companyId: user.companyId, deletedAt: IsNull() },
      relations: ['folder', 'receipts'],
    });

    if (!agreement) {
      throw new NotFoundException('Agreement not found');
    }

    return agreement;
  }

  async listReceipts(agreementId: string, user: UserContext) {
    await this.getAgreement(agreementId, user);

    return this.receiptsRepository.find({
      where: { agreementId },
      order: { createdAt: 'DESC' },
    });
  }

  async createReceipt(
    agreementId: string,
    dto: CreateSaleReceiptDto,
    user: UserContext,
  ) {
    const agreement = await this.getAgreement(agreementId, user);

    const existingCount = await this.receiptsRepository.count({
      where: { agreementId },
    });
    const installmentNumber = dto.installmentNumber ?? existingCount + 1;

    const paymentDate = new Date(dto.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException('Invalid payment date');
    }

    const paidAmount = Number(agreement.paidAmount) + Number(dto.amount);

    const balanceAfter = Number(agreement.totalAmount) - paidAmount;
    const expectedPaid = this.calculateExpectedPaid(
      agreement,
      paymentDate,
    );
    const overdueAmount = Number(expectedPaid) - paidAmount;

    agreement.paidAmount = Number(paidAmount.toFixed(2));
    await this.agreementsRepository.save(agreement);

    const receiptNumber = await this.generateReceiptNumber(agreementId);

    const receipt = this.receiptsRepository.create({
      agreementId,
      receiptNumber,
      installmentNumber,
      amount: dto.amount,
      currency: agreement.currency,
      paymentDate,
      balanceAfter,
      overdueAmount,
      copyCount: 2,
    });

    const savedReceipt = await this.receiptsRepository.save(receipt);

    try {
      const pdfUrl = await this.receiptPdfService.generate(
        savedReceipt,
        agreement,
      );
      savedReceipt.pdfUrl = pdfUrl;
      await this.receiptsRepository.save(savedReceipt);
    } catch (error) {
      console.error('Failed to generate sale receipt PDF:', error);
    }

    return savedReceipt;
  }

  async getReceipt(receiptId: string, user: UserContext) {
    const receipt = await this.receiptsRepository.findOne({
      where: { id: receiptId },
      relations: ['agreement', 'agreement.folder'],
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    if (user.companyId && receipt.agreement?.companyId !== user.companyId) {
      throw new ForbiddenException('You can only access your own company');
    }

    return receipt;
  }

  private async generateReceiptNumber(agreementId: string): Promise<string> {
    const lastReceipt = await this.receiptsRepository.findOne({
      where: { agreementId },
      order: { createdAt: 'DESC' },
    });

    let sequence = 1;
    if (lastReceipt) {
      const parts = lastReceipt.receiptNumber.split('-');
      if (parts.length >= 2) {
        sequence = parseInt(parts[parts.length - 1], 10) + 1;
      }
    }

    return `SREC-${agreementId.slice(0, 6)}-${String(sequence).padStart(4, '0')}`;
  }

  private calculateExpectedPaid(agreement: SaleAgreement, paymentDate: Date) {
    const start = new Date(agreement.startDate);
    const dueDay = agreement.dueDay || 10;

    const monthsDiff =
      paymentDate.getFullYear() * 12 +
      paymentDate.getMonth() -
      (start.getFullYear() * 12 + start.getMonth());

    let installmentsDue = monthsDiff;
    if (paymentDate.getDate() >= dueDay) {
      installmentsDue += 1;
    }

    installmentsDue = Math.max(0, Math.min(installmentsDue, agreement.installmentCount));

    return Number(agreement.installmentAmount) * installmentsDue;
  }
}
