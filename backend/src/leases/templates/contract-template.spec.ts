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

  it('generates contract from HTML with headings, lists, tables and blockquotes', async () => {
    const html = `
      <h1>Contract Title</h1>
      <p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
      <h2>Section 2</h2>
      <ul><li>Item A</li><li>Item B</li></ul>
      <ol><li>First</li><li>Second</li></ol>
      <blockquote>A quote block</blockquote>
      <table><tr><th>Header</th><td>Cell</td></tr></table>
      <h3>Small heading</h3>
      <p>Final paragraph</p>
      Loose text outside tags
    `;

    const buffer = await generateContractPdf(
      { id: 'lease-html' } as any,
      i18n,
      'es',
      html,
      'html',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('generates contract from HTML with empty blocks', async () => {
    const html = '<p></p><div></div><p>Content</p>';

    const buffer = await generateContractPdf(
      { id: 'lease-empty' } as any,
      i18n,
      'es',
      html,
      'html',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('generates contract with buyer instead of tenant', async () => {
    const buffer = await generateContractPdf(
      {
        id: 'lease-buyer',
        currency: 'USD',
        securityDeposit: 1000,
        paymentFrequency: 'monthly',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2026-05-31'),
        monthlyRent: 2000,
        buyer: {
          user: {
            firstName: 'Buyer',
            lastName: 'Person',
            email: 'buyer@test.dev',
          },
        },
        property: {
          addressStreet: 'Main',
          addressNumber: '1',
          addressCity: 'Town',
          addressState: 'Province',
          addressPostalCode: '2000',
          owner: { user: { firstName: 'Owner', lastName: 'O' } },
        },
      } as any,
      i18n,
      'en',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
