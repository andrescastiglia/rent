import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentDocumentTemplatesService } from './payment-document-templates.service';
import { PaymentDocumentTemplateType } from './entities/payment-document-template.entity';

describe('PaymentDocumentTemplatesService', () => {
  const listQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
  };
  const txUpdateQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  };
  const txRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => txUpdateQb),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
  };
  const templatesRepository = {
    createQueryBuilder: jest.fn(() => listQuery),
    manager: {
      transaction: jest.fn(async (cb: any) =>
        cb({ getRepository: () => txRepo }),
      ),
    },
  };

  let service: PaymentDocumentTemplatesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentDocumentTemplatesService(templatesRepository as any);
  });

  it('lists templates with optional type filter', async () => {
    await service.list('co1');
    await service.list('co1', PaymentDocumentTemplateType.RECEIPT);
    expect(listQuery.andWhere).toHaveBeenCalledWith(
      'template.type = :type',
      expect.objectContaining({ type: PaymentDocumentTemplateType.RECEIPT }),
    );
  });

  it('create rejects inactive default template', async () => {
    await expect(
      service.create(
        {
          type: PaymentDocumentTemplateType.RECEIPT,
          name: 'x',
          templateBody: 'b',
          isDefault: true,
          isActive: false,
        } as any,
        'co1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create assigns default when no previous templates exist', async () => {
    txRepo.count.mockResolvedValue(0);
    txRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await service.create(
      {
        type: PaymentDocumentTemplateType.RECEIPT,
        name: '  Template  ',
        templateBody: 'body',
      } as any,
      'co1',
    );

    expect(result.name).toBe('Template');
    expect(result.isDefault).toBe(true);
  });

  it('update rejects inactive default and throws when template not found', async () => {
    await expect(
      service.update('t1', { isDefault: true, isActive: false } as any, 'co1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    txRepo.findOne.mockResolvedValue(null);
    await expect(
      service.update('missing', { name: 'x' } as any, 'co1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update persists template and ensures defaults by type changes', async () => {
    txRepo.findOne
      .mockResolvedValueOnce({
        id: 't1',
        companyId: 'co1',
        type: PaymentDocumentTemplateType.RECEIPT,
        name: 'old',
        templateBody: 'old',
        isActive: true,
        isDefault: false,
      })
      .mockResolvedValueOnce({ id: 'default-new-type' })
      .mockResolvedValueOnce({ id: 'default-old-type' });

    const result = await service.update(
      't1',
      {
        type: PaymentDocumentTemplateType.INVOICE,
        name: '  New  ',
        isDefault: true,
      } as any,
      'co1',
    );

    expect(result.name).toBe('New');
    expect(txUpdateQb.execute).toHaveBeenCalled();
  });

  it('findActiveTemplate builds query and returns active template', async () => {
    listQuery.getOne.mockResolvedValueOnce({ id: 'active' });
    await expect(
      service.findActiveTemplate('co1', PaymentDocumentTemplateType.INVOICE),
    ).resolves.toEqual({ id: 'active' });
  });
});
