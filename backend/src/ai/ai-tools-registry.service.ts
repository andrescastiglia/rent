import { Injectable } from '@nestjs/common';
import { zodFunction } from 'openai/helpers/zod';
import { z } from 'zod';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiExecutionContext } from './types/ai-tool.types';

function toOpenAiCompatibleSchema(schema: any): any {
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

@Injectable()
export class AiToolsRegistryService {
  constructor(
    private readonly catalog: AiToolCatalogService,
    private readonly executor: AiToolExecutorService,
  ) {}

  getOpenAiTools(context: AiExecutionContext) {
    return this.catalog.getDefinitions().map((tool) =>
      zodFunction({
        name: tool.name,
        description: tool.description,
        parameters: toOpenAiCompatibleSchema(tool.parameters) as any,
        function: async (args: unknown) =>
          this.executor.execute(tool.name, args, context),
      }),
    );
  }
}
