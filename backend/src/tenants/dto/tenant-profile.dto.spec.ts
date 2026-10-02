import { CreateTenantDto } from './create-tenant.dto';
import { UpdateTenantDto } from './update-tenant.dto';

describe('tenant profile contract', () => {
  const profile = { firstName: 'Ana', lastName: 'Gomez', dni: '12345678' };
  it('allows a person without granting authentication or requiring a body company', () => {
    expect(CreateTenantDto.zodSchema.parse(profile)).toEqual(profile);
  });
  it('accepts the persisted personal, employment and emergency fields', () => {
    const data = {
      ...profile,
      cuil: '20123456789',
      dateOfBirth: '1990-02-10',
      nationality: 'AR',
      occupation: 'Analista',
      employer: 'Empresa',
      monthlyIncome: 0,
      employmentStatus: 'employed',
      emergencyContactName: 'Juan',
      emergencyContactPhone: '123',
      emergencyContactRelationship: 'Hermano',
      creditScore: 0,
      notes: 'Referencia verificada',
    };
    expect(CreateTenantDto.zodSchema.parse(data)).toEqual(data);
  });
  it('allows email updates while keeping credential and role changes out of profile edits', () => {
    expect(
      UpdateTenantDto.zodSchema.parse({
        email: 'ana@example.invalid',
        monthlyIncome: 0,
      }),
    ).toEqual({ email: 'ana@example.invalid', monthlyIncome: 0 });
    expect(
      UpdateTenantDto.zodSchema.safeParse({ password: 'new-password' }).success,
    ).toBe(false);
    expect(
      UpdateTenantDto.zodSchema.safeParse({ roles: ['admin'] }).success,
    ).toBe(false);
  });
  it.each([
    { monthlyIncome: -1 },
    { creditScore: 1.5 },
    { creditScore: 1001 },
    { dateOfBirth: 'bad' },
    { address: {} },
    { status: 'ACTIVE' },
  ])('rejects invalid or unsupported profile values', (fields) => {
    expect(
      CreateTenantDto.zodSchema.safeParse({ ...profile, ...fields }).success,
    ).toBe(false);
  });
});
