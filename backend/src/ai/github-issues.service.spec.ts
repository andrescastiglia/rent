import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GithubIssuesService } from './github-issues.service';

type MockResponseInit = {
  ok: boolean;
  status: number;
  statusText?: string;
  body: unknown;
};

function mockResponse(init: MockResponseInit): Response {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? (init.ok ? 'OK' : 'ERROR'),
    text: async () =>
      typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
  } as unknown as Response;
}

describe('GithubIssuesService', () => {
  const previewsRepo = {
    save: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
  };

  const conversationsService = {
    mergeToolState: jest.fn(),
    getConversationById: jest.fn(),
  };

  let service: GithubIssuesService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GithubIssuesService(
      previewsRepo as any,
      conversationsService as any,
    );
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_REPOSITORY = 'acme/repo';
    delete process.env.GITHUB_API_BASE_URL;
    delete process.env.GITHUB_ISSUES_DEFAULT_LABELS;
    delete process.env.GITHUB_ISSUES_PREVIEW_TTL_SECONDS;
    previewsRepo.delete.mockResolvedValue(undefined);
    previewsRepo.save.mockResolvedValue(undefined);
    previewsRepo.findOne.mockResolvedValue(null);
    conversationsService.mergeToolState.mockResolvedValue(undefined);
    conversationsService.getConversationById.mockResolvedValue({
      toolState: {},
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists issues by search query and filters pull requests', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: {
          total_count: 2,
          items: [
            {
              number: 10,
              title: 'Bug report',
              state: 'open',
              html_url: 'https://x/10',
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-02T00:00:00.000Z',
              body: 'desc',
              labels: [{ name: 'bug' }],
            },
            {
              number: 11,
              title: 'PR should be filtered',
              state: 'open',
              html_url: 'https://x/11',
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-02T00:00:00.000Z',
              body: 'desc',
              pull_request: {},
            },
          ],
        },
      }),
    ) as any;

    const result = await service.listIssues({
      state: 'open',
      query: 'ticket',
      page: 1,
      perPage: 20,
    });

    expect(result.source).toBe('search');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ number: 10, title: 'Bug report' }),
    );
  });

  it('lists issues without query using repository issues endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: [
          {
            number: 21,
            title: 'Feature request',
            state: 'closed',
            html_url: 'https://x/21',
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-02T00:00:00.000Z',
            body: null,
            labels: [{ name: 'enhancement' }],
          },
        ],
      }),
    ) as any;

    const result = await service.listIssues({
      state: 'all',
      page: 1,
      perPage: 10,
    });

    expect(result.source).toBe('list');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ number: 21, state: 'closed' }),
    );
  });

  it('gets detailed issue with rendered markdown payload', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: {
          number: 31,
          title: 'Issue detail',
          state: 'open',
          html_url: 'https://x/31',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
          body: 'body md',
          labels: [{ name: 'bug' }],
        },
      }),
    ) as any;

    const result = await service.getIssueDetail(31);

    expect(result.number).toBe(31);
    expect(result.markdown).toContain('# Issue detail');
    expect(result.markdown).toContain('## Description');
  });

  it('prepares issue report, saves preview, and stores pending preview in conversation state', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: {
          total_count: 1,
          items: [
            {
              number: 40,
              title: 'same bug in ui',
              state: 'open',
              html_url: 'https://x/40',
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-02T00:00:00.000Z',
              body: 'ui ticket error al crear',
              labels: [{ name: 'bug' }],
            },
          ],
        },
      }),
    ) as any;
    process.env.GITHUB_ISSUES_DEFAULT_LABELS = 'chat-report';

    const result = await service.prepareIssueReport(
      {
        kind: 'bug',
        report: 'Error al crear ticket desde UI',
        summary: 'No deja crear ticket',
        labels: ['ux'],
      },
      {
        userId: 'u1',
        companyId: 'co1',
        conversationId: 'conv1',
      },
    );

    expect(result.previewId).toBeDefined();
    expect(result.draft.labels).toEqual(
      expect.arrayContaining(['bug', 'chat-report', 'ux']),
    );
    expect(previewsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        companyId: 'co1',
        conversationId: 'conv1',
      }),
    );
    expect(conversationsService.mergeToolState).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv1', userId: 'u1' }),
    );
  });

  it('returns pending_confirmation when commit confirm=false', async () => {
    previewsRepo.findOne.mockResolvedValue({
      previewId: 'p1',
      userId: 'u1',
      companyId: null,
      conversationId: null,
      expiresAt: new Date(Date.now() + 60_000),
      draft: {
        kind: 'bug',
        title: '[BUG] A',
        bodyMarkdown: 'Body',
        labels: ['bug'],
        summary: 'S',
      },
      similarIssues: [],
      recommendation: {
        action: 'create_new_issue',
        targetIssueNumber: null,
        reason: 'none',
      },
    });

    const result = await service.commitIssueReport(
      {
        previewId: 'p1',
        action: 'auto',
        confirm: false,
      },
      { userId: 'u1' },
    );

    expect(result.status).toBe('pending_confirmation');
    expect(previewsRepo.delete).not.toHaveBeenCalledWith({ previewId: 'p1' });
  });

  it('merges into open issue when action resolves to merge_open_issue', async () => {
    previewsRepo.findOne.mockResolvedValue({
      previewId: 'p2',
      userId: 'u1',
      companyId: null,
      conversationId: 'conv1',
      expiresAt: new Date(Date.now() + 60_000),
      draft: {
        kind: 'bug',
        title: '[BUG] A',
        bodyMarkdown: 'Body',
        labels: ['bug'],
        summary: 'S',
      },
      similarIssues: [],
      recommendation: {
        action: 'merge_open_issue',
        targetIssueNumber: 55,
        reason: 'open similar',
      },
    });

    conversationsService.getConversationById.mockResolvedValue({
      toolState: { githubIssues: { pendingPreviewId: 'p2', expiresAt: 'x' } },
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          body: {
            number: 55,
            title: 'Open similar',
            state: 'open',
            html_url: 'https://x/55',
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-02T00:00:00.000Z',
            body: 'existing',
            labels: [{ name: 'bug' }],
          },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 201,
          body: {
            id: 999,
            html_url: 'https://x/comment/999',
            body: 'comment body',
          },
        }),
      ) as any;

    const result = await service.commitIssueReport(
      { previewId: 'p2', action: 'auto', confirm: true },
      { userId: 'u1', conversationId: 'conv1' },
    );

    expect(result.status).toBe('merged_into_open_issue');
    expect(previewsRepo.delete).toHaveBeenCalledWith({ previewId: 'p2' });
    expect(conversationsService.mergeToolState).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv1',
        userId: 'u1',
        patch: { githubIssues: {} },
      }),
    );
  });

  it('creates new issue when action resolves to create_new_issue', async () => {
    previewsRepo.findOne.mockResolvedValue({
      previewId: 'p3',
      userId: 'u1',
      companyId: null,
      conversationId: null,
      expiresAt: new Date(Date.now() + 60_000),
      draft: {
        kind: 'feature',
        title: '[FEATURE] Title',
        bodyMarkdown: 'Body',
        labels: ['enhancement'],
        summary: 'S',
      },
      similarIssues: [],
      recommendation: {
        action: 'create_new_issue',
        targetIssueNumber: null,
        reason: 'none',
      },
    });

    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 201,
        body: {
          number: 88,
          title: '[FEATURE] Title',
          state: 'open',
          html_url: 'https://x/88',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
          body: 'Body',
          labels: [{ name: 'enhancement' }],
        },
      }),
    ) as any;

    const result = await service.commitIssueReport(
      { previewId: 'p3', action: 'auto', confirm: true },
      { userId: 'u1' },
    );

    expect(result.status).toBe('created_new_issue');
    expect((result as any).issue.number).toBe(88);
    expect(previewsRepo.delete).toHaveBeenCalledWith({ previewId: 'p3' });
  });

  it('uses pending preview from conversation when previewId is omitted', async () => {
    conversationsService.getConversationById.mockResolvedValue({
      toolState: { githubIssues: { pendingPreviewId: 'p4' } },
    });
    previewsRepo.findOne.mockResolvedValue({
      previewId: 'p4',
      userId: 'u1',
      companyId: null,
      conversationId: 'conv1',
      expiresAt: new Date(Date.now() + 60_000),
      draft: {
        kind: 'feature',
        title: 'T',
        bodyMarkdown: 'B',
        labels: ['enhancement'],
        summary: 'S',
      },
      similarIssues: [],
      recommendation: {
        action: 'create_new_issue',
        targetIssueNumber: null,
        reason: 'none',
      },
    });

    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 201,
        body: {
          number: 89,
          title: 'T',
          state: 'open',
          html_url: 'https://x/89',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
          body: 'B',
          labels: [{ name: 'enhancement' }],
        },
      }),
    ) as any;

    const result = await service.commitIssueReport(
      { action: 'create_new_issue', confirm: true },
      { userId: 'u1', conversationId: 'conv1' },
    );

    expect(result.status).toBe('created_new_issue');
    expect(conversationsService.getConversationById).toHaveBeenCalled();
  });

  it('throws BadRequestException when preview cannot be resolved', async () => {
    previewsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.commitIssueReport(
        { action: 'auto', confirm: true },
        { userId: 'u1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws ServiceUnavailableException when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;

    await expect(
      service.listIssues({ state: 'open', page: 1, perPage: 10 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps non-2xx provider responses to BadGatewayException', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Error',
        body: { message: 'boom' },
      }),
    ) as any;

    await expect(
      service.listIssues({ state: 'open', page: 1, perPage: 10 }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
