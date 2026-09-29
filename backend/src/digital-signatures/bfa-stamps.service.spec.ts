import { BfaStampsService } from './bfa-stamps.service';
import { BfaStampsController } from './bfa-stamps.controller';

describe('BFA stamp queue', () => {
  const setup = () => {
    const job = {
      id: 'job',
      company_id: 'company',
      document_id: 'document',
      sha256: 'digest',
      status: 'queued',
      attempts: 1,
      claim_token: 'claim',
      submitted_at: null as Date | null,
    };
    const jobs = [job];
    const document = {
      file_data: Buffer.from('pdf'),
      file_mime_type: 'application/pdf',
    };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('WITH next AS')) return jobs.splice(0, 1);
      if (sql.includes('SELECT file_data')) return [document];
      if (sql.includes('WITH submitted AS'))
        return [{ submitted_at: new Date() }];
      if (sql.includes('AS "deadLetter"')) return [{ deadLetter: 0 }];
      if (sql.includes('INSERT INTO document_bfa_stamps'))
        return [{ id: 'job', status: 'queued' }];
      if (sql.includes('SELECT s.id'))
        return [{ id: 'job', status: 'stamped' }];
      return [];
    });
    const manager = { query };
    const db = {
      query,
      manager,
      transaction: jest.fn(async (work) => work(manager)),
    };
    const bfa = {
      digest: jest.fn().mockReturnValue('digest'),
      verify: jest.fn().mockResolvedValue({ stamped: false, stamps: [] }),
      submit: jest.fn(),
    };
    const config = {
      enabled: jest.fn().mockReturnValue(true),
      assertEnabled: jest.fn(),
    };
    const service = new BfaStampsService(
      db as never,
      bfa as never,
      config as never,
    );
    return { job, jobs, document, query, db, bfa, config, service };
  };

  it('does not access storage or providers while disabled', async () => {
    const f = setup();
    f.config.enabled.mockReturnValue(false);
    await expect(f.service.processDue()).resolves.toMatchObject({
      processed: 0,
      disabled: true,
    });
    expect(f.query).not.toHaveBeenCalled();
    expect(f.bfa.verify).not.toHaveBeenCalled();
  });
  it('enqueues a digest with document ownership checked inside the transaction', async () => {
    const f = setup();
    await expect(
      f.service.request('document', 'company'),
    ).resolves.toMatchObject({ status: 'queued' });
    expect(f.config.assertEnabled).toHaveBeenCalledWith('BFA');
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('company_id = $2::uuid'),
      ['document', 'company'],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO document_bfa_stamps'),
      ['company', 'document', 'digest'],
    );
  });
  it.each(['scope', 'missing', 'bytes', 'mime'])(
    'rejects %s document requests without submitting',
    async (reason) => {
      const f = setup();
      if (reason === 'missing') f.query.mockResolvedValueOnce([]);
      if (reason === 'bytes') f.document.file_data = null as never;
      if (reason === 'mime') f.document.file_mime_type = 'text/plain';
      await expect(
        f.service.request('document', reason === 'scope' ? '' : 'company'),
      ).rejects.toThrow();
      expect(f.bfa.submit).not.toHaveBeenCalled();
    },
  );
  it('returns historical proof by company and rejects absent history', async () => {
    const f = setup();
    await expect(f.service.find('document', 'company')).resolves.toMatchObject({
      status: 'stamped',
    });
    await expect(f.service.find('document', '')).rejects.toThrow(
      'Company scope',
    );
    f.query.mockResolvedValueOnce([]);
    await expect(f.service.find('document', 'foreign')).rejects.toThrow(
      'not found',
    );
  });
  it('persists submission intent before transmitting only the digest', async () => {
    const f = setup();
    await f.service.processDue();
    expect(f.bfa.submit).toHaveBeenCalledWith('digest');
    const claimIndex = f.query.mock.calls.findIndex(([sql]) =>
      sql.includes('WITH submitted'),
    );
    expect(f.query.mock.invocationCallOrder[claimIndex]).toBeLessThan(
      f.bfa.submit.mock.invocationCallOrder[0],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining("INTERVAL '60 seconds'"),
      ['job', 'claim', null],
    );
  });
  it('does not submit when its claim was replaced by another worker', async () => {
    const f = setup();
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql) =>
      sql.includes('WITH submitted') ? [] : query(sql),
    );
    await f.service.processDue();
    expect(f.bfa.submit).not.toHaveBeenCalled();
  });
  it('confirms a verified stamp atomically without modifying lease signature state', async () => {
    const f = setup();
    const proof = { stamped: true, stamps: [{ blocknumber: '1' }] };
    f.bfa.verify.mockResolvedValue(proof);
    await expect(f.service.processDue()).resolves.toMatchObject({
      completed: 1,
      failed: 0,
    });
    expect(f.db.transaction).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'stamped'"),
      ['job', 'claim', JSON.stringify(proof)],
    );
    expect(
      f.query.mock.calls.every(([sql]) => !sql.includes('UPDATE leases')),
    ).toBe(true);
    expect(f.bfa.submit).not.toHaveBeenCalled();
  });
  it('rechecks document bytes before committing proof', async () => {
    const f = setup();
    f.bfa.verify.mockResolvedValue({ stamped: true, stamps: [] });
    f.bfa.digest.mockReturnValueOnce('digest').mockReturnValueOnce('changed');
    await expect(f.service.processDue()).resolves.toMatchObject({
      completed: 0,
      failed: 1,
    });
    expect(
      f.query.mock.calls.some(([sql]) => sql.includes("status = 'stamped'")),
    ).toBe(false);
  });
  it('routes modified documents to review without sending a new stamp', async () => {
    const f = setup();
    f.bfa.digest.mockReturnValue('changed');
    await f.service.processDue();
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('SET status = $3'),
      ['job', 'claim', 'needs_review', 'document_changed'],
    );
    expect(f.bfa.verify).not.toHaveBeenCalled();
  });
  it.each(['attempts', 'timeout', 'query-failure'])(
    'bounds %s retries and never resubmits uncertain work',
    async (reason) => {
      const f = setup();
      if (reason === 'attempts') {
        f.job.status = 'submitted';
        f.job.attempts = 20;
      } else {
        f.job.status = 'submitted';
        f.job.submitted_at = new Date(Date.now() - 3600001);
      }
      if (reason === 'query-failure')
        f.bfa.verify.mockRejectedValue(new Error('provider unavailable'));
      await f.service.processDue();
      expect(f.query).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $3'),
        expect.arrayContaining(['needs_review']),
      );
      if (reason !== 'attempts') expect(f.bfa.submit).not.toHaveBeenCalled();
    },
  );
  it('marks repeated read failures as failed before any submission', async () => {
    const f = setup();
    f.job.attempts = 20;
    f.bfa.verify.mockRejectedValue(new Error('offline'));
    await f.service.processDue();
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('SET status = $3'),
      ['job', 'claim', 'failed', 'provider_unavailable'],
    );
    expect(f.bfa.submit).not.toHaveBeenCalled();
  });
  it('passes the company scope and checks batch authentication in the controller', async () => {
    const f = setup();
    const communications = { assertBatchToken: jest.fn() };
    const controller = new BfaStampsController(
      f.service,
      communications as never,
    );
    await controller.request('document', { user: { companyId: 'company' } });
    await controller.find('document', { user: { companyId: 'company' } });
    f.config.enabled.mockReturnValue(false);
    await controller.process('batch-token');
    expect(communications.assertBatchToken).toHaveBeenCalledWith('batch-token');
    communications.assertBatchToken.mockImplementation(() => {
      throw new Error('unauthorized');
    });
    expect(() => controller.process()).toThrow('unauthorized');
  });
});
