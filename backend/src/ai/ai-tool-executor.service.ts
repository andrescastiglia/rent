import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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

  constructor(private readonly catalog: AiToolCatalogService) {}

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
    this.auditLog('start', toolName, context, parsed);

    try {
      const result = await definition.execute(parsed, context);
      const sanitized = this.sanitizeOutput(result);
      this.auditLog('success', toolName, context, {
        latencyMs: Date.now() - startedAt,
      });
      return sanitized;
    } catch (error) {
      this.auditLog('error', toolName, context, {
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
      const output: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(
        value as Record<string, unknown>,
      )) {
        output[key] = this.nullsToUndefined(val);
      }
      return output;
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
  }

  private sanitizeOutput(value: unknown): unknown {
    const blockedKeys = new Set(['password', 'passwordHash']);

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeOutput(item));
    }

    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (blockedKeys.has(key)) {
          continue;
        }
        output[key] = this.sanitizeOutput(val);
      }
      return output;
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
