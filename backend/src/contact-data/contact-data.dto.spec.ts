import { ValidationPipe } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { PhonePreviewDto } from './contact-data.dto';
async function validate(
  value: unknown,
  metatype: typeof PhonePreviewDto | typeof UpdateProfileDto,
) {
  const metadata = { type: 'body' as const, metatype };
  const parsed = new ZodValidationPipe().transform(value, metadata);
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }).transform(parsed, metadata);
}
describe('shared normalization HTTP validation', () => {
  it('accepts one phone field and preserves self-service profile fields', async () => {
    const result = await validate(
      {
        firstName: 'Ana',
        lastName: 'Test',
        phone: '01143215678',
        normalization: {
          phones: { phone: 'AR' },
          phoneOriginals: { phone: '01143215678' },
        },
      },
      UpdateProfileDto,
    );
    expect(result).toMatchObject({
      firstName: 'Ana',
      phone: '01143215678',
      normalization: { phones: { phone: 'AR' } },
    });
  });
  it('defaults the preview region to AR and rejects unknown fields', async () => {
    expect(
      await validate({ value: '01143215678' }, PhonePreviewDto),
    ).toMatchObject({ country: 'AR' });
    await expect(
      validate(
        {
          value: '01143215678',
          country: 'AR',
          contactData: { e164: '+12025550123' },
        },
        PhonePreviewDto,
      ),
    ).rejects.toThrow();
  });
});
