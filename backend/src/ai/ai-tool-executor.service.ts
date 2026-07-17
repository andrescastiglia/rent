import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/entities/user.entity';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import {
  AiExecutionContext,
  AiToolDefinition,
  AiToolsMode,
} from './types/ai-tool.types';

@Injectable()
export class AiToolExecutorService {
  private readonly logger = new Logger(AiToolExecutorService.name);
  private readonly unsafeObjectKeys = new Set([
    '__proto__',
    'constructor',
    'prototype',
  ]);

  constructor(
    private readonly catalog: AiToolCatalogService,
    private readonly dataSource: DataSource,
  ) {}

  getMode(): AiToolsMode {
    const raw = (process.env.AI_TOOLS_MODE || 'NONE').toUpperCase();
    if (raw === 'READONLY' || raw === 'FULL') {
      return raw;
    }
    return 'NONE';
  }

  listTools() {
    const mode = this.getMode();
    return this.catalog.getDefinitions().map((tool) => ({
      name: tool.name,
      description: tool.description,
      mutability: tool.mutability,
      enabled:
        mode === 'FULL' ||
        (mode === 'READONLY' && tool.mutability === 'readonly'),
      allowedRoles: tool.allowedRoles,
    }));
  }

  async execute(
    toolName: string,
    args: unknown,
    context: AiExecutionContext,
  ): Promise<unknown> {
    const startedAt = Date.now();
    const mode = this.getMode();
    const definition = this.catalog.getDefinitionByName(toolName);

    if (!definition) {
      throw new NotFoundException(`AI tool not found: ${toolName}`);
    }

    this.assertModeAllowsExecution(mode, definition);
    this.assertRoleAllowed(definition, context.role);
    this.assertContext(context);

    const parsed = this.parseArguments(definition, args ?? {});
    let confirmationId: string | null = null;
    if (definition.mutability === 'mutable') {
      const confirmation = await this.requireMutationConfirmation(
        definition,
        parsed,
        context,
      );
      if (!confirmation.confirmed) return confirmation.preview;
      confirmationId = confirmation.id;
    }
    this.auditLog('start', toolName, context, this.redactSensitive(parsed));

    try {
      const result = await definition.execute(parsed, context);
      const sanitized = this.sanitizeOutput(result);
      if (confirmationId) {
        await this.finishConfirmation(confirmationId, 'executed', sanitized);
      }
      this.auditLog('success', toolName, context, {
        latencyMs: Date.now() - startedAt,
      });
      return sanitized;
    } catch (error) {
      if (confirmationId) {
        await this.finishConfirmation(confirmationId, 'failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.auditLog('error', toolName, context, {
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async requireMutationConfirmation(
    definition: AiToolDefinition,
    parsed: unknown,
    context: AiExecutionContext,
  ): Promise<
    | { confirmed: true; id: string }
    | { confirmed: false; preview: Record<string, unknown> }
  > {
    if (!context.conversationId) {
      throw new ForbiddenException(
        `Tool ${definition.name} requires a conversationId for auditable confirmation`,
      );
    }
    const payloadHash = this.hash(parsed);
    if (!context.confirmMutation) {
      const ttlSeconds = Math.min(
        Math.max(
          Number(process.env.AI_MUTATION_CONFIRMATION_TTL_SECONDS ?? 900),
          60,
        ),
        3600,
      );
      const result = await this.dataSource.query(
        `INSERT INTO ai_tool_mutation_confirmations (
           conversation_id, company_id, user_id, tool_name, payload,
           payload_hash, status, expires_at
         )
         SELECT conv.id, $2::uuid, $3::uuid, $4, $5::jsonb, $6,
                'pending', NOW() + ($7::integer * INTERVAL '1 second')
           FROM ai_conversations conv
          WHERE conv.id = $1::uuid AND conv.user_id = $3::uuid
            AND (conv.company_id IS NULL OR conv.company_id = $2::uuid)
         RETURNING id`,
        [
          context.conversationId,
          context.companyId ?? null,
          context.userId,
          definition.name,
          JSON.stringify(this.redactSensitive(parsed)),
          payloadHash,
          ttlSeconds,
        ],
      );
      const rows = this.mutationRows<{ id: string }>(result);
      const id = rows[0]?.id;
      if (!id) {
        throw new ForbiddenException('Could not create mutation preview');
      }
      return {
        confirmed: false,
        preview: {
          status: 'pending_confirmation',
          confirmationId: id,
          toolName: definition.name,
          payload: this.redactSensitive(parsed),
          message:
            'La operación no fue ejecutada. Solicitá confirmación explícita del usuario.',
        },
      };
    }

    const result = await this.dataSource.query(
      `UPDATE ai_tool_mutation_confirmations
          SET status = 'confirmed', confirmed_at = NOW()
        WHERE id = COALESCE(
          $1::uuid,
          (
            SELECT id FROM ai_tool_mutation_confirmations
             WHERE conversation_id = $2::uuid AND user_id = $3::uuid
               AND tool_name = $4 AND payload_hash = $5
               AND status = 'pending' AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1
          )
        )
          AND conversation_id = $2::uuid AND user_id = $3::uuid
          AND (company_id IS NULL OR company_id = $6::uuid)
          AND tool_name = $4 AND payload_hash = $5
          AND status = 'pending' AND expires_at > NOW()
        RETURNING id`,
      [
        context.confirmationId ?? null,
        context.conversationId,
        context.userId,
        definition.name,
        payloadHash,
        context.companyId,
      ],
    );
    const rows = this.mutationRows<{ id: string }>(result);
    const id = rows[0]?.id;
    if (!id) {
      throw new ForbiddenException(
        'No matching unexpired mutation preview was found',
      );
    }
    return { confirmed: true, id };
  }

  private async finishConfirmation(
    id: string,
    status: 'executed' | 'failed',
    result: unknown,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE ai_tool_mutation_confirmations
          SET status = $2, executed_at = NOW(), result_hash = $3
        WHERE id = $1::uuid AND status = 'confirmed'`,
      [id, status, this.hash(result)],
    );
  }

  private hash(value: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(this.sortValue(value)))
      .digest('hex');
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortValue(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.sortValue(item)]),
      );
    }
    return value;
  }

  private redactSensitive(value: unknown): unknown {
    const sensitive =
      /password|secret|token|authorization|api[-_]?key|private[-_]?key/i;
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitive(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          sensitive.test(key) ? '[REDACTED]' : this.redactSensitive(item),
        ]),
      );
    }
    return value;
  }

  private mutationRows<T>(result: unknown): T[] {
    if (
      Array.isArray(result) &&
      result.length === 2 &&
      Array.isArray(result[0]) &&
      typeof result[1] === 'number'
    ) {
      return result[0] as T[];
    }
    return result as T[];
  }

  private parseArguments(definition: AiToolDefinition, args: unknown): unknown {
    const firstPass = definition.parameters.safeParse(args);
    if (firstPass.success) {
      return firstPass.data;
    }

    const normalizedArgs = this.nullsToUndefined(args);
    const secondPass = definition.parameters.safeParse(normalizedArgs);
    if (secondPass.success) {
      return secondPass.data;
    }

    throw firstPass.error;
  }

  private nullsToUndefined(value: unknown): unknown {
    if (value === null) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.nullsToUndefined(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => !this.unsafeObjectKeys.has(key))
          .map(([key, val]) => [key, this.nullsToUndefined(val)]),
      );
    }

    return value;
  }

  private assertModeAllowsExecution(
    mode: AiToolsMode,
    definition: AiToolDefinition,
  ): void {
    if (mode === 'NONE') {
      throw new ForbiddenException('AI tools are disabled');
    }

    if (mode === 'READONLY' && definition.mutability === 'mutable') {
      throw new ForbiddenException(
        `Tool ${definition.name} is not allowed in READONLY mode`,
      );
    }
  }

  private assertRoleAllowed(
    definition: AiToolDefinition,
    role: UserRole,
  ): void {
    if (!definition.allowedRoles.includes(role)) {
      throw new ForbiddenException(
        `Role ${role} is not allowed to execute ${definition.name}`,
      );
    }
  }

  private assertContext(context: AiExecutionContext): void {
    if (!context.userId) {
      throw new ForbiddenException('Execution context is missing userId');
    }
    if (!context.companyId) {
      throw new ForbiddenException('Execution context is missing companyId');
    }
  }

  private sanitizeOutput(value: unknown): unknown {
    const blockedKey =
      /password|secret|token|authorization|api[-_]?key|private[-_]?key/i;

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeOutput(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => !blockedKey.test(key))
          .map(([key, val]) => [key, this.sanitizeOutput(val)]),
      );
    }

    return value;
  }

  private auditLog(
    event: 'start' | 'success' | 'error',
    toolName: string,
    context: AiExecutionContext,
    data: unknown,
  ): void {
    const payload = {
      timestamp: new Date().toISOString(),
      event,
      toolName,
      companyId: context.companyId,
      userId: context.userId,
      role: context.role,
      data,
    };
    this.logger.log(JSON.stringify(payload));
  }
}
