import { Injectable, Logger } from '@nestjs/common';
import { zodFunction } from 'openai/helpers/zod';
import { z } from 'zod';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiExecutionContext, AiToolDefinition } from './types/ai-tool.types';

const OPENAI_FALLBACK_PARAMETERS_SCHEMA = z.object({}).passthrough();
const OPENAI_LOOSE_UNKNOWN_SCHEMA = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.object({}).passthrough(),
    z.array(z.object({}).passthrough()),
    z.array(z.string()),
    z.array(z.number()),
    z.array(z.boolean()),
  ])
  .nullable();

function toOpenAiCompatibleSchema(schema: any): any {
  if (schema instanceof z.ZodDate) {
    // OpenAI tool schemas do not support "date" directly.
    return z.string().min(1);
  }

  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    return OPENAI_LOOSE_UNKNOWN_SCHEMA;
  }

  if (schema instanceof z.ZodPipe) {
    const inSchema = toOpenAiCompatibleSchema((schema as any)._def.in);
    const outSchema = toOpenAiCompatibleSchema((schema as any)._def.out);

    // JSON Schema cannot represent transforms. Prefer a non-transform side.
    if (!(outSchema instanceof z.ZodTransform)) {
      return outSchema;
    }
    if (!(inSchema instanceof z.ZodTransform)) {
      return inSchema;
    }

    // Last resort: accept unknown and let executor re-validate with original DTO.
    return z.unknown();
  }

  if (schema instanceof z.ZodTransform) {
    // Transforms are runtime-only. Use unknown for OpenAI schema generation.
    return z.unknown();
  }

  if (schema instanceof z.ZodOptional) {
    return toOpenAiCompatibleSchema(schema.unwrap()).nullable();
  }

  if (schema instanceof z.ZodNullable) {
    return toOpenAiCompatibleSchema(schema.unwrap()).nullable();
  }

  if (schema instanceof z.ZodDefault) {
    return toOpenAiCompatibleSchema((schema as any)._def.innerType);
  }

  if (schema instanceof z.ZodReadonly) {
    return toOpenAiCompatibleSchema((schema as any)._def.innerType).readonly();
  }

  if (schema instanceof z.ZodCatch) {
    return toOpenAiCompatibleSchema((schema as any)._def.innerType).catch(
      (schema as any)._def.catchValue,
    );
  }

  if (schema instanceof z.ZodArray) {
    return z.array(toOpenAiCompatibleSchema(schema.element));
  }

  if (schema instanceof z.ZodRecord) {
    const keyType = toOpenAiCompatibleSchema((schema as any)._def.keyType);
    const valueType = toOpenAiCompatibleSchema((schema as any)._def.valueType);
    return z.record(keyType as any, valueType);
  }

  if (schema instanceof z.ZodUnion) {
    const options = (schema as any)._def.options.map((option: any) =>
      toOpenAiCompatibleSchema(option),
    );
    if (options.length === 0) {
      return z.never();
    }
    if (options.length === 1) {
      return options[0];
    }
    return z.union(options as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  if (schema instanceof z.ZodTuple) {
    const items = (schema as any)._def.items.map((item: any) =>
      toOpenAiCompatibleSchema(item),
    );
    const rest = (schema as any)._def.rest
      ? toOpenAiCompatibleSchema((schema as any)._def.rest)
      : null;
    return rest
      ? z.tuple(items as [z.ZodTypeAny, ...z.ZodTypeAny[]], rest)
      : z.tuple(items as [z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  if (schema instanceof z.ZodIntersection) {
    return z.intersection(
      toOpenAiCompatibleSchema((schema as any)._def.left),
      toOpenAiCompatibleSchema((schema as any)._def.right),
    );
  }

  if (schema instanceof z.ZodLazy) {
    return z.lazy(() =>
      toOpenAiCompatibleSchema((schema as any)._def.getter()),
    );
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const transformedShape: Record<string, any> = {};
    for (const [key, value] of Object.entries(shape)) {
      transformedShape[key] = toOpenAiCompatibleSchema(value);
    }

    let transformedObject = z.object(transformedShape);
    const catchall = (schema as any)._def.catchall as any;
    if (catchall) {
      const transformedCatchall = toOpenAiCompatibleSchema(catchall);
      if (transformedCatchall instanceof z.ZodNever) {
        transformedObject = transformedObject.strict();
      } else {
        transformedObject = transformedObject.catchall(transformedCatchall);
      }
    }
    return transformedObject;
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
      current = (current as any)._def.innerType;
      continue;
    }

    break;
  }

  return null;
}

@Injectable()
export class AiToolsRegistryService {
  private readonly logger = new Logger(AiToolsRegistryService.name);
  private readonly warnedFallbackTools = new Set<string>();
  private readonly erroredBuildTools = new Set<string>();

  constructor(
    private readonly catalog: AiToolCatalogService,
    private readonly executor: AiToolExecutorService,
  ) {}

  getOpenAiTools(context: AiExecutionContext) {
    return this.catalog
      .getDefinitions()
      .map((tool) => this.buildToolOrFallback(tool, context));
  }

  private buildToolOrFallback(
    tool: AiToolDefinition,
    context: AiExecutionContext,
  ) {
    const parameters = this.resolveParametersSchema(tool);

    try {
      return this.buildTool(tool, parameters, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logBuildErrorOnce(
        tool.name,
        `Failed to build OpenAI schema for tool "${tool.name}": ${message}. Falling back to passthrough object schema.`,
      );
      return this.buildTool(tool, OPENAI_FALLBACK_PARAMETERS_SCHEMA, context);
    }
  }

  private buildTool(
    tool: AiToolDefinition,
    parameters: z.ZodObject<any>,
    context: AiExecutionContext,
  ) {
    return zodFunction({
      name: tool.name,
      description: tool.description,
      parameters: parameters as any,
      function: async (args: unknown) =>
        this.executor.execute(tool.name, args, context),
    });
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
        `OpenAI tool schema for "${tool.name}" is not an object after transform; using passthrough object fallback`,
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
}
