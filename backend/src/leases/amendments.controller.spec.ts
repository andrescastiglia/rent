import { AmendmentsController } from './amendments.controller';

describe('AmendmentsController', () => {
  const amendmentsService = {
    create: jest.fn(),
    findByLease: jest.fn(),
    findOne: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
  };
  let controller: AmendmentsController;
  const req = { user: { id: 'u1' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AmendmentsController(amendmentsService as any);
  });

  it('delegates create/find/approve/reject', async () => {
    amendmentsService.create.mockResolvedValue({ id: 'a1' });
    amendmentsService.findByLease.mockResolvedValue([]);
    amendmentsService.findOne.mockResolvedValue({ id: 'a1' });
    amendmentsService.approve.mockResolvedValue({
      id: 'a1',
      status: 'approved',
    });
    amendmentsService.reject.mockResolvedValue({
      id: 'a1',
      status: 'rejected',
    });

    await expect(controller.create({} as any, req)).resolves.toEqual({
      id: 'a1',
    });
    await expect(controller.findByLease('l1')).resolves.toEqual([]);
    await expect(controller.findOne('a1')).resolves.toEqual({ id: 'a1' });
    await expect(controller.approve('a1', req)).resolves.toEqual({
      id: 'a1',
      status: 'approved',
    });
    await expect(controller.reject('a1', req)).resolves.toEqual({
      id: 'a1',
      status: 'rejected',
    });
  });
});
