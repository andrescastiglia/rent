import { BadRequestException } from '@nestjs/common';
import { LeasesController } from './leases.controller';

describe('LeasesController', () => {
  const leasesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    listTemplates: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    findOneScoped: jest.fn(),
    update: jest.fn(),
    renderDraft: jest.fn(),
    updateDraftText: jest.fn(),
    confirmDraft: jest.fn(),
    activate: jest.fn(),
    terminate: jest.fn(),
    renew: jest.fn(),
    remove: jest.fn(),
  };

  let controller: LeasesController;
  const req = {
    user: { id: 'u1', companyId: 'c1', role: 'admin' },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LeasesController(leasesService as any);
  });

  it('delegates main operations to leases service', async () => {
    leasesService.create.mockResolvedValue({ id: 'l1' });
    leasesService.findAll.mockResolvedValue({ data: [] });
    leasesService.listTemplates.mockResolvedValue([]);
    leasesService.createTemplate.mockResolvedValue({ id: 'tpl1' });
    leasesService.updateTemplate.mockResolvedValue({ id: 'tpl1' });
    leasesService.findOneScoped.mockResolvedValue({ id: 'l1' });
    leasesService.update.mockResolvedValue({ id: 'l1' });
    leasesService.renderDraft.mockResolvedValue({ text: 'draft' });
    leasesService.updateDraftText.mockResolvedValue({ id: 'l1' });
    leasesService.confirmDraft.mockResolvedValue({ id: 'l1' });
    leasesService.activate.mockResolvedValue({ id: 'l1', status: 'active' });
    leasesService.terminate.mockResolvedValue({
      id: 'l1',
      status: 'finalized',
    });
    leasesService.renew.mockResolvedValue({ id: 'l2' });

    await expect(controller.create({} as any)).resolves.toEqual({ id: 'l1' });
    await expect(controller.findAll({} as any, req)).resolves.toEqual({
      data: [],
    });
    await expect(controller.listTemplates({} as any, req)).resolves.toEqual([]);
    await expect(controller.createTemplate({} as any, req)).resolves.toEqual({
      id: 'tpl1',
    });
    await expect(
      controller.updateTemplate('tpl1', {} as any, req),
    ).resolves.toEqual({ id: 'tpl1' });
    await expect(controller.findOne('l1', req)).resolves.toEqual({ id: 'l1' });
    await expect(controller.update('l1', {} as any)).resolves.toEqual({
      id: 'l1',
    });
    await expect(controller.renderDraft('l1', {} as any)).resolves.toEqual({
      text: 'draft',
    });
    await expect(
      controller.updateDraftText('l1', { draftText: 'x' } as any),
    ).resolves.toEqual({ id: 'l1' });
    await expect(
      controller.confirmDraft('l1', { finalText: 'f' } as any, req),
    ).resolves.toEqual({ id: 'l1' });
    await expect(controller.activate('l1', req)).resolves.toEqual({
      id: 'l1',
      status: 'active',
    });
    await expect(
      controller.terminate('l1', { reason: 'x' } as any),
    ).resolves.toEqual({ id: 'l1', status: 'finalized' });
    await expect(
      controller.finalize('l1', { reason: 'x' } as any),
    ).resolves.toEqual({ id: 'l1', status: 'finalized' });
    await expect(controller.renew('l1', {} as any)).resolves.toEqual({
      id: 'l2',
    });
  });

  it('validates template contract type and remove returns success message', async () => {
    expect(() =>
      controller.listTemplates({ contractType: 'bad' } as any, req),
    ).toThrow(BadRequestException);

    leasesService.remove.mockResolvedValue(undefined);
    await expect(controller.remove('l1')).resolves.toEqual({
      message: 'Lease deleted successfully',
    });
  });
});
