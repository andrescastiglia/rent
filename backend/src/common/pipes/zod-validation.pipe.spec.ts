import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe();
  });

  it('returns value unchanged when metadata has no zod schema', () => {
    const value = { any: 'value' };
    expect(pipe.transform(value, { type: 'body' } as any)).toBe(value);
  });

  it('returns parsed data for valid payload', () => {
    class Dto {
      static zodSchema = z.object({ name: z.string().min(1) }).strict();
    }
    const result = pipe.transform({ name: 'Ana' }, {
      type: 'body',
      metatype: Dto,
    } as any);
    expect(result).toEqual({ name: 'Ana' });
  });

  it('throws BadRequestException with issue mapping for invalid payload', () => {
    class Dto {
      static zodSchema = z
        .object({ age: z.number().int().positive() })
        .strict();
    }

    expect(() =>
      pipe.transform({ age: -1 }, { type: 'body', metatype: Dto } as any),
    ).toThrow(BadRequestException);
  });
});
