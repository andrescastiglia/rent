import { ForbiddenException } from '@nestjs/common';
import { PaymentEffectsController } from './payment-effects.controller';

describe('PaymentEffectsController', () => {
  it('requires the batch credential before starting any work', () => {
    const effects = { processDue: jest.fn() };
    const communications = {
      assertBatchToken: jest.fn(() => {
        throw new ForbiddenException();
      }),
    };
    const controller = new PaymentEffectsController(
      effects as never,
      communications as never,
    );
    expect(() => controller.process('invalid')).toThrow(ForbiddenException);
    expect(effects.processDue).not.toHaveBeenCalled();
  });

  it('returns queue status for an authenticated worker', async () => {
    const status = { processed: 1, failed: 0 };
    const effects = { processDue: jest.fn().mockResolvedValue(status) };
    const communications = { assertBatchToken: jest.fn() };
    const controller = new PaymentEffectsController(
      effects as never,
      communications as never,
    );
    await expect(controller.process('batch-token')).resolves.toEqual(status);
    expect(communications.assertBatchToken).toHaveBeenCalledWith('batch-token');
  });
});
