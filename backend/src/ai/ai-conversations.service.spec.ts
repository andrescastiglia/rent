import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AiConversationsService } from './ai-conversations.service';

describe('AiConversationsService', () => {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  let service: AiConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiConversationsService(repo as any);
  });

  describe('getOrCreateConversation', () => {
    it('returns existing conversation when owned by user', async () => {
      const existing = { id: 'c1', userId: 'u1', messages: [], toolState: {} };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.getOrCreateConversation({
        conversationId: 'c1',
        userId: 'u1',
      });

      expect(result).toBe(existing);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when conversation does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.getOrCreateConversation({
          conversationId: 'missing',
          userId: 'u1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when conversation belongs to another user', async () => {
      repo.findOne.mockResolvedValue({ id: 'c1', userId: 'u2' });

      await expect(
        service.getOrCreateConversation({ conversationId: 'c1', userId: 'u1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates new conversation when conversationId is not provided', async () => {
      const created = {
        companyId: 'co1',
        userId: 'u1',
        messages: [],
        toolState: {},
      };
      const saved = { ...created, id: 'new-conversation-id' };

      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(saved);

      const result = await service.getOrCreateConversation({
        userId: 'u1',
        companyId: 'co1',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'co1',
          userId: 'u1',
          messages: [],
          toolState: {},
        }),
      );
      expect(result).toEqual(saved);
    });
  });

  describe('getConversationById', () => {
    it('returns conversation when found and authorized', async () => {
      const existing = { id: 'c1', userId: 'u1' };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.getConversationById({
        conversationId: 'c1',
        userId: 'u1',
      });

      expect(result).toBe(existing);
    });

    it('throws NotFoundException when missing', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.getConversationById({ conversationId: 'x', userId: 'u1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when user mismatch', async () => {
      repo.findOne.mockResolvedValue({ id: 'c1', userId: 'u2' });

      await expect(
        service.getConversationById({ conversationId: 'c1', userId: 'u1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('appendAssistantError', () => {
    it('appends user and assistant error messages and saves', async () => {
      const conversation = {
        id: 'c1',
        userId: 'u1',
        messages: [
          {
            id: 'm0',
            role: 'assistant',
            content: 'hola',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        toolState: {},
      } as any;

      repo.findOne.mockResolvedValue(conversation);
      repo.save.mockImplementation(async (value) => value);

      const result = await service.appendAssistantError({
        conversationId: 'c1',
        userId: 'u1',
        userPrompt: 'pregunta',
        assistantError: 'error llm',
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[2].role).toBe('assistant');
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('appendExchange', () => {
    it('appends user and assistant messages with model and saves', async () => {
      const conversation = {
        id: 'c1',
        userId: 'u1',
        messages: [],
        toolState: {},
      } as any;

      repo.findOne.mockResolvedValue(conversation);
      repo.save.mockImplementation(async (value) => value);

      const result = await service.appendExchange({
        conversationId: 'c1',
        userId: 'u1',
        userPrompt: 'hola',
        assistantText: 'respuesta',
        model: 'gpt-test',
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual(
        expect.objectContaining({ role: 'user', content: 'hola' }),
      );
      expect(result.messages[1]).toEqual(
        expect.objectContaining({
          role: 'assistant',
          content: 'respuesta',
          model: 'gpt-test',
        }),
      );
    });
  });

  describe('mergeToolState', () => {
    it('deep merges nested objects and keeps existing keys', async () => {
      const conversation = {
        id: 'c1',
        userId: 'u1',
        messages: [],
        toolState: {
          githubIssues: { pendingPreviewId: 'p1', expiresAt: 'old' },
          untouched: true,
        },
      } as any;

      repo.findOne.mockResolvedValue(conversation);
      repo.save.mockImplementation(async (value) => value);

      const result = await service.mergeToolState({
        conversationId: 'c1',
        userId: 'u1',
        patch: {
          githubIssues: { expiresAt: 'new' },
          another: { a: 1 },
        },
      });

      expect(result.toolState).toEqual({
        githubIssues: { pendingPreviewId: 'p1', expiresAt: 'new' },
        untouched: true,
        another: { a: 1 },
      });
    });
  });

  describe('clearToolStateKeys', () => {
    it('removes provided keys and keeps others', async () => {
      const conversation = {
        id: 'c1',
        userId: 'u1',
        messages: [],
        toolState: { a: 1, b: 2, c: 3 },
      } as any;

      repo.findOne.mockResolvedValue(conversation);
      repo.save.mockImplementation(async (value) => value);

      const result = await service.clearToolStateKeys({
        conversationId: 'c1',
        userId: 'u1',
        keys: ['a', 'c'],
      });

      expect(result.toolState).toEqual({ b: 2 });
    });
  });

  describe('toOpenAiHistory', () => {
    it('returns only valid user/assistant messages and applies limit', () => {
      const history = service.toOpenAiHistory(
        {
          messages: [
            { role: 'system', content: 'skip me' },
            { role: 'user', content: '  ' },
            { role: 'assistant', content: 'ok 1' },
            { role: 'user', content: 'ok 2' },
            { role: 'assistant', content: 'ok 3' },
          ],
        } as any,
        2,
      );

      expect(history).toEqual([
        { role: 'user', content: 'ok 2' },
        { role: 'assistant', content: 'ok 3' },
      ]);
    });
  });
});
