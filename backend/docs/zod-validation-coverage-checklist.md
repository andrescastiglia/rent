# Zod Validation Coverage Checklist (API)

Legend:
- `[x]` Endpoint reviewed and covered.
- `Body DTO` and `Query DTO` indicate request input schemas validated by `ZodValidationPipe`.
- `N/A` means endpoint has no body/query payload.

## app.controller (`/`)
- [x] `GET /` - Body DTO: `N/A` - Query DTO: `N/A`

## health.controller (`/health`)
- [x] `GET /health` - Body DTO: `N/A` - Query DTO: `N/A`

## test.controller (`/test`)
- [x] `GET /test/admin-only` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /test/owner-only` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /test/tenant-only` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /test/admin-or-owner` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /test/create-user-permission` - Body DTO: `N/A` - Query DTO: `N/A`

## auth.controller (`/auth`)
- [x] `POST /auth/login` - Body DTO: `LoginDto` - Query DTO: `N/A`
- [x] `POST /auth/register` - Body DTO: `RegisterDto` - Query DTO: `N/A`
- [x] `GET /auth/profile` - Body DTO: `N/A` - Query DTO: `N/A`

## users.controller (`/users`)
- [x] `POST /users` - Body DTO: `CreateUserDto` - Query DTO: `N/A`
- [x] `GET /users` - Body DTO: `N/A` - Query DTO: `UserListQueryDto`
- [x] `GET /users/profile/me` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /users/profile/me` - Body DTO: `UpdateUserDto` - Query DTO: `N/A`
- [x] `POST /users/profile/change-password` - Body DTO: `ChangePasswordDto` - Query DTO: `N/A`
- [x] `GET /users/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /users/:id` - Body DTO: `UpdateUserDto` - Query DTO: `N/A`
- [x] `PATCH /users/:id/activation` - Body DTO: `SetUserActivationDto` - Query DTO: `N/A`
- [x] `POST /users/:id/reset-password` - Body DTO: `ResetUserPasswordDto` - Query DTO: `N/A`
- [x] `DELETE /users/:id` - Body DTO: `N/A` - Query DTO: `N/A`

## currencies.controller (`/currencies`)
- [x] `GET /currencies` - Body DTO: `N/A` - Query DTO: `CurrencyFiltersDto`
- [x] `GET /currencies/default/:locale` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /currencies/:code` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `POST /currencies` - Body DTO: `CreateCurrencyDto` - Query DTO: `N/A`
- [x] `PUT /currencies/:code` - Body DTO: `UpdateCurrencyDto` - Query DTO: `N/A`
- [x] `DELETE /currencies/:code` - Body DTO: `N/A` - Query DTO: `N/A`

## dashboard.controller (`/dashboard`)
- [x] `GET /dashboard/stats` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /dashboard/recent-activity` - Body DTO: `N/A` - Query DTO: `RecentActivityQueryDto`
- [x] `GET /dashboard/reports` - Body DTO: `N/A` - Query DTO: `ReportJobsQueryDto`

## documents.controller (`/documents`)
- [x] `POST /documents/upload-url` - Body DTO: `GenerateUploadUrlDto` - Query DTO: `N/A`
- [x] `PATCH /documents/:id/confirm` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /documents/:id/download-url` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /documents/entity/:type/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `DELETE /documents/:id` - Body DTO: `N/A` - Query DTO: `N/A`

## whatsapp.controller (`/whatsapp`)
- [x] `POST /whatsapp/messages` - Body DTO: `SendWhatsappMessageDto` - Query DTO: `N/A`
- [x] `POST /whatsapp/messages/internal` - Body DTO: `SendWhatsappMessageDto` - Query DTO: `N/A`
- [x] `GET /whatsapp/webhook` - Body DTO: `N/A` - Query DTO: `WhatsappWebhookQueryDto`
- [x] `POST /whatsapp/webhook` - Body DTO: `WhatsappWebhookPayloadDto` - Query DTO: `N/A`
- [x] `GET /whatsapp/documents/:documentId` - Body DTO: `N/A` - Query DTO: `WhatsappDocumentQueryDto`

## properties.controller (`/properties`)
- [x] `POST /properties` - Body DTO: `CreatePropertyDto` - Query DTO: `N/A`
- [x] `GET /properties` - Body DTO: `N/A` - Query DTO: `PropertyFiltersDto`
- [x] `GET /properties/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /properties/:id` - Body DTO: `UpdatePropertyDto` - Query DTO: `N/A`
- [x] `DELETE /properties/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `POST /properties/upload` - Body DTO: `N/A` (multipart) - Query DTO: `N/A`
- [x] `POST /properties/uploads/discard` - Body DTO: `DiscardPropertyImagesDto` - Query DTO: `N/A`

## property-images.controller (`/properties`)
- [x] `GET /properties/images/:imageId` - Body DTO: `N/A` - Query DTO: `N/A`

## property-visits.controller (`/properties/:propertyId/visits`)
- [x] `POST /properties/:propertyId/visits` - Body DTO: `CreatePropertyVisitDto` - Query DTO: `N/A`
- [x] `GET /properties/:propertyId/visits` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `POST /properties/:propertyId/visits/maintenance-tasks` - Body DTO: `CreatePropertyMaintenanceTaskDto` - Query DTO: `N/A`
- [x] `GET /properties/:propertyId/visits/maintenance-tasks` - Body DTO: `N/A` - Query DTO: `N/A`

## units.controller (`/units`)
- [x] `POST /units` - Body DTO: `CreateUnitDto` - Query DTO: `N/A`
- [x] `GET /units/property/:propertyId` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /units/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /units/:id` - Body DTO: `UpdateUnitDto` - Query DTO: `N/A`
- [x] `DELETE /units/:id` - Body DTO: `N/A` - Query DTO: `N/A`

## leases.controller (`/leases`)
- [x] `POST /leases` - Body DTO: `CreateLeaseDto` - Query DTO: `N/A`
- [x] `GET /leases` - Body DTO: `N/A` - Query DTO: `LeaseFiltersDto`
- [x] `GET /leases/templates` - Body DTO: `N/A` - Query DTO: `LeaseTemplateFiltersDto`
- [x] `POST /leases/templates` - Body DTO: `CreateLeaseContractTemplateDto` - Query DTO: `N/A`
- [x] `PATCH /leases/templates/:templateId` - Body DTO: `UpdateLeaseContractTemplateDto` - Query DTO: `N/A`
- [x] `GET /leases/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /leases/:id` - Body DTO: `UpdateLeaseDto` - Query DTO: `N/A`
- [x] `POST /leases/:id/draft/render` - Body DTO: `RenderLeaseDraftDto` - Query DTO: `N/A`
- [x] `PATCH /leases/:id/draft-text` - Body DTO: `UpdateLeaseDraftTextDto` - Query DTO: `N/A`
- [x] `POST /leases/:id/confirm` - Body DTO: `ConfirmLeaseDraftDto` - Query DTO: `N/A`
- [x] `PATCH /leases/:id/activate` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /leases/:id/terminate` - Body DTO: `LeaseStatusReasonDto` - Query DTO: `N/A`
- [x] `PATCH /leases/:id/finalize` - Body DTO: `LeaseStatusReasonDto` - Query DTO: `N/A`
- [x] `PATCH /leases/:id/renew` - Body DTO: `RenewLeaseDto` - Query DTO: `N/A`
- [x] `DELETE /leases/:id` - Body DTO: `N/A` - Query DTO: `N/A`

## leases-contract.controller (`/leases-contract`)
- [x] `GET /leases-contract/:id/contract` - Body DTO: `N/A` - Query DTO: `N/A`

## amendments.controller (`/amendments`)
- [x] `POST /amendments` - Body DTO: `CreateAmendmentDto` - Query DTO: `N/A`
- [x] `GET /amendments/lease/:leaseId` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /amendments/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /amendments/:id/approve` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /amendments/:id/reject` - Body DTO: `N/A` - Query DTO: `N/A`

## payments.controller (`/payments`)
- [x] `POST /payments` - Body DTO: `CreatePaymentDto` - Query DTO: `N/A`
- [x] `PATCH /payments/:id/confirm` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /payments/:id` - Body DTO: `UpdatePaymentDto` - Query DTO: `N/A`
- [x] `GET /payments` - Body DTO: `N/A` - Query DTO: `PaymentFiltersDto`
- [x] `GET /payments/tenant/:tenantId/receipts` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /payments/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /payments/:id/cancel` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /payments/:id/receipt` - Body DTO: `N/A` - Query DTO: `N/A`

## invoices.controller (`/invoices`)
- [x] `POST /invoices` - Body DTO: `CreateInvoiceDto` - Query DTO: `N/A`
- [x] `POST /invoices/lease/:leaseId/generate` - Body DTO: `GenerateInvoiceDto` - Query DTO: `N/A`
- [x] `PATCH /invoices/:id/issue` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /invoices` - Body DTO: `N/A` - Query DTO: `InvoiceFiltersDto`
- [x] `GET /invoices/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /invoices/:id/credit-notes` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /invoices/:id/cancel` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /invoices/:id/pdf` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /invoices/credit-notes/:creditNoteId/pdf` - Body DTO: `N/A` - Query DTO: `N/A`

## payment-document-templates.controller (`/payment-templates`)
- [x] `GET /payment-templates` - Body DTO: `N/A` - Query DTO: `PaymentDocumentTemplateFiltersDto`
- [x] `POST /payment-templates` - Body DTO: `CreatePaymentDocumentTemplateDto` - Query DTO: `N/A`
- [x] `PATCH /payment-templates/:templateId` - Body DTO: `UpdatePaymentDocumentTemplateDto` - Query DTO: `N/A`

## tenant-accounts.controller (`/tenant-accounts`)
- [x] `GET /tenant-accounts/lease/:leaseId` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /tenant-accounts/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /tenant-accounts/:id/movements` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /tenant-accounts/:id/balance` - Body DTO: `N/A` - Query DTO: `N/A`

## tenants.controller (`/tenants`)
- [x] `POST /tenants` - Body DTO: `CreateTenantDto` - Query DTO: `N/A`
- [x] `GET /tenants` - Body DTO: `N/A` - Query DTO: `TenantFiltersDto`
- [x] `GET /tenants/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /tenants/:id/leases` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /tenants/:id/activities` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `POST /tenants/:id/activities` - Body DTO: `CreateTenantActivityDto` - Query DTO: `N/A`
- [x] `PATCH /tenants/:id/activities/:activityId` - Body DTO: `UpdateTenantActivityDto` - Query DTO: `N/A`
- [x] `PATCH /tenants/:id` - Body DTO: `UpdateTenantDto` - Query DTO: `N/A`
- [x] `DELETE /tenants/:id` - Body DTO: `N/A` - Query DTO: `N/A`

## interested.controller (`/interested`)
- [x] `POST /interested` - Body DTO: `CreateInterestedProfileDto` - Query DTO: `N/A`
- [x] `GET /interested/metrics/overview` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /interested/duplicates` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /interested` - Body DTO: `N/A` - Query DTO: `InterestedFiltersDto`
- [x] `GET /interested/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /interested/:id/summary` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /interested/:id/timeline` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /interested/:id/matches` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `POST /interested/:id/matches/refresh` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /interested/:id/matches/:matchId` - Body DTO: `UpdateInterestedMatchDto` - Query DTO: `N/A`
- [x] `POST /interested/:id/stage` - Body DTO: `ChangeInterestedStageDto` - Query DTO: `N/A`
- [x] `POST /interested/:id/activities` - Body DTO: `CreateInterestedActivityDto` - Query DTO: `N/A`
- [x] `POST /interested/:id/reservations` - Body DTO: `CreatePropertyReservationDto` - Query DTO: `N/A`
- [x] `GET /interested/:id/reservations` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /interested/:id/activities/:activityId` - Body DTO: `UpdateInterestedActivityDto` - Query DTO: `N/A`
- [x] `POST /interested/:id/convert/tenant` - Body DTO: `ConvertInterestedToTenantDto` - Query DTO: `N/A`
- [x] `POST /interested/:id/convert/buyer` - Body DTO: `ConvertInterestedToBuyerDto` - Query DTO: `N/A`
- [x] `PATCH /interested/:id` - Body DTO: `UpdateInterestedProfileDto` - Query DTO: `N/A`
- [x] `DELETE /interested/:id` - Body DTO: `N/A` - Query DTO: `N/A`

## owners.controller (`/owners`)
- [x] `GET /owners/settlements/payments` - Body DTO: `N/A` - Query DTO: `ListOwnerSettlementPaymentsDto`
- [x] `GET /owners/settlements/:settlementId/receipt` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /owners` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `POST /owners` - Body DTO: `CreateOwnerDto` - Query DTO: `N/A`
- [x] `GET /owners/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `PATCH /owners/:id` - Body DTO: `UpdateOwnerDto` - Query DTO: `N/A`
- [x] `GET /owners/:id/settlements` - Body DTO: `N/A` - Query DTO: `ListOwnerSettlementsDto`
- [x] `POST /owners/:id/settlements/:settlementId/pay` - Body DTO: `RegisterOwnerSettlementPaymentDto` - Query DTO: `N/A`
- [x] `GET /owners/:id/activities` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `POST /owners/:id/activities` - Body DTO: `CreateOwnerActivityDto` - Query DTO: `N/A`
- [x] `PATCH /owners/:id/activities/:activityId` - Body DTO: `UpdateOwnerActivityDto` - Query DTO: `N/A`

## sales.controller (`/sales`)
- [x] `POST /sales/folders` - Body DTO: `CreateSaleFolderDto` - Query DTO: `N/A`
- [x] `GET /sales/folders` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `POST /sales/agreements` - Body DTO: `CreateSaleAgreementDto` - Query DTO: `N/A`
- [x] `GET /sales/agreements` - Body DTO: `N/A` - Query DTO: `SaleAgreementsQueryDto`
- [x] `GET /sales/agreements/:id` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `GET /sales/agreements/:id/receipts` - Body DTO: `N/A` - Query DTO: `N/A`
- [x] `POST /sales/agreements/:id/receipts` - Body DTO: `CreateSaleReceiptDto` - Query DTO: `N/A`
- [x] `GET /sales/receipts/:receiptId/pdf` - Body DTO: `N/A` - Query DTO: `N/A`

## Coverage Summary
- [x] All request `@Body()` and `@Query()` inputs in controllers are now typed with DTO classes exposing `static zodSchema`.
- [x] Endpoints with no body/query payload are marked as `N/A`.
- [x] `ZodValidationPipe` remains globally enabled before `ValidationPipe`.

