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
  const ragRollout = {
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
      conversationsService as any,
      ragRollout as any,
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
      {
        userId: 'u1',
        companyId: 'c1',
        role: UserRole.ADMIN,
        conversationId: undefined,
        confirmationId: undefined,
        confirmMutation: false,
      },
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
      companyId: 'c1',
    });
    expect(result.conversationId).toBe('conv-1');
  });

  it('respond uses dto history when provided', async () => {
    ragRollout.respond.mockResolvedValue({
      conversationId: 'conv-1',
      outputText: 'assistant',
      model: 'gpt',
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

    expect(ragRollout.respond).toHaveBeenCalledWith({
      prompt: 'hola',
      conversationId: 'conv-1',
      history: [{ role: 'user', content: 'prev' }],
      context: {
        userId: 'u1',
        companyId: 'c1',
        role: UserRole.ADMIN,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        mode: 'FULL',
        conversationId: 'conv-1',
        toolState: { ok: true },
        outputText: 'assistant',
      }),
    );
  });

  it('respond lets the orchestrator load persisted history when messages are empty', async () => {
    ragRollout.respond.mockResolvedValue({
      conversationId: 'conv-2',
      outputText: '',
      model: 'gpt',
    });

    await controller.respond(
      { conversationId: 'conv-2', prompt: 'hola', messages: [] } as any,
      req,
    );

    expect(ragRollout.respond).toHaveBeenCalledWith(
      expect.objectContaining({ history: [] }),
    );
  });

  it('respond propagates orchestrator errors', async () => {
    const error = new Error('provider failed');
    ragRollout.respond.mockRejectedValue(error);

    await expect(
      controller.respond(
        { conversationId: 'conv-3', prompt: 'hola' } as any,
        req,
      ),
    ).rejects.toThrow('provider failed');

    expect(ragRollout.respond).toHaveBeenCalled();
  });
});
