import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import {
  CompanyFinancialSettingsDto,
  CompanyFinancialSettingsViewDto,
} from './dto/company-financial-settings.dto';
import { paymentCents } from './payment-amount';

@Injectable()
export class CompanyFinancialSettingsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async get(companyId: string): Promise<CompanyFinancialSettingsViewDto> {
    const [company] = await this.db.query(
      'SELECT settings FROM companies WHERE id=$1 AND deleted_at IS NULL',
      [companyId],
    );
    if (!company) throw new NotFoundException('Company not found');
    const settings = company.settings?.financial;
    return {
      configured: settings?.commissionTaxRate !== undefined,
      commissionTaxRate:
        settings?.commissionTaxRate === undefined
          ? null
          : Number(settings.commissionTaxRate),
      source: settings?.source ?? settings?.commissionTaxRateSource ?? null,
      effectiveFrom: settings?.effectiveFrom ?? null,
    };
  }

  async update(
    companyId: string,
    actorId: string,
    dto: CompanyFinancialSettingsDto,
    key?: string,
  ) {
    const parsed = CompanyFinancialSettingsDto.zodSchema.safeParse(dto);
    if (!parsed.success)
      throw new BadRequestException('Invalid financial settings');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date());
    if (dto.effectiveFrom > today)
      throw new BadRequestException(
        'Financial settings cannot take effect in the future',
      );
    paymentCents(dto.commissionTaxRate, 'Commission tax rate');
    return this.db.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        key,
        'company.financial-settings.update',
        { ...dto },
        async () => {
          const [company] = await manager.query(
            'SELECT settings FROM companies WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
            [companyId],
          );
          if (!company) throw new NotFoundException('Company not found');
          const financial = {
            ...company.settings?.financial,
            ...parsed.data,
            commissionTaxRateSource: parsed.data.source,
          };
          await manager.query(
            `UPDATE companies SET settings=jsonb_set(COALESCE(settings,'{}'::jsonb),'{financial}',$2::jsonb),updated_at=now() WHERE id=$1`,
            [companyId, JSON.stringify(financial)],
          );
          await manager.query(
            `INSERT INTO company_financial_settings_audit(company_id,changed_by,previous_settings,new_settings)
        VALUES($1,$2,$3::jsonb,$4::jsonb)`,
            [
              companyId,
              actorId,
              JSON.stringify(company.settings?.financial ?? {}),
              JSON.stringify(financial),
            ],
          );
          return {
            configured: true,
            commissionTaxRate: parsed.data.commissionTaxRate,
            source: parsed.data.source,
            effectiveFrom: parsed.data.effectiveFrom,
          };
        },
      ),
    );
  }
}
