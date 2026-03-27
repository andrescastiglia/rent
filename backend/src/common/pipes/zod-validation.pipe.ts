import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';
import { ZodSchemaCarrier } from '../validation/zod-validation.types';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    const schema = this.getSchema(metadata);
    if (!schema) {
      return value;
    }

    const parsed = schema.safeParse(value);
    if (parsed.success) {
      return parsed.data;
    }

    throw new BadRequestException({
      message: 'Validation failed',
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
  }

  private getSchema(metadata: ArgumentMetadata): ZodType | undefined {
    const metatype = metadata.metatype as ZodSchemaCarrier | undefined;
    return metatype?.zodSchema;
  }
}
