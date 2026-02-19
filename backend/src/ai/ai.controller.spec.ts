import { AiController } from './ai.controller';
import { UserRole } from '../users/entities/user.entity';

describe('AiController', () => {
  const executor = {
    getMode: jest.fn(() => 'FULL'),
    listTools: jest.fn(() => [{ name: 'tool-1' }]),
    execute: jest.fn(),
  };
  const registry = {
    getOpenAiTools: jest.fn(),
  };
  const openAiService = {
    respond: jest.fn(),
  };
  const conversationsService = {
    getConversationById: jest.fn(),
    getOrCreateConversation: jest.fn(),
    toOpenAiHistory: jest.fn(),
    appendExchange: jest.fn(),
    appendAssistantError: jest.fn(),
  };

  let controller: AiController;
  const req = {
    user: {
      id: 'u1',
      companyId: 'c1',
      role: UserRole.ADMIN,
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AiController(
      executor as any,
      registry as any,
      openAiService as any,
      conversationsService as any,
    );
  });

  it('listTools returns mode and tools', () => {
    expect(controller.listTools()).toEqual({
      mode: 'FULL',
      tools: [{ name: 'tool-1' }],
    });
  });

  it('listOpenAiTools forwards request context', () => {
    registry.getOpenAiTools.mockReturnValue([{ name: 'x' }]);
    const result = controller.listOpenAiTools(req);
    expect(registry.getOpenAiTools).toHaveBeenCalledWith({
      userId: 'u1',
      companyId: 'c1',
      role: UserRole.ADMIN,
    });
    expect(result).toEqual([{ name: 'x' }]);
  });

  it('executeTool executes and wraps response', async () => {
    executor.execute.mockResolvedValue({ ok: true });
    const result = await controller.executeTool(
      { toolName: 'get_users', arguments: { page: 1 } } as any,
      req,
    );
    expect(executor.execute).toHaveBeenCalledWith(
      'get_users',
      { page: 1 },
      { userId: 'u1', companyId: 'c1', role: UserRole.ADMIN },
    );
    expect(result).toEqual({
      toolName: 'get_users',
      mode: 'FULL',
      result: { ok: true },
    });
  });

  it('getConversation maps conversation response', async () => {
    conversationsService.getConversationById.mockResolvedValue({
      id: 'conv-1',
      messages: [{ role: 'user', content: 'hi' }],
      toolState: { k: 'v' },
      lastActivityAt: '2026-01-01',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const result = await controller.getConversation('conv-1', req);
    expect(conversationsService.getConversationById).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      userId: 'u1',
    });
    expect(result.conversationId).toBe('conv-1');
  });

  it('respond uses dto history when provided', async () => {
    conversationsService.getOrCreateConversation.mockResolvedValue({
      id: 'conv-1',
    });
    openAiService.respond.mockResolvedValue({
      outputText: 'assistant',
      model: 'gpt',
    });
    conversationsService.appendExchange.mockResolvedValue({
      toolState: { ok: true },
    });

    const result = await controller.respond(
      {
        conversationId: 'conv-1',
        prompt: 'hola',
        messages: [{ role: 'user', content: 'prev' }],
      } as any,
      req,
    );

    expect(openAiService.respond).toHaveBeenCalledWith(
      'hola',
      {
        userId: 'u1',
        companyId: 'c1',
        conversationId: 'conv-1',
        role: UserRole.ADMIN,
      },
      [{ role: 'user', content: 'prev' }],
    );
    expect(result).toEqual(
      expect.objectContaining({
        mode: 'FULL',
        conversationId: 'conv-1',
        toolState: { ok: true },
        outputText: 'assistant',
      }),
    );
  });

  it('respond falls back to persisted history when dto messages are empty', async () => {
    conversationsService.getOrCreateConversation.mockResolvedValue({
      id: 'conv-2',
    });
    conversationsService.toOpenAiHistory.mockReturnValue([
      { role: 'assistant', content: 'prev' },
    ]);
    openAiService.respond.mockResolvedValue({ outputText: '', model: 'gpt' });
    conversationsService.appendExchange.mockResolvedValue({ toolState: {} });

    await controller.respond(
      { conversationId: 'conv-2', prompt: 'hola', messages: [] } as any,
      req,
    );

    expect(conversationsService.toOpenAiHistory).toHaveBeenCalled();
  });

  it('respond appends assistant error and rethrows', async () => {
    conversationsService.getOrCreateConversation.mockResolvedValue({
      id: 'conv-3',
    });
    const error = new Error('provider failed');
    openAiService.respond.mockRejectedValue(error);

    await expect(
      controller.respond(
        { conversationId: 'conv-3', prompt: 'hola' } as any,
        req,
      ),
    ).rejects.toThrow('provider failed');

    expect(conversationsService.appendAssistantError).toHaveBeenCalledWith({
      conversationId: 'conv-3',
      userId: 'u1',
      userPrompt: 'hola',
      assistantError: 'provider failed',
    });
  });
});
