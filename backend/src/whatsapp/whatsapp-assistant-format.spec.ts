import { formatWhatsappAssistantText } from './whatsapp-assistant-format';

it('formats headings, emphasis and tables as WhatsApp text', () => {
  expect(
    formatWhatsappAssistantText(
      '## Cobranza\n\n**Total: ARS 10**\n\n| Pago | Importe |\n| --- | ---: |\n| P-1 | ARS 10 |\n\nFin',
    ),
  ).toBe('Cobranza\n\n*Total: ARS 10*\n\n- Pago: P-1 · Importe: ARS 10\n\nFin');
});
