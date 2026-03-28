import { generateCustomDocumentPdf } from './custom-document-pdf';

describe('generateCustomDocumentPdf', () => {
  it('generates a PDF buffer with title, body and footer', async () => {
    const buffer = await generateCustomDocumentPdf(
      'Test Title',
      'Body content here',
      'Footer text',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('handles empty body gracefully', async () => {
    const buffer = await generateCustomDocumentPdf('Title', '', 'Footer');

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('handles long multiline body', async () => {
    const longBody = Array(50).fill('Line of text content.').join('\n');
    const buffer = await generateCustomDocumentPdf(
      'Report',
      longBody,
      'Page footer',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
