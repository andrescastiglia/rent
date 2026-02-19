import { OwnersController } from './owners.controller';

describe('OwnersController', () => {
  const ownersService = {
    listSettlementPayments: jest.fn(),
    getSettlementReceipt: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    listSettlements: jest.fn(),
    registerSettlementPayment: jest.fn(),
    listActivities: jest.fn(),
    createActivity: jest.fn(),
    updateActivity: jest.fn(),
  };

  let controller: OwnersController;
  const req = {
    user: {
      id: 'u1',
      email: 'owner@test.dev',
      phone: '123',
      companyId: 'c1',
      role: 'owner',
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OwnersController(ownersService as any);
  });

  it('delegates list/find/create/update/settlements/activities methods', async () => {
    ownersService.listSettlementPayments.mockResolvedValue([]);
    ownersService.findAll.mockResolvedValue([]);
    ownersService.create.mockResolvedValue({ id: 'o1' });
    ownersService.findOne.mockResolvedValue({ id: 'o1' });
    ownersService.update.mockResolvedValue({ id: 'o1', firstName: 'A' });
    ownersService.listSettlements.mockResolvedValue([]);
    ownersService.registerSettlementPayment.mockResolvedValue({ ok: true });
    ownersService.listActivities.mockResolvedValue([]);
    ownersService.createActivity.mockResolvedValue({ id: 'a1' });
    ownersService.updateActivity.mockResolvedValue({ id: 'a1' });

    await expect(
      controller.listSettlementPayments(req, { limit: 10 } as any),
    ).resolves.toEqual([]);
    await expect(controller.findAll(req)).resolves.toEqual([]);
    await expect(controller.create({} as any, req)).resolves.toEqual({
      id: 'o1',
    });
    await expect(controller.findOne('o1', req)).resolves.toEqual({ id: 'o1' });
    await expect(controller.update('o1', {} as any, req)).resolves.toEqual({
      id: 'o1',
      firstName: 'A',
    });
    await expect(
      controller.listSettlements('o1', req, { status: 'all', limit: 5 } as any),
    ).resolves.toEqual([]);
    await expect(
      controller.registerSettlementPayment('o1', 's1', {} as any, req),
    ).resolves.toEqual({ ok: true });
    await expect(controller.listActivities('o1', req)).resolves.toEqual([]);
    await expect(
      controller.createActivity('o1', {} as any, req),
    ).resolves.toEqual({ id: 'a1' });
    await expect(
      controller.updateActivity('o1', 'a1', {} as any, req),
    ).resolves.toEqual({ id: 'a1' });
  });

  it('downloadSettlementReceipt sets headers and sends file', async () => {
    ownersService.getSettlementReceipt.mockResolvedValue({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
      filename: 'settlement.pdf',
    });
    const res = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;

    await controller.downloadSettlementReceipt('s1', req, res);
    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="settlement.pdf"',
    });
    expect(res.send).toHaveBeenCalledWith(Buffer.from('pdf'));
  });
});
