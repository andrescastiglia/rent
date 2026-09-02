type Environment = Record<string, unknown>;

export type RuntimeHttpSecurityConfig = {
  allowedOrigins: string[];
  allowLocalDevelopmentOrigins: boolean;
  trustProxyHops: number;
};

const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'METRICS_SCRAPE_TOKEN',
  'PROPERTY_IMAGE_SIGNING_SECRET',
  'TURNSTILE_SECRET_KEY',
  'BATCH_WHATSAPP_INTERNAL_TOKEN',
  'BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN',
  'BATCH_COMMUNICATIONS_INTERNAL_TOKEN',
] as const;

const PLACEHOLDER_SECRET =
  /(?:change_in_production|replace_with|your_|minioadmin|rent_(?:redis_)?password|^(?:test|dev)[-_])/i;

function valueOf(environment: Environment, key: string): string {
  const value = environment[key];
  return typeof value === 'string' ? value.trim() : '';
}

function assertPositiveInteger(environment: Environment, key: string): void {
  const raw = valueOf(environment, key);
  if (!raw) return;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
}

function parseAllowedOrigins(environment: Environment): string[] {
  const raw = valueOf(environment, 'FRONTEND_URL');
  if (!raw) {
    if (valueOf(environment, 'NODE_ENV') === 'test') {
      return ['http://localhost:3000'];
    }
    throw new Error('FRONTEND_URL is required outside test');
  }

  return raw.split(',').map((entry) => {
    const candidate = entry.trim();
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error(`Invalid FRONTEND_URL origin: ${candidate}`);
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(`Invalid FRONTEND_URL origin: ${candidate}`);
    }
    if (
      valueOf(environment, 'NODE_ENV') === 'production' &&
      parsed.protocol !== 'https:'
    ) {
      throw new Error('Production FRONTEND_URL origins must use HTTPS');
    }
    return parsed.origin;
  });
}

export function getRuntimeHttpSecurityConfig(
  environment: Environment,
): RuntimeHttpSecurityConfig {
  const isProduction = valueOf(environment, 'NODE_ENV') === 'production';
  const rawTrustProxyHops = valueOf(environment, 'TRUST_PROXY_HOPS');
  if (isProduction && !rawTrustProxyHops) {
    throw new Error('TRUST_PROXY_HOPS is required in production');
  }
  const trustProxyHops = rawTrustProxyHops ? Number(rawTrustProxyHops) : 0;
  if (
    !Number.isSafeInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 10
  ) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  }

  return {
    allowedOrigins: parseAllowedOrigins(environment),
    allowLocalDevelopmentOrigins: !isProduction,
    trustProxyHops,
  };
}

export function validateRuntimeEnvironment(
  environment: Environment,
): Environment {
  if (valueOf(environment, 'NODE_ENV') === 'test') {
    return environment;
  }

  getRuntimeHttpSecurityConfig(environment);
  const required: string[] = [...REQUIRED_SECRETS];
  required.push(
    valueOf(environment, 'AWS_ACCESS_KEY_ID')
      ? 'AWS_ACCESS_KEY_ID'
      : 'S3_ACCESS_KEY',
    valueOf(environment, 'AWS_SECRET_ACCESS_KEY')
      ? 'AWS_SECRET_ACCESS_KEY'
      : 'S3_SECRET_KEY',
  );
  if (valueOf(environment, 'WHATSAPP_ENABLED').toLowerCase() === 'true') {
    required.push(
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_VERIFY_TOKEN',
      'WHATSAPP_APP_SECRET',
      'WHATSAPP_DOCUMENT_LINK_SECRET',
    );
  }
  if (
    valueOf(environment, 'WHATSAPP_INBOUND_ENABLED').toLowerCase() === 'true' &&
    valueOf(environment, 'WHATSAPP_ENABLED').toLowerCase() !== 'true'
  ) {
    throw new Error('WHATSAPP_INBOUND_ENABLED requires WHATSAPP_ENABLED=true');
  }
  [
    'WHATSAPP_INBOUND_DAILY_LIMIT',
    'WHATSAPP_INBOX_RETENTION_DAYS',
    'WHATSAPP_DEAD_LETTER_RETENTION_DAYS',
    'WHATSAPP_COMMUNICATION_RETENTION_DAYS',
    'WHATSAPP_OUTBOUND_RETENTION_DAYS',
  ].forEach((key) => assertPositiveInteger(environment, key));
  if (valueOf(environment, 'MERCADOPAGO_ACCESS_TOKEN')) {
    required.push('MERCADOPAGO_WEBHOOK_SECRET');
  }
  if (valueOf(environment, 'COMMUNICATION_EMAIL_WEBHOOK_URL')) {
    required.push('COMMUNICATION_EMAIL_WEBHOOK_TOKEN');
  }

  const missing = required.filter((key) => !valueOf(environment, key));
  if (missing.length > 0) {
    throw new Error(
      `Missing required secrets: ${missing
        .sort((left, right) => left.localeCompare(right))
        .join(', ')}`,
    );
  }

  if (valueOf(environment, 'NODE_ENV') === 'production') {
    const placeholders = required.filter((key) =>
      PLACEHOLDER_SECRET.test(valueOf(environment, key)),
    );
    if (placeholders.length > 0) {
      throw new Error(
        `Production secrets contain placeholder values: ${placeholders
          .sort((left, right) => left.localeCompare(right))
          .join(', ')}`,
      );
    }
  }

  return environment;
}
