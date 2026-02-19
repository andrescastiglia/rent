import { AiToolRegistryDepsProvider } from './ai-tool-registry-deps.provider';

describe('AiToolRegistryDepsProvider', () => {
  it('exposes all injected dependencies', () => {
    const deps = Array.from({ length: 22 }, (_, i) => ({ id: i + 1 }));
    const provider = new AiToolRegistryDepsProvider(
      deps[0] as any,
      deps[1] as any,
      deps[2] as any,
      deps[3] as any,
      deps[4] as any,
      deps[5] as any,
      deps[6] as any,
      deps[7] as any,
      deps[8] as any,
      deps[9] as any,
      deps[10] as any,
      deps[11] as any,
      deps[12] as any,
      deps[13] as any,
      deps[14] as any,
      deps[15] as any,
      deps[16] as any,
      deps[17] as any,
      deps[18] as any,
      deps[19] as any,
      deps[20] as any,
      deps[21] as any,
    );

    expect(provider.authService).toBe(deps[0]);
    expect(provider.usersService).toBe(deps[1]);
    expect(provider.githubIssuesService).toBe(deps[21]);
  });
});
