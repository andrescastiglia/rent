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
});
