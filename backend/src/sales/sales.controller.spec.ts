import { SalesController } from './sales.controller';

describe('SalesController', () => {
  const salesService = {
    createFolder: jest.fn(),
    listFolders: jest.fn(),
    createAgreement: jest.fn(),
    listAgreements: jest.fn(),
    getAgreement: jest.fn(),
    listReceipts: jest.fn(),
    createReceipt: jest.fn(),
    getReceipt: jest.fn(),
  };
  const documentsService = {
    downloadByS3Key: jest.fn(),
  };

  let controller: SalesController;
  const req = { user: { companyId: 'c1' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SalesController(
      salesService as any,
      documentsService as any,
    );
  });

  it('delegates folder/agreement/receipt operations to service', async () => {
    salesService.createFolder.mockResolvedValue({ id: 'f1' });
    salesService.listFolders.mockResolvedValue([{ id: 'f1' }]);
    salesService.createAgreement.mockResolvedValue({ id: 'a1' });
    salesService.listAgreements.mockResolvedValue([{ id: 'a1' }]);
    salesService.getAgreement.mockResolvedValue({ id: 'a1' });
    salesService.listReceipts.mockResolvedValue([{ id: 'r1' }]);
    salesService.createReceipt.mockResolvedValue({ id: 'r1' });

    await expect(controller.createFolder({} as any, req)).resolves.toEqual({
      id: 'f1',
    });
    await expect(controller.listFolders(req)).resolves.toEqual([{ id: 'f1' }]);
    await expect(controller.createAgreement({} as any, req)).resolves.toEqual({
      id: 'a1',
    });
    await expect(
      controller.listAgreements({ folderId: 'f1' } as any, req),
    ).resolves.toEqual([{ id: 'a1' }]);
    await expect(controller.getAgreement('a1', req)).resolves.toEqual({
      id: 'a1',
    });
    await expect(controller.listReceipts('a1', req)).resolves.toEqual([
      { id: 'r1' },
    ]);
    await expect(
      controller.createReceipt('a1', { amount: 100 } as any, req),
    ).resolves.toEqual({ id: 'r1' });
  });

  it('downloadReceipt returns 404 json when receipt has no pdf', async () => {
    salesService.getReceipt.mockResolvedValue({
      receiptNumber: '001',
      pdfUrl: null,
    });
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;

    await controller.downloadReceipt('r1', req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Receipt PDF not found' });
    expect(documentsService.downloadByS3Key).not.toHaveBeenCalled();
  });

  it('downloadReceipt sends buffer when pdf exists', async () => {
    salesService.getReceipt.mockResolvedValue({
      receiptNumber: '001',
      pdfUrl: 's3/key.pdf',
    });
    documentsService.downloadByS3Key.mockResolvedValue({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
    });

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;

    await controller.downloadReceipt('r1', req, res);

    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="recibo-venta-001.pdf"',
    });
    expect(res.send).toHaveBeenCalledWith(Buffer.from('pdf'));
  });
});
