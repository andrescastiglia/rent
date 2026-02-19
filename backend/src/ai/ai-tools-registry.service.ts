import { Injectable, Logger } from '@nestjs/common';
import { zodFunction } from 'openai/helpers/zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiExecutionContext, AiToolDefinition } from './types/ai-tool.types';

const OPENAI_PRIMITIVE_SCHEMA = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
const OPENAI_LOOSE_OBJECT_SCHEMA = z.record(
  z.string(),
  OPENAI_PRIMITIVE_SCHEMA,
);
const OPENAI_LOOSE_UNKNOWN_SCHEMA = z.union([
  OPENAI_PRIMITIVE_SCHEMA,
  z.array(OPENAI_PRIMITIVE_SCHEMA),
  OPENAI_LOOSE_OBJECT_SCHEMA,
  z.array(OPENAI_LOOSE_OBJECT_SCHEMA),
]);
const OPENAI_FALLBACK_PARAMETERS_SCHEMA = z
  .object({})
  .catchall(OPENAI_LOOSE_UNKNOWN_SCHEMA);
const OPENAI_TOOLS_LIMIT = 128;
const AI_PROMPT_ALIASES_FILENAME = 'ai-prompt-aliases.json';

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parsePromptAliases(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const parsed: Record<string, string[]> = {};
  for (const [rawKey, rawValue] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    const key = normalizeText(rawKey).trim();
    if (!key || !Array.isArray(rawValue)) {
      continue;
    }

    const values = rawValue
      .filter((item): item is string => typeof item === 'string')
      .map((item) => normalizeText(item).trim())
      .filter((item) => item.length > 0);

    if (values.length > 0) {
      parsed[key] = [...new Set(values)];
    }
  }

  return parsed;
}

function loadPromptAliasesFile(): Record<string, string[]> {
  const candidates = [
    join(__dirname, AI_PROMPT_ALIASES_FILENAME),
    join(process.cwd(), 'src', 'ai', AI_PROMPT_ALIASES_FILENAME),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const content = readFileSync(filePath, 'utf8');
      const raw = JSON.parse(content) as unknown;
      return parsePromptAliases(raw);
    } catch {
      continue;
    }
  }

  return {};
}

function withNullable(schema: any): any {
  if (schema instanceof z.ZodNull) {
    return schema;
  }

  if (schema instanceof z.ZodUnion) {
    const options = schema._def.options;
    const hasNull = options.some((option: any) => option instanceof z.ZodNull);
    if (hasNull) {
      return schema;
    }
    return z.union([...options, z.null()]);
  }

  return schema.nullable();
}

function transformPipeSchema(schema: z.ZodPipe<any, any>): any {
  const rawIn = (schema as any)._def.in;
  const rawOut = (schema as any)._def.out;
  const inSchema = toOpenAiCompatibleSchema(rawIn);
  const outSchema = toOpenAiCompatibleSchema(rawOut);

  // JSON Schema cannot represent transforms. Prefer a non-transform side.
  if (rawOut instanceof z.ZodTransform) {
    return inSchema;
  }
  if (rawIn instanceof z.ZodTransform) {
    return outSchema;
  }
  if (outSchema instanceof z.ZodUnknown || outSchema instanceof z.ZodAny) {
    return inSchema;
  }
  return outSchema;
}

function transformUnionSchema(schema: z.ZodUnion<any>): any {
  const options = (schema as any)._def.options.map((option: any) =>
    toOpenAiCompatibleSchema(option),
  );
  if (options.length === 0) {
    return z.never();
  }
  if (options.length === 1) {
    return options[0];
  }
  return z.union(options);
}

function transformTupleSchema(schema: z.ZodTuple<any, any>): any {
  const items = (schema as any)._def.items.map((item: any) =>
    toOpenAiCompatibleSchema(item),
  );
  const rest = (schema as any)._def.rest
    ? toOpenAiCompatibleSchema((schema as any)._def.rest)
    : null;
  return rest ? z.tuple(items, rest) : z.tuple(items);
}

function transformObjectSchema(schema: z.ZodObject<any>): any {
  const transformedShape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, value]) => [
      key,
      toOpenAiCompatibleSchema(value),
    ]),
  );
  const transformedObject = z.object(transformedShape);
  const catchall = (schema as any)._def.catchall;
  if (!catchall) {
    return transformedObject;
  }
  const transformedCatchall = toOpenAiCompatibleSchema(catchall);
  if (transformedCatchall instanceof z.ZodNever) {
    return transformedObject.strict();
  }
  return transformedObject.catchall(transformedCatchall);
}

function toOpenAiCompatibleSchema(schema: any): any {
  if (schema instanceof z.ZodDate) {
    return z.string().min(1);
  }
  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    return OPENAI_LOOSE_UNKNOWN_SCHEMA;
  }
  if (schema instanceof z.ZodPipe) {
    return transformPipeSchema(schema);
  }
  if (schema instanceof z.ZodTransform) {
    return OPENAI_LOOSE_UNKNOWN_SCHEMA;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return withNullable(toOpenAiCompatibleSchema(schema.unwrap()));
  }
  if (schema instanceof z.ZodDefault) {
    return toOpenAiCompatibleSchema(schema._def.innerType);
  }
  if (schema instanceof z.ZodReadonly) {
    return toOpenAiCompatibleSchema(schema._def.innerType).readonly();
  }
  if (schema instanceof z.ZodCatch) {
    return toOpenAiCompatibleSchema(schema._def.innerType).catch(
      schema._def.catchValue,
    );
  }
  if (schema instanceof z.ZodArray) {
    return z.array(toOpenAiCompatibleSchema(schema.element));
  }
  if (schema instanceof z.ZodRecord) {
    const keyType = toOpenAiCompatibleSchema(schema._def.keyType);
    const valueType = toOpenAiCompatibleSchema(schema._def.valueType);
    return z.record(keyType, valueType);
  }
  if (schema instanceof z.ZodUnion) {
    return transformUnionSchema(schema);
  }
  if (schema instanceof z.ZodTuple) {
    return transformTupleSchema(schema);
  }
  if (schema instanceof z.ZodIntersection) {
    return z.intersection(
      toOpenAiCompatibleSchema(schema._def.left),
      toOpenAiCompatibleSchema(schema._def.right),
    );
  }
  if (schema instanceof z.ZodLazy) {
    return z.lazy(() => toOpenAiCompatibleSchema(schema._def.getter()));
  }
  if (schema instanceof z.ZodObject) {
    return transformObjectSchema(schema);
  }
  return schema;
}

function toRootObjectSchema(schema: any): z.ZodObject<any> | null {
  let current = schema;

  while (current) {
    if (current instanceof z.ZodObject) {
      return current;
    }

    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
      continue;
    }

    if (
      current instanceof z.ZodDefault ||
      current instanceof z.ZodReadonly ||
      current instanceof z.ZodCatch
    ) {
      current = current._def.innerType;
      continue;
    }

    break;
  }

  return null;
}

function hasInvalidAnyOfBranch(anyOf: unknown[]): boolean {
  return anyOf.some((option) => {
    if (!option || typeof option !== 'object') {
      return true;
    }
    const optionNode = option as Record<string, unknown>;
    if (typeof optionNode.type !== 'string') {
      return true;
    }
    return hasInvalidAnyOfSchemaNode(optionNode);
  });
}

function hasInvalidAnyOfSchemaNode(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  if (Array.isArray(schema)) {
    return schema.some((item) => hasInvalidAnyOfSchemaNode(item));
  }

  const node = schema as Record<string, unknown>;
  if (Array.isArray(node.anyOf) && hasInvalidAnyOfBranch(node.anyOf)) {
    return true;
  }
  return Object.values(node).some((value) => hasInvalidAnyOfSchemaNode(value));
}

function inferTypeFromConst(value: unknown): string | null {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return null;
}

function inferTypeFromEnum(values: unknown[]): string | null {
  if (values.length === 0) return null;
  return inferTypeFromConst(values[0]);
}

function sanitizeAnyOfBranch(branch: Record<string, unknown>): void {
  if (typeof branch.type === 'string') {
    return;
  }

  if (Array.isArray(branch.enum)) {
    const inferred = inferTypeFromEnum(branch.enum);
    if (inferred) {
      branch.type = inferred;
      return;
    }
  }

  if ('const' in branch) {
    const inferred = inferTypeFromConst(branch.const);
    if (inferred) {
      branch.type = inferred;
      return;
    }
  }

  if ('items' in branch) {
    branch.type = 'array';
    return;
  }

  if ('properties' in branch || 'additionalProperties' in branch) {
    branch.type = 'object';
    if (
      branch.additionalProperties &&
      typeof branch.additionalProperties === 'object'
    ) {
      const nested = branch.additionalProperties as Record<string, unknown>;
      if (Object.keys(nested).length === 0) {
        branch.additionalProperties = true;
      }
    }
    return;
  }

  if (Object.keys(branch).length === 0) {
    branch.type = 'object';
    branch.additionalProperties = true;
  }
}

function sanitizeOpenAiSchemaNode(schema: unknown): void {
  if (!schema || typeof schema !== 'object') {
    return;
  }
  if (Array.isArray(schema)) {
    for (const item of schema) {
      sanitizeOpenAiSchemaNode(item);
    }
    return;
  }

  const node = schema as Record<string, unknown>;
  if (Array.isArray(node.anyOf)) {
    for (const branch of node.anyOf) {
      if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
        continue;
      }
      sanitizeAnyOfBranch(branch as Record<string, unknown>);
    }
  }

  if (
    node.additionalProperties &&
    typeof node.additionalProperties === 'object' &&
    !Array.isArray(node.additionalProperties)
  ) {
    const additional = node.additionalProperties as Record<string, unknown>;
    if (Object.keys(additional).length === 0) {
      node.additionalProperties = true;
    } else if (typeof additional.type !== 'string') {
      sanitizeAnyOfBranch(additional);
    }
  }

  for (const value of Object.values(node)) {
    sanitizeOpenAiSchemaNode(value);
  }
}

@Injectable()
export class AiToolsRegistryService {
  private readonly logger = new Logger(AiToolsRegistryService.name);
  private readonly warnedFallbackTools = new Set<string>();
  private readonly erroredBuildTools = new Set<string>();
  private readonly promptAliases = loadPromptAliasesFile();

  constructor(
    private readonly catalog: AiToolCatalogService,
    private readonly executor: AiToolExecutorService,
  ) {
    if (Object.keys(this.promptAliases).length === 0) {
      this.logger.warn(
        `Prompt aliases file "${AI_PROMPT_ALIASES_FILENAME}" not loaded or empty`,
      );
    }
  }

  getOpenAiTools(context: AiExecutionContext, prompt?: string) {
    const selected = this.selectDefinitionsForOpenAi(context, prompt);
    return selected.map((tool) => this.buildToolOrFallback(tool, context));
  }

  private buildToolOrFallback(
    tool: AiToolDefinition,
    context: AiExecutionContext,
  ) {
    const parameters = this.resolveParametersSchema(tool);

    try {
      const built = this.buildTool(tool, parameters, context);
      if (this.hasInvalidAnyOfSchema(built)) {
        this.logBuildErrorOnce(
          tool.name,
          `OpenAI schema validation failed for tool "${tool.name}" (invalid anyOf branch without type). Falling back to typed object schema.`,
        );
        return this.buildTool(tool, OPENAI_FALLBACK_PARAMETERS_SCHEMA, context);
      }
      return built;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logBuildErrorOnce(
        tool.name,
        `Failed to build OpenAI schema for tool "${tool.name}": ${message}. Falling back to typed object schema.`,
      );
      return this.buildTool(tool, OPENAI_FALLBACK_PARAMETERS_SCHEMA, context);
    }
  }

  private buildTool(
    tool: AiToolDefinition,
    parameters: z.ZodObject<any>,
    context: AiExecutionContext,
  ) {
    const description = tool.responseDescription
      ? `${tool.description} Returns: ${tool.responseDescription}`
      : tool.description;

    const built = zodFunction({
      name: tool.name,
      description,
      parameters: parameters as any,
      function: async (args: unknown) =>
        this.executor.execute(tool.name, args, context),
    });
    return this.sanitizeBuiltToolSchema(built);
  }

  private sanitizeBuiltToolSchema<T>(toolConfig: T): T {
    if (!toolConfig || typeof toolConfig !== 'object') {
      return toolConfig;
    }
    const candidate = toolConfig as Record<string, unknown>;
    const fnNode =
      candidate.function && typeof candidate.function === 'object'
        ? (candidate.function as Record<string, unknown>)
        : null;
    if (
      !fnNode ||
      !fnNode.parameters ||
      typeof fnNode.parameters !== 'object'
    ) {
      return toolConfig;
    }
    sanitizeOpenAiSchemaNode(fnNode.parameters);
    return toolConfig;
  }

  private resolveParametersSchema(tool: AiToolDefinition): z.ZodObject<any> {
    let transformed: unknown;
    try {
      transformed = toOpenAiCompatibleSchema(tool.parameters);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logBuildErrorOnce(
        tool.name,
        `Failed to transform OpenAI schema for tool "${tool.name}": ${message}. Using passthrough object schema.`,
      );
      return OPENAI_FALLBACK_PARAMETERS_SCHEMA;
    }

    const rootObject = toRootObjectSchema(transformed);
    if (!rootObject) {
      if (
        tool.parameters instanceof z.ZodUnknown ||
        tool.parameters instanceof z.ZodAny
      ) {
        return OPENAI_FALLBACK_PARAMETERS_SCHEMA;
      }
      this.logWarnOnce(
        tool.name,
        `OpenAI tool schema for "${tool.name}" is not an object after transform; using typed object fallback`,
      );
      return OPENAI_FALLBACK_PARAMETERS_SCHEMA;
    }

    return rootObject;
  }

  private logWarnOnce(toolName: string, message: string): void {
    if (this.warnedFallbackTools.has(toolName)) {
      return;
    }
    this.warnedFallbackTools.add(toolName);
    this.logger.warn(message);
  }

  private logBuildErrorOnce(toolName: string, message: string): void {
    if (this.erroredBuildTools.has(toolName)) {
      return;
    }
    this.erroredBuildTools.add(toolName);
    this.logger.error(message);
  }

  private hasInvalidAnyOfSchema(toolConfig: unknown): boolean {
    const sanitized = this.sanitizeBuiltToolSchema(toolConfig);
    if (!sanitized || typeof sanitized !== 'object') {
      return true;
    }

    const candidate = sanitized as Record<string, unknown>;
    const fnNode =
      candidate.function && typeof candidate.function === 'object'
        ? (candidate.function as Record<string, unknown>)
        : null;
    const parameters = fnNode?.parameters;
    return hasInvalidAnyOfSchemaNode(parameters);
  }

  private selectDefinitionsForOpenAi(
    context: AiExecutionContext,
    prompt?: string,
  ): AiToolDefinition[] {
    const mode = this.executor.getMode();
    const eligible = this.catalog.getDefinitions().filter((tool) => {
      if (!tool.allowedRoles.includes(context.role)) {
        return false;
      }
      if (mode === 'NONE') {
        return false;
      }
      if (mode === 'READONLY' && tool.mutability === 'mutable') {
        return false;
      }
      return true;
    });

    if (eligible.length <= OPENAI_TOOLS_LIMIT) {
      return eligible;
    }

    const ranked = this.rankToolsByPrompt(eligible, prompt);
    const selected = ranked.slice(0, OPENAI_TOOLS_LIMIT);
    this.logger.warn(
      `OpenAI tools trimmed from ${eligible.length} to ${selected.length} for user ${context.userId}`,
    );
    return selected;
  }

  private rankToolsByPrompt(
    tools: AiToolDefinition[],
    prompt?: string,
  ): AiToolDefinition[] {
    const tokens = this.expandPromptTokens(prompt);
    if (tokens.length === 0) {
      return [...tools].sort((a, b) => a.name.localeCompare(b.name));
    }

    return [...tools].sort((a, b) => {
      const scoreDiff = this.toolScore(b, tokens) - this.toolScore(a, tokens);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      if (a.mutability !== b.mutability) {
        return a.mutability === 'readonly' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  private expandPromptTokens(prompt?: string): string[] {
    if (!prompt) {
      return [];
    }

    const normalized = normalizeText(prompt);
    const baseTokens = normalized
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 3);
    const expanded = new Set(baseTokens);

    for (const token of baseTokens) {
      const aliases = this.promptAliases[token];
      if (!aliases) {
        continue;
      }
      for (const alias of aliases) {
        expanded.add(normalizeText(alias));
      }
    }

    return [...expanded];
  }

  private toolScore(tool: AiToolDefinition, tokens: string[]): number {
    const name = normalizeText(tool.name);
    const description = normalizeText(tool.description);
    let score = 0;
    for (const token of tokens) {
      if (name.includes(token)) {
        score += 6;
      }
      if (description.includes(token)) {
        score += 3;
      }
    }
    return score;
  }
}
