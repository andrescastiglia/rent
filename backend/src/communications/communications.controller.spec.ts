import { CommunicationsController } from './communications.controller';

describe('CommunicationsController', () => {
  const service = {
    listTemplates: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    preview: jest.fn(),
    sendTest: jest.fn(),
    listDeliveries: jest.fn(),
    approve: jest.fn(),
    retry: jest.fn(),
    assertBatchToken: jest.fn(),
    retryDue: jest.fn(),
  };
  const request = { user: { companyId: 'company-1' } } as any;
  let controller: CommunicationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CommunicationsController(service as any);
  });

  it('scopes templates and deliveries to the authenticated company', async () => {
    service.listTemplates.mockResolvedValue([]);
    service.listDeliveries.mockResolvedValue([]);
    await controller.listTemplates(request);
    await controller.listDeliveries(request);
    expect(service.listTemplates).toHaveBeenCalledWith('company-1');
    expect(service.listDeliveries).toHaveBeenCalledWith('company-1');
  });

  it('protects and delegates the automatic retry endpoint', async () => {
    service.retryDue.mockResolvedValue({ processed: 1, sent: 1, failed: 0 });
    await expect(controller.retryDue('token')).resolves.toEqual({
      processed: 1,
      sent: 1,
      failed: 0,
    });
    expect(service.assertBatchToken).toHaveBeenCalledWith('token');
  });
});
