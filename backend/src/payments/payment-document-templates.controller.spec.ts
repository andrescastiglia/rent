import { PaymentDocumentTemplatesController } from './payment-document-templates.controller';

describe('PaymentDocumentTemplatesController', () => {
  const templatesService = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  let controller: PaymentDocumentTemplatesController;
  const req = { user: { companyId: 'c1' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PaymentDocumentTemplatesController(
      templatesService as any,
    );
  });

  it('delegates list/create/update with company scope', async () => {
    templatesService.list.mockResolvedValue([]);
    templatesService.create.mockResolvedValue({ id: 'tpl-1' });
    templatesService.update.mockResolvedValue({ id: 'tpl-1', name: 'Updated' });

    await expect(
      controller.list({ type: 'receipt' } as any, req),
    ).resolves.toEqual([]);
    await expect(controller.create({} as any, req)).resolves.toEqual({
      id: 'tpl-1',
    });
    await expect(controller.update('tpl-1', {} as any, req)).resolves.toEqual({
      id: 'tpl-1',
      name: 'Updated',
    });
  });
});
