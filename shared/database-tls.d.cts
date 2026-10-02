export function databaseTls(
  environment: Record<string, string | undefined>,
): { ssl: { rejectUnauthorized: true; ca: string } | false } | undefined;
