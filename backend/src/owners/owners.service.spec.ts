import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { OwnersService } from './owners.service';

describe('OwnersService', () => {
  const ownersRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const ownerActivitiesRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const propertiesRepository = {
    findOne: jest.fn(),
  };
  const usersRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const documentsRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
    query: jest.fn(),
  };
  const documentsService = {
    downloadByS3Key: jest.fn(),
  };

  let service: OwnersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OwnersService(
      ownersRepository as any,
      ownerActivitiesRepository as any,
      propertiesRepository as any,
      usersRepository as any,
      documentsRepository as any,
      dataSource as any,
      documentsService as any,
    );
  });

  it('findAll returns owners ordered by createdAt desc', async () => {
    ownersRepository.find.mockResolvedValue([{ id: 'o1' }]);

    const result = await service.findAll('co1');

    expect(ownersRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'co1' }),
        relations: ['user'],
        order: { createdAt: 'DESC' },
      }),
    );
    expect(result).toEqual([{ id: 'o1' }]);
  });

  it('findOne throws when owner does not exist', async () => {
    ownersRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne('o1', 'co1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create throws conflict when user email already exists', async () => {
    usersRepository.findOne.mockResolvedValue({ id: 'u-existing' });

    await expect(
      service.create(
        {
          email: 'owner@example.com',
          firstName: 'A',
          lastName: 'B',
        } as any,
        'co1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create creates user and owner transactionally', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    const saveUser = jest.fn().mockResolvedValue({ id: 'u1' });
    const saveOwner = jest.fn().mockResolvedValue({ id: 'o1' });
    const userRepo = { create: jest.fn((x) => x), save: saveUser };
    const ownerRepo = { create: jest.fn((x) => x), save: saveOwner };
    const manager = {
      getRepository: jest.fn().mockImplementation((entity: unknown) => {
        if ((entity as any).name === 'User') {
          return userRepo;
        }
        if ((entity as any).name === 'Owner') {
          return ownerRepo;
        }
        throw new Error('Unexpected repository request');
      }),
    };
    dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      companyId: 'co1',
      user: { email: 'owner@example.com' },
    });

    const result = await service.create(
      {
        email: 'owner@example.com',
        firstName: ' Ana ',
        lastName: ' Owner ',
      } as any,
      'co1',
    );

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(saveUser).toHaveBeenCalled();
    expect(saveOwner).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 'o1' }));
  });

  it('update throws conflict when updating to duplicated email', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      userId: 'u1',
      companyId: 'co1',
      user: { id: 'u1', email: 'old@example.com' },
    });
    usersRepository.findOne.mockResolvedValue({ id: 'u2' });

    await expect(
      service.update(
        'o1',
        {
          email: 'dup@example.com',
        } as any,
        'co1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update persists trimmed owner and user profile values', async () => {
    ownersRepository.findOne
      .mockResolvedValueOnce({
        id: 'o1',
        userId: 'u1',
        companyId: 'co1',
        user: {
          id: 'u1',
          email: 'old@example.com',
          firstName: 'Old',
          lastName: 'Name',
          phone: null,
        },
      })
      .mockResolvedValueOnce({
        id: 'o1',
        userId: 'u1',
        companyId: 'co1',
        user: {
          id: 'u1',
          email: 'new@example.com',
          firstName: 'Ana',
          lastName: 'Diaz',
          phone: '123',
        },
        taxId: '201',
      });
    usersRepository.findOne.mockResolvedValue(null);
    usersRepository.save.mockResolvedValue({ id: 'u1' });
    ownersRepository.save.mockResolvedValue({ id: 'o1' });

    const result = await service.update(
      'o1',
      {
        email: ' NEW@EXAMPLE.COM ',
        firstName: ' Ana ',
        lastName: ' Diaz ',
        phone: ' 123 ',
        taxId: ' 201 ',
      } as any,
      'co1',
    );

    expect(usersRepository.save).toHaveBeenCalled();
    expect(ownersRepository.save).toHaveBeenCalled();
    expect(result.user.email).toBe('new@example.com');
  });

  it('listSettlements enforces owner access', async () => {
    ownersRepository.findOne
      .mockResolvedValueOnce({
        id: 'o1',
        userId: 'owner-user',
        companyId: 'co1',
        user: {},
      })
      .mockResolvedValueOnce({
        id: 'o1',
        userId: 'owner-user',
        companyId: 'co1',
        user: {},
      });

    await expect(
      service.listSettlements(
        'o1',
        'co1',
        { id: 'other-owner', companyId: 'co1', role: UserRole.OWNER },
        'all',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('listSettlements maps SQL rows to summaries', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      userId: 'owner-user',
      companyId: 'co1',
      user: {},
    });
    dataSource.query.mockResolvedValue([
      {
        id: 's1',
        owner_id: 'o1',
        owner_name: 'Owner Test',
        period: '2025-01',
        gross_amount: '100000',
        commission_amount: '10000',
        withholdings_amount: '5000',
        net_amount: '85000',
        status: 'completed',
        scheduled_date: '2025-01-10',
        processed_at: '2025-01-12',
        transfer_reference: 'TR-1',
        notes: 'ok',
        created_at: '2025-01-01',
        updated_at: '2025-01-12',
        receipt_pdf_url: 'db://document/1',
        receipt_name: 'receipt.pdf',
      },
    ]);

    const result = await service.listSettlements(
      'o1',
      'co1',
      { id: 'owner-user', companyId: 'co1', role: UserRole.OWNER },
      'completed',
      12,
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 's1',
        ownerId: 'o1',
        netAmount: 85000,
        receiptPdfUrl: 'db://document/1',
      }),
    );
  });

  it('listSettlementPayments applies owner scope and maps rows', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      userId: 'owner-user',
      companyId: 'co1',
      user: {},
    });
    dataSource.query.mockResolvedValue([
      {
        id: 's1',
        owner_id: 'o1',
        owner_name: 'Owner Test',
        period: '2025-01',
        gross_amount: '1000',
        commission_amount: '100',
        withholdings_amount: '50',
        net_amount: '850',
        status: 'completed',
        scheduled_date: '2025-01-10',
        processed_at: '2025-01-12',
        transfer_reference: 'TR-1',
        notes: 'ok',
        created_at: '2025-01-01',
        updated_at: '2025-01-12',
        receipt_pdf_url: 'db://document/1',
        receipt_name: 'receipt.pdf',
      },
    ]);

    const result = await service.listSettlementPayments(
      'co1',
      { id: 'owner-user', companyId: 'co1', role: UserRole.OWNER },
      10,
    );

    expect(dataSource.query).toHaveBeenCalled();
    expect(result[0].ownerId).toBe('o1');
  });

  it('createActivity validates property ownership when propertyId is provided', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      companyId: 'co1',
      user: {},
    });
    propertiesRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createActivity(
        'o1',
        { propertyId: 'p1', type: 'call', subject: 'x' } as any,
        { id: 'u1', companyId: 'co1' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateActivity throws not found when activity does not exist', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      companyId: 'co1',
      user: {},
    });
    ownerActivitiesRepository.findOne.mockResolvedValue(null);

    await expect(
      service.updateActivity('o1', 'a1', {} as any, 'co1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createActivity sets completedAt when status is completed', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      companyId: 'co1',
      user: {},
    });
    ownerActivitiesRepository.create.mockImplementation((x) => x);
    ownerActivitiesRepository.save.mockImplementation(async (x) => x);

    const result = await service.createActivity(
      'o1',
      {
        type: 'note',
        subject: 'done',
        status: 'completed',
      } as any,
      { id: 'u1', companyId: 'co1' },
    );

    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('updateActivity validates property and updates completedAt', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      companyId: 'co1',
      user: {},
    });
    ownerActivitiesRepository.findOne.mockResolvedValue({
      id: 'a1',
      ownerId: 'o1',
      companyId: 'co1',
      propertyId: null,
      status: 'pending',
      completedAt: null,
      dueAt: null,
    });
    propertiesRepository.findOne.mockResolvedValue({
      id: 'p1',
      ownerId: 'o1',
      companyId: 'co1',
    });
    ownerActivitiesRepository.save.mockImplementation(async (x) => x);

    const result = await service.updateActivity(
      'o1',
      'a1',
      {
        propertyId: 'p1',
        status: 'completed',
      } as any,
      'co1',
    );
    expect(result.propertyId).toBe('p1');
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('registerSettlementPayment throws when settlement row is missing', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      userId: 'owner-user',
      companyId: 'co1',
      user: {},
    });
    dataSource.query.mockResolvedValue([]);

    await expect(
      service.registerSettlementPayment('o1', 's-missing', {} as any, {
        id: 'owner-user',
        companyId: 'co1',
        role: UserRole.OWNER,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('registerSettlementPayment validates amount and payment date', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      userId: 'owner-user',
      companyId: 'co1',
      user: {},
    });
    dataSource.query.mockResolvedValue([
      {
        id: 's1',
        owner_id: 'o1',
        owner_name: 'Owner Test',
        period: '2025-01',
        gross_amount: '1000',
        commission_amount: '100',
        withholdings_amount: '50',
        net_amount: '850',
        status: 'pending',
        scheduled_date: null,
        processed_at: null,
        transfer_reference: null,
        notes: null,
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
        receipt_pdf_url: null,
        receipt_name: null,
      },
    ]);

    await expect(
      service.registerSettlementPayment('o1', 's1', { amount: 800 } as any, {
        id: 'owner-user',
        companyId: 'co1',
        role: UserRole.OWNER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.registerSettlementPayment(
        'o1',
        's1',
        { paymentDate: 'invalid-date' } as any,
        { id: 'owner-user', companyId: 'co1', role: UserRole.OWNER },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registerSettlementPayment returns current row when already completed with receipt', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      userId: 'owner-user',
      companyId: 'co1',
      user: {},
    });
    dataSource.query.mockResolvedValue([
      {
        id: 's1',
        owner_id: 'o1',
        owner_name: 'Owner Test',
        period: '2025-01',
        gross_amount: '1000',
        commission_amount: '100',
        withholdings_amount: '50',
        net_amount: '850',
        status: 'completed',
        scheduled_date: null,
        processed_at: '2025-01-10',
        transfer_reference: 'TR-1',
        notes: 'ok',
        created_at: '2025-01-01',
        updated_at: '2025-01-10',
        receipt_pdf_url: 'db://document/1',
        receipt_name: 'r.pdf',
      },
    ]);

    const result = await service.registerSettlementPayment(
      'o1',
      's1',
      {} as any,
      { id: 'owner-user', companyId: 'co1', role: UserRole.OWNER },
    );

    expect(result.status).toBe('completed');
    expect(documentsRepository.save).not.toHaveBeenCalled();
  });

  it('registerSettlementPayment saves receipt document and returns updated row', async () => {
    ownersRepository.findOne.mockResolvedValue({
      id: 'o1',
      userId: 'owner-user',
      companyId: 'co1',
      user: {},
    });
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 's1',
          owner_id: 'o1',
          owner_name: 'Owner Test',
          period: '2025-01',
          gross_amount: '1000',
          commission_amount: '100',
          withholdings_amount: '50',
          net_amount: '850',
          status: 'pending',
          scheduled_date: null,
          processed_at: null,
          transfer_reference: null,
          notes: null,
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          receipt_pdf_url: null,
          receipt_name: null,
        },
      ])
      .mockResolvedValueOnce([{ affected: 1 }])
      .mockResolvedValueOnce([
        {
          id: 's1',
          owner_id: 'o1',
          owner_name: 'Owner Test',
          period: '2025-01',
          gross_amount: '1000',
          commission_amount: '100',
          withholdings_amount: '50',
          net_amount: '850',
          status: 'completed',
          scheduled_date: null,
          processed_at: '2025-01-10',
          transfer_reference: 'TR-2',
          notes: 'ok',
          created_at: '2025-01-01',
          updated_at: '2025-01-10',
          receipt_pdf_url: 'db://document/2',
          receipt_name: 'receipt.pdf',
        },
      ]);
    documentsRepository.create.mockImplementation((x) => x);
    documentsRepository.save
      .mockResolvedValueOnce({ id: 'doc-1', fileUrl: 'db://document/pending' })
      .mockResolvedValueOnce({ id: 'doc-1', fileUrl: 'db://document/doc-1' });

    const result = await service.registerSettlementPayment(
      'o1',
      's1',
      {
        paymentDate: '2025-01-10',
        reference: 'TR-2',
        notes: 'ok',
      } as any,
      { id: 'owner-user', companyId: 'co1', role: UserRole.OWNER },
    );

    expect(documentsRepository.save).toHaveBeenCalled();
    expect(result.receiptPdfUrl).toBe('db://document/2');
  });

  it('getSettlementReceipt downloads receipt and resolves filename', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 's1',
        period: '2025-01',
        receipt_pdf_url: 'db://document/1',
        receipt_name: null,
      },
    ]);
    documentsService.downloadByS3Key.mockResolvedValue({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
    });

    const result = await service.getSettlementReceipt('s1', 'co1', {
      id: 'admin',
      companyId: 'co1',
      role: UserRole.ADMIN,
    });

    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toContain('recibo-liquidacion-2025-01-s1');
  });

  it('getSettlementReceipt throws when settlement or receipt is missing', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await expect(
      service.getSettlementReceipt('s1', 'co1', {
        id: 'admin',
        companyId: 'co1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    dataSource.query.mockResolvedValueOnce([
      {
        id: 's1',
        period: '2025-01',
        receipt_pdf_url: null,
        receipt_name: null,
      },
    ]);
    await expect(
      service.getSettlementReceipt('s1', 'co1', {
        id: 'admin',
        companyId: 'co1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
