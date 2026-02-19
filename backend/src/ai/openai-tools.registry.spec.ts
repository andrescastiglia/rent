import { buildAiToolDefinitions } from './openai-tools.registry';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UserListQueryDto } from '../users/dto/user-list-query.dto';

describe('openai-tools.registry', () => {
  it('should reuse DTO zod schemas as single source of truth', () => {
    const deps = {
      authService: {
        validateUser: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
      },
      usersService: {
        findAll: jest.fn(),
        create: jest.fn(),
      },
      currenciesService: {
        findAll: jest.fn(),
        findOne: jest.fn(),
        getDefaultForLocale: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
      },
      documentsService: {
        generateUploadUrl: jest.fn(),
        confirmUpload: jest.fn(),
        generateDownloadUrl: jest.fn(),
        findByEntity: jest.fn(),
        remove: jest.fn(),
        downloadByS3Key: jest.fn(),
      },
      interestedService: {
        create: jest.fn(),
      },
      propertiesService: {
        findAll: jest.fn(),
        create: jest.fn(),
      },
      propertyVisitsService: {
        create: jest.fn(),
      },
      unitsService: {
        create: jest.fn(),
      },
      leasesService: {
        findAll: jest.fn(),
        create: jest.fn(),
      },
      amendmentsService: {
        create: jest.fn(),
      },
      pdfService: {
        getContractDocument: jest.fn(),
      },
      ownersService: {
        findAll: jest.fn(),
      },
      paymentsService: {
        findAll: jest.fn(),
        create: jest.fn(),
      },
      invoicesService: {
        findAll: jest.fn(),
      },
      invoicePdfService: {
        generate: jest.fn(),
      },
      tenantAccountsService: {
        findByLease: jest.fn(),
      },
      paymentDocumentTemplatesService: {
        list: jest.fn(),
      },
      dashboardService: {
        getStats: jest.fn(),
        getRecentActivity: jest.fn(),
        getReportJobs: jest.fn(),
      },
      salesService: {
        listFolders: jest.fn(),
      },
      tenantsService: {
        findAll: jest.fn(),
      },
      whatsappService: {
        sendTextMessage: jest.fn(),
      },
      githubIssuesService: {
        listIssues: jest.fn(),
        getIssueDetail: jest.fn(),
        prepareIssueReport: jest.fn(),
        commitIssueReport: jest.fn(),
      },
    } as any;

    const definitions = buildAiToolDefinitions(deps);

    const usersList = definitions.find((d) => d.name === 'get_users');
    const usersCreate = definitions.find((d) => d.name === 'post_users');

    expect(usersList).toBeDefined();
    expect(usersCreate).toBeDefined();
    expect(usersList?.parameters).toBe(UserListQueryDto.zodSchema);
    expect(usersCreate?.parameters).toBe(CreateUserDto.zodSchema);
  });
});
