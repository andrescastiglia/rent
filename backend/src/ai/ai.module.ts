import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { DocumentsModule } from '../documents/documents.module';
import { InterestedModule } from '../interested/interested.module';
import { UsersModule } from '../users/users.module';
import { PropertiesModule } from '../properties/properties.module';
import { LeasesModule } from '../leases/leases.module';
import { OwnersModule } from '../owners/owners.module';
import { PaymentsModule } from '../payments/payments.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SalesModule } from '../sales/sales.module';
import { TenantsModule } from '../tenants/tenants.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { StaffModule } from '../staff/staff.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiController } from './ai.controller';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiOpenAiService } from './ai-openai.service';
import { AiToolRegistryDepsProvider } from './ai-tool-registry-deps.provider';
import { AiToolsRegistryService } from './ai-tools-registry.service';
import { AiConversationsService } from './ai-conversations.service';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiGithubIssuePreview } from './entities/ai-github-issue-preview.entity';
import { AiKnowledgeChunk } from './entities/ai-knowledge-chunk.entity';
import { AiEmbeddingOutbox } from './entities/ai-embedding-outbox.entity';
import { AiRagRun } from './entities/ai-rag-run.entity';
import { AiRagShadowComparison } from './entities/ai-rag-shadow-comparison.entity';
import { GithubIssuesService } from './github-issues.service';
import { AiRagController } from './ai-rag.controller';
import { AiIntentClassifierService } from './rag/ai-intent-classifier.service';
import { AiQueryEmbeddingService } from './rag/ai-query-embedding.service';
import { AiVectorRetrieverService } from './rag/ai-vector-retriever.service';
import { AiStructuredRetrieverService } from './rag/ai-structured-retriever.service';
import { AiEvidenceValidatorService } from './rag/ai-evidence-validator.service';
import { AiAnswerGeneratorService } from './rag/ai-answer-generator.service';
import { AiRagAuditService } from './rag/ai-rag-audit.service';
import { AiRagOrchestratorService } from './rag/ai-rag-orchestrator.service';
import { AiRagRolloutService } from './rag/ai-rag-rollout.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiConversation,
      AiGithubIssuePreview,
      AiKnowledgeChunk,
      AiEmbeddingOutbox,
      AiRagRun,
      AiRagShadowComparison,
    ]),
    AuthModule,
    CurrenciesModule,
    DocumentsModule,
    InterestedModule,
    UsersModule,
    PropertiesModule,
    LeasesModule,
    OwnersModule,
    PaymentsModule,
    DashboardModule,
    SalesModule,
    TenantsModule,
    WhatsappModule,
    StaffModule,
    MaintenanceModule,
    BankAccountsModule,
    SettlementsModule,
    NotificationsModule,
  ],
  controllers: [AiController, AiRagController],
  providers: [
    GithubIssuesService,
    AiConversationsService,
    AiToolRegistryDepsProvider,
    AiToolCatalogService,
    AiToolExecutorService,
    AiOpenAiService,
    AiToolsRegistryService,
    AiIntentClassifierService,
    AiQueryEmbeddingService,
    AiVectorRetrieverService,
    AiStructuredRetrieverService,
    AiEvidenceValidatorService,
    AiAnswerGeneratorService,
    AiRagAuditService,
    AiRagOrchestratorService,
    AiRagRolloutService,
  ],
  exports: [
    AiToolCatalogService,
    AiToolExecutorService,
    AiOpenAiService,
    AiToolsRegistryService,
    AiConversationsService,
    AiRagOrchestratorService,
    AiRagRolloutService,
  ],
})
export class AiModule {}
