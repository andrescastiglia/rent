import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { UserRole } from '../users/entities/user.entity';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiToolDefinition } from './types/ai-tool.types';

describe('AiToolExecutorService', () => {
  const context = {
    userId: 'user-1',
    companyId: 'company-1',
    role: UserRole.ADMIN,
  };

  let service: AiToolExecutorService;
  let getDefinitions: jest.Mock;
  let getDefinitionByName: jest.Mock;
  let testTool: AiToolDefinition;

  beforeEach(() => {
    testTool = {
      name: 'users_list',
      description: 'List users',
      mutability: 'readonly',
      allowedRoles: [UserRole.ADMIN],
      parameters: z
        .object({
          page: z.number().int().min(1).default(1),
        })
        .strict(),
      execute: jest.fn().mockResolvedValue({
        ok: true,
        passwordHash: 'hidden',
      }),
    };

    getDefinitions = jest.fn(() => [testTool]);
    getDefinitionByName = jest.fn((name: string) =>
      name === testTool.name ? testTool : undefined,
    );

    service = new AiToolExecutorService({
      getDefinitions,
      getDefinitionByName,
    } as unknown as AiToolCatalogService);

    delete process.env.AI_TOOLS_MODE;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.AI_TOOLS_MODE;
  });

  it('should reject execution when AI_TOOLS_MODE is NONE', async () => {
    process.env.AI_TOOLS_MODE = 'NONE';

    await expect(
      service.execute('users_list', { page: 1 }, context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should reject mutable tool in READONLY mode', async () => {
    process.env.AI_TOOLS_MODE = 'READONLY';
    testTool.mutability = 'mutable';

    await expect(
      service.execute('users_list', { page: 1 }, context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should reject role not allowed for tool', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';
    testTool.allowedRoles = [UserRole.STAFF];

    await expect(
      service.execute('users_list', { page: 1 }, context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should reject unknown tool', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';

    await expect(
      service.execute('missing_tool', {}, context),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should reject invalid payload with extra field', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';

    await expect(
      service.execute('users_list', { page: 1, extra: true }, context),
    ).rejects.toBeInstanceOf(Error);
  });

  it('should execute tool and sanitize sensitive fields', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';

    await expect(
      service.execute('users_list', { page: 1 }, context),
    ).resolves.toEqual({
      ok: true,
    });
    expect(testTool.execute).toHaveBeenCalledWith({ page: 1 }, context);
  });

  it('should sanitize nested objects and arrays with sensitive fields', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';
    (testTool.execute as jest.Mock).mockResolvedValue({
      users: [
        { name: 'Alice', password: 'secret', passwordHash: 'hash1' },
        { name: 'Bob', nested: { password: 'x', safe: true } },
      ],
      total: 2,
    });

    const result = await service.execute('users_list', { page: 1 }, context);
    expect(result).toEqual({
      users: [{ name: 'Alice' }, { name: 'Bob', nested: { safe: true } }],
      total: 2,
    });
  });

  it('should return primitive values from sanitizeOutput as-is', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';
    (testTool.execute as jest.Mock).mockResolvedValue('plain string');

    const result = await service.execute('users_list', { page: 1 }, context);
    expect(result).toBe('plain string');
  });

  it('should apply null-to-undefined normalization on second pass', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';

    const toolWithOptional: AiToolDefinition = {
      name: 'test_nullable',
      description: 'test',
      mutability: 'readonly',
      allowedRoles: [UserRole.ADMIN],
      parameters: z.object({
        page: z.number().int().min(1).default(1),
        filter: z.string().optional(),
      }),
      execute: jest.fn().mockResolvedValue({ ok: true }),
    };
    getDefinitionByName.mockImplementation((name: string) =>
      name === 'test_nullable' ? toolWithOptional : undefined,
    );

    await service.execute('test_nullable', { page: 1, filter: null }, context);
    expect(toolWithOptional.execute).toHaveBeenCalledWith({ page: 1 }, context);
  });

  it('should normalize nulls inside arrays', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';

    const toolArr: AiToolDefinition = {
      name: 'test_arr',
      description: 'test',
      mutability: 'readonly',
      allowedRoles: [UserRole.ADMIN],
      parameters: z.object({
        tags: z.array(z.string().optional()).optional(),
      }),
      execute: jest.fn().mockResolvedValue({ ok: true }),
    };
    getDefinitionByName.mockImplementation((name: string) =>
      name === 'test_arr' ? toolArr : undefined,
    );

    await service.execute('test_arr', { tags: [null, 'a'] }, context);
    expect(toolArr.execute).toHaveBeenCalledWith(
      { tags: [undefined, 'a'] },
      context,
    );
  });

  it('should rethrow tool execution errors with audit log', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';
    const execError = new Error('DB connection failed');
    (testTool.execute as jest.Mock).mockRejectedValue(execError);

    await expect(
      service.execute('users_list', { page: 1 }, context),
    ).rejects.toThrow('DB connection failed');
  });

  it('should reject execution when context is missing userId', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';

    await expect(
      service.execute(
        'users_list',
        { page: 1 },
        {
          userId: '',
          companyId: 'c-1',
          role: UserRole.ADMIN,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('should return correct mode for READONLY', () => {
    process.env.AI_TOOLS_MODE = 'readonly';
    expect(service.getMode()).toBe('READONLY');
  });

  it('should return correct mode for FULL', () => {
    process.env.AI_TOOLS_MODE = 'full';
    expect(service.getMode()).toBe('FULL');
  });

  it('should default to NONE for unknown mode', () => {
    process.env.AI_TOOLS_MODE = 'INVALID';
    expect(service.getMode()).toBe('NONE');
  });

  it('should list tools with enabled status based on mode', () => {
    process.env.AI_TOOLS_MODE = 'READONLY';
    const tools = service.listTools();
    expect(tools).toEqual([
      {
        name: 'users_list',
        description: 'List users',
        mutability: 'readonly',
        enabled: true,
        allowedRoles: [UserRole.ADMIN],
      },
    ]);
  });

  it('should mark mutable tools as disabled in READONLY mode', () => {
    process.env.AI_TOOLS_MODE = 'READONLY';
    testTool.mutability = 'mutable';
    const tools = service.listTools();
    expect(tools[0].enabled).toBe(false);
  });

  it('should apply defaults from Zod schema when args are empty', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';

    await service.execute('users_list', {}, context);
    expect(testTool.execute).toHaveBeenCalledWith({ page: 1 }, context);
  });

  it('should handle null args by converting to empty object', async () => {
    process.env.AI_TOOLS_MODE = 'FULL';

    await service.execute('users_list', null, context);
    expect(testTool.execute).toHaveBeenCalledWith({ page: 1 }, context);
  });
});
