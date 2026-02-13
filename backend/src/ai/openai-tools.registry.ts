import { UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/dto/login.dto';
import { RegisterDto } from '../auth/dto/register.dto';
import { CurrenciesService } from '../currencies/currencies.service';
import {
  CreateCurrencyDto,
  UpdateCurrencyDto,
} from '../currencies/dto/currency.dto';
import { CurrencyFiltersDto } from '../currencies/dto/currency-filters.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { RecentActivityQueryDto } from '../dashboard/dto/recent-activity-query.dto';
import { ReportJobsQueryDto } from '../dashboard/dto/report-jobs-query.dto';
import { DocumentsService } from '../documents/documents.service';
import { GenerateUploadUrlDto } from '../documents/dto/generate-upload-url.dto';
import { InterestedService } from '../interested/interested.service';
import { ChangeInterestedStageDto } from '../interested/dto/change-interested-stage.dto';
import { ConvertInterestedToBuyerDto } from '../interested/dto/convert-interested-to-buyer.dto';
import { ConvertInterestedToTenantDto } from '../interested/dto/convert-interested-to-tenant.dto';
import { CreateInterestedActivityDto } from '../interested/dto/create-interested-activity.dto';
import { CreateInterestedProfileDto } from '../interested/dto/create-interested-profile.dto';
import { CreatePropertyReservationDto } from '../interested/dto/create-property-reservation.dto';
import { InterestedFiltersDto } from '../interested/dto/interested-filters.dto';
import { UpdateInterestedActivityDto } from '../interested/dto/update-interested-activity.dto';
import { UpdateInterestedMatchDto } from '../interested/dto/update-interested-match.dto';
import { UpdateInterestedProfileDto } from '../interested/dto/update-interested-profile.dto';
import { AmendmentsService } from '../leases/amendments.service';
import { CreateAmendmentDto } from '../leases/dto/create-amendment.dto';
import { ConfirmLeaseDraftDto } from '../leases/dto/confirm-lease-draft.dto';
import { CreateLeaseContractTemplateDto } from '../leases/dto/create-lease-contract-template.dto';
import { CreateLeaseDto } from '../leases/dto/create-lease.dto';
import { LeaseFiltersDto } from '../leases/dto/lease-filters.dto';
import { LeaseStatusReasonDto } from '../leases/dto/lease-status-reason.dto';
import { LeaseTemplateFiltersDto } from '../leases/dto/lease-template-filters.dto';
import { RenderLeaseDraftDto } from '../leases/dto/render-lease-draft.dto';
import { RenewLeaseDto } from '../leases/dto/renew-lease.dto';
import { UpdateLeaseContractTemplateDto } from '../leases/dto/update-lease-contract-template.dto';
import { UpdateLeaseDraftTextDto } from '../leases/dto/update-lease-draft-text.dto';
import { UpdateLeaseDto } from '../leases/dto/update-lease.dto';
import { LeasesService } from '../leases/leases.service';
import { PdfService } from '../leases/pdf.service';
import { OwnersService } from '../owners/owners.service';
import { CreateOwnerActivityDto } from '../owners/dto/create-owner-activity.dto';
import { CreateOwnerDto } from '../owners/dto/create-owner.dto';
import { ListOwnerSettlementPaymentsDto } from '../owners/dto/list-owner-settlement-payments.dto';
import { ListOwnerSettlementsDto } from '../owners/dto/list-owner-settlements.dto';
import { RegisterOwnerSettlementPaymentDto } from '../owners/dto/register-owner-settlement-payment.dto';
import { UpdateOwnerActivityDto } from '../owners/dto/update-owner-activity.dto';
import { UpdateOwnerDto } from '../owners/dto/update-owner.dto';
import { InvoicePdfService } from '../payments/invoice-pdf.service';
import { InvoicesService } from '../payments/invoices.service';
import {
  CreateInvoiceDto,
  CreatePaymentDto,
  GenerateInvoiceDto,
  UpdatePaymentDto,
} from '../payments/dto';
import { InvoiceFiltersDto } from '../payments/dto/invoice-filters.dto';
import { CreatePaymentDocumentTemplateDto } from '../payments/dto/create-payment-document-template.dto';
import { PaymentDocumentTemplateFiltersDto } from '../payments/dto/payment-document-template-filters.dto';
import { PaymentFiltersDto } from '../payments/dto/payment-filters.dto';
import { UpdatePaymentDocumentTemplateDto } from '../payments/dto/update-payment-document-template.dto';
import { PaymentDocumentTemplatesService } from '../payments/payment-document-templates.service';
import { PaymentsService } from '../payments/payments.service';
import { TenantAccountsService } from '../payments/tenant-accounts.service';
import { CreatePropertyMaintenanceTaskDto } from '../properties/dto/create-property-maintenance-task.dto';
import { CreatePropertyVisitDto } from '../properties/dto/create-property-visit.dto';
import { CreatePropertyDto } from '../properties/dto/create-property.dto';
import { CreateUnitDto } from '../properties/dto/create-unit.dto';
import { DiscardPropertyImagesDto } from '../properties/dto/discard-property-images.dto';
import { PropertyFiltersDto } from '../properties/dto/property-filters.dto';
import { UpdatePropertyDto } from '../properties/dto/update-property.dto';
import { UpdateUnitDto } from '../properties/dto/update-unit.dto';
import { PropertiesService } from '../properties/properties.service';
import { PropertyVisitsService } from '../properties/property-visits.service';
import { UnitsService } from '../properties/units.service';
import { SalesService } from '../sales/sales.service';
import { CreateSaleAgreementDto } from '../sales/dto/create-sale-agreement.dto';
import { CreateSaleFolderDto } from '../sales/dto/create-sale-folder.dto';
import { CreateSaleReceiptDto } from '../sales/dto/create-sale-receipt.dto';
import { SaleAgreementsQueryDto } from '../sales/dto/sale-agreements-query.dto';
import { CreateTenantActivityDto } from '../tenants/dto/create-tenant-activity.dto';
import { CreateTenantDto } from '../tenants/dto/create-tenant.dto';
import { TenantFiltersDto } from '../tenants/dto/tenant-filters.dto';
import { UpdateTenantActivityDto } from '../tenants/dto/update-tenant-activity.dto';
import { UpdateTenantDto } from '../tenants/dto/update-tenant.dto';
import { TenantsService } from '../tenants/tenants.service';
import { UserRole } from '../users/entities/user.entity';
import { ChangePasswordDto } from '../users/dto/change-password.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { ResetUserPasswordDto } from '../users/dto/reset-user-password.dto';
import { SetUserActivationDto } from '../users/dto/set-user-activation.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { UserListQueryDto } from '../users/dto/user-list-query.dto';
import { UsersService } from '../users/users.service';
import { SendWhatsappMessageDto } from '../whatsapp/dto/send-whatsapp-message.dto';
import { WhatsappDocumentQueryDto } from '../whatsapp/dto/whatsapp-document-query.dto';
import { WhatsappWebhookPayloadDto } from '../whatsapp/dto/whatsapp-webhook-payload.dto';
import { WhatsappWebhookQueryDto } from '../whatsapp/dto/whatsapp-webhook-query.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AiExecutionContext, AiToolDefinition } from './types/ai-tool.types';

export type AiToolRegistryDeps = {
  authService: AuthService;
  usersService: UsersService;
  currenciesService: CurrenciesService;
  dashboardService: DashboardService;
  documentsService: DocumentsService;
  interestedService: InterestedService;
  leasesService: LeasesService;
  amendmentsService: AmendmentsService;
  pdfService: PdfService;
  ownersService: OwnersService;
  paymentsService: PaymentsService;
  invoicesService: InvoicesService;
  invoicePdfService: InvoicePdfService;
  tenantAccountsService: TenantAccountsService;
  paymentDocumentTemplatesService: PaymentDocumentTemplatesService;
  propertiesService: PropertiesService;
  propertyVisitsService: PropertyVisitsService;
  unitsService: UnitsService;
  salesService: SalesService;
  tenantsService: TenantsService;
  whatsappService: WhatsappService;
};

const emptyObjectSchema = z.object({}).strict();
const idSchema = z.string().min(1);
const uuidSchema = z.string().uuid();
const localeSchema = z.string().min(2);
const codeSchema = z.string().min(1);

const ADMIN = [UserRole.ADMIN];
const ADMIN_STAFF = [UserRole.ADMIN, UserRole.STAFF];
const ADMIN_OWNER = [UserRole.ADMIN, UserRole.OWNER];
const ADMIN_OWNER_STAFF = [UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF];
const ALL_ROLES = [
  UserRole.ADMIN,
  UserRole.OWNER,
  UserRole.STAFF,
  UserRole.TENANT,
];

const asObjectSchema = (schema: z.ZodTypeAny): z.ZodObject<any> =>
  schema as unknown as z.ZodObject<any>;

const withParams = (
  schema: z.ZodTypeAny,
  shape: z.ZodRawShape,
): z.ZodObject<any> =>
  asObjectSchema(schema).extend(shape).strict() as z.ZodObject<any>;

const toScopedUser = (context: AiExecutionContext) => ({
  id: context.userId,
  role: context.role,
  companyId: context.companyId,
  email: null,
  phone: null,
});

const toRequestUser = (context: AiExecutionContext) => ({
  id: context.userId,
  role: context.role,
  email: null,
  phone: null,
});

const toFilePayload = (
  buffer: Buffer,
  contentType: string,
  filename?: string,
) => ({
  contentType,
  filename: filename ?? null,
  sizeBytes: buffer.length,
  base64: buffer.toString('base64'),
});

export function buildAiToolDefinitions(
  deps: AiToolRegistryDeps,
): AiToolDefinition[] {
  return [
    {
      name: 'get_root',
      description: 'Equivalent to GET /',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: emptyObjectSchema,
      execute: async () => ({ message: 'Hello World!' }),
    },
    {
      name: 'get_health',
      description: 'Equivalent to GET /health',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: emptyObjectSchema,
      execute: async () => ({ status: 'ok', source: 'ai-tool' }),
    },
    {
      name: 'get_test_admin_only',
      description: 'Equivalent to GET /test/admin-only',
      mutability: 'readonly',
      allowedRoles: ADMIN,
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint is only accessible by admins',
      }),
    },
    {
      name: 'get_test_owner_only',
      description: 'Equivalent to GET /test/owner-only',
      mutability: 'readonly',
      allowedRoles: [UserRole.OWNER],
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint is only accessible by owners',
      }),
    },
    {
      name: 'get_test_tenant_only',
      description: 'Equivalent to GET /test/tenant-only',
      mutability: 'readonly',
      allowedRoles: [UserRole.TENANT],
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint is only accessible by tenants',
      }),
    },
    {
      name: 'get_test_admin_or_owner',
      description: 'Equivalent to GET /test/admin-or-owner',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER,
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint is accessible by admins or owners',
      }),
    },
    {
      name: 'get_test_create_user_permission',
      description: 'Equivalent to GET /test/create-user-permission',
      mutability: 'readonly',
      allowedRoles: ADMIN,
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint requires permission to create users',
      }),
    },

    {
      name: 'post_auth_login',
      description: 'Equivalent to POST /auth/login',
      mutability: 'mutable',
      allowedRoles: ALL_ROLES,
      parameters: LoginDto.zodSchema,
      execute: async (args) => {
        const parsed = LoginDto.zodSchema.parse(args) as any;
        const user = await deps.authService.validateUser(
          parsed.email,
          parsed.password,
        );
        if (!user) {
          throw new UnauthorizedException('Invalid credentials');
        }
        return deps.authService.login(user);
      },
    },
    {
      name: 'post_auth_register',
      description: 'Equivalent to POST /auth/register',
      mutability: 'mutable',
      allowedRoles: ALL_ROLES,
      parameters: RegisterDto.zodSchema,
      execute: async (args) =>
        deps.authService.register(RegisterDto.zodSchema.parse(args)),
    },
    {
      name: 'get_auth_profile',
      description: 'Equivalent to GET /auth/profile',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: emptyObjectSchema,
      execute: async (_args, context) => {
        const user = await deps.usersService.findOneById(context.userId);
        if (!user) {
          return null;
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash, ...safeUser } = user;
        return safeUser;
      },
    },

    {
      name: 'post_users',
      description: 'Equivalent to POST /users',
      mutability: 'mutable',
      allowedRoles: ADMIN,
      parameters: CreateUserDto.zodSchema,
      execute: async (args) => {
        const user = await deps.usersService.create(
          CreateUserDto.zodSchema.parse(args),
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash, ...safeUser } = user;
        return safeUser;
      },
    },
    {
      name: 'get_users',
      description: 'Equivalent to GET /users',
      mutability: 'readonly',
      allowedRoles: ADMIN,
      parameters: UserListQueryDto.zodSchema,
      execute: async (args) => {
        const parsed = UserListQueryDto.zodSchema.parse(args) as any;
        const result = await deps.usersService.findAll(
          parsed.page,
          parsed.limit,
        );
        return {
          ...result,
          data: result.data.map((user) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { passwordHash, ...safeUser } = user;
            return safeUser;
          }),
        };
      },
    },
    {
      name: 'get_users_profile_me',
      description: 'Equivalent to GET /users/profile/me',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: emptyObjectSchema,
      execute: async (_args, context) => {
        const user = await deps.usersService.findOneById(context.userId);
        if (!user) {
          return null;
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash, ...safeUser } = user;
        return safeUser;
      },
    },
    {
      name: 'patch_users_profile_me',
      description: 'Equivalent to PATCH /users/profile/me',
      mutability: 'mutable',
      allowedRoles: ALL_ROLES,
      parameters: UpdateUserDto.zodSchema,
      execute: async (args, context) => {
        const user = await deps.usersService.updateProfile(
          context.userId,
          UpdateUserDto.zodSchema.parse(args),
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash, ...safeUser } = user;
        return safeUser;
      },
    },
    {
      name: 'post_users_profile_change_password',
      description: 'Equivalent to POST /users/profile/change-password',
      mutability: 'mutable',
      allowedRoles: ALL_ROLES,
      parameters: ChangePasswordDto.zodSchema,
      execute: async (args, context) => {
        const parsed = ChangePasswordDto.zodSchema.parse(args) as any;
        await deps.usersService.changePassword(
          context.userId,
          parsed.currentPassword,
          parsed.newPassword,
        );
        return { message: 'Password changed successfully' };
      },
    },
    {
      name: 'get_users_by_id',
      description: 'Equivalent to GET /users/:id',
      mutability: 'readonly',
      allowedRoles: ADMIN,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        const user = await deps.usersService.findOneById(id);
        if (!user) {
          return null;
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash, ...safeUser } = user;
        return safeUser;
      },
    },
    {
      name: 'patch_users_by_id',
      description: 'Equivalent to PATCH /users/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN,
      parameters: withParams(UpdateUserDto.zodSchema, { id: uuidSchema }),
      execute: async (args) => {
        const parsed = withParams(UpdateUserDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        const user = await deps.usersService.update(parsed.id, parsed);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash, ...safeUser } = user;
        return safeUser;
      },
    },
    {
      name: 'patch_users_activation_by_id',
      description: 'Equivalent to PATCH /users/:id/activation',
      mutability: 'mutable',
      allowedRoles: ADMIN,
      parameters: withParams(SetUserActivationDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args) => {
        const parsed = withParams(SetUserActivationDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        const user = await deps.usersService.setActivation(
          parsed.id,
          parsed.isActive,
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash, ...safeUser } = user;
        return safeUser;
      },
    },
    {
      name: 'post_users_reset_password_by_id',
      description: 'Equivalent to POST /users/:id/reset-password',
      mutability: 'mutable',
      allowedRoles: ADMIN,
      parameters: withParams(ResetUserPasswordDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args) => {
        const parsed = withParams(ResetUserPasswordDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        const result = await deps.usersService.resetPassword(
          parsed.id,
          parsed.newPassword,
        );
        return {
          message: 'Password reset successfully',
          temporaryPassword: result.temporaryPassword,
        };
      },
    },
    {
      name: 'delete_users_by_id',
      description: 'Equivalent to DELETE /users/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        await deps.usersService.remove(id);
        return { message: 'User deleted successfully' };
      },
    },

    {
      name: 'get_currencies',
      description: 'Equivalent to GET /currencies',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: CurrencyFiltersDto.zodSchema,
      execute: async (args) => {
        const parsed = CurrencyFiltersDto.zodSchema.parse(args) as any;
        return deps.currenciesService.findAll(parsed.activeOnly !== false);
      },
    },
    {
      name: 'get_currencies_default_for_locale',
      description: 'Equivalent to GET /currencies/default/:locale',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ locale: localeSchema }).strict(),
      execute: async (args) => {
        const { locale } = z
          .object({ locale: localeSchema })
          .parse(args) as any;
        return deps.currenciesService.getDefaultForLocale(locale);
      },
    },
    {
      name: 'get_currency_by_code',
      description: 'Equivalent to GET /currencies/:code',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ code: codeSchema }).strict(),
      execute: async (args) => {
        const { code } = z.object({ code: codeSchema }).parse(args) as any;
        return deps.currenciesService.findOne(code);
      },
    },
    {
      name: 'post_currencies',
      description: 'Equivalent to POST /currencies',
      mutability: 'mutable',
      allowedRoles: ADMIN,
      parameters: CreateCurrencyDto.zodSchema,
      execute: async (args) =>
        deps.currenciesService.create(CreateCurrencyDto.zodSchema.parse(args)),
    },
    {
      name: 'put_currencies_by_code',
      description: 'Equivalent to PUT /currencies/:code',
      mutability: 'mutable',
      allowedRoles: ADMIN,
      parameters: withParams(UpdateCurrencyDto.zodSchema, { code: codeSchema }),
      execute: async (args) => {
        const parsed = withParams(UpdateCurrencyDto.zodSchema, {
          code: codeSchema,
        }).parse(args) as any;
        return deps.currenciesService.update(parsed.code, parsed);
      },
    },
    {
      name: 'delete_currencies_by_code',
      description: 'Equivalent to DELETE /currencies/:code',
      mutability: 'mutable',
      allowedRoles: ADMIN,
      parameters: z.object({ code: codeSchema }).strict(),
      execute: async (args) => {
        const { code } = z.object({ code: codeSchema }).parse(args) as any;
        await deps.currenciesService.remove(code);
        return { message: 'Currency deleted successfully' };
      },
    },

    {
      name: 'get_dashboard_stats',
      description: 'Equivalent to GET /dashboard/stats',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: emptyObjectSchema,
      execute: async (_args, context) =>
        deps.dashboardService.getStats(
          context.companyId ?? '',
          toRequestUser(context) as any,
        ),
    },
    {
      name: 'get_dashboard_recent_activity',
      description: 'Equivalent to GET /dashboard/recent-activity',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: RecentActivityQueryDto.zodSchema,
      execute: async (args, context) => {
        const parsed = RecentActivityQueryDto.zodSchema.parse(args) as any;
        return deps.dashboardService.getRecentActivity(
          context.companyId ?? '',
          toRequestUser(context) as any,
          parsed.limit ?? 10,
        );
      },
    },
    {
      name: 'get_dashboard_reports',
      description: 'Equivalent to GET /dashboard/reports',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: ReportJobsQueryDto.zodSchema,
      execute: async (args, context) => {
        const parsed = ReportJobsQueryDto.zodSchema.parse(args) as any;
        return deps.dashboardService.getReportJobs(
          context.companyId ?? '',
          toRequestUser(context) as any,
          parsed.page ?? 1,
          parsed.limit ?? 25,
        );
      },
    },

    {
      name: 'post_documents_upload_url',
      description: 'Equivalent to POST /documents/upload-url',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: GenerateUploadUrlDto.zodSchema,
      execute: async (args, context) =>
        deps.documentsService.generateUploadUrl(
          GenerateUploadUrlDto.zodSchema.parse(args),
          context.userId,
        ),
    },
    {
      name: 'patch_documents_confirm_by_id',
      description: 'Equivalent to PATCH /documents/:id/confirm',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.documentsService.confirmUpload(id);
      },
    },
    {
      name: 'get_documents_download_url_by_id',
      description: 'Equivalent to GET /documents/:id/download-url',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.documentsService.generateDownloadUrl(id);
      },
    },
    {
      name: 'get_documents_by_entity',
      description: 'Equivalent to GET /documents/entity/:type/:id',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ type: z.string().min(1), id: idSchema }).strict(),
      execute: async (args) => {
        const parsed = z
          .object({ type: z.string().min(1), id: idSchema })
          .parse(args) as any;
        return deps.documentsService.findByEntity(parsed.type, parsed.id);
      },
    },
    {
      name: 'delete_documents_by_id',
      description: 'Equivalent to DELETE /documents/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        await deps.documentsService.remove(id);
        return { message: 'Document deleted successfully' };
      },
    },

    {
      name: 'post_whatsapp_messages',
      description: 'Equivalent to POST /whatsapp/messages',
      mutability: 'mutable',
      allowedRoles: ALL_ROLES,
      parameters: SendWhatsappMessageDto.zodSchema,
      execute: async (args) => {
        const parsed = SendWhatsappMessageDto.zodSchema.parse(args) as any;
        return deps.whatsappService.sendTextMessage(
          parsed.to,
          parsed.text,
          parsed.pdfUrl,
        );
      },
    },
    {
      name: 'post_whatsapp_messages_internal',
      description: 'Equivalent to POST /whatsapp/messages/internal',
      mutability: 'mutable',
      allowedRoles: ALL_ROLES,
      parameters: withParams(SendWhatsappMessageDto.zodSchema, {
        batchToken: z.string().optional(),
      }),
      execute: async (args) => {
        const parsed = withParams(SendWhatsappMessageDto.zodSchema, {
          batchToken: z.string().optional(),
        }).parse(args) as any;
        deps.whatsappService.assertBatchToken(parsed.batchToken);
        return deps.whatsappService.sendTextMessage(
          parsed.to,
          parsed.text,
          parsed.pdfUrl,
        );
      },
    },
    {
      name: 'get_whatsapp_webhook',
      description: 'Equivalent to GET /whatsapp/webhook',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: WhatsappWebhookQueryDto.zodSchema,
      execute: async (args) => {
        const parsed = WhatsappWebhookQueryDto.zodSchema.parse(args) as any;
        if (
          parsed['hub.mode'] === 'subscribe' &&
          deps.whatsappService.verifyWebhookToken(parsed['hub.verify_token'])
        ) {
          return { status: 200, challenge: parsed['hub.challenge'] };
        }
        return { status: 403, challenge: null };
      },
    },
    {
      name: 'post_whatsapp_webhook',
      description: 'Equivalent to POST /whatsapp/webhook',
      mutability: 'mutable',
      allowedRoles: ALL_ROLES,
      parameters: WhatsappWebhookPayloadDto.zodSchema,
      execute: async (args) => {
        deps.whatsappService.handleIncomingWebhook(
          WhatsappWebhookPayloadDto.zodSchema.parse(args),
        );
        return { received: true };
      },
    },
    {
      name: 'get_whatsapp_document_by_id',
      description: 'Equivalent to GET /whatsapp/documents/:documentId',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: withParams(WhatsappDocumentQueryDto.zodSchema, {
        documentId: uuidSchema,
      }),
      execute: async (args) => {
        const parsed = withParams(WhatsappDocumentQueryDto.zodSchema, {
          documentId: uuidSchema,
        }).parse(args) as any;
        if (
          !deps.whatsappService.isDocumentTokenValid(
            parsed.documentId,
            parsed.token,
          )
        ) {
          throw new UnauthorizedException('Invalid or expired document token');
        }
        const file = await deps.documentsService.downloadByS3Key(
          `db://document/${parsed.documentId}`,
        );
        return toFilePayload(
          file.buffer,
          file.contentType,
          `document-${parsed.documentId}.pdf`,
        );
      },
    },

    {
      name: 'post_properties',
      description: 'Equivalent to POST /properties',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: CreatePropertyDto.zodSchema,
      execute: async (args, context) =>
        deps.propertiesService.create(
          CreatePropertyDto.zodSchema.parse(args),
          toScopedUser(context) as any,
        ),
    },
    {
      name: 'get_properties',
      description: 'Equivalent to GET /properties',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: PropertyFiltersDto.zodSchema,
      execute: async (args, context) =>
        deps.propertiesService.findAll(
          PropertyFiltersDto.zodSchema.parse(args),
          toScopedUser(context) as any,
        ),
    },
    {
      name: 'get_properties_by_id',
      description: 'Equivalent to GET /properties/:id',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.propertiesService.findOneScoped(
          id,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'patch_properties_by_id',
      description: 'Equivalent to PATCH /properties/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: withParams(UpdatePropertyDto.zodSchema, { id: uuidSchema }),
      execute: async (args, context) => {
        const parsed = withParams(UpdatePropertyDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.propertiesService.update(
          parsed.id,
          parsed,
          context.userId,
          context.role,
        );
      },
    },
    {
      name: 'delete_properties_by_id',
      description: 'Equivalent to DELETE /properties/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        await deps.propertiesService.remove(id, context.userId, context.role);
        return { message: 'Property deleted successfully' };
      },
    },
    {
      name: 'post_properties_upload',
      description: 'Equivalent to POST /properties/upload',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z
        .object({
          fileBase64: z.string().min(1),
          mimeType: z.string().min(1),
          originalName: z.string().min(1).optional(),
          size: z.number().int().positive().optional(),
        })
        .strict(),
      execute: async (args, context) => {
        const parsed = z
          .object({
            fileBase64: z.string().min(1),
            mimeType: z.string().min(1),
            originalName: z.string().min(1).optional(),
            size: z.number().int().positive().optional(),
          })
          .parse(args) as any;
        const file = {
          buffer: Buffer.from(parsed.fileBase64, 'base64'),
          mimetype: parsed.mimeType,
          originalname: parsed.originalName,
          size: parsed.size,
        };
        return deps.propertiesService.uploadPropertyImage(
          file,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'post_properties_uploads_discard',
      description: 'Equivalent to POST /properties/uploads/discard',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: DiscardPropertyImagesDto.zodSchema,
      execute: async (args, context) => {
        const parsed = DiscardPropertyImagesDto.zodSchema.parse(args) as any;
        return deps.propertiesService.discardUploadedImages(
          parsed.images,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'get_properties_image_by_id',
      description: 'Equivalent to GET /properties/images/:imageId',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ imageId: uuidSchema }).strict(),
      execute: async (args) => {
        const { imageId } = z
          .object({ imageId: uuidSchema })
          .parse(args) as any;
        const image = await deps.propertiesService.getPropertyImage(imageId);
        return {
          id: image.id,
          mimeType: image.mimeType,
          originalName: image.originalName,
          sizeBytes: image.sizeBytes,
          isTemporary: image.isTemporary,
          base64: Buffer.from(image.data).toString('base64'),
        };
      },
    },

    {
      name: 'post_property_visits',
      description: 'Equivalent to POST /properties/:propertyId/visits',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(CreatePropertyVisitDto.zodSchema, {
        propertyId: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(CreatePropertyVisitDto.zodSchema, {
          propertyId: uuidSchema,
        }).parse(args) as any;
        return deps.propertyVisitsService.create(
          parsed.propertyId,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'get_property_visits',
      description: 'Equivalent to GET /properties/:propertyId/visits',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ propertyId: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { propertyId } = z
          .object({ propertyId: uuidSchema })
          .parse(args) as any;
        return deps.propertyVisitsService.findAll(
          propertyId,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'post_property_visit_maintenance_tasks',
      description:
        'Equivalent to POST /properties/:propertyId/visits/maintenance-tasks',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(CreatePropertyMaintenanceTaskDto.zodSchema, {
        propertyId: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(CreatePropertyMaintenanceTaskDto.zodSchema, {
          propertyId: uuidSchema,
        }).parse(args) as any;
        return deps.propertyVisitsService.createMaintenanceTask(
          parsed.propertyId,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'get_property_visit_maintenance_tasks',
      description:
        'Equivalent to GET /properties/:propertyId/visits/maintenance-tasks',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ propertyId: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { propertyId } = z
          .object({ propertyId: uuidSchema })
          .parse(args) as any;
        return deps.propertyVisitsService.findAll(
          propertyId,
          toScopedUser(context) as any,
        );
      },
    },

    {
      name: 'post_units',
      description: 'Equivalent to POST /units',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: CreateUnitDto.zodSchema,
      execute: async (args) =>
        deps.unitsService.create(CreateUnitDto.zodSchema.parse(args)),
    },
    {
      name: 'get_units_by_property',
      description: 'Equivalent to GET /units/property/:propertyId',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ propertyId: uuidSchema }).strict(),
      execute: async (args) => {
        const { propertyId } = z
          .object({ propertyId: uuidSchema })
          .parse(args) as any;
        return deps.unitsService.findByProperty(propertyId);
      },
    },
    {
      name: 'get_unit_by_id',
      description: 'Equivalent to GET /units/:id',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.unitsService.findOne(id);
      },
    },
    {
      name: 'patch_unit_by_id',
      description: 'Equivalent to PATCH /units/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: withParams(UpdateUnitDto.zodSchema, { id: uuidSchema }),
      execute: async (args) => {
        const parsed = withParams(UpdateUnitDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.unitsService.update(parsed.id, parsed);
      },
    },
    {
      name: 'delete_unit_by_id',
      description: 'Equivalent to DELETE /units/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        await deps.unitsService.remove(id);
        return { message: 'Unit deleted successfully' };
      },
    },

    {
      name: 'post_leases',
      description: 'Equivalent to POST /leases',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: CreateLeaseDto.zodSchema,
      execute: async (args) =>
        deps.leasesService.create(CreateLeaseDto.zodSchema.parse(args)),
    },
    {
      name: 'get_leases',
      description: 'Equivalent to GET /leases',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: LeaseFiltersDto.zodSchema,
      execute: async (args, context) =>
        deps.leasesService.findAll(
          LeaseFiltersDto.zodSchema.parse(args),
          toRequestUser(context) as any,
        ),
    },
    {
      name: 'get_lease_templates',
      description: 'Equivalent to GET /leases/templates',
      mutability: 'readonly',
      allowedRoles: ADMIN_STAFF,
      parameters: LeaseTemplateFiltersDto.zodSchema,
      execute: async (args, context) => {
        const parsed = LeaseTemplateFiltersDto.zodSchema.parse(args) as any;
        return deps.leasesService.listTemplates(
          context.companyId ?? '',
          parsed.contractType,
        );
      },
    },
    {
      name: 'post_lease_templates',
      description: 'Equivalent to POST /leases/templates',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: CreateLeaseContractTemplateDto.zodSchema,
      execute: async (args, context) =>
        deps.leasesService.createTemplate(
          CreateLeaseContractTemplateDto.zodSchema.parse(args),
          context.companyId ?? '',
        ),
    },
    {
      name: 'patch_lease_template_by_id',
      description: 'Equivalent to PATCH /leases/templates/:templateId',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(UpdateLeaseContractTemplateDto.zodSchema, {
        templateId: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(UpdateLeaseContractTemplateDto.zodSchema, {
          templateId: uuidSchema,
        }).parse(args) as any;
        return deps.leasesService.updateTemplate(
          parsed.templateId,
          parsed,
          context.companyId ?? '',
        );
      },
    },
    {
      name: 'get_lease_by_id',
      description: 'Equivalent to GET /leases/:id',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.leasesService.findOneScoped(
          id,
          toRequestUser(context) as any,
        );
      },
    },
    {
      name: 'patch_lease_by_id',
      description: 'Equivalent to PATCH /leases/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(UpdateLeaseDto.zodSchema, { id: uuidSchema }),
      execute: async (args) => {
        const parsed = withParams(UpdateLeaseDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.leasesService.update(parsed.id, parsed);
      },
    },
    {
      name: 'post_lease_draft_render',
      description: 'Equivalent to POST /leases/:id/draft/render',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(RenderLeaseDraftDto.zodSchema, { id: uuidSchema }),
      execute: async (args) => {
        const parsed = withParams(RenderLeaseDraftDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.leasesService.renderDraft(parsed.id, parsed.templateId);
      },
    },
    {
      name: 'patch_lease_draft_text',
      description: 'Equivalent to PATCH /leases/:id/draft-text',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(UpdateLeaseDraftTextDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args) => {
        const parsed = withParams(UpdateLeaseDraftTextDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.leasesService.updateDraftText(parsed.id, parsed.draftText);
      },
    },
    {
      name: 'post_lease_confirm',
      description: 'Equivalent to POST /leases/:id/confirm',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(ConfirmLeaseDraftDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(ConfirmLeaseDraftDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.leasesService.confirmDraft(
          parsed.id,
          context.userId,
          parsed.finalText,
        );
      },
    },
    {
      name: 'patch_lease_activate',
      description: 'Equivalent to PATCH /leases/:id/activate',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.leasesService.activate(id, context.userId);
      },
    },
    {
      name: 'patch_lease_terminate',
      description: 'Equivalent to PATCH /leases/:id/terminate',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(LeaseStatusReasonDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args) => {
        const parsed = withParams(LeaseStatusReasonDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.leasesService.terminate(parsed.id, parsed.reason);
      },
    },
    {
      name: 'patch_lease_finalize',
      description: 'Equivalent to PATCH /leases/:id/finalize',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(LeaseStatusReasonDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args) => {
        const parsed = withParams(LeaseStatusReasonDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.leasesService.terminate(parsed.id, parsed.reason);
      },
    },
    {
      name: 'patch_lease_renew',
      description: 'Equivalent to PATCH /leases/:id/renew',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(RenewLeaseDto.zodSchema, { id: uuidSchema }),
      execute: async (args) => {
        const parsed = withParams(RenewLeaseDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.leasesService.renew(parsed.id, parsed);
      },
    },
    {
      name: 'delete_lease_by_id',
      description: 'Equivalent to DELETE /leases/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        await deps.leasesService.remove(id);
        return { message: 'Lease deleted successfully' };
      },
    },
    {
      name: 'get_lease_contract_by_id',
      description: 'Equivalent to GET /leases-contract/:id/contract',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        await deps.leasesService.findOneScoped(
          id,
          toRequestUser(context) as any,
        );
        const document = await deps.pdfService.getContractDocument(id);
        if (!document) {
          return { message: 'Contract not found' };
        }
        const file = await deps.documentsService.downloadByS3Key(
          document.fileUrl,
        );
        return toFilePayload(
          file.buffer,
          file.contentType,
          document.name || `contrato-${id}.pdf`,
        );
      },
    },

    {
      name: 'post_amendments',
      description: 'Equivalent to POST /amendments',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: CreateAmendmentDto.zodSchema,
      execute: async (args, context) =>
        deps.amendmentsService.create(
          CreateAmendmentDto.zodSchema.parse(args),
          context.userId,
        ),
    },
    {
      name: 'get_amendments_by_lease',
      description: 'Equivalent to GET /amendments/lease/:leaseId',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ leaseId: uuidSchema }).strict(),
      execute: async (args) => {
        const { leaseId } = z
          .object({ leaseId: uuidSchema })
          .parse(args) as any;
        return deps.amendmentsService.findByLease(leaseId);
      },
    },
    {
      name: 'get_amendment_by_id',
      description: 'Equivalent to GET /amendments/:id',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.amendmentsService.findOne(id);
      },
    },
    {
      name: 'patch_amendment_approve',
      description: 'Equivalent to PATCH /amendments/:id/approve',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.amendmentsService.approve(id, context.userId);
      },
    },
    {
      name: 'patch_amendment_reject',
      description: 'Equivalent to PATCH /amendments/:id/reject',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.amendmentsService.reject(id, context.userId);
      },
    },

    {
      name: 'post_payments',
      description: 'Equivalent to POST /payments',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: CreatePaymentDto.zodSchema,
      execute: async (args, context) =>
        deps.paymentsService.create(
          CreatePaymentDto.zodSchema.parse(args),
          context.userId,
        ),
    },
    {
      name: 'patch_payment_confirm',
      description: 'Equivalent to PATCH /payments/:id/confirm',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.paymentsService.confirm(id);
      },
    },
    {
      name: 'patch_payment_by_id',
      description: 'Equivalent to PATCH /payments/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(UpdatePaymentDto.zodSchema, { id: uuidSchema }),
      execute: async (args) => {
        const parsed = withParams(UpdatePaymentDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.paymentsService.update(parsed.id, parsed);
      },
    },
    {
      name: 'get_payments',
      description: 'Equivalent to GET /payments',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: PaymentFiltersDto.zodSchema,
      execute: async (args, context) =>
        deps.paymentsService.findAll(
          PaymentFiltersDto.zodSchema.parse(args),
          toRequestUser(context) as any,
        ),
    },
    {
      name: 'get_payment_receipts_by_tenant',
      description: 'Equivalent to GET /payments/tenant/:tenantId/receipts',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ tenantId: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { tenantId } = z
          .object({ tenantId: uuidSchema })
          .parse(args) as any;
        return deps.paymentsService.findReceiptsByTenant(
          tenantId,
          toRequestUser(context) as any,
        );
      },
    },
    {
      name: 'get_payment_by_id',
      description: 'Equivalent to GET /payments/:id',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.paymentsService.findOneScoped(
          id,
          toRequestUser(context) as any,
        );
      },
    },
    {
      name: 'patch_payment_cancel',
      description: 'Equivalent to PATCH /payments/:id/cancel',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.paymentsService.cancel(id);
      },
    },
    {
      name: 'get_payment_receipt_pdf_by_id',
      description: 'Equivalent to GET /payments/:id/receipt',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        const payment = await deps.paymentsService.findOneScoped(
          id,
          toRequestUser(context) as any,
        );
        if (!payment.receipt?.pdfUrl) {
          return { message: 'Receipt not found' };
        }
        const file = await deps.documentsService.downloadByS3Key(
          payment.receipt.pdfUrl,
        );
        return toFilePayload(
          file.buffer,
          file.contentType,
          `recibo-${payment.receipt.receiptNumber}.pdf`,
        );
      },
    },

    {
      name: 'post_invoices',
      description: 'Equivalent to POST /invoices',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: CreateInvoiceDto.zodSchema,
      execute: async (args) =>
        deps.invoicesService.create(CreateInvoiceDto.zodSchema.parse(args)),
    },
    {
      name: 'post_invoices_generate_for_lease',
      description: 'Equivalent to POST /invoices/lease/:leaseId/generate',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(GenerateInvoiceDto.zodSchema, {
        leaseId: uuidSchema,
      }),
      execute: async (args) => {
        const parsed = withParams(GenerateInvoiceDto.zodSchema, {
          leaseId: uuidSchema,
        }).parse(args) as any;
        return deps.invoicesService.generateForLease(parsed.leaseId, parsed);
      },
    },
    {
      name: 'patch_invoice_issue',
      description: 'Equivalent to PATCH /invoices/:id/issue',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        const invoice = await deps.invoicesService.issue(id);
        try {
          const pdfUrl = await deps.invoicePdfService.generate(invoice as any);
          return deps.invoicesService.attachPdf(invoice.id, pdfUrl);
        } catch {
          return invoice;
        }
      },
    },
    {
      name: 'get_invoices',
      description: 'Equivalent to GET /invoices',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: InvoiceFiltersDto.zodSchema,
      execute: async (args, context) => {
        const parsed = InvoiceFiltersDto.zodSchema.parse(args) as any;
        return deps.invoicesService.findAll(
          {
            leaseId: parsed.leaseId,
            ownerId: parsed.ownerId,
            status: parsed.status,
            page: parsed.page ?? 1,
            limit: parsed.limit ?? 10,
          },
          toRequestUser(context) as any,
        );
      },
    },
    {
      name: 'get_invoice_by_id',
      description: 'Equivalent to GET /invoices/:id',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.invoicesService.findOneScoped(
          id,
          toRequestUser(context) as any,
        );
      },
    },
    {
      name: 'get_invoice_credit_notes',
      description: 'Equivalent to GET /invoices/:id/credit-notes',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        await deps.invoicesService.findOneScoped(
          id,
          toRequestUser(context) as any,
        );
        return deps.paymentsService.listCreditNotesByInvoice(id);
      },
    },
    {
      name: 'patch_invoice_cancel',
      description: 'Equivalent to PATCH /invoices/:id/cancel',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.invoicesService.cancel(id);
      },
    },
    {
      name: 'get_invoice_pdf',
      description: 'Equivalent to GET /invoices/:id/pdf',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        const invoice = await deps.invoicesService.findOneScoped(
          id,
          toRequestUser(context) as any,
        );
        if (!invoice.pdfUrl) {
          return { message: 'PDF not found' };
        }
        const file = await deps.documentsService.downloadByS3Key(
          invoice.pdfUrl,
        );
        return toFilePayload(
          file.buffer,
          file.contentType,
          `factura-${invoice.invoiceNumber}.pdf`,
        );
      },
    },
    {
      name: 'get_credit_note_pdf',
      description: 'Equivalent to GET /invoices/credit-notes/:creditNoteId/pdf',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ creditNoteId: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { creditNoteId } = z
          .object({ creditNoteId: uuidSchema })
          .parse(args) as any;
        const note =
          await deps.paymentsService.findCreditNoteById(creditNoteId);
        await deps.invoicesService.findOneScoped(
          note.invoiceId,
          toRequestUser(context) as any,
        );
        if (!note.pdfUrl) {
          return { message: 'Credit note PDF not found' };
        }
        const file = await deps.documentsService.downloadByS3Key(note.pdfUrl);
        return toFilePayload(
          file.buffer,
          file.contentType,
          `nota-credito-${note.noteNumber}.pdf`,
        );
      },
    },

    {
      name: 'get_payment_templates',
      description: 'Equivalent to GET /payment-templates',
      mutability: 'readonly',
      allowedRoles: ADMIN_STAFF,
      parameters: PaymentDocumentTemplateFiltersDto.zodSchema,
      execute: async (args, context) => {
        const parsed = PaymentDocumentTemplateFiltersDto.zodSchema.parse(
          args,
        ) as any;
        return deps.paymentDocumentTemplatesService.list(
          context.companyId ?? '',
          parsed.type,
        );
      },
    },
    {
      name: 'post_payment_templates',
      description: 'Equivalent to POST /payment-templates',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: CreatePaymentDocumentTemplateDto.zodSchema,
      execute: async (args, context) =>
        deps.paymentDocumentTemplatesService.create(
          CreatePaymentDocumentTemplateDto.zodSchema.parse(args),
          context.companyId ?? '',
        ),
    },
    {
      name: 'patch_payment_template_by_id',
      description: 'Equivalent to PATCH /payment-templates/:templateId',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(UpdatePaymentDocumentTemplateDto.zodSchema, {
        templateId: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(UpdatePaymentDocumentTemplateDto.zodSchema, {
          templateId: uuidSchema,
        }).parse(args) as any;
        return deps.paymentDocumentTemplatesService.update(
          parsed.templateId,
          parsed,
          context.companyId ?? '',
        );
      },
    },

    {
      name: 'get_tenant_account_by_lease',
      description: 'Equivalent to GET /tenant-accounts/lease/:leaseId',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ leaseId: uuidSchema }).strict(),
      execute: async (args) => {
        const { leaseId } = z
          .object({ leaseId: uuidSchema })
          .parse(args) as any;
        return deps.tenantAccountsService.findByLease(leaseId);
      },
    },
    {
      name: 'get_tenant_account_by_id',
      description: 'Equivalent to GET /tenant-accounts/:id',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.tenantAccountsService.findOne(id);
      },
    },
    {
      name: 'get_tenant_account_movements',
      description: 'Equivalent to GET /tenant-accounts/:id/movements',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.tenantAccountsService.getMovements(id);
      },
    },
    {
      name: 'get_tenant_account_balance',
      description: 'Equivalent to GET /tenant-accounts/:id/balance',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.tenantAccountsService.getBalanceInfo(id);
      },
    },

    {
      name: 'post_tenants',
      description: 'Equivalent to POST /tenants',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: CreateTenantDto.zodSchema,
      execute: async (args) =>
        deps.tenantsService.create(CreateTenantDto.zodSchema.parse(args)),
    },
    {
      name: 'get_tenants',
      description: 'Equivalent to GET /tenants',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER,
      parameters: TenantFiltersDto.zodSchema,
      execute: async (args) =>
        deps.tenantsService.findAll(TenantFiltersDto.zodSchema.parse(args)),
    },
    {
      name: 'get_tenant_by_id',
      description: 'Equivalent to GET /tenants/:id',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.tenantsService.findOne(id);
      },
    },
    {
      name: 'get_tenant_leases',
      description: 'Equivalent to GET /tenants/:id/leases',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.tenantsService.getLeaseHistory(id);
      },
    },
    {
      name: 'get_tenant_activities',
      description: 'Equivalent to GET /tenants/:id/activities',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.tenantsService.listActivities(id, context.companyId ?? '');
      },
    },
    {
      name: 'post_tenant_activities',
      description: 'Equivalent to POST /tenants/:id/activities',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(CreateTenantActivityDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(CreateTenantActivityDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.tenantsService.createActivity(parsed.id, parsed, {
          id: context.userId,
          companyId: context.companyId ?? '',
        });
      },
    },
    {
      name: 'patch_tenant_activity',
      description: 'Equivalent to PATCH /tenants/:id/activities/:activityId',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(UpdateTenantActivityDto.zodSchema, {
        id: uuidSchema,
        activityId: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(UpdateTenantActivityDto.zodSchema, {
          id: uuidSchema,
          activityId: uuidSchema,
        }).parse(args) as any;
        return deps.tenantsService.updateActivity(
          parsed.id,
          parsed.activityId,
          parsed,
          context.companyId ?? '',
        );
      },
    },
    {
      name: 'patch_tenant_by_id',
      description: 'Equivalent to PATCH /tenants/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: withParams(UpdateTenantDto.zodSchema, { id: uuidSchema }),
      execute: async (args) => {
        const parsed = withParams(UpdateTenantDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.tenantsService.update(parsed.id, parsed);
      },
    },
    {
      name: 'delete_tenant_by_id',
      description: 'Equivalent to DELETE /tenants/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        await deps.tenantsService.remove(id);
        return { message: 'Tenant deleted successfully' };
      },
    },

    {
      name: 'post_interested',
      description: 'Equivalent to POST /interested',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: CreateInterestedProfileDto.zodSchema,
      execute: async (args, context) =>
        deps.interestedService.create(
          CreateInterestedProfileDto.zodSchema.parse(args),
          toScopedUser(context) as any,
        ),
    },
    {
      name: 'get_interested_metrics_overview',
      description: 'Equivalent to GET /interested/metrics/overview',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: emptyObjectSchema,
      execute: async (_args, context) =>
        deps.interestedService.getMetrics(toScopedUser(context) as any),
    },
    {
      name: 'get_interested_duplicates',
      description: 'Equivalent to GET /interested/duplicates',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: emptyObjectSchema,
      execute: async (_args, context) =>
        deps.interestedService.findPotentialDuplicates(
          toScopedUser(context) as any,
        ),
    },
    {
      name: 'get_interested',
      description: 'Equivalent to GET /interested',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: InterestedFiltersDto.zodSchema,
      execute: async (args, context) =>
        deps.interestedService.findAll(
          InterestedFiltersDto.zodSchema.parse(args),
          toScopedUser(context) as any,
        ),
    },
    {
      name: 'get_interested_by_id',
      description: 'Equivalent to GET /interested/:id',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.interestedService.findOne(id, toScopedUser(context) as any);
      },
    },
    {
      name: 'get_interested_summary',
      description: 'Equivalent to GET /interested/:id/summary',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.interestedService.getSummary(
          id,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'get_interested_timeline',
      description: 'Equivalent to GET /interested/:id/timeline',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.interestedService.getTimeline(
          id,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'get_interested_matches',
      description: 'Equivalent to GET /interested/:id/matches',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.interestedService.listMatches(
          id,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'post_interested_matches_refresh',
      description: 'Equivalent to POST /interested/:id/matches/refresh',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.interestedService.refreshMatches(
          id,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'patch_interested_match',
      description: 'Equivalent to PATCH /interested/:id/matches/:matchId',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(UpdateInterestedMatchDto.zodSchema, {
        id: uuidSchema,
        matchId: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(UpdateInterestedMatchDto.zodSchema, {
          id: uuidSchema,
          matchId: uuidSchema,
        }).parse(args) as any;
        return deps.interestedService.updateMatch(
          parsed.id,
          parsed.matchId,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'post_interested_stage',
      description: 'Equivalent to POST /interested/:id/stage',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(ChangeInterestedStageDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(ChangeInterestedStageDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.interestedService.changeStage(
          parsed.id,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'post_interested_activities',
      description: 'Equivalent to POST /interested/:id/activities',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(CreateInterestedActivityDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(CreateInterestedActivityDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.interestedService.createActivity(
          parsed.id,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'post_interested_reservations',
      description: 'Equivalent to POST /interested/:id/reservations',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(CreatePropertyReservationDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(CreatePropertyReservationDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.interestedService.createReservation(
          parsed.id,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'get_interested_reservations',
      description: 'Equivalent to GET /interested/:id/reservations',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.interestedService.listReservations(
          id,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'patch_interested_activity',
      description: 'Equivalent to PATCH /interested/:id/activities/:activityId',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(UpdateInterestedActivityDto.zodSchema, {
        id: uuidSchema,
        activityId: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(UpdateInterestedActivityDto.zodSchema, {
          id: uuidSchema,
          activityId: uuidSchema,
        }).parse(args) as any;
        return deps.interestedService.updateActivity(
          parsed.id,
          parsed.activityId,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'post_interested_convert_tenant',
      description: 'Equivalent to POST /interested/:id/convert/tenant',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(ConvertInterestedToTenantDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(ConvertInterestedToTenantDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.interestedService.convertToTenant(
          parsed.id,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'post_interested_convert_buyer',
      description: 'Equivalent to POST /interested/:id/convert/buyer',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(ConvertInterestedToBuyerDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(ConvertInterestedToBuyerDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.interestedService.convertToBuyer(
          parsed.id,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'patch_interested_by_id',
      description: 'Equivalent to PATCH /interested/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(UpdateInterestedProfileDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(UpdateInterestedProfileDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.interestedService.update(
          parsed.id,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'delete_interested_by_id',
      description: 'Equivalent to DELETE /interested/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        await deps.interestedService.remove(id, toScopedUser(context) as any);
        return { message: 'Interested profile deleted successfully' };
      },
    },

    {
      name: 'get_owner_settlement_payments',
      description: 'Equivalent to GET /owners/settlements/payments',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: ListOwnerSettlementPaymentsDto.zodSchema,
      execute: async (args, context) => {
        const parsed = ListOwnerSettlementPaymentsDto.zodSchema.parse(
          args,
        ) as any;
        return deps.ownersService.listSettlementPayments(
          context.companyId ?? '',
          toScopedUser(context) as any,
          parsed.limit ?? 100,
        );
      },
    },
    {
      name: 'get_owner_settlement_receipt',
      description:
        'Equivalent to GET /owners/settlements/:settlementId/receipt',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ settlementId: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { settlementId } = z
          .object({ settlementId: uuidSchema })
          .parse(args) as any;
        const file = await deps.ownersService.getSettlementReceipt(
          settlementId,
          context.companyId ?? '',
          toScopedUser(context) as any,
        );
        return toFilePayload(file.buffer, file.contentType, file.filename);
      },
    },
    {
      name: 'get_owners',
      description: 'Equivalent to GET /owners',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: emptyObjectSchema,
      execute: async (_args, context) =>
        deps.ownersService.findAll(context.companyId ?? ''),
    },
    {
      name: 'post_owners',
      description: 'Equivalent to POST /owners',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: CreateOwnerDto.zodSchema,
      execute: async (args, context) =>
        deps.ownersService.create(
          CreateOwnerDto.zodSchema.parse(args),
          context.companyId ?? '',
        ),
    },
    {
      name: 'get_owner_by_id',
      description: 'Equivalent to GET /owners/:id',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.ownersService.findOne(id, context.companyId ?? '');
      },
    },
    {
      name: 'patch_owner_by_id',
      description: 'Equivalent to PATCH /owners/:id',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(UpdateOwnerDto.zodSchema, { id: uuidSchema }),
      execute: async (args, context) => {
        const parsed = withParams(UpdateOwnerDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.ownersService.update(
          parsed.id,
          parsed,
          context.companyId ?? '',
        );
      },
    },
    {
      name: 'get_owner_settlements',
      description: 'Equivalent to GET /owners/:id/settlements',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(ListOwnerSettlementsDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(ListOwnerSettlementsDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.ownersService.listSettlements(
          parsed.id,
          context.companyId ?? '',
          toScopedUser(context) as any,
          parsed.status ?? 'all',
          parsed.limit ?? 12,
        );
      },
    },
    {
      name: 'post_owner_settlement_payment',
      description:
        'Equivalent to POST /owners/:id/settlements/:settlementId/pay',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: withParams(RegisterOwnerSettlementPaymentDto.zodSchema, {
        id: uuidSchema,
        settlementId: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(RegisterOwnerSettlementPaymentDto.zodSchema, {
          id: uuidSchema,
          settlementId: uuidSchema,
        }).parse(args) as any;
        return deps.ownersService.registerSettlementPayment(
          parsed.id,
          parsed.settlementId,
          parsed,
          toScopedUser(context) as any,
        );
      },
    },
    {
      name: 'get_owner_activities',
      description: 'Equivalent to GET /owners/:id/activities',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.ownersService.listActivities(id, context.companyId ?? '');
      },
    },
    {
      name: 'post_owner_activities',
      description: 'Equivalent to POST /owners/:id/activities',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(CreateOwnerActivityDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(CreateOwnerActivityDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.ownersService.createActivity(parsed.id, parsed, {
          id: context.userId,
          companyId: context.companyId ?? '',
        });
      },
    },
    {
      name: 'patch_owner_activity',
      description: 'Equivalent to PATCH /owners/:id/activities/:activityId',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(UpdateOwnerActivityDto.zodSchema, {
        id: uuidSchema,
        activityId: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(UpdateOwnerActivityDto.zodSchema, {
          id: uuidSchema,
          activityId: uuidSchema,
        }).parse(args) as any;
        return deps.ownersService.updateActivity(
          parsed.id,
          parsed.activityId,
          parsed,
          context.companyId ?? '',
        );
      },
    },

    {
      name: 'post_sales_folders',
      description: 'Equivalent to POST /sales/folders',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: CreateSaleFolderDto.zodSchema,
      execute: async (args, context) =>
        deps.salesService.createFolder(
          CreateSaleFolderDto.zodSchema.parse(args),
          { companyId: context.companyId },
        ),
    },
    {
      name: 'get_sales_folders',
      description: 'Equivalent to GET /sales/folders',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: emptyObjectSchema,
      execute: async (_args, context) =>
        deps.salesService.listFolders({ companyId: context.companyId }),
    },
    {
      name: 'post_sales_agreements',
      description: 'Equivalent to POST /sales/agreements',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: CreateSaleAgreementDto.zodSchema,
      execute: async (args, context) =>
        deps.salesService.createAgreement(
          CreateSaleAgreementDto.zodSchema.parse(args),
          { companyId: context.companyId },
        ),
    },
    {
      name: 'get_sales_agreements',
      description: 'Equivalent to GET /sales/agreements',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: SaleAgreementsQueryDto.zodSchema,
      execute: async (args, context) => {
        const parsed = SaleAgreementsQueryDto.zodSchema.parse(args) as any;
        return deps.salesService.listAgreements(
          { companyId: context.companyId },
          parsed.folderId,
        );
      },
    },
    {
      name: 'get_sales_agreement_by_id',
      description: 'Equivalent to GET /sales/agreements/:id',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.salesService.getAgreement(id, {
          companyId: context.companyId,
        });
      },
    },
    {
      name: 'get_sales_agreement_receipts',
      description: 'Equivalent to GET /sales/agreements/:id/receipts',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ id: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { id } = z.object({ id: uuidSchema }).parse(args) as any;
        return deps.salesService.listReceipts(id, {
          companyId: context.companyId,
        });
      },
    },
    {
      name: 'post_sales_agreement_receipt',
      description: 'Equivalent to POST /sales/agreements/:id/receipts',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: withParams(CreateSaleReceiptDto.zodSchema, {
        id: uuidSchema,
      }),
      execute: async (args, context) => {
        const parsed = withParams(CreateSaleReceiptDto.zodSchema, {
          id: uuidSchema,
        }).parse(args) as any;
        return deps.salesService.createReceipt(parsed.id, parsed, {
          companyId: context.companyId,
        });
      },
    },
    {
      name: 'get_sales_receipt_pdf',
      description: 'Equivalent to GET /sales/receipts/:receiptId/pdf',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: z.object({ receiptId: uuidSchema }).strict(),
      execute: async (args, context) => {
        const { receiptId } = z
          .object({ receiptId: uuidSchema })
          .parse(args) as any;
        const receipt = await deps.salesService.getReceipt(receiptId, {
          companyId: context.companyId,
        });
        if (!receipt.pdfUrl) {
          return { message: 'Receipt PDF not found' };
        }
        const file = await deps.documentsService.downloadByS3Key(
          receipt.pdfUrl,
        );
        return toFilePayload(
          file.buffer,
          file.contentType,
          `recibo-venta-${receipt.receiptNumber}.pdf`,
        );
      },
    },
  ];
}
