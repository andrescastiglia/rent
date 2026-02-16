import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';

describe('AI tools integration', () => {
  const authService = {
    validateUser: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
  };

  const usersService = {
    findAll: jest.fn().mockResolvedValue({
      data: [{ id: 'u1', email: 'admin@test.dev' }],
      total: 1,
      page: 1,
      limit: 10,
    }),
    create: jest.fn(),
  };

  const currenciesService = {};
  const documentsService = {};
  const interestedService = {};

  const propertiesService = {
    findAll: jest.fn(),
    create: jest.fn(),
  };

  const propertyVisitsService = {};
  const unitsService = {};

  const leasesService = {
    findAll: jest.fn(),
    create: jest.fn(),
  };

  const amendmentsService = {};
  const pdfService = {};
  const ownersService = {};

  const paymentsService = {
    findAll: jest.fn(),
    create: jest.fn(),
  };

  const invoicesService = {
    findAll: jest.fn(),
  };

  const invoicePdfService = {};
  const tenantAccountsService = {};
  const paymentDocumentTemplatesService = {};

  const dashboardService = {
    getStats: jest.fn(),
    getRecentActivity: jest.fn(),
    getReportJobs: jest.fn(),
  };

  const salesService = {};
  const tenantsService = {};
  const whatsappService = {};

  let catalog: AiToolCatalogService;
  let executor: AiToolExecutorService;

  beforeEach(() => {
    catalog = new AiToolCatalogService({
      authService,
      usersService,
      currenciesService,
      documentsService,
      interestedService,
      propertiesService,
      propertyVisitsService,
      unitsService,
      leasesService,
      amendmentsService,
      pdfService,
      ownersService,
      paymentsService,
      invoicesService,
      invoicePdfService,
      tenantAccountsService,
      paymentDocumentTemplatesService,
      dashboardService,
      salesService,
      tenantsService,
      whatsappService,
    } as any);
    executor = new AiToolExecutorService(catalog);
    process.env.AI_TOOLS_MODE = 'FULL';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.AI_TOOLS_MODE;
  });

  it('should execute users_list end-to-end (tool -> service -> response)', async () => {
    const result = await executor.execute(
      'get_users',
      { page: 1, limit: 10 },
      {
        userId: 'admin-1',
        companyId: 'company-1',
        role: UserRole.ADMIN,
      },
    );

    expect(usersService.findAll).toHaveBeenCalledWith(1, 10);
    expect(result).toEqual({
      data: [{ id: 'u1', email: 'admin@test.dev' }],
      total: 1,
      page: 1,
      limit: 10,
    });
  });

  it('should block users_create for STAFF role', async () => {
    await expect(
      executor.execute(
        'post_users',
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@doe.dev',
          password: 'Password123!',
          role: UserRole.STAFF,
        },
        {
          userId: 'staff-1',
          companyId: 'company-1',
          role: UserRole.STAFF,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
