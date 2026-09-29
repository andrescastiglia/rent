import { canRolesUseAiTool } from './ai-tool-access-policy';
import { buildAiToolDefinitions } from './openai-tools.registry';
import { UserRole } from '../users/entities/user.entity';

describe('AI tool domain authorization', () => {
  const definitions = buildAiToolDefinitions({} as never);
  const tool = (name: string) =>
    definitions.find((item) => item.name === name)!;

  it('assigns a domain policy to every staff tool', () => {
    expect(
      definitions
        .filter((item) => item.allowedRoles.includes(UserRole.STAFF))
        .filter((item) => !item.requiredPermission)
        .map((item) => item.name),
    ).toEqual([]);
  });

  it('denies admin-only mutations even to staff with user management permission', () => {
    for (const name of ['post_users', 'patch_users_by_id', 'post_currencies']) {
      expect(
        canRolesUseAiTool(tool(name), {
          role: UserRole.STAFF,
          permissions: { users: true, ai: true },
        }),
      ).toBe(false);
    }
  });

  it('requires the resource permission for both reads and mutations', () => {
    for (const name of ['get_properties', 'post_properties']) {
      const definition = tool(name);
      expect(canRolesUseAiTool(definition, { role: UserRole.STAFF })).toBe(
        false,
      );
      expect(
        canRolesUseAiTool(definition, {
          role: UserRole.STAFF,
          permissions: { ai: true, properties: false },
        }),
      ).toBe(false);
      expect(
        canRolesUseAiTool(definition, {
          role: UserRole.STAFF,
          permissions: { ai: true, properties: true },
        }),
      ).toBe(true);
    }
  });

  it('does not let an additional self-service role bypass domain permissions', () => {
    expect(
      canRolesUseAiTool(tool('get_properties'), {
        role: UserRole.OWNER,
        roles: [UserRole.OWNER, UserRole.STAFF],
        permissions: { properties: false },
      }),
    ).toBe(false);
    expect(
      canRolesUseAiTool(tool('get_auth_profile'), {
        role: UserRole.STAFF,
      }),
    ).toBe(true);
  });

  it('fails closed for newly registered staff tools without a policy', () => {
    expect(
      canRolesUseAiTool(
        { ...tool('get_properties'), requiredPermission: undefined },
        {
          role: UserRole.STAFF,
          permissions: { properties: true },
        },
      ),
    ).toBe(false);
  });
});
