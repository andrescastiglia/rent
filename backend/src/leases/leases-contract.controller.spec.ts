import { LeasesContractController } from './leases-contract.controller';

describe('LeasesContractController', () => {
  const pdfService = {
    getContractDocument: jest.fn(),
  };
  const documentsService = {
    downloadByS3Key: jest.fn(),
  };
  const leasesService = {
    findOneScoped: jest.fn(),
  };
  let controller: LeasesContractController;
  const req = { user: { id: 'u1', role: 'admin' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LeasesContractController(
      pdfService as any,
      documentsService as any,
      leasesService as any,
    );
  });

  it('returns 404 when contract is missing', async () => {
    pdfService.getContractDocument.mockResolvedValue(null);
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;

    await controller.downloadContract('l1', req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('streams file when contract exists', async () => {
    pdfService.getContractDocument.mockResolvedValue({
      fileUrl: 's3://contract.pdf',
      name: 'contract.pdf',
    });
    documentsService.downloadByS3Key.mockResolvedValue({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
    });
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;

    await controller.downloadContract('l1', req, res);
    expect(res.send).toHaveBeenCalledWith(Buffer.from('pdf'));
  });
});
