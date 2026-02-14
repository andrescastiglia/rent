import { z } from 'zod';
import { UserRole } from '../users/entities/user.entity';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiToolsRegistryService } from './ai-tools-registry.service';

describe('AiToolsRegistryService', () => {
  it('builds OpenAI tools for schemas with date coercion and unknown root', () => {
    const catalog = {
      getDefinitions: jest.fn().mockReturnValue([
        {
          name: 'post_interested',
          description: 'Test date coercion schema',
          mutability: 'mutable',
          allowedRoles: [UserRole.ADMIN],
          parameters: z
            .object({
              phone: z.string().min(1),
              consentRecordedAt: z.coerce.date().optional(),
            })
            .strict(),
          execute: jest.fn(),
        },
        {
          name: 'post_whatsapp_webhook',
          description: 'Test unknown root schema',
          mutability: 'mutable',
          allowedRoles: [UserRole.ADMIN],
          parameters: z.unknown(),
          execute: jest.fn(),
        },
      ]),
    } as unknown as AiToolCatalogService;

    const executor = {
      execute: jest.fn(),
      getMode: jest.fn().mockReturnValue('FULL'),
    } as unknown as AiToolExecutorService;

    const service = new AiToolsRegistryService(catalog, executor);

    const tools = service.getOpenAiTools({
      userId: 'user-1',
      companyId: 'company-1',
      role: UserRole.ADMIN,
    }) as any[];

    expect(tools).toHaveLength(2);
    expect(tools[0].function.name).toBe('post_interested');
    expect(tools[0].function.parameters.type).toBe('object');
    expect(tools[1].function.name).toBe('post_whatsapp_webhook');
    expect(tools[1].function.parameters.type).toBe('object');
  });

  it('logs fallback warning once per tool', () => {
    const catalog = {
      getDefinitions: jest.fn().mockReturnValue([
        {
          name: 'non_object_tool',
          description: 'Test non-object root schema',
          mutability: 'mutable',
          allowedRoles: [UserRole.ADMIN],
          parameters: z.string(),
          execute: jest.fn(),
        },
      ]),
    } as unknown as AiToolCatalogService;

    const executor = {
      execute: jest.fn(),
      getMode: jest.fn().mockReturnValue('FULL'),
    } as unknown as AiToolExecutorService;

    const service = new AiToolsRegistryService(catalog, executor);
    const warnSpy = jest.spyOn((service as any).logger, 'warn');

    service.getOpenAiTools({
      userId: 'user-1',
      companyId: 'company-1',
      role: UserRole.ADMIN,
    });
    service.getOpenAiTools({
      userId: 'user-1',
      companyId: 'company-1',
      role: UserRole.ADMIN,
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('trims tools to OpenAI limit and prioritizes prompt-relevant tools', () => {
    const fillerTools = Array.from({ length: 147 }, (_, index) => ({
      name: `a_tool_${index}`,
      description: `Filler tool ${index}`,
      mutability: 'readonly' as const,
      allowedRoles: [UserRole.ADMIN],
      parameters: z.object({}).strict(),
      execute: jest.fn(),
    }));

    const propertyTool = {
      name: 'get_properties',
      description: 'Equivalent to GET /properties',
      mutability: 'readonly' as const,
      allowedRoles: [UserRole.ADMIN],
      parameters: z.object({}).strict(),
      execute: jest.fn(),
    };

    const catalog = {
      getDefinitions: jest.fn().mockReturnValue([...fillerTools, propertyTool]),
    } as unknown as AiToolCatalogService;

    const executor = {
      execute: jest.fn(),
      getMode: jest.fn().mockReturnValue('FULL'),
    } as unknown as AiToolExecutorService;

    const service = new AiToolsRegistryService(catalog, executor);
    const tools = service.getOpenAiTools(
      {
        userId: 'user-1',
        companyId: 'company-1',
        role: UserRole.ADMIN,
      },
      'ver propiedades',
    ) as any[];

    expect(tools).toHaveLength(128);
    expect(
      tools.some((tool) => tool.function.name === 'get_properties'),
    ).toBeTruthy();
  });
});
