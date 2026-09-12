export function databaseTls(
  environment: Record<string, string | undefined>,
): { rejectUnauthorized: true; ca: string } | false | undefined;
