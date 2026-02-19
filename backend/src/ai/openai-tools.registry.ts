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
import { GithubIssuesService } from './github-issues.service';
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
  githubIssuesService: GithubIssuesService;
};

const emptyObjectSchema = z.object({}).strict();
const idSchema = z.string().min(1);
const uuidSchema = z.string().uuid();
const localeSchema = z.string().min(2);
const codeSchema = z.string().min(1);
const githubIssueStateSchema = z.enum(['open', 'closed', 'all']);
const githubReportKindSchema = z.enum(['bug', 'feature', 'tech-report']);
const githubCommitActionSchema = z.enum([
  'auto',
  'create_new_issue',
  'merge_open_issue',
]);

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
      description:
        'Returns a hello world message. Used for basic connectivity testing.',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: emptyObjectSchema,
      execute: async () => ({ message: 'Hello World!' }),
    },
    {
      name: 'get_health',
      description:
        'Returns the API health status. Use to check if the service is running.',
      mutability: 'readonly',
      allowedRoles: ALL_ROLES,
      parameters: emptyObjectSchema,
      execute: async () => ({ status: 'ok', source: 'ai-tool' }),
    },
    {
      name: 'get_test_admin_only',
      description:
        'Test endpoint restricted to admin role. Use to verify admin permissions.',
      mutability: 'readonly',
      allowedRoles: ADMIN,
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint is only accessible by admins',
      }),
    },
    {
      name: 'get_test_owner_only',
      description:
        'Test endpoint restricted to owner role. Use to verify owner permissions.',
      mutability: 'readonly',
      allowedRoles: [UserRole.OWNER],
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint is only accessible by owners',
      }),
    },
    {
      name: 'get_test_tenant_only',
      description:
        'Test endpoint restricted to tenant role. Use to verify tenant permissions.',
      mutability: 'readonly',
      allowedRoles: [UserRole.TENANT],
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint is only accessible by tenants',
      }),
    },
    {
      name: 'get_test_admin_or_owner',
      description:
        'Test endpoint restricted to admin or owner roles. Use to verify combined role permissions.',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER,
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint is accessible by admins or owners',
      }),
    },
    {
      name: 'get_test_create_user_permission',
      description:
        'Test endpoint restricted to users with create-user permission. Use to verify permission checks.',
      mutability: 'readonly',
      allowedRoles: ADMIN,
      parameters: emptyObjectSchema,
      execute: async () => ({
        message: 'This endpoint requires permission to create users',
      }),
    },

    {
      name: 'post_auth_login',
      description:
        'Authenticates a user with email and password credentials. Returns a JWT access token for subsequent API calls.',
      responseDescription: 'JWT access token and user profile information.',
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
      description:
        'Registers a new user account with email, password, and profile details. Use for self-service sign-up.',
      responseDescription: 'The newly created user profile with assigned UUID.',
      mutability: 'mutable',
      allowedRoles: ALL_ROLES,
      parameters: RegisterDto.zodSchema,
      execute: async (args) =>
        deps.authService.register(RegisterDto.zodSchema.parse(args)),
    },
    {
      name: 'get_auth_profile',
      description:
        "Returns the authenticated user's profile based on the current JWT token. Excludes sensitive fields like passwordHash.",
      responseDescription:
        'Current user profile including id, email, name, role, and company info.',
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
      description:
        'Creates a new user account (admin only). Use to provision users with a specific role and company assignment.',
      responseDescription: 'The newly created user record with assigned UUID.',
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
      description:
        'Lists all users with pagination. Accepts page and limit params. Admin only.',
      responseDescription: 'Paginated list of user records with total count.',
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
      description:
        "Returns the current authenticated user's own profile. Available to any logged-in user.",
      responseDescription: "Current user's full profile details.",
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
      description:
        "Updates the current authenticated user's own profile fields (name, phone, etc.). Available to any logged-in user.",
      responseDescription: 'The updated user profile.',
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
      description:
        "Changes the current user's password. Requires currentPassword and newPassword fields for verification.",
      responseDescription:
        'Confirmation that the password was changed successfully.',
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
      description: 'Retrieves a specific user by their UUID. Admin only.',
      responseDescription: 'Full user record for the specified UUID.',
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
      description:
        "Updates a specific user's fields by UUID. Admin only. Use to modify role, name, or other attributes.",
      responseDescription: 'The updated user record.',
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
      description:
        'Activates or deactivates a user account by UUID. Accepts isActive boolean. Admin only.',
      responseDescription:
        'The updated user record with new activation status.',
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
      description:
        "Resets a user's password by UUID (admin action). Generates or sets a new password for the target user.",
      responseDescription:
        'Confirmation with the new or reset password details.',
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
      description: 'Permanently deletes a user account by UUID. Admin only.',
      responseDescription: 'Confirmation that the user was deleted.',
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
      description:
        'Lists available currencies. Accepts optional activeOnly boolean filter to return only active currencies.',
      responseDescription:
        'Array of currency records with code, name, symbol, and active status.',
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
      description:
        "Returns the default currency for a given locale string (e.g., 'es-AR' returns ARS, 'en-US' returns USD).",
      responseDescription:
        "Single currency record matching the locale's default.",
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
      description:
        "Retrieves a currency by its ISO code (e.g., 'USD', 'ARS', 'EUR'). Use to get details for a specific currency.",
      responseDescription:
        'Currency record with code, name, symbol, decimals, and active status.',
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
      description:
        'Creates a new currency record with code, name, symbol, and configuration. Admin only.',
      responseDescription: 'The newly created currency record.',
      mutability: 'mutable',
      allowedRoles: ADMIN,
      parameters: CreateCurrencyDto.zodSchema,
      execute: async (args) =>
        deps.currenciesService.create(CreateCurrencyDto.zodSchema.parse(args)),
    },
    {
      name: 'put_currencies_by_code',
      description:
        'Updates an existing currency by its ISO code. Use to modify name, symbol, or active status.',
      responseDescription: 'The updated currency record.',
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
      description: 'Deletes a currency by its ISO code. Admin only.',
      responseDescription: 'Confirmation that the currency was deleted.',
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
      description:
        'Returns company KPIs: totalProperties, totalTenants, activeLeases, monthlyIncome, monthlyExpenses, currencyCode, totalPayments, totalInvoices, monthlyCommissions. Role-scoped (owners see only their data).',
      responseDescription:
        'Dashboard statistics object with numeric KPIs and currency code.',
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
      description:
        'Returns a combined feed of recent interested and owner activities. Accepts limit param to control result count.',
      responseDescription:
        'Array of recent activity entries with type, description, timestamp, and related entity info.',
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
      description:
        'Returns batch billing job execution history with pagination. Accepts page and limit params.',
      responseDescription:
        'Paginated list of batch job reports with execution status and timestamps.',
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
      description:
        'Generates a pre-signed upload URL for a new document. Specify entity type, entity id, and file metadata.',
      responseDescription:
        'Pre-signed upload URL and the created document record with pending status.',
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
      description:
        'Confirms that a document was successfully uploaded by its UUID. Transitions document from pending to confirmed.',
      responseDescription: 'The confirmed document record with updated status.',
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
      description:
        'Generates a download URL for a specific document by UUID. Use to retrieve stored files.',
      responseDescription: 'Pre-signed download URL for the document.',
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
      description:
        "Lists all documents attached to a specific entity. Requires type (e.g., 'property', 'lease', 'tenant') and the entity's UUID.",
      responseDescription:
        'Array of document records for the specified entity.',
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
      description:
        'Deletes a document by UUID, removing both the record and stored file.',
      responseDescription: 'Confirmation that the document was deleted.',
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
      description:
        "Sends a WhatsApp text message. Requires 'to' (phone number) and 'text'. Optionally attach a pdfUrl.",
      responseDescription:
        'WhatsApp API response with message delivery status.',
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
      description:
        'Sends a WhatsApp message via internal batch process. Requires batchToken for authorization. Used by automated jobs.',
      responseDescription:
        'WhatsApp API response with message delivery status.',
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
      description:
        'Handles WhatsApp webhook verification challenge. Returns the hub.challenge value for subscription confirmation.',
      responseDescription:
        'The verification challenge string for webhook setup.',
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
      description:
        'Processes incoming WhatsApp webhook payloads (message received, delivery status, etc.).',
      responseDescription: 'Acknowledgment of the processed webhook event.',
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
      description:
        'Downloads a WhatsApp media document by ID using a WhatsApp-signed token. Use to retrieve media from incoming messages.',
      responseDescription: 'The document binary content or download URL.',
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
      description:
        'Creates a new property with owner assignment, address, and details. Use to register a rental or sale property.',
      responseDescription:
        'The newly created property record with assigned UUID.',
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
      description:
        'Lists properties with optional filters: ownerId, page, limit. Role-scoped (owners see only their properties).',
      responseDescription:
        'Paginated list of property records with total count.',
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
      description:
        'Retrieves full property details by UUID, including owner info, units, and images.',
      responseDescription:
        'Complete property record with nested owner, units, and image data.',
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
      description:
        "Updates a property's fields (address, description, status, etc.) by UUID.",
      responseDescription: 'The updated property record.',
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
      description:
        'Deletes a property by UUID. Fails if the property has active leases.',
      responseDescription: 'Confirmation that the property was deleted.',
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
      description:
        'Uploads an image for a property. Accepts a base64-encoded file with metadata.',
      responseDescription:
        'The created property image record with assigned imageId.',
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
      description:
        'Discards temporary uploaded property images that were not confirmed. Use to clean up abandoned uploads.',
      responseDescription: 'Confirmation that temporary images were discarded.',
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
      description:
        'Downloads a property image by imageId. Returns the image as base64-encoded content.',
      responseDescription: 'Base64-encoded image data with content type.',
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
      description:
        'Schedules a visit for a property. Specify property, date, time, and visitor details.',
      responseDescription:
        'The created visit record with assigned UUID and scheduled datetime.',
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
      description: 'Lists all scheduled visits for a property by propertyId.',
      responseDescription:
        'Array of visit records with date, status, and visitor info.',
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
        'Creates a maintenance task associated with a property visit. Specify description, priority, and status.',
      responseDescription: 'The created maintenance task record.',
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
      description: 'Lists all maintenance tasks for a property by propertyId.',
      responseDescription:
        'Array of maintenance task records with status and priority.',
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
      description:
        'Creates a unit within a property (e.g., apartment, office). Specify propertyId, label, and unit details.',
      responseDescription: 'The newly created unit record with assigned UUID.',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: CreateUnitDto.zodSchema,
      execute: async (args) =>
        deps.unitsService.create(CreateUnitDto.zodSchema.parse(args)),
    },
    {
      name: 'get_units_by_property',
      description:
        'Lists all units belonging to a specific property by propertyId.',
      responseDescription: 'Array of unit records for the specified property.',
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
      description: 'Retrieves a specific unit by its UUID with full details.',
      responseDescription: 'Complete unit record including property reference.',
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
      description:
        "Updates a unit's fields (label, area, description, etc.) by UUID.",
      responseDescription: 'The updated unit record.',
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
      description:
        'Deletes a unit by UUID. Fails if the unit has active leases.',
      responseDescription: 'Confirmation that the unit was deleted.',
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
      description:
        'Creates a new lease in draft status. Specify property, tenant, dates, rent amount, and billing terms.',
      responseDescription:
        'The newly created lease record in draft status with assigned UUID.',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: CreateLeaseDto.zodSchema,
      execute: async (args) =>
        deps.leasesService.create(CreateLeaseDto.zodSchema.parse(args)),
    },
    {
      name: 'get_leases',
      description:
        'Lists leases with optional filters: propertyId, ownerId, tenantId, status, page, limit. Role-scoped by user permissions.',
      responseDescription: 'Paginated list of lease records with total count.',
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
      description:
        "Lists available contract templates. Accepts contractType filter ('rental' or 'sale') to narrow results.",
      responseDescription:
        'Array of contract template records with name, type, and content.',
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
      description:
        'Creates a new contract template with name, type (rental/sale), and template body with variable placeholders.',
      responseDescription: 'The newly created contract template record.',
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
      description: "Updates a contract template's name, body, or type by UUID.",
      responseDescription: 'The updated contract template record.',
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
      description:
        'Retrieves full lease details by UUID, including property, tenant, billing config, and status history.',
      responseDescription:
        'Complete lease record with nested property, tenant, and billing details.',
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
      description:
        "Updates a draft lease's fields (dates, rent amount, terms, etc.) by UUID. Only works on draft leases.",
      responseDescription: 'The updated lease record.',
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
      description:
        'Renders the contract text for a draft lease by applying template variables (tenant name, dates, amounts, etc.).',
      responseDescription:
        'The rendered contract text string ready for review.',
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
      description:
        'Manually sets or overrides the draft contract text for a lease. Use after rendering to make manual edits.',
      responseDescription: 'The updated lease record with new contract text.',
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
      description:
        'Confirms a draft lease, transitioning it to active. Auto-creates tenant account for rentals and finalizes any existing active lease on the same property.',
      responseDescription:
        'The activated lease record with updated status and tenant account info.',
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
      description:
        'Activates a lease via alternative confirmation path. Transitions lease from draft to active status.',
      responseDescription: 'The activated lease record.',
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
      description:
        'Terminates an active lease early. Requires a termination reason. Transitions status to terminated.',
      responseDescription:
        'The terminated lease record with reason and termination date.',
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
      description:
        'Finalizes/ends a lease at its natural conclusion. Requires a reason. Transitions status to finalized.',
      responseDescription:
        'The finalized lease record with reason and end date.',
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
      description:
        'Renews a lease by creating a new draft with incremented version, inheriting terms from the current lease.',
      responseDescription:
        'The new draft lease record with incremented version number.',
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
      description:
        'Deletes a draft lease by UUID. Only works on leases in draft status.',
      responseDescription: 'Confirmation that the draft lease was deleted.',
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
      description:
        'Downloads the signed lease contract as a PDF document by lease UUID.',
      responseDescription: 'PDF binary content of the lease contract.',
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
      description:
        'Creates an amendment for an active lease. Specify change type: rent_increase, rent_decrease, extension, or other modification types.',
      responseDescription: 'The created amendment record in pending status.',
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
      description: 'Lists all amendments for a specific lease by leaseId.',
      responseDescription:
        'Array of amendment records with type, status, and details.',
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
      description: 'Retrieves a specific amendment by UUID with full details.',
      responseDescription:
        'Complete amendment record including lease reference and change details.',
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
      description:
        'Approves a pending amendment, applying its changes to the active lease.',
      responseDescription:
        'The approved amendment record with applied changes.',
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
      description:
        'Rejects a pending amendment. The amendment is archived without applying changes.',
      responseDescription: 'The rejected amendment record.',
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
      description:
        'Creates a new payment record for a tenant account. Specify leaseId or tenantAccountId, amount, date, and payment method.',
      responseDescription:
        'The created payment record in pending status with assigned UUID.',
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
      description:
        'Confirms a pending payment: creates a PAYMENT movement, applies FIFO allocation to outstanding invoices, generates receipt PDF, and auto-creates credit notes for late fees.',
      responseDescription:
        'The confirmed payment record with receipt info and allocated invoice list.',
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
      description:
        "Updates a payment's editable fields (amount, date, notes, method) by UUID.",
      responseDescription: 'The updated payment record.',
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
      description:
        'Lists payments with optional filters: tenantId, leaseId, status, page, limit. Role-scoped by user permissions.',
      responseDescription:
        'Paginated list of payment records with total count.',
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
      description:
        'Lists all payment receipts for a specific tenant by tenantId. Use to view receipt history.',
      responseDescription:
        'Array of receipt records with amounts, dates, and PDF availability.',
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
      description:
        'Retrieves a specific payment by UUID with full details including allocations.',
      responseDescription:
        'Complete payment record with tenant, lease, and invoice allocation details.',
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
      description:
        'Cancels a payment by UUID. If the payment was completed, reverses all associated movements and allocations.',
      responseDescription:
        'The cancelled payment record with reversal details.',
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
      description:
        'Downloads the receipt PDF for a specific confirmed payment by paymentId.',
      responseDescription: 'PDF binary content of the payment receipt.',
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
      description:
        'Creates a new invoice manually. Specify leaseId, tenant, line items, amounts, and due date.',
      responseDescription:
        'The created invoice record in draft status with assigned UUID.',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: CreateInvoiceDto.zodSchema,
      execute: async (args) =>
        deps.invoicesService.create(CreateInvoiceDto.zodSchema.parse(args)),
    },
    {
      name: 'post_invoices_generate_for_lease',
      description:
        'Auto-generates invoices for a lease based on its billing settings (frequency, amounts, dates). Use for bulk invoice creation.',
      responseDescription:
        'Array of newly generated invoice records for the lease period.',
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
      description:
        'Issues a draft invoice: sets issuedAt timestamp, creates a CHARGE movement on tenant account, and triggers commission invoice if applicable.',
      responseDescription: 'The issued invoice record with movement reference.',
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
      description:
        'Lists invoices with optional filters: leaseId, ownerId, status (draft|pending|sent|partial|overdue|paid|cancelled), page, limit. Role-scoped.',
      responseDescription:
        'Paginated list of invoice records with total count.',
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
      description:
        'Retrieves a specific invoice by UUID with full line items, movements, and payment allocations.',
      responseDescription:
        'Complete invoice record with nested line items and allocation details.',
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
      description:
        'Lists all credit notes associated with a specific invoice by invoiceId.',
      responseDescription:
        'Array of credit note records linked to the invoice.',
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
      description:
        'Cancels a non-PAID invoice by UUID. Reverses the CHARGE movement on the tenant account.',
      responseDescription:
        'The cancelled invoice record with reversal confirmation.',
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
      description: 'Downloads the invoice as a PDF document by invoiceId.',
      responseDescription: 'PDF binary content of the invoice.',
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
      description: 'Downloads a credit note as a PDF document by creditNoteId.',
      responseDescription: 'PDF binary content of the credit note.',
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
      description:
        "Lists payment document templates. Accepts optional type filter: 'receipt', 'invoice', or 'credit_note'.",
      responseDescription:
        'Array of payment document template records with type, name, and body.',
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
      description:
        'Creates a new payment document template (receipt, invoice, or credit_note) with name and HTML/template body.',
      responseDescription:
        'The newly created payment document template record.',
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
      description:
        "Updates a payment document template's name or body by UUID.",
      responseDescription: 'The updated payment document template record.',
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
      description:
        'Retrieves the tenant account (cuenta corriente) associated with a specific lease by leaseId.',
      responseDescription:
        'Tenant account record with balance, lease reference, and tenant info.',
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
      description:
        'Retrieves a tenant account by its UUID with balance and status details.',
      responseDescription:
        'Complete tenant account record with current balance.',
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
      description:
        'Lists all movements (charges, payments, adjustments, credits) for a tenant account. Shows the full transaction history.',
      responseDescription:
        'Array of movement records with type, amount, date, and related invoice/payment references.',
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
      description:
        'Returns the current balance summary for a tenant account, including total charges, payments, and outstanding amount.',
      responseDescription:
        'Balance object with totalCharges, totalPayments, totalAdjustments, and currentBalance.',
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
      description:
        'Creates a new tenant record with user account association. Specify personal details and contact info.',
      responseDescription:
        'The newly created tenant record with assigned UUID and linked user account.',
      mutability: 'mutable',
      allowedRoles: ADMIN_OWNER,
      parameters: CreateTenantDto.zodSchema,
      execute: async (args) =>
        deps.tenantsService.create(CreateTenantDto.zodSchema.parse(args)),
    },
    {
      name: 'get_tenants',
      description:
        'Lists tenants with optional filters: name (text search), page, limit.',
      responseDescription: 'Paginated list of tenant records with total count.',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER,
      parameters: TenantFiltersDto.zodSchema,
      execute: async (args) =>
        deps.tenantsService.findAll(TenantFiltersDto.zodSchema.parse(args)),
    },
    {
      name: 'get_tenant_by_id',
      description:
        'Retrieves a tenant by their user UUID with full profile and contact details.',
      responseDescription:
        'Complete tenant record with personal info and linked user account.',
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
      description:
        'Returns the lease history for a specific tenant by their user UUID. Shows all past and current leases.',
      responseDescription: 'Array of lease records associated with the tenant.',
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
      description:
        'Lists CRM activities (calls, tasks, notes, emails, visits) for a specific tenant by tenantId.',
      responseDescription:
        'Array of activity records with type, description, date, and status.',
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
      description:
        'Creates a CRM activity for a tenant. Types: call, task, note, email, whatsapp, visit. Specify description and optional scheduled date.',
      responseDescription: 'The created activity record with assigned UUID.',
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
      description:
        "Updates an existing tenant CRM activity's fields (description, status, date) by activityId.",
      responseDescription: 'The updated activity record.',
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
      description:
        "Updates a tenant's profile fields (name, phone, address, etc.) by UUID.",
      responseDescription: 'The updated tenant record.',
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
      description:
        'Deletes a tenant by UUID. Fails if the tenant has active leases.',
      responseDescription: 'Confirmation that the tenant was deleted.',
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
      description:
        'Creates a new interested/prospect profile in the CRM pipeline. Specify contact info, budget, and property preferences.',
      responseDescription:
        'The newly created interested profile with assigned UUID and initial pipeline stage.',
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
      description:
        'Returns pipeline-wide KPIs: total leads, leads by stage, conversion rates, and average time-to-convert.',
      responseDescription:
        'Metrics object with lead counts by stage and conversion rate percentages.',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: emptyObjectSchema,
      execute: async (_args, context) =>
        deps.interestedService.getMetrics(toScopedUser(context) as any),
    },
    {
      name: 'get_interested_duplicates',
      description:
        'Finds potential duplicate interested profiles based on name, email, or phone matching.',
      responseDescription:
        'Array of potential duplicate groups with similarity scores.',
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
      description:
        'Lists interested profiles with optional filters: name (text search), status, qualificationLevel, operations (rent/sale), page, limit.',
      responseDescription:
        'Paginated list of interested profiles with total count.',
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
      description:
        'Retrieves an interested profile by UUID with full contact info, preferences, and current pipeline stage.',
      responseDescription:
        'Complete interested profile record with preferences and stage history.',
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
      description:
        'Returns an aggregated summary for an interested profile: activity count, property matches count, and active reservations.',
      responseDescription:
        'Summary object with counts for activities, matches, and reservations.',
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
      description:
        'Returns the chronological activity feed for an interested profile, including stage changes, activities, and match updates.',
      responseDescription:
        'Array of timeline entries ordered by date with type and description.',
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
      description:
        'Lists scored property matches for an interested profile based on their preferences (budget, location, size).',
      responseDescription:
        'Array of property match records with compatibility score and match status.',
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
      description:
        'Recalculates property matches for an interested profile using current preferences and available properties.',
      responseDescription:
        'Updated array of recalculated property matches with new scores.',
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
      description:
        'Updates the status of a property match (e.g., contacted → visit_scheduled → accepted/rejected) by matchId.',
      responseDescription: 'The updated match record with new status.',
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
      description:
        'Changes the pipeline stage of an interested profile (e.g., new → contacted → qualified → proposal → won/lost).',
      responseDescription:
        'The updated interested profile with new stage and transition timestamp.',
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
      description:
        'Creates a CRM activity for an interested profile. Types: call, task, note, email, whatsapp, visit.',
      responseDescription: 'The created activity record with assigned UUID.',
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
      description:
        'Creates a property reservation for an interested profile. Links a prospect to a specific property with reservation terms.',
      responseDescription:
        'The created reservation record with property and date details.',
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
      description:
        'Lists all property reservations for a specific interested profile by interestedId.',
      responseDescription:
        'Array of reservation records with property, dates, and status.',
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
      description:
        'Updates a CRM activity for an interested profile by activityId. Modify description, status, or scheduled date.',
      responseDescription: 'The updated activity record.',
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
      description:
        'Converts an interested profile to a tenant. Creates User and Tenant records automatically. One-way irreversible operation.',
      responseDescription:
        'The created tenant record and updated interested profile with converted status.',
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
      description:
        'Converts an interested profile to a buyer. Creates a SaleAgreement automatically. One-way irreversible operation.',
      responseDescription:
        'The created sale agreement and updated interested profile with converted status.',
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
      description:
        "Updates an interested profile's fields (contact info, preferences, budget, qualification) by UUID.",
      responseDescription: 'The updated interested profile record.',
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
      description:
        'Deletes an interested profile by UUID. Removes all associated activities and matches.',
      responseDescription:
        'Confirmation that the interested profile was deleted.',
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
      description:
        'Lists settlement payment history across all owners. Accepts limit param to control result count.',
      responseDescription:
        'Array of settlement payment records with owner, amount, date, and status.',
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
        'Downloads a settlement receipt as a PDF document by settlementId.',
      responseDescription: 'PDF binary content of the settlement receipt.',
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
      description:
        'Lists all property owners in the company with contact and profile details.',
      responseDescription:
        'Array of owner records with name, contact info, and property count.',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: emptyObjectSchema,
      execute: async (_args, context) =>
        deps.ownersService.findAll(context.companyId ?? ''),
    },
    {
      name: 'post_owners',
      description:
        'Creates a new owner record with user account association. Specify personal details, contact info, and commission terms.',
      responseDescription:
        'The newly created owner record with assigned UUID and linked user account.',
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
      description:
        'Retrieves an owner by UUID with full profile, properties, and settlement summary.',
      responseDescription:
        'Complete owner record with nested properties and financial summary.',
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
      description:
        "Updates an owner's profile fields (name, phone, commission rate, etc.) by UUID.",
      responseDescription: 'The updated owner record.',
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
      description:
        'Lists settlements (liquidaciones) for an owner. Accepts status filter (pending/completed/all) and limit param.',
      responseDescription:
        'Array of settlement records with period, net amount, and payment status.',
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
        "Registers a payment for a specific owner settlement. Payment amount must match the settlement's net amount exactly.",
      responseDescription:
        'The updated settlement record with payment confirmation.',
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
      description:
        'Lists CRM activities (calls, tasks, notes, emails, visits) for a specific owner by ownerId.',
      responseDescription:
        'Array of activity records with type, description, date, and status.',
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
      description:
        'Creates a CRM activity for an owner. Types: call, task, note, email, whatsapp, visit, reserve.',
      responseDescription: 'The created activity record with assigned UUID.',
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
      description:
        "Updates an existing owner CRM activity's fields (description, status, date) by activityId.",
      responseDescription: 'The updated activity record.',
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
      name: 'get_github_issues',
      description:
        'Lists GitHub issues for the configured repository. Supports open, closed, or all states and optional text query.',
      responseDescription:
        'Issue list with number, title, state, labels, URL, and markdown body.',
      mutability: 'readonly',
      allowedRoles: ADMIN_STAFF,
      parameters: z
        .object({
          state: githubIssueStateSchema.default('open'),
          query: z.string().trim().min(1).max(200).optional(),
          page: z.coerce.number().int().min(1).max(100).default(1),
          perPage: z.coerce.number().int().min(1).max(50).default(20),
        })
        .strict(),
      execute: async (args) => {
        const parsed = z
          .object({
            state: githubIssueStateSchema.default('open'),
            query: z.string().trim().min(1).max(200).optional(),
            page: z.coerce.number().int().min(1).max(100).default(1),
            perPage: z.coerce.number().int().min(1).max(50).default(20),
          })
          .strict()
          .parse(args) as any;
        return deps.githubIssuesService.listIssues(parsed);
      },
    },
    {
      name: 'get_github_issue_by_number',
      description:
        'Gets a single GitHub issue by issue number, including full markdown description.',
      responseDescription:
        'Issue details with markdown description and metadata.',
      mutability: 'readonly',
      allowedRoles: ADMIN_STAFF,
      parameters: z
        .object({
          issueNumber: z.coerce.number().int().min(1),
        })
        .strict(),
      execute: async (args) => {
        const parsed = z
          .object({
            issueNumber: z.coerce.number().int().min(1),
          })
          .strict()
          .parse(args) as any;
        return deps.githubIssuesService.getIssueDetail(parsed.issueNumber);
      },
    },
    {
      name: 'post_github_issue_preview',
      description:
        'Builds a draft issue from a chat report, searches similar open/closed issues, and returns a preview before saving.',
      responseDescription:
        'Preview ID, draft markdown, similar issues, and recommended action.',
      mutability: 'readonly',
      allowedRoles: ADMIN_STAFF,
      parameters: z
        .object({
          kind: githubReportKindSchema.default('bug'),
          title: z.string().trim().min(3).max(120).optional(),
          summary: z.string().trim().min(3).max(300).optional(),
          report: z.string().trim().min(10).max(12000),
          labels: z.array(codeSchema).max(12).optional(),
        })
        .strict(),
      execute: async (args, context) => {
        const parsed = z
          .object({
            kind: githubReportKindSchema.default('bug'),
            title: z.string().trim().min(3).max(120).optional(),
            summary: z.string().trim().min(3).max(300).optional(),
            report: z.string().trim().min(10).max(12000),
            labels: z.array(codeSchema).max(12).optional(),
          })
          .strict()
          .parse(args) as any;
        return deps.githubIssuesService.prepareIssueReport(parsed, {
          userId: context.userId,
          companyId: context.companyId,
          conversationId: context.conversationId,
        });
      },
    },
    {
      name: 'post_github_issue_commit',
      description:
        'Persists a GitHub issue action from a previous preview. Requires previewId and confirm=true to mutate GitHub.',
      responseDescription:
        'Creation result or merge/comment result, including target issue and URLs.',
      mutability: 'mutable',
      allowedRoles: ADMIN_STAFF,
      parameters: z
        .object({
          previewId: z.string().uuid().optional(),
          action: githubCommitActionSchema.default('auto'),
          targetIssueNumber: z.coerce.number().int().min(1).optional(),
          confirm: z.coerce.boolean().default(false),
          titleOverride: z.string().trim().min(3).max(120).optional(),
          bodyOverride: z.string().trim().min(10).max(30000).optional(),
          labelsOverride: z.array(codeSchema).max(12).optional(),
        })
        .strict(),
      execute: async (args, context) => {
        const parsed = z
          .object({
            previewId: z.string().uuid().optional(),
            action: githubCommitActionSchema.default('auto'),
            targetIssueNumber: z.coerce.number().int().min(1).optional(),
            confirm: z.coerce.boolean().default(false),
            titleOverride: z.string().trim().min(3).max(120).optional(),
            bodyOverride: z.string().trim().min(10).max(30000).optional(),
            labelsOverride: z.array(codeSchema).max(12).optional(),
          })
          .strict()
          .parse(args) as any;
        return deps.githubIssuesService.commitIssueReport(parsed, {
          userId: context.userId,
          companyId: context.companyId,
          conversationId: context.conversationId,
        });
      },
    },

    {
      name: 'post_sales_folders',
      description:
        'Creates a new sale folder to group related sale agreements. Specify name and optional description.',
      responseDescription:
        'The newly created sale folder record with assigned UUID.',
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
      description: 'Lists all sale folders in the company with summary info.',
      responseDescription:
        'Array of sale folder records with name, agreement count, and status.',
      mutability: 'readonly',
      allowedRoles: ADMIN_OWNER_STAFF,
      parameters: emptyObjectSchema,
      execute: async (_args, context) =>
        deps.salesService.listFolders({ companyId: context.companyId }),
    },
    {
      name: 'post_sales_agreements',
      description:
        'Creates a sale agreement within a folder. Specify buyer, property, price, and payment terms.',
      responseDescription:
        'The newly created sale agreement record with assigned UUID.',
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
      description:
        'Lists sale agreements with optional folderId filter to scope by sale folder.',
      responseDescription:
        'Array of sale agreement records with buyer, property, and status details.',
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
      description:
        'Retrieves a sale agreement by UUID with full details including buyer, property, and payment schedule.',
      responseDescription:
        'Complete sale agreement record with nested details.',
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
      description:
        'Lists all payment receipts for a specific sale agreement by agreementId.',
      responseDescription:
        'Array of receipt records with amounts, dates, and payment method.',
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
      description:
        'Creates a payment receipt for a sale agreement. Specify amount, date, and payment method.',
      responseDescription: 'The created receipt record with assigned UUID.',
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
      description: 'Downloads a sale receipt as a PDF document by receiptId.',
      responseDescription: 'PDF binary content of the sale receipt.',
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
