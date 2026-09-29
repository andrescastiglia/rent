import { formatInvoiceDate } from './invoice-date';

describe('invoice calendar dates', () => {
  it('preserves a database date without shifting it to the previous Argentina day', () => {
    expect(formatInvoiceDate('2026-10-10', 'es-AR')).toBe('10/10/2026');
    expect(formatInvoiceDate('2026-09-01', 'en-US')).toBe('9/1/2026');
  });
  it('renders an instant using the Argentina calendar day', () => {
    expect(formatInvoiceDate(new Date('2026-10-10T01:00:00Z'), 'es-AR')).toBe(
      '9/10/2026',
    );
  });
});
