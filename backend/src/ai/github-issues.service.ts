import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { AiConversationsService } from './ai-conversations.service';
import { AiGithubIssuePreview } from './entities/ai-github-issue-preview.entity';

type GithubIssueState = 'open' | 'closed' | 'all';
type GithubReportKind = 'bug' | 'feature' | 'tech-report';
type GithubCommitAction = 'auto' | 'create_new_issue' | 'merge_open_issue';

type GithubApiIssue = {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  updated_at: string;
  labels?: Array<{ name?: string }>;
  pull_request?: unknown;
};

type GithubSearchResponse = {
  total_count: number;
  items: GithubApiIssue[];
};

type GithubApiComment = {
  id: number;
  html_url: string;
  body: string;
};

type IssueDraft = {
  kind: GithubReportKind;
  title: string;
  bodyMarkdown: string;
  labels: string[];
  summary: string;
};

type IssueSimilar = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  htmlUrl: string;
  labels: string[];
  similarity: number;
  bodyMarkdown: string;
};

type Recommendation = {
  action: Exclude<GithubCommitAction, 'auto'>;
  targetIssueNumber: number | null;
  reason: string;
};

type PreviewRecord = {
  previewId: string;
  userId: string;
  companyId?: string;
  conversationId?: string;
  expiresAt: Date;
  draft: IssueDraft;
  similarIssues: IssueSimilar[];
  recommendation: Recommendation;
};

const DEFAULT_API_BASE_URL = 'https://api.github.com';
const DEFAULT_PREVIEW_TTL_SECONDS = 15 * 60;
const SEARCH_MAX_ITEMS = 20;
const PREVIEW_SIMILAR_ITEMS = 8;
const OPEN_SIMILARITY_THRESHOLD = 0.26;

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'por',
  'para',
  'con',
  'una',
  'uno',
  'unos',
  'unas',
  'que',
  'como',
  'cuando',
  'donde',
  'desde',
  'sobre',
  'entre',
  'deberia',
  'debe',
  'reportar',
  'reporte',
  'reportes',
  'issue',
  'issues',
  'bug',
  'bugs',
  'feature',
  'features',
  'funcionalidad',
  'funcionalidades',
  'nuevo',
  'nueva',
  'tecnico',
  'tecnico',
  'tecnica',
  'chat',
]);

const KIND_PREFIX: Record<GithubReportKind, string> = {
  bug: '[BUG]',
  feature: '[FEATURE]',
  'tech-report': '[TECH]',
};

const KIND_LABEL: Record<GithubReportKind, string> = {
  bug: 'bug',
  feature: 'enhancement',
  'tech-report': 'technical-report',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

@Injectable()
export class GithubIssuesService {
  constructor(
    @InjectRepository(AiGithubIssuePreview)
    private readonly previewsRepo: Repository<AiGithubIssuePreview>,
    private readonly conversationsService: AiConversationsService,
  ) {}

  async listIssues(params: {
    state: GithubIssueState;
    page: number;
    perPage: number;
    query?: string;
  }) {
    const page = clamp(params.page, 1, 100);
    const perPage = clamp(params.perPage, 1, 50);

    if (params.query?.trim()) {
      const search = await this.searchIssues(
        params.query,
        params.state,
        page,
        perPage,
      );
      return {
        source: 'search',
        state: params.state,
        query: params.query.trim(),
        page,
        perPage,
        totalCount: search.total_count,
        items: search.items
          .filter((issue) => !issue.pull_request)
          .map((issue) => this.toIssueListItem(issue)),
      };
    }

    const { owner, repo } = this.getRepository();
    const endpoint = `/repos/${owner}/${repo}/issues?state=${encodeURIComponent(params.state)}&sort=updated&direction=desc&page=${page}&per_page=${perPage}`;
    const issues = await this.request<GithubApiIssue[]>(endpoint);

    return {
      source: 'list',
      state: params.state,
      page,
      perPage,
      totalCount: issues.length,
      items: issues
        .filter((issue) => !issue.pull_request)
        .map((issue) => this.toIssueListItem(issue)),
    };
  }

  async getIssueDetail(issueNumber: number) {
    const issue = await this.fetchIssue(issueNumber);
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      htmlUrl: issue.html_url,
      labels: this.toLabelList(issue),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      bodyMarkdown: issue.body ?? '',
      markdown: this.toIssueMarkdown(issue),
    };
  }

  async prepareIssueReport(
    input: {
      kind: GithubReportKind;
      title?: string;
      summary?: string;
      report: string;
      labels?: string[];
    },
    context: { userId: string; companyId?: string; conversationId?: string },
  ) {
    await this.pruneExpiredPreviews();

    const draft = this.buildDraft(input, context.userId);
    const similarIssues = await this.findSimilarIssues(
      draft.title,
      draft.bodyMarkdown,
    );
    const recommendation = this.buildRecommendation(similarIssues);

    const previewId = randomUUID();
    const expiresAt = new Date(Date.now() + this.getPreviewTtlSeconds() * 1000);

    await this.previewsRepo.save({
      previewId,
      userId: context.userId,
      companyId: context.companyId ?? null,
      conversationId: context.conversationId ?? null,
      expiresAt,
      draft: draft as unknown as Record<string, unknown>,
      similarIssues: similarIssues as unknown as Record<string, unknown>[],
      recommendation: recommendation as unknown as Record<string, unknown>,
    });

    if (context.conversationId) {
      await this.conversationsService.mergeToolState({
        conversationId: context.conversationId,
        userId: context.userId,
        patch: {
          githubIssues: {
            pendingPreviewId: previewId,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
    }

    return {
      previewId,
      expiresAt: expiresAt.toISOString(),
      draft,
      similarIssues,
      recommendation,
      guidance: [
        'Revisa el borrador y la lista de similares antes de confirmar.',
        'Para guardar, usa post_github_issue_commit con confirm=true y el previewId.',
      ],
    };
  }

  async commitIssueReport(
    input: {
      previewId?: string;
      action: GithubCommitAction;
      targetIssueNumber?: number;
      confirm: boolean;
      titleOverride?: string;
      bodyOverride?: string;
      labelsOverride?: string[];
    },
    context: { userId: string; companyId?: string; conversationId?: string },
  ) {
    await this.pruneExpiredPreviews();
    const resolvedPreviewId =
      input.previewId ||
      (await this.getPendingPreviewIdFromConversation(context)) ||
      (await this.getLatestPreviewIdForUser(context.userId));
    if (!resolvedPreviewId) {
      throw new BadRequestException(
        'Preview not found or expired. Generate a new preview before committing.',
      );
    }
    const preview = await this.getPreviewRecord(
      resolvedPreviewId,
      context.userId,
    );

    if (!preview) {
      throw new BadRequestException(
        'Preview not found or expired. Generate a new preview before committing.',
      );
    }

    const resolvedAction = this.resolveAction(
      input.action,
      preview.recommendation,
    );
    const finalTitle = input.titleOverride?.trim() || preview.draft.title;
    const finalBody = input.bodyOverride?.trim() || preview.draft.bodyMarkdown;
    const finalLabels =
      input.labelsOverride && input.labelsOverride.length > 0
        ? unique(input.labelsOverride)
        : preview.draft.labels;

    const targetIssueNumber =
      input.targetIssueNumber ??
      preview.recommendation.targetIssueNumber ??
      null;

    if (!input.confirm) {
      return {
        status: 'pending_confirmation',
        resolvedAction,
        targetIssueNumber,
        draft: {
          title: finalTitle,
          bodyMarkdown: finalBody,
          labels: finalLabels,
        },
        similarIssues: preview.similarIssues,
        recommendation: preview.recommendation,
        message:
          'Confirm not enabled. Set confirm=true to persist the selected action in GitHub.',
      };
    }

    if (resolvedAction === 'merge_open_issue') {
      if (!targetIssueNumber) {
        throw new BadRequestException(
          'targetIssueNumber is required to merge with an open issue.',
        );
      }

      const issue = await this.fetchIssue(targetIssueNumber);
      if (issue.state !== 'open') {
        throw new BadRequestException(
          `Issue #${targetIssueNumber} is not open. Create a new issue instead.`,
        );
      }

      const comment = await this.createIssueComment(
        targetIssueNumber,
        this.buildMergeComment(finalTitle, finalBody, context.userId),
      );

      await this.previewsRepo.delete({ previewId: resolvedPreviewId });
      await this.clearPendingPreviewFromConversation(
        context,
        resolvedPreviewId,
      );

      return {
        status: 'merged_into_open_issue',
        action: resolvedAction,
        issue: this.toIssueListItem(issue),
        comment: {
          id: comment.id,
          htmlUrl: comment.html_url,
          bodyMarkdown: comment.body,
        },
      };
    }

    const createdIssue = await this.createIssue(
      finalTitle,
      finalBody,
      finalLabels,
    );
    await this.previewsRepo.delete({ previewId: resolvedPreviewId });
    await this.clearPendingPreviewFromConversation(context, resolvedPreviewId);

    return {
      status: 'created_new_issue',
      action: 'create_new_issue',
      issue: this.toIssueListItem(createdIssue),
      bodyMarkdown: createdIssue.body ?? '',
    };
  }

  private resolveAction(
    requested: GithubCommitAction,
    recommendation: Recommendation,
  ): Exclude<GithubCommitAction, 'auto'> {
    if (requested === 'auto') {
      return recommendation.action;
    }
    return requested;
  }

  private buildDraft(
    input: {
      kind: GithubReportKind;
      title?: string;
      summary?: string;
      report: string;
      labels?: string[];
    },
    userId: string,
  ): IssueDraft {
    const report = input.report.trim();
    const summary = (input.summary?.trim() || this.firstSentence(report)).slice(
      0,
      240,
    );

    const title =
      input.title?.trim() ||
      `${KIND_PREFIX[input.kind]} ${summary || 'Reporte desde chat'}`;

    const bodyMarkdown = [
      `## Tipo`,
      input.kind,
      '',
      `## Resumen`,
      summary || 'Sin resumen adicional',
      '',
      `## Descripcion`,
      report,
      '',
      `## Metadata`,
      `- Reportado desde chat`,
      `- Usuario: ${userId}`,
      `- Fecha: ${new Date().toISOString()}`,
    ].join('\n');

    const labels = unique([
      KIND_LABEL[input.kind],
      ...(this.getDefaultLabels() ?? []),
      ...(input.labels ?? []),
    ]);

    return {
      kind: input.kind,
      title: title.slice(0, 120),
      bodyMarkdown,
      labels,
      summary,
    };
  }

  private firstSentence(value: string): string {
    const sentence = value.split(/\n+/g)[0]?.trim() ?? '';
    if (!sentence) {
      return '';
    }
    return sentence.length > 240 ? `${sentence.slice(0, 237)}...` : sentence;
  }

  private async findSimilarIssues(
    title: string,
    bodyMarkdown: string,
  ): Promise<IssueSimilar[]> {
    const queryTokens = unique([
      ...tokenize(title),
      ...tokenize(bodyMarkdown),
    ]).slice(0, 8);

    const query = queryTokens.join(' ') || title;
    const response = await this.searchIssues(query, 'all', 1, SEARCH_MAX_ITEMS);

    const targetTokens = new Set([
      ...tokenize(title),
      ...tokenize(bodyMarkdown),
    ]);
    const similar = response.items
      .filter((issue) => !issue.pull_request)
      .map((issue) => {
        const issueTokens = new Set(
          tokenize(`${issue.title}\n${issue.body ?? ''}`),
        );
        const similarity = this.similarity(targetTokens, issueTokens);

        return {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          htmlUrl: issue.html_url,
          labels: this.toLabelList(issue),
          similarity,
          bodyMarkdown: issue.body ?? '',
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, PREVIEW_SIMILAR_ITEMS);

    return similar;
  }

  private buildRecommendation(similarIssues: IssueSimilar[]): Recommendation {
    const openMatch = similarIssues.find(
      (issue) =>
        issue.state === 'open' && issue.similarity >= OPEN_SIMILARITY_THRESHOLD,
    );

    if (openMatch) {
      return {
        action: 'merge_open_issue',
        targetIssueNumber: openMatch.number,
        reason:
          'Found an open similar issue. It is better to merge this requirement there via comment.',
      };
    }

    return {
      action: 'create_new_issue',
      targetIssueNumber: null,
      reason:
        'No open similar issue with strong similarity. Create a new issue.',
    };
  }

  private similarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) {
      return 0;
    }

    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) {
        intersection += 1;
      }
    }

    const union = a.size + b.size - intersection;
    if (union <= 0) {
      return 0;
    }

    return Number((intersection / union).toFixed(4));
  }

  private async createIssue(
    title: string,
    bodyMarkdown: string,
    labels: string[],
  ): Promise<GithubApiIssue> {
    const { owner, repo } = this.getRepository();
    return this.request<GithubApiIssue>(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body: bodyMarkdown,
        labels,
      }),
    });
  }

  private async createIssueComment(
    issueNumber: number,
    bodyMarkdown: string,
  ): Promise<GithubApiComment> {
    const { owner, repo } = this.getRepository();
    return this.request<GithubApiComment>(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body: bodyMarkdown }),
      },
    );
  }

  private buildMergeComment(
    title: string,
    bodyMarkdown: string,
    userId: string,
  ): string {
    return [
      '### Nuevo requerimiento relacionado desde chat',
      `- Usuario: ${userId}`,
      `- Fecha: ${new Date().toISOString()}`,
      '',
      `#### ${title}`,
      '',
      bodyMarkdown,
    ].join('\n');
  }

  private async fetchIssue(issueNumber: number): Promise<GithubApiIssue> {
    const { owner, repo } = this.getRepository();
    return this.request<GithubApiIssue>(
      `/repos/${owner}/${repo}/issues/${issueNumber}`,
    );
  }

  private async searchIssues(
    textQuery: string,
    state: GithubIssueState,
    page: number,
    perPage: number,
  ): Promise<GithubSearchResponse> {
    const { owner, repo } = this.getRepository();
    const qualifiers = [`repo:${owner}/${repo}`, 'is:issue'];
    if (state === 'open') {
      qualifiers.push('is:open');
    } else if (state === 'closed') {
      qualifiers.push('is:closed');
    }

    const q = `${textQuery.trim()} ${qualifiers.join(' ')}`.trim();
    return this.request<GithubSearchResponse>(
      `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&page=${page}&per_page=${perPage}`,
    );
  }

  private toIssueMarkdown(issue: GithubApiIssue): string {
    return [
      `# ${issue.title}`,
      '',
      `- Number: #${issue.number}`,
      `- State: ${issue.state}`,
      `- Labels: ${this.toLabelList(issue).join(', ') || 'none'}`,
      `- URL: ${issue.html_url}`,
      '',
      '## Description',
      issue.body ?? '',
    ].join('\n');
  }

  private toIssueListItem(issue: GithubApiIssue) {
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      htmlUrl: issue.html_url,
      labels: this.toLabelList(issue),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      bodyMarkdown: issue.body ?? '',
    };
  }

  private toLabelList(issue: GithubApiIssue): string[] {
    return (issue.labels ?? [])
      .map((label) => label.name?.trim() ?? '')
      .filter((label) => label.length > 0);
  }

  private getApiBaseUrl(): string {
    return process.env.GITHUB_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
  }

  private getToken(): string {
    const token = process.env.GITHUB_TOKEN?.trim();
    if (!token) {
      throw new ServiceUnavailableException(
        'GITHUB_TOKEN is not configured in backend environment.',
      );
    }
    return token;
  }

  private getRepository(): { owner: string; repo: string } {
    const repository = process.env.GITHUB_REPOSITORY?.trim();
    if (!repository || !repository.includes('/')) {
      throw new ServiceUnavailableException(
        'GITHUB_REPOSITORY is not configured. Expected format: owner/repo.',
      );
    }

    const [owner, repo] = repository.split('/').map((part) => part.trim());
    if (!owner || !repo) {
      throw new ServiceUnavailableException(
        'GITHUB_REPOSITORY is invalid. Expected format: owner/repo.',
      );
    }

    return { owner, repo };
  }

  private getDefaultLabels(): string[] {
    const raw = process.env.GITHUB_ISSUES_DEFAULT_LABELS?.trim();
    if (!raw) {
      return [];
    }
    return unique(raw.split(',').map((label) => label.trim()));
  }

  private getPreviewTtlSeconds(): number {
    const raw = Number.parseInt(
      process.env.GITHUB_ISSUES_PREVIEW_TTL_SECONDS ?? '',
      10,
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_PREVIEW_TTL_SECONDS;
    }
    return clamp(raw, 60, 24 * 60 * 60);
  }

  private async pruneExpiredPreviews(): Promise<void> {
    await this.previewsRepo.delete({
      expiresAt: LessThanOrEqual(new Date()),
    });
  }

  private async getPreviewRecord(
    previewId: string,
    userId: string,
  ): Promise<PreviewRecord | null> {
    const entity = await this.previewsRepo.findOne({
      where: { previewId, userId },
    });

    if (!entity) {
      return null;
    }

    return {
      previewId: entity.previewId,
      userId: entity.userId,
      companyId: entity.companyId ?? undefined,
      conversationId: entity.conversationId ?? undefined,
      expiresAt: entity.expiresAt,
      draft: entity.draft as unknown as IssueDraft,
      similarIssues: entity.similarIssues as unknown as IssueSimilar[],
      recommendation: entity.recommendation as unknown as Recommendation,
    };
  }

  private async getLatestPreviewIdForUser(
    userId: string,
  ): Promise<string | null> {
    const preview = await this.previewsRepo.findOne({
      where: { userId, expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    return preview?.previewId ?? null;
  }

  private async getPendingPreviewIdFromConversation(context: {
    userId: string;
    conversationId?: string;
  }): Promise<string | null> {
    if (!context.conversationId) {
      return null;
    }

    const conversation = await this.conversationsService.getConversationById({
      conversationId: context.conversationId,
      userId: context.userId,
    });
    const githubIssuesState =
      (conversation.toolState?.githubIssues as
        | Record<string, unknown>
        | undefined) ?? undefined;
    const pendingPreviewId = githubIssuesState?.pendingPreviewId;

    return typeof pendingPreviewId === 'string' && pendingPreviewId.length > 0
      ? pendingPreviewId
      : null;
  }

  private async clearPendingPreviewFromConversation(
    context: { userId: string; conversationId?: string },
    previewId: string,
  ): Promise<void> {
    if (!context.conversationId) {
      return;
    }

    const conversation = await this.conversationsService.getConversationById({
      conversationId: context.conversationId,
      userId: context.userId,
    });
    const githubIssuesState =
      (conversation.toolState?.githubIssues as
        | Record<string, unknown>
        | undefined) ?? undefined;
    const pendingPreviewId = githubIssuesState?.pendingPreviewId;
    if (
      typeof pendingPreviewId !== 'string' ||
      pendingPreviewId !== previewId
    ) {
      return;
    }

    const nextGithubIssuesState = { ...githubIssuesState };
    delete nextGithubIssuesState.pendingPreviewId;
    delete nextGithubIssuesState.expiresAt;

    await this.conversationsService.mergeToolState({
      conversationId: context.conversationId,
      userId: context.userId,
      patch: {
        githubIssues: nextGithubIssuesState,
      },
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const base = this.getApiBaseUrl();
    const url = `${base}${path}`;

    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'rent-ai-github-issues',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const payload = this.tryParseJson(text);

    if (!response.ok) {
      const message =
        this.extractApiErrorMessage(payload) || response.statusText;
      throw new BadGatewayException(
        `GitHub API request failed (${response.status}): ${message}`,
      );
    }

    return payload as T;
  }

  private tryParseJson(text: string): unknown {
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  private extractApiErrorMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const message = (payload as Record<string, unknown>).message;
    if (typeof message !== 'string' || !message.trim()) {
      return null;
    }
    return message;
  }
}
