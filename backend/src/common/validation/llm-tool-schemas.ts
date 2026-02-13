import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodTypeAny } from 'zod';
import { LoginDto } from '../../auth/dto/login.dto';
import { RegisterDto } from '../../auth/dto/register.dto';
import { ConfirmLeaseDraftDto } from '../../leases/dto/confirm-lease-draft.dto';
import { CreateAmendmentDto } from '../../leases/dto/create-amendment.dto';
import { CreateLeaseContractTemplateDto } from '../../leases/dto/create-lease-contract-template.dto';
import { CreateLeaseDto } from '../../leases/dto/create-lease.dto';
import { LeaseStatusReasonDto } from '../../leases/dto/lease-status-reason.dto';
import { LeaseTemplateFiltersDto } from '../../leases/dto/lease-template-filters.dto';
import { LeaseFiltersDto } from '../../leases/dto/lease-filters.dto';
import { RenderLeaseDraftDto } from '../../leases/dto/render-lease-draft.dto';
import { RenewLeaseDto } from '../../leases/dto/renew-lease.dto';
import { UpdateLeaseContractTemplateDto } from '../../leases/dto/update-lease-contract-template.dto';
import { UpdateLeaseDraftTextDto } from '../../leases/dto/update-lease-draft-text.dto';
import { UpdateLeaseDto } from '../../leases/dto/update-lease.dto';
import { ChangeInterestedStageDto } from '../../interested/dto/change-interested-stage.dto';
import { ConvertInterestedToBuyerDto } from '../../interested/dto/convert-interested-to-buyer.dto';
import { ConvertInterestedToTenantDto } from '../../interested/dto/convert-interested-to-tenant.dto';
import { CreateInterestedActivityDto } from '../../interested/dto/create-interested-activity.dto';
import { CreateInterestedProfileDto } from '../../interested/dto/create-interested-profile.dto';
import { CreatePropertyReservationDto } from '../../interested/dto/create-property-reservation.dto';
import { InterestedFiltersDto } from '../../interested/dto/interested-filters.dto';
import { UpdateInterestedActivityDto } from '../../interested/dto/update-interested-activity.dto';
import { UpdateInterestedMatchDto } from '../../interested/dto/update-interested-match.dto';
import { UpdateInterestedProfileDto } from '../../interested/dto/update-interested-profile.dto';
import { CreateInvoiceDto } from '../../payments/dto/create-invoice.dto';
import { CreatePaymentDocumentTemplateDto } from '../../payments/dto/create-payment-document-template.dto';
import { CreatePaymentDto } from '../../payments/dto/create-payment.dto';
import { GenerateInvoiceDto } from '../../payments/dto/generate-invoice.dto';
import { InvoiceFiltersDto } from '../../payments/dto/invoice-filters.dto';
import { PaymentDocumentTemplateFiltersDto } from '../../payments/dto/payment-document-template-filters.dto';
import { PaymentFiltersDto } from '../../payments/dto/payment-filters.dto';
import { UpdatePaymentDocumentTemplateDto } from '../../payments/dto/update-payment-document-template.dto';
import { UpdatePaymentDto } from '../../payments/dto/update-payment.dto';
import { CreatePropertyMaintenanceTaskDto } from '../../properties/dto/create-property-maintenance-task.dto';
import { CreatePropertyVisitDto } from '../../properties/dto/create-property-visit.dto';
import { CreatePropertyDto } from '../../properties/dto/create-property.dto';
import { CreateUnitDto } from '../../properties/dto/create-unit.dto';
import { DiscardPropertyImagesDto } from '../../properties/dto/discard-property-images.dto';
import { PropertyFiltersDto } from '../../properties/dto/property-filters.dto';
import { UpdatePropertyDto } from '../../properties/dto/update-property.dto';
import { UpdateUnitDto } from '../../properties/dto/update-unit.dto';
import { CreateSaleAgreementDto } from '../../sales/dto/create-sale-agreement.dto';
import { CreateSaleFolderDto } from '../../sales/dto/create-sale-folder.dto';
import { CreateSaleReceiptDto } from '../../sales/dto/create-sale-receipt.dto';
import { SaleAgreementsQueryDto } from '../../sales/dto/sale-agreements-query.dto';
import { CreateOwnerActivityDto } from '../../owners/dto/create-owner-activity.dto';
import { CreateOwnerDto } from '../../owners/dto/create-owner.dto';
import { ListOwnerSettlementPaymentsDto } from '../../owners/dto/list-owner-settlement-payments.dto';
import { ListOwnerSettlementsDto } from '../../owners/dto/list-owner-settlements.dto';
import { RegisterOwnerSettlementPaymentDto } from '../../owners/dto/register-owner-settlement-payment.dto';
import { UpdateOwnerActivityDto } from '../../owners/dto/update-owner-activity.dto';
import { UpdateOwnerDto } from '../../owners/dto/update-owner.dto';
import {
  CreateCurrencyDto,
  UpdateCurrencyDto,
} from '../../currencies/dto/currency.dto';
import { CurrencyFiltersDto } from '../../currencies/dto/currency-filters.dto';
import { GenerateUploadUrlDto } from '../../documents/dto/generate-upload-url.dto';
import { SendWhatsappMessageDto } from '../../whatsapp/dto/send-whatsapp-message.dto';
import { WhatsappDocumentQueryDto } from '../../whatsapp/dto/whatsapp-document-query.dto';
import { WhatsappWebhookPayloadDto } from '../../whatsapp/dto/whatsapp-webhook-payload.dto';
import { WhatsappWebhookQueryDto } from '../../whatsapp/dto/whatsapp-webhook-query.dto';
import { RecentActivityQueryDto } from '../../dashboard/dto/recent-activity-query.dto';
import { ReportJobsQueryDto } from '../../dashboard/dto/report-jobs-query.dto';
import { ChangePasswordDto } from '../../users/dto/change-password.dto';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import { ResetUserPasswordDto } from '../../users/dto/reset-user-password.dto';
import { SetUserActivationDto } from '../../users/dto/set-user-activation.dto';
import { UserListQueryDto } from '../../users/dto/user-list-query.dto';
import { UpdateUserDto } from '../../users/dto/update-user.dto';
import { CreateTenantActivityDto } from '../../tenants/dto/create-tenant-activity.dto';
import { CreateTenantDto } from '../../tenants/dto/create-tenant.dto';
import { TenantFiltersDto } from '../../tenants/dto/tenant-filters.dto';
import { UpdateTenantActivityDto } from '../../tenants/dto/update-tenant-activity.dto';
import { UpdateTenantDto } from '../../tenants/dto/update-tenant.dto';

type ZodDtoClass = {
  name: string;
  zodSchema: ZodTypeAny;
};

type ToolSchemaDefinition = {
  name: string;
  description: string;
  dto: ZodDtoClass;
};

const TOOL_SCHEMAS: ToolSchemaDefinition[] = [
  {
    name: 'auth_login',
    description: 'Payload for POST /auth/login',
    dto: LoginDto as unknown as ZodDtoClass,
  },
  {
    name: 'auth_register',
    description: 'Payload for POST /auth/register',
    dto: RegisterDto as unknown as ZodDtoClass,
  },
  {
    name: 'users_create',
    description: 'Payload for POST /users',
    dto: CreateUserDto as unknown as ZodDtoClass,
  },
  {
    name: 'users_update',
    description: 'Payload for PATCH /users/:id and PATCH /users/profile/me',
    dto: UpdateUserDto as unknown as ZodDtoClass,
  },
  {
    name: 'users_list_query',
    description: 'Query params for GET /users',
    dto: UserListQueryDto as unknown as ZodDtoClass,
  },
  {
    name: 'users_change_password',
    description: 'Payload for POST /users/profile/change-password',
    dto: ChangePasswordDto as unknown as ZodDtoClass,
  },
  {
    name: 'users_set_activation',
    description: 'Payload for PATCH /users/:id/activation',
    dto: SetUserActivationDto as unknown as ZodDtoClass,
  },
  {
    name: 'users_reset_password',
    description: 'Payload for POST /users/:id/reset-password',
    dto: ResetUserPasswordDto as unknown as ZodDtoClass,
  },
  {
    name: 'payments_create',
    description: 'Payload for POST /payments',
    dto: CreatePaymentDto as unknown as ZodDtoClass,
  },
  {
    name: 'payments_update',
    description: 'Payload for PATCH /payments/:id',
    dto: UpdatePaymentDto as unknown as ZodDtoClass,
  },
  {
    name: 'payments_filters',
    description: 'Query params for GET /payments',
    dto: PaymentFiltersDto as unknown as ZodDtoClass,
  },
  {
    name: 'invoices_create',
    description: 'Payload for POST /invoices',
    dto: CreateInvoiceDto as unknown as ZodDtoClass,
  },
  {
    name: 'invoices_generate_for_lease',
    description: 'Payload for POST /invoices/lease/:leaseId/generate',
    dto: GenerateInvoiceDto as unknown as ZodDtoClass,
  },
  {
    name: 'invoices_filters',
    description: 'Query params for GET /invoices',
    dto: InvoiceFiltersDto as unknown as ZodDtoClass,
  },
  {
    name: 'payment_templates_create',
    description: 'Payload for POST /payment-templates',
    dto: CreatePaymentDocumentTemplateDto as unknown as ZodDtoClass,
  },
  {
    name: 'payment_templates_update',
    description: 'Payload for PATCH /payment-templates/:templateId',
    dto: UpdatePaymentDocumentTemplateDto as unknown as ZodDtoClass,
  },
  {
    name: 'payment_templates_filters',
    description: 'Query params for GET /payment-templates',
    dto: PaymentDocumentTemplateFiltersDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_create',
    description: 'Payload for POST /leases',
    dto: CreateLeaseDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_update',
    description: 'Payload for PATCH /leases/:id',
    dto: UpdateLeaseDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_filters',
    description: 'Query params for GET /leases',
    dto: LeaseFiltersDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_templates_create',
    description: 'Payload for POST /leases/templates',
    dto: CreateLeaseContractTemplateDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_templates_filters',
    description: 'Query params for GET /leases/templates',
    dto: LeaseTemplateFiltersDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_templates_update',
    description: 'Payload for PATCH /leases/templates/:templateId',
    dto: UpdateLeaseContractTemplateDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_draft_render',
    description: 'Payload for POST /leases/:id/draft/render',
    dto: RenderLeaseDraftDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_draft_update_text',
    description: 'Payload for PATCH /leases/:id/draft-text',
    dto: UpdateLeaseDraftTextDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_confirm',
    description: 'Payload for POST /leases/:id/confirm',
    dto: ConfirmLeaseDraftDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_terminate_or_finalize',
    description:
      'Payload for PATCH /leases/:id/terminate and /leases/:id/finalize',
    dto: LeaseStatusReasonDto as unknown as ZodDtoClass,
  },
  {
    name: 'leases_renew',
    description: 'Payload for PATCH /leases/:id/renew',
    dto: RenewLeaseDto as unknown as ZodDtoClass,
  },
  {
    name: 'amendments_create',
    description: 'Payload for POST /amendments',
    dto: CreateAmendmentDto as unknown as ZodDtoClass,
  },
  {
    name: 'tenants_create',
    description: 'Payload for POST /tenants',
    dto: CreateTenantDto as unknown as ZodDtoClass,
  },
  {
    name: 'tenants_update',
    description: 'Payload for PATCH /tenants/:id',
    dto: UpdateTenantDto as unknown as ZodDtoClass,
  },
  {
    name: 'tenants_filters',
    description: 'Query params for GET /tenants',
    dto: TenantFiltersDto as unknown as ZodDtoClass,
  },
  {
    name: 'tenants_activities_create',
    description: 'Payload for POST /tenants/:id/activities',
    dto: CreateTenantActivityDto as unknown as ZodDtoClass,
  },
  {
    name: 'tenants_activities_update',
    description: 'Payload for PATCH /tenants/:id/activities/:activityId',
    dto: UpdateTenantActivityDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_create',
    description: 'Payload for POST /interested',
    dto: CreateInterestedProfileDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_update',
    description: 'Payload for PATCH /interested/:id',
    dto: UpdateInterestedProfileDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_filters',
    description: 'Query params for GET /interested',
    dto: InterestedFiltersDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_stage_change',
    description: 'Payload for POST /interested/:id/stage',
    dto: ChangeInterestedStageDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_activities_create',
    description: 'Payload for POST /interested/:id/activities',
    dto: CreateInterestedActivityDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_activities_update',
    description: 'Payload for PATCH /interested/:id/activities/:activityId',
    dto: UpdateInterestedActivityDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_matches_update',
    description: 'Payload for PATCH /interested/:id/matches/:matchId',
    dto: UpdateInterestedMatchDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_convert_tenant',
    description: 'Payload for POST /interested/:id/convert/tenant',
    dto: ConvertInterestedToTenantDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_convert_buyer',
    description: 'Payload for POST /interested/:id/convert/buyer',
    dto: ConvertInterestedToBuyerDto as unknown as ZodDtoClass,
  },
  {
    name: 'interested_reservations_create',
    description: 'Payload for POST /interested/:id/reservations',
    dto: CreatePropertyReservationDto as unknown as ZodDtoClass,
  },
  {
    name: 'properties_create',
    description: 'Payload for POST /properties',
    dto: CreatePropertyDto as unknown as ZodDtoClass,
  },
  {
    name: 'properties_update',
    description: 'Payload for PATCH /properties/:id',
    dto: UpdatePropertyDto as unknown as ZodDtoClass,
  },
  {
    name: 'properties_filters',
    description: 'Query params for GET /properties',
    dto: PropertyFiltersDto as unknown as ZodDtoClass,
  },
  {
    name: 'properties_discard_images',
    description: 'Payload for PATCH /properties/discard-images',
    dto: DiscardPropertyImagesDto as unknown as ZodDtoClass,
  },
  {
    name: 'properties_units_create',
    description: 'Payload for POST /properties/:propertyId/units',
    dto: CreateUnitDto as unknown as ZodDtoClass,
  },
  {
    name: 'properties_units_update',
    description: 'Payload for PATCH /properties/units/:id',
    dto: UpdateUnitDto as unknown as ZodDtoClass,
  },
  {
    name: 'properties_visits_create',
    description: 'Payload for POST /properties/:propertyId/visits',
    dto: CreatePropertyVisitDto as unknown as ZodDtoClass,
  },
  {
    name: 'properties_maintenance_create',
    description: 'Payload for POST /properties/:propertyId/maintenance',
    dto: CreatePropertyMaintenanceTaskDto as unknown as ZodDtoClass,
  },
  {
    name: 'sales_folders_create',
    description: 'Payload for POST /sales/folders',
    dto: CreateSaleFolderDto as unknown as ZodDtoClass,
  },
  {
    name: 'sales_agreements_create',
    description: 'Payload for POST /sales/agreements',
    dto: CreateSaleAgreementDto as unknown as ZodDtoClass,
  },
  {
    name: 'sales_agreements_query',
    description: 'Query params for GET /sales/agreements',
    dto: SaleAgreementsQueryDto as unknown as ZodDtoClass,
  },
  {
    name: 'sales_receipts_create',
    description: 'Payload for POST /sales/agreements/:id/receipts',
    dto: CreateSaleReceiptDto as unknown as ZodDtoClass,
  },
  {
    name: 'owners_create',
    description: 'Payload for POST /owners',
    dto: CreateOwnerDto as unknown as ZodDtoClass,
  },
  {
    name: 'owners_update',
    description: 'Payload for PATCH /owners/:id',
    dto: UpdateOwnerDto as unknown as ZodDtoClass,
  },
  {
    name: 'owners_activities_create',
    description: 'Payload for POST /owners/:id/activities',
    dto: CreateOwnerActivityDto as unknown as ZodDtoClass,
  },
  {
    name: 'owners_activities_update',
    description: 'Payload for PATCH /owners/:id/activities/:activityId',
    dto: UpdateOwnerActivityDto as unknown as ZodDtoClass,
  },
  {
    name: 'owners_settlement_pay',
    description: 'Payload for POST /owners/:id/settlements/:settlementId/pay',
    dto: RegisterOwnerSettlementPaymentDto as unknown as ZodDtoClass,
  },
  {
    name: 'owners_settlement_payments_query',
    description: 'Query params for GET /owners/settlements/payments',
    dto: ListOwnerSettlementPaymentsDto as unknown as ZodDtoClass,
  },
  {
    name: 'owners_settlements_query',
    description: 'Query params for GET /owners/:id/settlements',
    dto: ListOwnerSettlementsDto as unknown as ZodDtoClass,
  },
  {
    name: 'currencies_create',
    description: 'Payload for POST /currencies',
    dto: CreateCurrencyDto as unknown as ZodDtoClass,
  },
  {
    name: 'currencies_update',
    description: 'Payload for PUT /currencies/:code',
    dto: UpdateCurrencyDto as unknown as ZodDtoClass,
  },
  {
    name: 'currencies_query',
    description: 'Query params for GET /currencies',
    dto: CurrencyFiltersDto as unknown as ZodDtoClass,
  },
  {
    name: 'documents_generate_upload_url',
    description: 'Payload for POST /documents/upload-url',
    dto: GenerateUploadUrlDto as unknown as ZodDtoClass,
  },
  {
    name: 'whatsapp_send_message',
    description: 'Payload for POST /whatsapp/messages',
    dto: SendWhatsappMessageDto as unknown as ZodDtoClass,
  },
  {
    name: 'whatsapp_send_message_internal',
    description: 'Payload for POST /whatsapp/messages/internal',
    dto: SendWhatsappMessageDto as unknown as ZodDtoClass,
  },
  {
    name: 'whatsapp_webhook_query',
    description: 'Query params for GET /whatsapp/webhook',
    dto: WhatsappWebhookQueryDto as unknown as ZodDtoClass,
  },
  {
    name: 'whatsapp_document_query',
    description: 'Query params for GET /whatsapp/documents/:documentId',
    dto: WhatsappDocumentQueryDto as unknown as ZodDtoClass,
  },
  {
    name: 'whatsapp_webhook_payload',
    description: 'Payload for POST /whatsapp/webhook',
    dto: WhatsappWebhookPayloadDto as unknown as ZodDtoClass,
  },
  {
    name: 'dashboard_recent_activity_query',
    description: 'Query params for GET /dashboard/recent-activity',
    dto: RecentActivityQueryDto as unknown as ZodDtoClass,
  },
  {
    name: 'dashboard_reports_query',
    description: 'Query params for GET /dashboard/reports',
    dto: ReportJobsQueryDto as unknown as ZodDtoClass,
  },
];

function toToolJsonSchema(dto: ZodDtoClass, schemaName: string): object {
  return zodToJsonSchema(dto.zodSchema as any, schemaName) as object;
}

export function buildOpenAiToolSchemas() {
  return TOOL_SCHEMAS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toToolJsonSchema(tool.dto, tool.dto.name),
    },
  }));
}

export function buildAnthropicToolSchemas() {
  return TOOL_SCHEMAS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: toToolJsonSchema(tool.dto, tool.dto.name),
  }));
}
