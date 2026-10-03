import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import { z } from 'zod';
import { AiToolsRegistryService } from './ai-tools-registry.service';
import { AiExecutionContext, AiUiAction } from './types/ai-tool.types';
import { accessiblePages, validatePageAction } from './ai-page-catalog';
import { AiChatMessage } from './dto/ai-chat-request.dto';
import { UserRole } from '../users/entities/user.entity';

type OpenAiApiErrorShape = {
  status?: number;
  message?: string;
  requestID?: string;
  code?: string;
  type?: string;
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
};

const AI_RELATIONSHIP_MD_FILENAME = 'ai-domain-relationships.md';
const RELATIONSHIP_CONTEXT_FALLBACK = `
You are an assistant for a property management backend.
Always reason using entity relationships and IDs.
Resolve names to IDs first. Do not invent records.
Group results by relationship path (owner -> properties -> leases -> invoices/payments, tenant -> leases -> properties -> payments/invoices/activities).
Prefer readonly tools unless the user explicitly asks to mutate data.
`.trim();

type RelationshipContext = {
  content: string;
  source: 'file' | 'fallback';
};

type RunnableTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
  $parseRaw?: (value: string) => unknown;
  $callback?: (args: unknown) => unknown;
};

function loadRelationshipContext(): RelationshipContext {
  const candidates = [
    join(__dirname, AI_RELATIONSHIP_MD_FILENAME),
    join(process.cwd(), 'src', 'ai', AI_RELATIONSHIP_MD_FILENAME),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf8').trim();
      if (content.length > 0) {
        return { content, source: 'file' };
      }
    } catch {
      continue;
    }
  }

  return { content: RELATIONSHIP_CONTEXT_FALLBACK, source: 'fallback' };
}

@Injectable()
export class AiOpenAiService {
  private readonly logger = new Logger(AiOpenAiService.name);
  private readonly relationshipContext = loadRelationshipContext();

  constructor(private readonly registry: AiToolsRegistryService) {
    if (this.relationshipContext.source === 'fallback') {
      this.logger.warn(
        `AI relationship context file "${AI_RELATIONSHIP_MD_FILENAME}" not found; using fallback context`,
      );
    }
  }

  async respond(
    prompt: string,
    context: AiExecutionContext,
    history?: AiChatMessage[],
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    const baseURL = process.env.OPENAI_BASE_URL;

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is not configured in backend environment',
      );
    }

    if (!model) {
      throw new ServiceUnavailableException(
        'OPENAI_MODEL is not configured in backend environment',
      );
    }

    const client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });

    const conversationHistory = (history ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const rolePreamble = this.buildRolePreamble(context.role);

    try {
      // Reasoning options are model-dependent. Do not send an unsupported
      // default to non-reasoning models or models that reject effort=none.
      const reasoningEffort = z
        .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
        .optional()
        .parse(process.env.OPENAI_REASONING_EFFORT?.trim() || undefined);
      const executionContext: AiExecutionContext = {
        ...context,
        confirmMutation:
          context.mutationApprovalMode === 'staff_queue'
            ? false
            : this.isExplicitConfirmation(prompt),
      };
      const tools = this.registry.getOpenAiTools(
        executionContext,
        prompt,
      ) as RunnableTool[];
      let uiAction: AiUiAction | undefined;
      const knownIds = new Set<string>();
      if (context.channel === 'web') {
        const schema = z
          .object({
            path: z.string().max(300),
            intent: z.enum(['help', 'edit', 'create']),
            field: z.string().max(100).nullable(),
            instruction: z.string().min(1).max(600),
            recordId: z.string().uuid().nullable(),
            openControl: z.string().max(100).nullable().optional(),
          })
          .strict();
        tools.push({
          type: 'function',
          function: {
            name: 'show_application_page',
            description:
              'Open an authorized application page and display contextual help. Use for navigation, usage help and ALL requested web changes. This ONLY opens a screen/form and highlights a control; it never fills values, saves, submits or mutates records. Resolve record names with readonly tools first. For inline editors use the list page with intent edit and recordId (users, staff, maintenance, sales). On edit routes leave recordId null. For modal creation use intent create. openControl selects an alternative registered opener from the page catalog (sale-folder, user-password); null opens the default editor. field must be a control identifier in the page catalog, or null for automatic help. Template editor accepts ?scope=contract_rental|contract_sale|receipt|invoice|credit_note&templateId=resolved-UUID. Payment creation accepts ?leaseId=resolved-UUID. Other query parameters are forbidden.',
            parameters: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                intent: { type: 'string', enum: ['help', 'edit', 'create'] },
                field: { type: ['string', 'null'] },
                instruction: { type: 'string' },
                recordId: { type: ['string', 'null'] },
                openControl: { type: ['string', 'null'] },
              },
              required: [
                'path',
                'intent',
                'field',
                'instruction',
                'recordId',
                'openControl',
              ],
            },
          },
          $parseRaw: (raw) => schema.parse(JSON.parse(raw)),
          $callback: (args) => {
            const parsed = schema.parse(args);
            uiAction = validatePageAction(
              {
                type: 'navigate',
                guide: 'screen',
                path: parsed.path,
                intent: parsed.intent,
                instruction: parsed.instruction,
                ...(parsed.field ? { field: parsed.field } : {}),
                ...(parsed.recordId ? { recordId: parsed.recordId } : {}),
                ...(parsed.openControl
                  ? { openControl: parsed.openControl }
                  : {}),
              },
              context,
              knownIds,
            );
            return { status: 'form_guidance', saved: false, uiAction };
          },
        });
      }
      const responseTools = tools.map((tool) => ({
        type: 'function' as const,
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        strict: tool.function.strict ?? true,
      }));
      const instructions = [
        'Use the following DB relationship map as hard context for tool planning.',
        this.relationshipContext.content,
        rolePreamble,
        `Current date in America/Argentina/Buenos_Aires: ${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}. Resolve today/yesterday/date ranges against this date, not your training data.`,
        'Help users operate this application as well as query its stored data. Explain known workflows; never ask for passwords in chat. For data requests, consult authorized tools and return the results directly in concise Markdown: a heading, currency totals, and a small table or list. Never replace a data answer with navigation instructions. Never treat a paginated list as a complete collection total.',
        context.channel === 'whatsapp'
          ? 'Channel: WhatsApp. This channel can display authorized data and propose changes; it cannot navigate, open pages, highlight controls or show help bubbles. Never claim to do so. Use short paragraphs and lists; avoid Markdown tables, HTML and JSON.'
          : context.channel === 'web'
            ? `Channel: web. ALL modifications must use show_application_page and be completed manually by the user. Even if the user says confirm/save, you never execute a mutation or submit a form. Open the actual record's edit page (not just its list) whenever there is an edit route. Describe what to change in the help bubble and leave the final Save to the user. Do not collect passwords. Usage/navigation requests also use show_application_page. Return data queries in chat without navigating unless navigation is requested. Current page: ${context.currentPath ?? 'unknown'}. Available pages and control identifiers (replace [id] etc with IDs resolved by authorized reads):\n${JSON.stringify(accessiblePages(context))}`
            : 'Channel: application chat. Do not claim to navigate or highlight controls unless an application UI action was actually supplied.',
        context.roleDataContext
          ? `The following JSON is the complete authorized data scope for this user. Answer data questions only from it and never request records by arbitrary IDs. Application usage guidance may also use the documented workflows:\n${context.roleDataContext}`
          : '',
        context.mutationApprovalMode === 'staff_queue'
          ? 'Any create, update, or delete operation is only a proposal. For a mutation intent, you must call the appropriate tool. Only say it was queued for staff review when the tool result has status pending_confirmation; never claim it was executed.'
          : '',
      ].join('\n\n');
      let mutationProposalQueued = false;
      let response = await client.responses.create({
        model,
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        instructions,
        input: [...conversationHistory, { role: 'user', content: prompt }],
        tools: responseTools,
        ...(context.mutationIntent
          ? { tool_choice: 'required' as const, parallel_tool_calls: false }
          : {}),
      } as OpenAI.Responses.ResponseCreateParamsNonStreaming);
      const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

      for (let round = 0; round < 8; round += 1) {
        this.addUsage(usage, response.usage);
        const calls = response.output.filter(
          (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
            item.type === 'function_call',
        );
        if (calls.length === 0) {
          if (
            context.mutationIntent &&
            context.mutationApprovalMode === 'staff_queue' &&
            !mutationProposalQueued
          ) {
            return {
              model: response.model,
              outputText:
                'No pude registrar la solicitud como tarea pendiente. Revisá los datos e intentá nuevamente.',
              usage,
            };
          }
          return {
            model: response.model,
            outputText: response.output_text ?? '',
            usage,
            ...(uiAction && context.channel === 'web' ? { uiAction } : {}),
          };
        }

        const outputs = await Promise.all(
          calls.map(async (call) => {
            const tool = tools.find(
              (candidate) => candidate.function.name === call.name,
            );
            if (!tool?.$callback) {
              return this.toolOutput(call.call_id, {
                error: `Unknown tool: ${call.name}`,
              });
            }
            try {
              const args = tool.$parseRaw
                ? tool.$parseRaw(call.arguments)
                : JSON.parse(call.arguments);
              const result = await tool.$callback(args);
              if (call.name !== 'show_application_page')
                this.collectRecordIds(result, knownIds);
              mutationProposalQueued =
                mutationProposalQueued ||
                this.isPendingMutationProposal(result);
              return this.toolOutput(call.call_id, result);
            } catch (error) {
              return this.toolOutput(call.call_id, {
                error:
                  error instanceof Error
                    ? error.message
                    : 'Tool execution failed',
              });
            }
          }),
        );

        response = await client.responses.create({
          model,
          ...(reasoningEffort
            ? { reasoning: { effort: reasoningEffort } }
            : {}),
          previous_response_id: response.id,
          instructions,
          input: outputs,
          tools: responseTools,
        } as OpenAI.Responses.ResponseCreateParamsNonStreaming);
      }

      throw new Error('OpenAI tool loop exceeded 8 rounds');
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  private isExplicitConfirmation(prompt: string): boolean {
    return /^\s*(?:s[ií]|confirmo|confirmar|confirmado|adelante|proced[eé]|ejecut[aá])(?:\s|[.!])*$/i.test(
      prompt,
    );
  }

  private collectRecordIds(value: unknown, ids: Set<string>): void {
    if (Array.isArray(value)) {
      value.forEach((item) => this.collectRecordIds(item, ids));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (
          /(?:^id$|Id$|_id$)/.test(key) &&
          typeof item === 'string' &&
          z.string().uuid().safeParse(item).success
        )
          ids.add(item);
        else if (item && typeof item === 'object')
          this.collectRecordIds(item, ids);
      }
    }
  }

  private isPendingMutationProposal(value: unknown): boolean {
    return (
      !!value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>).status === 'pending_confirmation'
    );
  }

  private toolOutput(callId: string, value: unknown) {
    let output: string;
    try {
      output = JSON.stringify(value ?? null);
    } catch {
      output = JSON.stringify({
        error: 'Tool returned non-serializable output',
      });
    }
    return { type: 'function_call_output' as const, call_id: callId, output };
  }

  private addUsage(
    target: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    },
    source: OpenAI.Responses.ResponseUsage | null | undefined,
  ): void {
    target.input_tokens += source?.input_tokens ?? 0;
    target.output_tokens += source?.output_tokens ?? 0;
    target.total_tokens += source?.total_tokens ?? 0;
  }

  private mapProviderError(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    if (this.isOpenAiApiError(error)) {
      const status = this.normalizeStatus(error.status);
      const message =
        error.error?.message ||
        error.message ||
        'OpenAI request failed unexpectedly';
      const code = error.error?.code || error.code || null;
      const type = error.error?.type || error.type || null;
      const requestId = error.requestID ?? null;

      const requestIdSuffix = requestId ? ` [${requestId}]` : '';
      const logMessage = `OpenAI provider error (${status})${requestIdSuffix}: ${message}`;

      if (status >= 500) {
        this.logger.error(logMessage);
      } else {
        this.logger.warn(logMessage);
      }

      return new HttpException(
        {
          statusCode: status,
          message,
          error: 'OpenAIError',
          provider: 'openai',
          code,
          type,
          requestId,
        },
        status,
      );
    }

    const genericMessage =
      error instanceof Error ? error.message : 'AI provider request failed';
    this.logger.error(`Unexpected AI provider error: ${genericMessage}`);
    return new BadGatewayException({
      statusCode: 502,
      message: genericMessage,
      error: 'BadGateway',
      provider: 'openai',
    });
  }

  private normalizeStatus(status: unknown): number {
    if (typeof status !== 'number') {
      return 502;
    }

    if (status < 400 || status > 599) {
      return 502;
    }

    return status;
  }

  private isOpenAiApiError(error: unknown): error is OpenAiApiErrorShape {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as Record<string, unknown>;
    return (
      'status' in candidate ||
      'requestID' in candidate ||
      'error' in candidate ||
      'code' in candidate ||
      'type' in candidate
    );
  }

  private buildRolePreamble(role: UserRole): string {
    switch (role) {
      case UserRole.ADMIN:
        return [
          'The user is an ADMIN with full access to all entities and operations.',
          'They manage properties, owners, tenants, leases, payments, invoices, settlements, interested prospects, sales, and staff.',
          'They can create, update, and delete any record. Proactively provide detailed data and actionable summaries.',
        ].join(' ');

      case UserRole.STAFF:
        return [
          'The user is a STAFF member with broad operational access.',
          'They handle day-to-day property management: leases, payments, invoices, interested prospects, visits, and activities.',
          'They can create and modify most records but cannot manage users or company settings.',
          'Focus on operational efficiency and clear status updates.',
        ].join(' ');

      case UserRole.OWNER:
        return [
          'The user is a property OWNER.',
          'They can view their own properties, leases, tenants, invoices, payments, and settlements.',
          "They CANNOT see other owners' data or manage the interested pipeline.",
          'Focus responses on their portfolio: rental income, pending payments, settlement status, and property occupancy.',
          'All queries are automatically scoped to their properties.',
        ].join(' ');

      case UserRole.TENANT:
        return [
          'The user is a TENANT.',
          'They can view their own leases, invoices, payments, balance (cuenta corriente), and receipts.',
          "They CANNOT see other tenants' data, property listings, or owner information.",
          'Focus responses on their obligations: upcoming payments, current balance, lease details, and payment history.',
          'All queries are automatically scoped to their tenant account.',
        ].join(' ');

      default:
        return 'The user has limited access. Only show data they are authorized to view.';
    }
  }
}
