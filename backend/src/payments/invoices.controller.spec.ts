import { InvoicesController } from './invoices.controller';

describe('InvoicesController', () => {
  const invoicesService = {
    create: jest.fn(),
    generateForLease: jest.fn(),
    issue: jest.fn(),
    attachPdf: jest.fn(),
    findAll: jest.fn(),
    findOneScoped: jest.fn(),
    cancel: jest.fn(),
  };
  const invoicePdfService = {
    generate: jest.fn(),
  };
  const documentsService = {
    downloadByS3Key: jest.fn(),
  };
  const paymentsService = {
    listCreditNotesByInvoice: jest.fn(),
    findCreditNoteById: jest.fn(),
  };

  let controller: InvoicesController;
  const req = { user: { id: 'u1', companyId: 'c1' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InvoicesController(
      invoicesService as any,
      invoicePdfService as any,
      documentsService as any,
      paymentsService as any,
    );
  });

  it('delegates create/generate/find/list/cancel and credit notes', async () => {
    invoicesService.create.mockResolvedValue({ id: 'i1' });
    invoicesService.generateForLease.mockResolvedValue({ id: 'i2' });
    invoicesService.findAll.mockResolvedValue({ data: [] });
    invoicesService.findOneScoped.mockResolvedValue({ id: 'i1' });
    invoicesService.cancel.mockResolvedValue({ id: 'i1', status: 'cancelled' });
    paymentsService.listCreditNotesByInvoice.mockResolvedValue([]);

    await expect(controller.create({} as any)).resolves.toEqual({ id: 'i1' });
    await expect(controller.generateForLease('l1', {} as any)).resolves.toEqual(
      {
        id: 'i2',
      },
    );
    await expect(controller.findAll({} as any, req)).resolves.toEqual({
      data: [],
    });
    await expect(controller.findOne('i1', req)).resolves.toEqual({ id: 'i1' });
    await expect(controller.listCreditNotes('i1', req)).resolves.toEqual([]);
    await expect(controller.cancel('i1')).resolves.toEqual({
      id: 'i1',
      status: 'cancelled',
    });
  });

  it('issue returns attachPdf on success and original invoice on pdf failure', async () => {
    invoicesService.issue.mockResolvedValue({ id: 'i1' });
    invoicePdfService.generate.mockResolvedValueOnce('s3://invoice.pdf');
    invoicesService.attachPdf.mockResolvedValue({
      id: 'i1',
      pdfUrl: 's3://invoice.pdf',
    });
    await expect(controller.issue('i1')).resolves.toEqual({
      id: 'i1',
      pdfUrl: 's3://invoice.pdf',
    });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    invoicePdfService.generate.mockRejectedValueOnce(new Error('pdf fail'));
    await expect(controller.issue('i1')).resolves.toEqual({ id: 'i1' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('getPdf and getCreditNotePdf handle not-found and download branches', async () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;

    invoicesService.findOneScoped.mockResolvedValueOnce({
      id: 'i1',
      invoiceNumber: '001',
      pdfUrl: null,
    });
    await controller.getPdf('i1', req, res);
    expect(res.status).toHaveBeenCalledWith(404);

    invoicesService.findOneScoped.mockResolvedValueOnce({
      id: 'i1',
      invoiceNumber: '001',
      pdfUrl: 's3://invoice.pdf',
    });
    documentsService.downloadByS3Key.mockResolvedValue({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
    });
    await controller.getPdf('i1', req, res);
    expect(res.send).toHaveBeenCalledWith(Buffer.from('pdf'));

    paymentsService.findCreditNoteById.mockResolvedValueOnce({
      invoiceId: 'i1',
      noteNumber: 'CN1',
      pdfUrl: null,
    });
    invoicesService.findOneScoped.mockResolvedValueOnce({ id: 'i1' });
    await controller.getCreditNotePdf('cn1', req, res);
    expect(res.status).toHaveBeenCalledWith(404);

    paymentsService.findCreditNoteById.mockResolvedValueOnce({
      invoiceId: 'i1',
      noteNumber: 'CN1',
      pdfUrl: 's3://cn.pdf',
    });
    invoicesService.findOneScoped.mockResolvedValueOnce({ id: 'i1' });
    documentsService.downloadByS3Key.mockResolvedValue({
      buffer: Buffer.from('pdf-cn'),
      contentType: 'application/pdf',
    });
    await controller.getCreditNotePdf('cn1', req, res);
    expect(res.send).toHaveBeenCalledWith(Buffer.from('pdf-cn'));
  });
});
