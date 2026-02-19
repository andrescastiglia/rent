import { InterestedController } from './interested.controller';

describe('InterestedController', () => {
  const interestedService = {
    create: jest.fn(),
    getMetrics: jest.fn(),
    findPotentialDuplicates: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getSummary: jest.fn(),
    getTimeline: jest.fn(),
    listMatches: jest.fn(),
    refreshMatches: jest.fn(),
    updateMatch: jest.fn(),
    changeStage: jest.fn(),
    createActivity: jest.fn(),
    createReservation: jest.fn(),
    listReservations: jest.fn(),
    updateActivity: jest.fn(),
    convertToTenant: jest.fn(),
    convertToBuyer: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  let controller: InterestedController;
  const req = {
    user: { id: 'u1', role: 'admin', companyId: 'c1' },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InterestedController(interestedService as any);
  });

  it('delegates CRUD, metrics, activities, matches and conversions', async () => {
    interestedService.create.mockResolvedValue({ id: 'i1' });
    interestedService.getMetrics.mockResolvedValue({ total: 1 });
    interestedService.findPotentialDuplicates.mockResolvedValue([]);
    interestedService.findAll.mockResolvedValue({ data: [] });
    interestedService.findOne.mockResolvedValue({ id: 'i1' });
    interestedService.getSummary.mockResolvedValue({ id: 'i1', score: 10 });
    interestedService.getTimeline.mockResolvedValue([]);
    interestedService.listMatches.mockResolvedValue([]);
    interestedService.refreshMatches.mockResolvedValue({ refreshed: true });
    interestedService.updateMatch.mockResolvedValue({ id: 'm1' });
    interestedService.changeStage.mockResolvedValue({
      id: 'i1',
      stage: 'matched',
    });
    interestedService.createActivity.mockResolvedValue({ id: 'a1' });
    interestedService.createReservation.mockResolvedValue({ id: 'r1' });
    interestedService.listReservations.mockResolvedValue([{ id: 'r1' }]);
    interestedService.updateActivity.mockResolvedValue({ id: 'a1' });
    interestedService.convertToTenant.mockResolvedValue({ tenantId: 't1' });
    interestedService.convertToBuyer.mockResolvedValue({ buyerId: 'b1' });
    interestedService.update.mockResolvedValue({ id: 'i1', firstName: 'Ana' });

    await expect(controller.create({} as any, req)).resolves.toEqual({
      id: 'i1',
    });
    await expect(controller.getMetrics(req)).resolves.toEqual({ total: 1 });
    await expect(controller.findPotentialDuplicates(req)).resolves.toEqual([]);
    await expect(controller.findAll({} as any, req)).resolves.toEqual({
      data: [],
    });
    await expect(controller.findOne('i1', req)).resolves.toEqual({ id: 'i1' });
    await expect(controller.getSummary('i1', req)).resolves.toEqual({
      id: 'i1',
      score: 10,
    });
    await expect(controller.getTimeline('i1', req)).resolves.toEqual([]);
    await expect(controller.findMatches('i1', req)).resolves.toEqual([]);
    await expect(controller.refreshMatches('i1', req)).resolves.toEqual({
      refreshed: true,
    });
    await expect(
      controller.updateMatch('i1', 'm1', {} as any, req),
    ).resolves.toEqual({ id: 'm1' });
    await expect(controller.changeStage('i1', {} as any, req)).resolves.toEqual(
      {
        id: 'i1',
        stage: 'matched',
      },
    );
    await expect(
      controller.createActivity('i1', {} as any, req),
    ).resolves.toEqual({ id: 'a1' });
    await expect(
      controller.createReservation('i1', {} as any, req),
    ).resolves.toEqual({ id: 'r1' });
    await expect(controller.listReservations('i1', req)).resolves.toEqual([
      { id: 'r1' },
    ]);
    await expect(
      controller.updateActivity('i1', 'a1', {} as any, req),
    ).resolves.toEqual({ id: 'a1' });
    await expect(
      controller.convertToTenant('i1', {} as any, req),
    ).resolves.toEqual({ tenantId: 't1' });
    await expect(
      controller.convertToBuyer('i1', {} as any, req),
    ).resolves.toEqual({ buyerId: 'b1' });
    await expect(controller.update('i1', {} as any, req)).resolves.toEqual({
      id: 'i1',
      firstName: 'Ana',
    });
  });

  it('remove returns success message', async () => {
    interestedService.remove.mockResolvedValue(undefined);
    await expect(controller.remove('i1', req)).resolves.toEqual({
      message: 'Interested profile deleted successfully',
    });
  });
});
