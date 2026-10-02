import { chooseGuidance, guidanceModule } from './guidance';
const ready = {
  ready: true,
  blocked: false,
  paused: false,
  started: false,
  seen: new Set<string>(),
};
afterEach(() => {
  delete process.env.EXPO_PUBLIC_HELP_INITIAL_MS;
  delete process.env.EXPO_PUBLIC_HELP_TASK_MS;
});
it('waits eight seconds after a screen becomes ready', () => {
  expect(chooseGuidance('/properties', ready)).toEqual({
    key: '/properties:initial',
    module: 'properties',
    stage: 'initial',
    delay: 8000,
  });
});
it('reevaluates started tasks with a twelve-second interaction timeout', () => {
  expect(chooseGuidance('/payments/new', { ...ready, started: true })).toEqual({
    key: '/payments/new:next',
    module: 'payments',
    stage: 'next',
    delay: 12000,
  });
});
it.each([{ ready: false }, { blocked: true }, { paused: true }])(
  'pauses help while state is %j',
  (state) => {
    expect(chooseGuidance('/leases/new', { ...ready, ...state })).toBeNull();
  },
);
it('does not repeat a dismissed suggestion in the same task but rechecks later visits', () => {
  expect(
    chooseGuidance('/properties', {
      ...ready,
      seen: new Set(['/properties:initial']),
    }),
  ).toBeNull();
  expect(
    chooseGuidance('/properties/42', {
      ...ready,
      seen: new Set(['/properties:initial']),
    })?.key,
  ).toBe('/properties/42:initial');
  expect(chooseGuidance('/properties', ready)).not.toBeNull();
});
it('does not advise on authentication and unknown screens', () => {
  expect(guidanceModule('/login')).toBeNull();
  expect(chooseGuidance('/unsupported', ready)).toBeNull();
  expect(guidanceModule('/(app)/(tabs)/payments')).toBe('payments');
});
it('supports configured timers and rejects invalid timings', () => {
  process.env.EXPO_PUBLIC_HELP_INITIAL_MS = '2000';
  process.env.EXPO_PUBLIC_HELP_TASK_MS = '3000';
  expect(chooseGuidance('/properties', ready)?.delay).toBe(2000);
  expect(
    chooseGuidance('/properties', { ...ready, started: true })?.delay,
  ).toBe(3000);
  process.env.EXPO_PUBLIC_HELP_INITIAL_MS = 'invalid';
  expect(chooseGuidance('/properties', ready)?.delay).toBe(8000);
});
