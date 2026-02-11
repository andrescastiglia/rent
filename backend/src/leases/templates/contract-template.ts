import * as PDFDocument from 'pdfkit';
import { Lease } from '../entities/lease.entity';
import { I18nService } from 'nestjs-i18n';

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
        .text(await i18n.t('contract.header', { lang }), { align: 'center' })
        .moveDown();

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          `${await i18n.t('contract.issued_date', { lang })}: ${new Date().toLocaleDateString(lang)}`,
          { align: 'right' },
        )
        .moveDown(2);

      if (contractText && contractText.trim().length > 0) {
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(contractText.trim(), {
            align: 'left',
            lineGap: 4,
          })
          .moveDown(2);
      } else {
        // Contract parties (multilingual)
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(await i18n.t('contract.parties', { lang }))
          .moveDown(0.5);

        doc
          .fontSize(11)
          .font('Helvetica')
          .text(
            `${await i18n.t('contract.landlord', { lang })}: ${lease.property?.owner?.user?.firstName || ''} ${lease.property?.owner?.user?.lastName || ''}`,
          )
          .text(
            `${await i18n.t('contract.tenant', { lang })}: ${
              lease.tenant
                ? `${lease.tenant?.user?.firstName || ''} ${lease.tenant?.user?.lastName || ''}`.trim()
                : `${lease.buyerProfile?.firstName || ''} ${lease.buyerProfile?.lastName || ''}`.trim()
            }`,
          )
          .text(
            `${await i18n.t('contract.email', { lang })}: ${lease.tenant?.user?.email || lease.buyerProfile?.email || ''}`,
          )
          .moveDown(1.5);

        // Property (multilingual)
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(await i18n.t('contract.property', { lang }))
          .moveDown(0.5);

        const property = lease.property;
        doc
          .fontSize(11)
          .font('Helvetica')
          .text(
            `${await i18n.t('contract.address', { lang })}: ${property?.addressStreet || ''} ${property?.addressNumber || ''}`,
          )
          .text(
            `${await i18n.t('contract.city', { lang })}: ${property?.addressCity || ''}, ${property?.addressState || ''}`,
          )
          .text(
            `${await i18n.t('contract.postal_code', { lang })}: ${property?.addressPostalCode || ''}`,
          )
          .moveDown(1.5);

        // Contract terms (multilingual)
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(await i18n.t('contract.terms', { lang }))
          .moveDown(0.5);

        doc
          .fontSize(11)
          .font('Helvetica')
          .text(
            `${await i18n.t('contract.start_date', { lang })}: ${lease.startDate ? new Date(lease.startDate).toLocaleDateString(lang) : '-'}`,
          )
          .text(
            `${await i18n.t('contract.end_date', { lang })}: ${lease.endDate ? new Date(lease.endDate).toLocaleDateString(lang) : '-'}`,
          )
          .text(
            `${await i18n.t('contract.monthly_rent', { lang })}: ${lease.monthlyRent !== null && lease.monthlyRent !== undefined ? `${lease.currency} ${Number(lease.monthlyRent).toLocaleString(lang)}` : '-'}`,
          )
          .text(
            `${await i18n.t('contract.deposit', { lang })}: ${lease.currency} ${Number(lease.securityDeposit).toLocaleString(lang)}`,
          )
          .text(
            `${await i18n.t('contract.payment_frequency', { lang })}: ${lease.paymentFrequency}`,
          )
          .moveDown(1.5);

        // Clauses (multilingual)
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(await i18n.t('contract.clauses', { lang }))
          .moveDown(0.5);

        // NOTA: nestjs-i18n no soporta returnObjects, así que contract.clauses_list debe ser un string con saltos de línea o manejarse de otra forma.
        const clausesRaw: string = await i18n.t('contract.clauses_list', {
          lang,
        });
        const clauses = clausesRaw.split('\n');
        doc.fontSize(10).font('Helvetica');
        clauses.forEach((clause, index) => {
          doc.text(`${index + 1}. ${clause}`, { indent: 20 }).moveDown(0.3);
        });
        doc.moveDown(1.5);

        // Terms and conditions (multilingual)
        if (lease.termsAndConditions) {
          doc
            .fontSize(14)
            .font('Helvetica-Bold')
            .text(await i18n.t('contract.terms_and_conditions', { lang }))
            .moveDown(0.5);

          doc
            .fontSize(10)
            .font('Helvetica')
            .text(lease.termsAndConditions)
            .moveDown(1.5);
        }

        // Additional notes (multilingual)
        if (lease.notes) {
          doc
            .fontSize(14)
            .font('Helvetica-Bold')
            .text(await i18n.t('contract.additional_notes', { lang }))
            .moveDown(0.5);

          doc.fontSize(10).font('Helvetica').text(lease.notes).moveDown(1.5);
        }

        // Signatures (multilingual)
        doc.moveDown(3);
        doc
          .fontSize(11)
          .font('Helvetica')
          .text('_________________________', 100, doc.y)
          .text('_________________________', 350, doc.y - 15);

        doc
          .fontSize(10)
          .text(
            await i18n.t('contract.landlord_signature', { lang }),
            100,
            doc.y + 5,
          )
          .text(
            await i18n.t('contract.tenant_signature', { lang }),
            350,
            doc.y - 10,
          );

        // Footer (multilingual)
        doc
          .fontSize(8)
          .font('Helvetica')
          .text(
            `${await i18n.t('contract.contract_id', { lang })}: ${lease.id}`,
            50,
            doc.page.height - 50,
            {
              align: 'center',
            },
          );
      }

      doc.end();
    };

    void buildPdf().catch(reject);
  });
}
