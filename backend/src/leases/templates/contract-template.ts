import * as PDFDocument from 'pdfkit';
import { Lease } from '../entities/lease.entity';
import { I18nService } from 'nestjs-i18n';
import {
  HTMLElement,
  Node,
  TextNode,
  parse as parseHtml,
} from 'node-html-parser';

type InlineStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
};

type InlineSegment = {
  text: string;
  style: Required<InlineStyle>;
};

/**
 * Generate contract PDF with multilingual support.
 * @param lease Lease entity
 * @param i18n I18nService instance
 * @param lang Language code (e.g. 'es', 'en', 'pt')
 */
export function generateContractPdf(
  lease: Lease,
  i18n: I18nService,
  lang: string = 'es',
  contractText?: string,
  contractFormat: 'plain_text' | 'html' = 'plain_text',
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    doc.on('error', reject);

    const buildPdf = async () => {
      // Header (multilingual)
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(i18n.t('contract.header', { lang }), { align: 'center' })
        .moveDown();

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          `${i18n.t('contract.issued_date', { lang })}: ${new Date().toLocaleDateString(lang)}`,
          { align: 'right' },
        )
        .moveDown(2);

      if (contractText && contractText.trim().length > 0) {
        if (contractFormat === 'html') {
          renderHtmlContract(doc, contractText.trim());
        } else {
          doc
            .fontSize(10)
            .font('Helvetica')
            .text(contractText.trim(), {
              align: 'left',
              lineGap: 4,
            })
            .moveDown(2);
        }
      } else {
        await renderDefaultContractSections(doc, lease, i18n, lang);
      }

      doc.end();
    };

    buildPdf().catch(reject);
  });
}

async function renderDefaultContractSections(
  doc: PDFKit.PDFDocument,
  lease: Lease,
  i18n: I18nService,
  lang: string,
): Promise<void> {
  await renderParties(doc, lease, i18n, lang);
  await renderProperty(doc, lease, i18n, lang);
  await renderTerms(doc, lease, i18n, lang);
  await renderClauses(doc, i18n, lang);
  await renderOptionalSections(doc, lease, i18n, lang);
  await renderSignaturesAndFooter(doc, lease, i18n, lang);
}

async function renderParties(
  doc: PDFKit.PDFDocument,
  lease: Lease,
  i18n: I18nService,
  lang: string,
): Promise<void> {
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text(i18n.t('contract.parties', { lang }))
    .moveDown(0.5);

  const tenantLabel = lease.tenant
    ? `${lease.tenant?.user?.firstName || ''} ${lease.tenant?.user?.lastName || ''}`.trim()
    : `${lease.buyer?.user?.firstName || ''} ${lease.buyer?.user?.lastName || ''}`.trim();

  doc
    .fontSize(11)
    .font('Helvetica')
    .text(
      `${i18n.t('contract.landlord', { lang })}: ${lease.property?.owner?.user?.firstName || ''} ${lease.property?.owner?.user?.lastName || ''}`,
    )
    .text(`${i18n.t('contract.tenant', { lang })}: ${tenantLabel}`)
    .text(
      `${i18n.t('contract.email', { lang })}: ${lease.tenant?.user?.email || lease.buyer?.user?.email || ''}`,
    )
    .moveDown(1.5);
}

function renderHtmlContract(
  doc: PDFKit.PDFDocument,
  contractHtml: string,
): void {
  const root = parseHtml(`<div>${contractHtml}</div>`);
  const blocks = root.querySelector('div')?.childNodes ?? root.childNodes;

  for (const block of blocks) {
    if (!(block instanceof HTMLElement)) {
      renderLooseTextBlock(doc, block.rawText?.trim());
      continue;
    }

    const tag = block.tagName.toLowerCase();
    const text = block.text.trim();
    if (!text) {
      continue;
    }

    if (renderStructuredHtmlBlock(doc, block, tag)) {
      continue;
    }

    const headingLevel = /^h([1-6])$/.exec(tag)?.[1];
    if (headingLevel) {
      const fontSize = Math.max(12, 20 - Number(headingLevel) * 2);
      renderInlineBlock(doc, block, {
        bold: true,
        italic: false,
        underline: false,
        fontSize,
      });
      continue;
    }

    renderInlineBlock(doc, block, {
      bold: false,
      italic: false,
      underline: false,
      fontSize: 10,
    });
  }
}

function renderLooseTextBlock(
  doc: PDFKit.PDFDocument,
  text: string | undefined,
): void {
  if (!text) {
    return;
  }

  doc
    .font('Helvetica')
    .fontSize(10)
    .text(text, { align: 'left', lineGap: 4 })
    .moveDown(0.8);
}

function renderStructuredHtmlBlock(
  doc: PDFKit.PDFDocument,
  block: HTMLElement,
  tag: string,
): boolean {
  if (tag === 'ul' || tag === 'ol') {
    renderListBlock(doc, block, tag === 'ol');
    return true;
  }

  if (tag === 'blockquote') {
    renderInlineBlock(doc, block, {
      bold: false,
      italic: true,
      underline: false,
      fontSize: 10,
    });
    return true;
  }

  if (tag === 'table') {
    renderTableBlock(doc, block);
    return true;
  }

  return false;
}

function renderListBlock(
  doc: PDFKit.PDFDocument,
  block: HTMLElement,
  ordered: boolean,
): void {
  block.querySelectorAll('li').forEach((item, index) => {
    const prefix = ordered ? `${index + 1}. ` : '• ';
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`${prefix}${item.text.trim()}`, { indent: 12, lineGap: 3 })
      .moveDown(0.25);
  });
  doc.moveDown(0.75);
}

function renderTableBlock(doc: PDFKit.PDFDocument, block: HTMLElement): void {
  block.querySelectorAll('tr').forEach((row) => {
    const rowText = row
      .querySelectorAll('th, td')
      .map((cell) => cell.text.trim())
      .filter(Boolean)
      .join(' | ');
    if (rowText) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(rowText, { lineGap: 3 })
        .moveDown(0.25);
    }
  });
  doc.moveDown(0.75);
}

function renderInlineBlock(
  doc: PDFKit.PDFDocument,
  block: HTMLElement,
  baseStyle: Required<InlineStyle>,
): void {
  const segments = collectInlineSegments(block, baseStyle);
  const printable = normalizeInlineSegments(segments);

  if (printable.length === 0) {
    return;
  }

  printable.forEach((segment, index) => {
    doc
      .font(resolvePdfFont(segment.style))
      .fontSize(segment.style.fontSize)
      .text(segment.text, {
        align: 'left',
        lineGap: 4,
        underline: segment.style.underline,
        continued: index < printable.length - 1,
      });
  });

  doc.moveDown(0.8);
}

function collectInlineSegments(
  node: Node,
  inheritedStyle: Required<InlineStyle>,
): InlineSegment[] {
  if (node instanceof TextNode) {
    const normalized = node.rawText.replaceAll(/\s+/g, ' ');
    return normalized
      ? [
          {
            text: normalized,
            style: inheritedStyle,
          },
        ]
      : [];
  }

  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const tag = node.tagName.toLowerCase();
  if (tag === 'br') {
    return [{ text: '\n', style: inheritedStyle }];
  }

  const nextStyle = resolveInlineStyle(inheritedStyle, tag);
  return node.childNodes.flatMap((child) =>
    collectInlineSegments(child, nextStyle),
  );
}

function resolveInlineStyle(
  current: Required<InlineStyle>,
  tagName: string,
): Required<InlineStyle> {
  switch (tagName) {
    case 'strong':
    case 'b':
      return { ...current, bold: true };
    case 'em':
    case 'i':
      return { ...current, italic: true };
    case 'u':
      return { ...current, underline: true };
    default:
      return current;
  }
}

function normalizeInlineSegments(segments: InlineSegment[]): InlineSegment[] {
  const normalized: InlineSegment[] = [];

  for (const segment of segments) {
    if (!segment.text) {
      continue;
    }

    const previous = normalized[normalized.length - 1]; // NOSONAR
    if (previous && haveSameInlineStyle(previous.style, segment.style)) {
      previous.text += segment.text;
      continue;
    }

    normalized.push({
      text: segment.text,
      style: segment.style,
    });
  }

  return normalized.filter(
    (segment) =>
      segment.text.length > 0 &&
      (segment.text.includes('\n') || segment.text.trim().length > 0),
  );
}

function haveSameInlineStyle(
  left: Required<InlineStyle>,
  right: Required<InlineStyle>,
): boolean {
  return (
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.fontSize === right.fontSize
  );
}

function resolvePdfFont(style: Required<InlineStyle>): string {
  if (style.bold && style.italic) {
    return 'Helvetica-BoldOblique';
  }

  if (style.bold) {
    return 'Helvetica-Bold';
  }

  if (style.italic) {
    return 'Helvetica-Oblique';
  }

  return 'Helvetica';
}

async function renderProperty(
  doc: PDFKit.PDFDocument,
  lease: Lease,
  i18n: I18nService,
  lang: string,
): Promise<void> {
  const property = lease.property;
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text(i18n.t('contract.property', { lang }))
    .moveDown(0.5)
    .fontSize(11)
    .font('Helvetica')
    .text(
      `${i18n.t('contract.address', { lang })}: ${property?.addressStreet || ''} ${property?.addressNumber || ''}`,
    )
    .text(
      `${i18n.t('contract.city', { lang })}: ${property?.addressCity || ''}, ${property?.addressState || ''}`,
    )
    .text(
      `${i18n.t('contract.postal_code', { lang })}: ${property?.addressPostalCode || ''}`,
    )
    .moveDown(1.5);
}

async function renderTerms(
  doc: PDFKit.PDFDocument,
  lease: Lease,
  i18n: I18nService,
  lang: string,
): Promise<void> {
  const monthlyRentValue =
    lease.monthlyRent !== null && lease.monthlyRent !== undefined
      ? `${lease.currency} ${Number(lease.monthlyRent).toLocaleString(lang)}`
      : '-';

  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text(i18n.t('contract.terms', { lang }))
    .moveDown(0.5)
    .fontSize(11)
    .font('Helvetica')
    .text(
      `${i18n.t('contract.start_date', { lang })}: ${lease.startDate ? new Date(lease.startDate).toLocaleDateString(lang) : '-'}`,
    )
    .text(
      `${i18n.t('contract.end_date', { lang })}: ${lease.endDate ? new Date(lease.endDate).toLocaleDateString(lang) : '-'}`,
    )
    .text(`${i18n.t('contract.monthly_rent', { lang })}: ${monthlyRentValue}`)
    .text(
      `${i18n.t('contract.deposit', { lang })}: ${lease.currency} ${Number(lease.securityDeposit).toLocaleString(lang)}`,
    )
    .text(
      `${i18n.t('contract.payment_frequency', { lang })}: ${lease.paymentFrequency}`,
    )
    .moveDown(1.5);
}

async function renderClauses(
  doc: PDFKit.PDFDocument,
  i18n: I18nService,
  lang: string,
): Promise<void> {
  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text(i18n.t('contract.clauses', { lang }))
    .moveDown(0.5)
    .fontSize(10)
    .font('Helvetica');

  const clausesRaw: string = await i18n.t('contract.clauses_list', { lang });
  clausesRaw.split('\n').forEach((clause, index) => {
    doc.text(`${index + 1}. ${clause}`, { indent: 20 }).moveDown(0.3);
  });
  doc.moveDown(1.5);
}

async function renderOptionalSections(
  doc: PDFKit.PDFDocument,
  lease: Lease,
  i18n: I18nService,
  lang: string,
): Promise<void> {
  if (lease.termsAndConditions) {
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(i18n.t('contract.terms_and_conditions', { lang }))
      .moveDown(0.5)
      .fontSize(10)
      .font('Helvetica')
      .text(lease.termsAndConditions)
      .moveDown(1.5);
  }

  if (lease.notes) {
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(i18n.t('contract.additional_notes', { lang }))
      .moveDown(0.5)
      .fontSize(10)
      .font('Helvetica')
      .text(lease.notes)
      .moveDown(1.5);
  }
}

async function renderSignaturesAndFooter(
  doc: PDFKit.PDFDocument,
  lease: Lease,
  i18n: I18nService,
  lang: string,
): Promise<void> {
  doc.moveDown(3);
  doc
    .fontSize(11)
    .font('Helvetica')
    .text('_________________________', 100, doc.y)
    .text('_________________________', 350, doc.y - 15)
    .fontSize(10)
    .text(i18n.t('contract.landlord_signature', { lang }), 100, doc.y + 5)
    .text(i18n.t('contract.tenant_signature', { lang }), 350, doc.y - 10)
    .fontSize(8)
    .font('Helvetica')
    .text(
      `${i18n.t('contract.contract_id', { lang })}: ${lease.id}`,
      50,
      doc.page.height - 50,
      {
        align: 'center',
      },
    );
}
