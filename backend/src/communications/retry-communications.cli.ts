export async function processQueues() {
  const baseUrl = process.env.APP_URL?.trim() || 'http://127.0.0.1:3001';
  const token = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN?.trim();
  if (!token) {
    throw new Error('BATCH_COMMUNICATIONS_INTERNAL_TOKEN is required');
  }
  let documentEffectsFailed = false;
  for (const path of [
    '/payments/internal/process-effects',
    '/sales/internal/process-receipts',
    '/digital-signatures/internal/process-stamps',
    '/portals/internal/process-publications',
    '/settlements/internal/process-payouts',
    '/communications/internal/retry-due',
  ]) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'x-batch-communications-token': token },
    });
    const body = await response.text();
    if (!response.ok)
      throw new Error(`Queue processing failed (${response.status}): ${body}`);
    process.stdout.write(`${path}: ${body}\n`);
    if (path !== '/communications/internal/retry-due') {
      const counts = JSON.parse(body) as { failed: number; deadLetter: number };
      documentEffectsFailed ||= counts.failed > 0 || counts.deadLetter > 0;
    }
  }
  if (documentEffectsFailed)
    throw new Error('Document effects require retry or dead-letter recovery');
}

if (require.main === module) {
  processQueues().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
