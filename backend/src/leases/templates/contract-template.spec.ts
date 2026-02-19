import { generateContractPdf } from './contract-template';

describe('generateContractPdf', () => {
  const i18n = {
    t: jest.fn(async (key: string) => {
      if (key === 'contract.clauses_list') {
        return 'clause-1\nclause-2';
      }
      return key;
    }),
  } as any;

  it('generates contract using explicit contract text', async () => {
    const buffer = await generateContractPdf(
      {
        id: 'lease-1',
      } as any,
      i18n,
      'es',
      'Texto contractual final',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(i18n.t).toHaveBeenCalledWith('contract.header', { lang: 'es' });
  });

  it('generates default contract sections and optional notes', async () => {
    const buffer = await generateContractPdf(
      {
        id: 'lease-2',
        currency: 'ARS',
        securityDeposit: 500,
        paymentFrequency: 'monthly',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        monthlyRent: 1000,
        termsAndConditions: 'T&C',
        notes: 'Extra notes',
        tenant: {
          user: {
            firstName: 'Tenant',
            lastName: 'User',
            email: 'tenant@test.dev',
          },
        },
        property: {
          addressStreet: 'Street',
          addressNumber: '123',
          addressCity: 'City',
          addressState: 'State',
          addressPostalCode: '1000',
          owner: {
            user: {
              firstName: 'Owner',
              lastName: 'User',
            },
          },
        },
      } as any,
      i18n,
      'en',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
