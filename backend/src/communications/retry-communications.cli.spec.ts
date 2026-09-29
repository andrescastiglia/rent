import { processQueues } from './retry-communications.cli';

describe('communication queue worker', () => {
  const env = { ...process.env };
  const fetchMock = jest.fn();
  const response = (body: unknown, status = 200) => ({
    ok: status < 300,
    status,
    text: async () => JSON.stringify(body),
  });

  beforeEach(() => {
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'batch-test-token';
    delete process.env.APP_URL;
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(response({ failed: 0, deadLetter: 0 }));
  });

  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('processes payment effects before delivering communications with the batch credential', async () => {
    await processQueues();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:3001/payments/internal/process-effects',
      'http://127.0.0.1:3001/sales/internal/process-receipts',
      'http://127.0.0.1:3001/digital-signatures/internal/process-stamps',
      'http://127.0.0.1:3001/portals/internal/process-publications',
      'http://127.0.0.1:3001/settlements/internal/process-payouts',
      'http://127.0.0.1:3001/communications/internal/retry-due',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      method: 'POST',
      headers: { 'x-batch-communications-token': 'batch-test-token' },
    });
  });

  it('uses the configured application URL', async () => {
    process.env.APP_URL = ' https://rent.test ';
    await processQueues();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://rent.test/payments/internal/process-effects',
    );
  });

  it('fails without contacting an endpoint when the credential is absent', async () => {
    delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    await expect(processQueues()).rejects.toThrow(
      'BATCH_COMMUNICATIONS_INTERNAL_TOKEN is required',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { failed: 1, deadLetter: 0 },
    { failed: 0, deadLetter: 1 },
  ])(
    'reports unhealthy payment effects %j after processing communications',
    async (counts) => {
      fetchMock.mockResolvedValueOnce(response(counts));
      await expect(processQueues()).rejects.toThrow(
        'Document effects require retry or dead-letter recovery',
      );
      expect(fetchMock).toHaveBeenCalledTimes(6);
    },
  );

  it('propagates HTTP failures instead of reporting a successful cron', async () => {
    fetchMock.mockResolvedValueOnce(response({ message: 'unavailable' }, 503));
    await expect(processQueues()).rejects.toThrow(
      'Queue processing failed (503)',
    );
  });
  it('reports unhealthy sale receipt effects while still delivering communications', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ failed: 0, deadLetter: 0 }))
      .mockResolvedValueOnce(response({ failed: 1, deadLetter: 0 }));
    await expect(processQueues()).rejects.toThrow(
      'Document effects require retry',
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
