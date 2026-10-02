export type GuidanceStage = 'initial' | 'next';
export type GuidanceContext = {
  ready: boolean;
  blocked: boolean;
  paused: boolean;
  started: boolean;
  seen: ReadonlySet<string>;
};

export function guidanceModule(path: string): string | null {
  const segment = path.split('/').find((part) => part && !part.startsWith('('));
  return [
    'properties',
    'owners',
    'tenants',
    'leases',
    'payments',
    'invoices',
    'interested',
    'sales',
    'reports',
    'users',
    'templates',
    'ai',
    'home',
    'tasks',
    'dashboard',
    'more',
  ].includes(segment ?? '')
    ? (segment ?? null)
    : null;
}

/** A pure decision function makes timings, progress and suppressions testable. */
export function chooseGuidance(
  path: string,
  context: GuidanceContext,
): { key: string; delay: number; module: string; stage: GuidanceStage } | null {
  const module = guidanceModule(path);
  if (!module || !context.ready || context.blocked || context.paused)
    return null;
  const stage = context.started ? 'next' : 'initial';
  const key = `${path}:${stage}`;
  if (context.seen.has(key)) return null;
  const configured = Number(
    stage === 'initial'
      ? process.env.EXPO_PUBLIC_HELP_INITIAL_MS
      : process.env.EXPO_PUBLIC_HELP_TASK_MS,
  );
  const defaultDelay = stage === 'initial' ? 8000 : 12000;
  const delay =
    Number.isFinite(configured) && configured >= 1000
      ? configured
      : defaultDelay;
  return { key, module, stage, delay };
}

export type GuidanceControl = {
  id: string;
  label: string;
  kind: 'field' | 'action' | 'blocker';
  enabled: boolean;
  complete: boolean;
  blocking?: boolean;
};

const pendingFields: Readonly<Record<string, readonly string[]>> = {
  properties: [
    'name',
    'ownerId',
    'street',
    'number',
    'city',
    'state',
    'zipCode',
  ],
  owners: ['firstName', 'lastName'],
  tenants: ['firstName', 'lastName', 'email', 'phone', 'dni'],
  interested: ['phone'],
  users: ['firstName', 'lastName', 'email', 'password'],
  leases: [
    'propertyId',
    'tenantId',
    'buyerId',
    'startDate',
    'endDate',
    'rentAmount',
    'currency',
  ],
  payments: [
    'tenantAccountId',
    'lease',
    'amount',
    'paymentDate',
    'date',
    'method',
  ],
  templates: ['name', 'templateBody'],
};

function taskRequiredFields(path: string): readonly string[] {
  if (/\/activities\/(new|edit)$/.test(path)) return ['subject'];
  if (/\/visits\/(new|edit)$/.test(path))
    return ['interestedName', 'offerAmount'];
  if (/\/maintenance\/(new|edit)$/.test(path)) return ['title'];
  if (/\/payments\/(new|edit)$/.test(path)) return pendingFields.payments;
  return pendingFields[guidanceModule(path) ?? ''] ?? [];
}

/** Only controls actually rendered and enabled in the current authorized screen can be suggested. */
export function selectGuidanceControl(
  path: string,
  controls: readonly GuidanceControl[],
): GuidanceControl | null {
  const available = controls.filter(
    (control) =>
      control.enabled &&
      control.kind !== 'blocker' &&
      !/\.(delete|reject|approve|confirm|resetPassword|cancel|logout)$/.test(
        control.id,
      ),
  );
  const fields = taskRequiredFields(path);
  const pending = available.find(
    (control) =>
      control.kind === 'field' &&
      !control.complete &&
      fields.includes(control.id.split('.').at(-1) ?? ''),
  );
  if (pending) return pending;
  if (/\/(new|edit)$/.test(path))
    return (
      available.find((control) => /\.(submit|save)$/.test(control.id)) ?? null
    );
  return (
    available.find((control) => /\.(new|create|add|edit)$/.test(control.id)) ??
    available[0] ??
    null
  );
}
