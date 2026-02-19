import { renderDocumentTemplate } from './document-template-renderer';

describe('renderDocumentTemplate', () => {
  it('renders nested placeholders and keeps unknown as empty string', () => {
    const output = renderDocumentTemplate(
      'Hola {{tenant.fullName}}, vence {{invoice.dueDate}} {{unknown.value}}',
      {
        tenant: { fullName: 'Ana Diaz' },
        invoice: { dueDate: '2026-03-10' },
      },
    );

    expect(output).toBe('Hola Ana Diaz, vence 2026-03-10 ');
  });

  it('renders primitives and strips non-renderable values', () => {
    const output = renderDocumentTemplate(
      'n={{n}} b={{b}} o={{o}} u={{u}} fn={{fn}} s={{s}}',
      {
        n: 123,
        b: false,
        o: { nested: true },
        u: undefined,
        fn: () => 'x',
        s: Symbol('x'),
      },
    );

    expect(output).toBe('n=123 b=false o= u= fn= s=');
  });

  it('handles traversal over non-object/null values without throwing', () => {
    const output = renderDocumentTemplate('{{a.b}}|{{x.y.z}}|{{base.value}}', {
      a: null,
      x: 'text',
      base: { value: 'ok' },
    });

    expect(output).toBe('||ok');
  });
});
