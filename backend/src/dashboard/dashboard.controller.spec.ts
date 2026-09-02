import { DashboardController } from './dashboard.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

describe('DashboardController', () => {
  const dashboardService = {
    getStats: jest.fn(),
    getRecentActivity: jest.fn(),
    getReportJobs: jest.fn(),
  };
  let controller: DashboardController;
  const req = { user: { id: 'u1', companyId: 'c1' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DashboardController(dashboardService as any);
  });

  it('denies buyer access to company-wide dashboard aggregates', () => {
    expect(Reflect.getMetadata(ROLES_KEY, DashboardController)).toEqual([
      UserRole.ADMIN,
      UserRole.STAFF,
      UserRole.OWNER,
      UserRole.TENANT,
    ]);
  });

  it('delegates stats, recent activity and report jobs', async () => {
    dashboardService.getStats.mockResolvedValue({ totalProperties: 1 });
    dashboardService.getRecentActivity.mockResolvedValue({
      overdue: [],
      today: [],
    });
    dashboardService.getReportJobs.mockResolvedValue({ data: [], total: 0 });

    await expect(controller.getStats(req)).resolves.toEqual({
      totalProperties: 1,
    });
    await expect(
      controller.getRecentActivity(req, { limit: 10 } as any),
    ).resolves.toEqual({ overdue: [], today: [] });
    await expect(
      controller.getReports(req, { page: 1, limit: 25 } as any),
    ).resolves.toEqual({ data: [], total: 0 });
  });

  it('uses default pagination values when query params are missing', async () => {
    dashboardService.getRecentActivity.mockResolvedValue({
      overdue: [],
      today: [],
    });
    dashboardService.getReportJobs.mockResolvedValue({ data: [], total: 0 });

    await controller.getRecentActivity(req, {} as any);
    expect(dashboardService.getRecentActivity).toHaveBeenCalledWith(
      'c1',
      req.user,
      10,
    );

    await controller.getReports(req, {} as any);
    expect(dashboardService.getReportJobs).toHaveBeenCalledWith(
      'c1',
      req.user,
      1,
      25,
    );
  });
});
