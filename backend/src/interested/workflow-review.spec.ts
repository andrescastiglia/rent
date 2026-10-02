import { signWorkflowReview, verifyWorkflowReview } from './workflow-review';

describe('Signed assisted workflow reviews', () => {
  const previousSecret = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-workflow-review-secret';
  });
  afterAll(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const state = { rows: [{ phone: '123' }], existing: [] };
  it('accepts the same reviewed state for the same company', () => {
    expect(() =>
      verifyWorkflowReview(
        signWorkflowReview('company', state),
        'company',
        state,
      ),
    ).not.toThrow();
  });
  it('rejects changed rows and another company', () => {
    const token = signWorkflowReview('company', state);
    expect(() =>
      verifyWorkflowReview(token, 'company', {
        ...state,
        existing: ['new-duplicate'],
      }),
    ).toThrow('cambiaron');
    expect(() => verifyWorkflowReview(token, 'foreign', state)).toThrow(
      'another company',
    );
  });
  it.each(['', 'invalid', 'payload.signature.extra', 'payload.bad-signature'])(
    'rejects a malformed or forged review: %s',
    (token) => {
      expect(() => verifyWorkflowReview(token, 'company', state)).toThrow(
        'Invalid workflow',
      );
    },
  );
  it('expires reviews after fifteen minutes', () => {
    const token = signWorkflowReview('company', state);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 900_001);
    try {
      expect(() => verifyWorkflowReview(token, 'company', state)).toThrow(
        'expired',
      );
    } finally {
      clock.mockRestore();
    }
  });
});
