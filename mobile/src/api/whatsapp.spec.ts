import { apiClient } from '@/api/client';
import { whatsappApi } from './whatsapp';

jest.mock('@/api/client', () => ({ apiClient: { post: jest.fn() } }));
jest.mock('@/api/env', () => ({ IS_MOCK_MODE: false }));

describe('whatsappApi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates and queues an activity through one backend command', async () => {
    const input = {
      requestId: '123e4567-e89b-12d3-a456-426614174003',
      personType: 'interested' as const,
      personId: '123e4567-e89b-12d3-a456-426614174002',
      subject: 'Seguimiento',
    };
    const response = {
      activity: { id: input.requestId },
      delivery: { deliveryId: 'delivery-1', status: 'queued', queued: true },
    };
    (apiClient.post as jest.Mock).mockResolvedValue(response);

    await expect(whatsappApi.createActivity(input)).resolves.toBe(response);
    expect(apiClient.post).toHaveBeenCalledWith('/whatsapp/activities', input);
  });
});
