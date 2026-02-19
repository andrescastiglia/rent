import { PaymentsController } from './payments.controller';

describe('PaymentsController', () => {
  const paymentsService = {
    create: jest.fn(),
    confirm: jest.fn(),
    update: jest.fn(),
    findAll: jest.fn(),
    findReceiptsByTenant: jest.fn(),
    findOneScoped: jest.fn(),
    cancel: jest.fn(),
  };
  const tenantAccountsService = {};
  const documentsService = {
    downloadByS3Key: jest.fn(),
  };

  let controller: PaymentsController;
  const req = { user: { id: 'u1', companyId: 'c1' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PaymentsController(
      paymentsService as any,
      tenantAccountsService as any,
      documentsService as any,
    );
  });

  it('delegates create/update/confirm/list/find/cancel', async () => {
    paymentsService.create.mockResolvedValue({ id: 'p1' });
    paymentsService.confirm.mockResolvedValue({
      id: 'p1',
      status: 'confirmed',
    });
    paymentsService.update.mockResolvedValue({ id: 'p1', amount: 10 });
    paymentsService.findAll.mockResolvedValue({ data: [] });
    paymentsService.findReceiptsByTenant.mockResolvedValue([]);
    paymentsService.findOneScoped.mockResolvedValue({ id: 'p1' });
    paymentsService.cancel.mockResolvedValue({ id: 'p1', status: 'cancelled' });

    await expect(
      controller.create({ amount: 10 } as any, req),
    ).resolves.toEqual({
      id: 'p1',
    });
    await expect(controller.confirm('p1')).resolves.toEqual({
      id: 'p1',
      status: 'confirmed',
    });
    await expect(
      controller.update('p1', { amount: 11 } as any),
    ).resolves.toEqual({
      id: 'p1',
      amount: 10,
    });
    await expect(controller.findAll({} as any, req)).resolves.toEqual({
      data: [],
    });
    await expect(controller.findReceiptsByTenant('t1', req)).resolves.toEqual(
      [],
    );
    await expect(controller.findOne('p1', req)).resolves.toEqual({ id: 'p1' });
    await expect(controller.cancel('p1')).resolves.toEqual({
      id: 'p1',
      status: 'cancelled',
    });
  });

  it('getReceipt returns 404 when missing and streams file when available', async () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;

    paymentsService.findOneScoped.mockResolvedValueOnce({
      receipt: { pdfUrl: null },
    });
    await controller.getReceipt('p1', req, res);
    expect(res.status).toHaveBeenCalledWith(404);

    paymentsService.findOneScoped.mockResolvedValueOnce({
      receipt: { pdfUrl: 's3://r.pdf', receiptNumber: '001' },
    });
    documentsService.downloadByS3Key.mockResolvedValue({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
    });
    await controller.getReceipt('p1', req, res);
    expect(res.send).toHaveBeenCalledWith(Buffer.from('pdf'));
  });
});
