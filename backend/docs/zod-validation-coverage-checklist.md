# Zod Validation Coverage Checklist (API)

Legend:
- `[x]` Endpoint reviewed and covered.
- `Body DTO` and `Query DTO` indicate request input schemas validated by `ZodValidationPipe`.
- `N/A` means endpoint has no body/query payload.
- `AI READONLY` / `AI FULL` indicate implementation status of the endpoint as an AI tool in each mode.

## app.controller (`/`)
- [x] `GET /` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## health.controller (`/health`)
- [x] `GET /health` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## test.controller (`/test`)
- [x] `GET /test/admin-only` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /test/owner-only` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /test/tenant-only` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /test/admin-or-owner` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /test/create-user-permission` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## auth.controller (`/auth`)
- [x] `POST /auth/login` - Body DTO: `LoginDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /auth/register` - Body DTO: `RegisterDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /auth/profile` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## users.controller (`/users`)
- [x] `POST /users` - Body DTO: `CreateUserDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /users` - Body DTO: `N/A` - Query DTO: `UserListQueryDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /users/profile/me` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /users/profile/me` - Body DTO: `UpdateUserDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /users/profile/change-password` - Body DTO: `ChangePasswordDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /users/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /users/:id` - Body DTO: `UpdateUserDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /users/:id/activation` - Body DTO: `SetUserActivationDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /users/:id/reset-password` - Body DTO: `ResetUserPasswordDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `DELETE /users/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## currencies.controller (`/currencies`)
- [x] `GET /currencies` - Body DTO: `N/A` - Query DTO: `CurrencyFiltersDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /currencies/default/:locale` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /currencies/:code` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /currencies` - Body DTO: `CreateCurrencyDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PUT /currencies/:code` - Body DTO: `UpdateCurrencyDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `DELETE /currencies/:code` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## dashboard.controller (`/dashboard`)
- [x] `GET /dashboard/stats` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /dashboard/recent-activity` - Body DTO: `N/A` - Query DTO: `RecentActivityQueryDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /dashboard/reports` - Body DTO: `N/A` - Query DTO: `ReportJobsQueryDto` - AI READONLY: [x] - AI FULL: [ ]

## documents.controller (`/documents`)
- [x] `POST /documents/upload-url` - Body DTO: `GenerateUploadUrlDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /documents/:id/confirm` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /documents/:id/download-url` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /documents/entity/:type/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `DELETE /documents/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## whatsapp.controller (`/whatsapp`)
- [x] `POST /whatsapp/messages` - Body DTO: `SendWhatsappMessageDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /whatsapp/messages/internal` - Body DTO: `SendWhatsappMessageDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /whatsapp/webhook` - Body DTO: `N/A` - Query DTO: `WhatsappWebhookQueryDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /whatsapp/webhook` - Body DTO: `WhatsappWebhookPayloadDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /whatsapp/documents/:documentId` - Body DTO: `N/A` - Query DTO: `WhatsappDocumentQueryDto` - AI READONLY: [x] - AI FULL: [ ]

## properties.controller (`/properties`)
- [x] `POST /properties` - Body DTO: `CreatePropertyDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /properties` - Body DTO: `N/A` - Query DTO: `PropertyFiltersDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /properties/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /properties/:id` - Body DTO: `UpdatePropertyDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `DELETE /properties/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /properties/upload` - Body DTO: `N/A` (multipart) - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /properties/uploads/discard` - Body DTO: `DiscardPropertyImagesDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## property-images.controller (`/properties`)
- [x] `GET /properties/images/:imageId` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## property-visits.controller (`/properties/:propertyId/visits`)
- [x] `POST /properties/:propertyId/visits` - Body DTO: `CreatePropertyVisitDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /properties/:propertyId/visits` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /properties/:propertyId/visits/maintenance-tasks` - Body DTO: `CreatePropertyMaintenanceTaskDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /properties/:propertyId/visits/maintenance-tasks` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## units.controller (`/units`)
- [x] `POST /units` - Body DTO: `CreateUnitDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /units/property/:propertyId` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /units/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /units/:id` - Body DTO: `UpdateUnitDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `DELETE /units/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## leases.controller (`/leases`)
- [x] `POST /leases` - Body DTO: `CreateLeaseDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /leases` - Body DTO: `N/A` - Query DTO: `LeaseFiltersDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /leases/templates` - Body DTO: `N/A` - Query DTO: `LeaseTemplateFiltersDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /leases/templates` - Body DTO: `CreateLeaseContractTemplateDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /leases/templates/:templateId` - Body DTO: `UpdateLeaseContractTemplateDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /leases/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /leases/:id` - Body DTO: `UpdateLeaseDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /leases/:id/draft/render` - Body DTO: `RenderLeaseDraftDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /leases/:id/draft-text` - Body DTO: `UpdateLeaseDraftTextDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /leases/:id/confirm` - Body DTO: `ConfirmLeaseDraftDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /leases/:id/activate` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /leases/:id/terminate` - Body DTO: `LeaseStatusReasonDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /leases/:id/finalize` - Body DTO: `LeaseStatusReasonDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /leases/:id/renew` - Body DTO: `RenewLeaseDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `DELETE /leases/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## leases-contract.controller (`/leases`)
- [x] `GET /leases/:id/contract` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## amendments.controller (`/amendments`)
- [x] `POST /amendments` - Body DTO: `CreateAmendmentDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /amendments/lease/:leaseId` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /amendments/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /amendments/:id/approve` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /amendments/:id/reject` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## payments.controller (`/payments`)
- [x] `POST /payments` - Body DTO: `CreatePaymentDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /payments/:id/confirm` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /payments/:id` - Body DTO: `UpdatePaymentDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /payments` - Body DTO: `N/A` - Query DTO: `PaymentFiltersDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /payments/tenant/:tenantId/receipts` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /payments/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /payments/:id/cancel` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /payments/:id/receipt` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## invoices.controller (`/invoices`)
- [x] `POST /invoices` - Body DTO: `CreateInvoiceDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /invoices/lease/:leaseId/generate` - Body DTO: `GenerateInvoiceDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /invoices/:id/issue` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /invoices` - Body DTO: `N/A` - Query DTO: `InvoiceFiltersDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /invoices/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /invoices/:id/credit-notes` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /invoices/:id/cancel` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /invoices/:id/pdf` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /invoices/credit-notes/:creditNoteId/pdf` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## payment-document-templates.controller (`/payment-templates`)
- [x] `GET /payment-templates` - Body DTO: `N/A` - Query DTO: `PaymentDocumentTemplateFiltersDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /payment-templates` - Body DTO: `CreatePaymentDocumentTemplateDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /payment-templates/:templateId` - Body DTO: `UpdatePaymentDocumentTemplateDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## tenant-accounts.controller (`/tenant-accounts`)
- [x] `GET /tenant-accounts/lease/:leaseId` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /tenant-accounts/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /tenant-accounts/:id/movements` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /tenant-accounts/:id/balance` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## tenants.controller (`/tenants`)
- [x] `POST /tenants` - Body DTO: `CreateTenantDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /tenants` - Body DTO: `N/A` - Query DTO: `TenantFiltersDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /tenants/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /tenants/:id/leases` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /tenants/:id/activities` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /tenants/:id/activities` - Body DTO: `CreateTenantActivityDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /tenants/:id/activities/:activityId` - Body DTO: `UpdateTenantActivityDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /tenants/:id` - Body DTO: `UpdateTenantDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `DELETE /tenants/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## interested.controller (`/interested`)
- [x] `POST /interested` - Body DTO: `CreateInterestedProfileDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /interested/metrics/overview` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /interested/duplicates` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /interested` - Body DTO: `N/A` - Query DTO: `InterestedFiltersDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /interested/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /interested/:id/summary` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /interested/:id/timeline` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /interested/:id/matches` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /interested/:id/matches/refresh` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /interested/:id/matches/:matchId` - Body DTO: `UpdateInterestedMatchDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /interested/:id/stage` - Body DTO: `ChangeInterestedStageDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /interested/:id/activities` - Body DTO: `CreateInterestedActivityDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /interested/:id/reservations` - Body DTO: `CreatePropertyReservationDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /interested/:id/reservations` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /interested/:id/activities/:activityId` - Body DTO: `UpdateInterestedActivityDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /interested/:id/convert/tenant` - Body DTO: `ConvertInterestedToTenantDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /interested/:id/convert/buyer` - Body DTO: `ConvertInterestedToBuyerDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /interested/:id` - Body DTO: `UpdateInterestedProfileDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `DELETE /interested/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## owners.controller (`/owners`)
- [x] `GET /owners/settlements/payments` - Body DTO: `N/A` - Query DTO: `ListOwnerSettlementPaymentsDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /owners/settlements/:settlementId/receipt` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /owners` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /owners` - Body DTO: `CreateOwnerDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /owners/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `PATCH /owners/:id` - Body DTO: `UpdateOwnerDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /owners/:id/settlements` - Body DTO: `N/A` - Query DTO: `ListOwnerSettlementsDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /owners/:id/settlements/:settlementId/pay` - Body DTO: `RegisterOwnerSettlementPaymentDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /owners/:id/activities` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /owners/:id/activities` - Body DTO: `CreateOwnerActivityDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `PATCH /owners/:id/activities/:activityId` - Body DTO: `UpdateOwnerActivityDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## sales.controller (`/sales`)
- [x] `POST /sales/folders` - Body DTO: `CreateSaleFolderDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /sales/folders` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /sales/agreements` - Body DTO: `CreateSaleAgreementDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /sales/agreements` - Body DTO: `N/A` - Query DTO: `SaleAgreementsQueryDto` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /sales/agreements/:id` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /sales/agreements/:id/receipts` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /sales/agreements/:id/receipts` - Body DTO: `CreateSaleReceiptDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `GET /sales/receipts/:receiptId/pdf` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]

## ai.controller (`/ai/tools`)
- [x] `GET /ai/tools` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `GET /ai/tools/openai` - Body DTO: `N/A` - Query DTO: `N/A` - AI READONLY: [x] - AI FULL: [ ]
- [x] `POST /ai/tools/execute` - Body DTO: `ExecuteAiToolDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]
- [x] `POST /ai/tools/respond` - Body DTO: `AiChatRequestDto` - Query DTO: `N/A` - AI READONLY: [ ] - AI FULL: [x]

## Coverage Summary
- [x] All request `@Body()` and `@Query()` inputs in controllers are now typed with DTO classes exposing `static zodSchema`.
- [x] Endpoints with no body/query payload are marked as `N/A`.
- [x] `ZodValidationPipe` remains globally enabled before `ValidationPipe`.
- [x] AI implementation tracking is embedded endpoint-by-endpoint with separate checks for `READONLY` and `FULL`.
- [x] 148 AI tool definitions registered in `openai-tools.registry.ts` — all endpoints covered.
- [x] Tool parameter schemas reuse DTO `zodSchema` + inline `z.object()` for path params — no `z.any()`.

## AI Context Gaps (Zod / tool metadata pending work)

The following items are **not yet implemented** but would significantly improve the AI's ability to reason about the domain.

### P0 — Tool descriptions lack business context
- [ ] All 148 tools use generic `"Equivalent to GET /path"` descriptions. Rewrite with **business intent**, **response shape summary**, and **when to use**.
  - File: `src/ai/openai-tools.registry.ts`
  - Example improvement: `get_properties` → `"Search rental/sale properties by filters (city, type, price range, owner). Returns paginated {data: [{id, name, propertyType, addressCity, status, rentPrice, ownerId}], total, page, limit}."`

### P0 — No `.describe()` on Zod DTO fields
- [ ] Zero DTO files use `.describe()` on schema fields. The AI sees bare field names (`adjustmentFrequencyMonths`, `fiscalValue`, `paymentDueDay`) with no explanation.
  - Priority DTOs to annotate:
    - `CreatePropertyDto` (26 fields)
    - `CreateLeaseDto` (28 fields)
    - `PropertyFiltersDto` (11 fields)
    - `LeaseFiltersDto` (9 fields)
    - `PaymentFiltersDto` (9 fields)
    - `InterestedFiltersDto` (8 fields)
    - `TenantFiltersDto` (5 fields)
    - `CreatePaymentDto`, `CreateTenantDto`, `CreateInterestedProfileDto`

### P1 — No response schemas / descriptions
- [ ] `AiToolDefinition` has no `responseDescription` field. The AI cannot plan multi-step operations (e.g., "get property ID from lease, then fetch payments") because it doesn't know response shapes.
  - Option A: Add `responseDescription?: string` to `AiToolDefinition` interface in `src/ai/types/ai-tool.types.ts`.
  - Option B: Embed response shape directly in tool `description` string (simpler, no interface change).

### P1 — Enums lack semantic descriptions
- [ ] `z.nativeEnum(X)` is used throughout without `.describe()`. Key enums needing context:
  - `LeaseStatus` — lifecycle: `draft → active → terminated/finalized`
  - `PropertyOperationState` — `available`, `rented`, `reserved`, `sold`
  - `PaymentStatus` — valid transitions
  - `LateFeeType` — calculation method per type
  - `AdjustmentType` / `IncreaseClauseType` — business meaning
  - `InterestedQualificationLevel` — `mql` (Marketing Qualified Lead), `sql` (Sales Qualified Lead)
  - `BillingFrequency` — when each type generates invoices

### P2 — No entity-relationship context for AI
- [ ] The AI has no system-level understanding of the data model. Consider adding a system prompt or preamble describing:
  ```
  Company ──1:N──> Property ──1:N──> Lease ──1:N──> Payment
                      │                  │
                      │                  ├──> TenantAccount ──> Movements
                      │                  ├──> Invoice
                      │                  ├──> Amendment
                      │                  └──> Tenant
                      ├──> Unit
                      ├──> Visit / MaintenanceTask
                      └──> Owner
  InterestedProfile ──converts──> Tenant | Buyer
  InterestedProfile ──matches──> Property (auto-scored)
  ```

### P2 — Inline parameter schemas lack field descriptions
- [ ] ~57 tools use `z.object({ id: uuidSchema }).strict()` where `id` has no `.describe()` indicating *what entity* the ID refers to (property? lease? tenant?).
