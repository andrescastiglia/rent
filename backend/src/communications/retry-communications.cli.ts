const baseUrl = process.env.APP_URL?.trim() || 'http://127.0.0.1:3001';
const token = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN?.trim();

if (!token) {
  throw new Error('BATCH_COMMUNICATIONS_INTERNAL_TOKEN is required');
}

fetch(`${baseUrl}/communications/internal/retry-due`, {
  method: 'POST',
  headers: { 'x-batch-communications-token': token },
})
  .then(async (response) => {
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `Communications retry failed (${response.status}): ${body}`,
      );
    }
    process.stdout.write(`${body}\n`);
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
