import { WithholdingsService } from './withholdings.service';

// Mock AppDataSource
jest.mock('../shared/database', () => ({
    AppDataSource: {
        query: jest.fn(),
    },
}));

import { AppDataSource } from '../shared/database';

describe('WithholdingsService', () => {
    let service: WithholdingsService;
    const mockQuery = AppDataSource.query as jest.Mock;

    beforeEach(() => {
        service = new WithholdingsService();
        mockQuery.mockReset();
    });

    describe('calculateWithholdings', () => {
        it('should return zeros when company is not withholding agent', async () => {
            mockQuery.mockResolvedValueOnce([{ isWithholdingAgent: false }]);
            mockQuery.mockResolvedValueOnce([]);

            const result = await service.calculateWithholdings(
                'company-1',
                'owner-1',
                100000
            );

            expect(result.total).toBe(0);
            expect(result.iibb).toBe(0);
            expect(result.iva).toBe(0);
            expect(result.ganancias).toBe(0);
        });

        it('should calculate IIBB withholding correctly', async () => {
            mockQuery.mockResolvedValueOnce([{
                isWithholdingAgent: true,
                iibbRate: '3.5',
                iibbJurisdiction: 'CABA',
                ivaRate: '0',
                gananciasRate: '0',
                gananciasMinAmount: '0',
            }]);
            mockQuery.mockResolvedValueOnce([{
                iibbExempt: false,
                ivaExempt: false,
                gananciasExempt: false,
            }]);

            const result = await service.calculateWithholdings(
                'company-1',
                'owner-1',
                100000
            );

            expect(result.iibb).toBe(3500);
            expect(result.iibbJurisdiction).toBe('CABA');
            expect(result.total).toBe(3500);
        });

        it('should calculate Ganancias only when above minimum', async () => {
            mockQuery.mockResolvedValueOnce([{
                isWithholdingAgent: true,
                iibbRate: '0',
                ivaRate: '0',
                gananciasRate: '6',
                gananciasMinAmount: '50000',
            }]);
            mockQuery.mockResolvedValueOnce([{
                iibbExempt: false,
                ivaExempt: false,
                gananciasExempt: false,
            }]);

            // Below minimum - no withholding
            const result1 = await service.calculateWithholdings(
                'company-1',
                'owner-1',
                40000
            );
            expect(result1.ganancias).toBe(0);

            // Reset and test above minimum
            mockQuery.mockResolvedValueOnce([{
                isWithholdingAgent: true,
                iibbRate: '0',
                ivaRate: '0',
                gananciasRate: '6',
                gananciasMinAmount: '50000',
            }]);
            mockQuery.mockResolvedValueOnce([{
                iibbExempt: false,
                ivaExempt: false,
                gananciasExempt: false,
            }]);

            const result2 = await service.calculateWithholdings(
                'company-1',
                'owner-1',
                100000
            );
            expect(result2.ganancias).toBe(6000);
        });

        it('should respect owner exemptions', async () => {
            mockQuery.mockResolvedValueOnce([{
                isWithholdingAgent: true,
                iibbRate: '3.5',
                ivaRate: '10.5',
                gananciasRate: '6',
                gananciasMinAmount: '0',
            }]);
            mockQuery.mockResolvedValueOnce([{
                iibbExempt: true,
                ivaExempt: false,
                gananciasExempt: true,
            }]);

            const result = await service.calculateWithholdings(
                'company-1',
                'owner-1',
                100000
            );

            expect(result.iibb).toBe(0); // Exempt
            expect(result.iva).toBe(10500);
            expect(result.ganancias).toBe(0); // Exempt
        });

        it('should calculate combined withholdings', async () => {
            mockQuery.mockResolvedValueOnce([{
                isWithholdingAgent: true,
                iibbRate: '3.5',
                ivaRate: '10.5',
                gananciasRate: '6',
                gananciasMinAmount: '0',
            }]);
            mockQuery.mockResolvedValueOnce([{
                iibbExempt: false,
                ivaExempt: false,
                gananciasExempt: false,
            }]);

            const result = await service.calculateWithholdings(
                'company-1',
                'owner-1',
                100000
            );

            expect(result.iibb).toBe(3500);
            expect(result.iva).toBe(10500);
            expect(result.ganancias).toBe(6000);
            expect(result.total).toBe(20000);
            expect(result.breakdown.length).toBe(3);
        });
    });

    describe('validateConfiguration', () => {
        it('should return valid for non-withholding agent', async () => {
            mockQuery.mockResolvedValueOnce([{ isWithholdingAgent: false }]);

            const result = await service.validateConfiguration('company-1');

            expect(result.valid).toBe(true);
            expect(result.issues.length).toBe(0);
        });

        it('should detect missing jurisdiction for IIBB', async () => {
            mockQuery.mockResolvedValueOnce([{
                isWithholdingAgent: true,
                iibbRate: '3.5',
                iibbJurisdiction: null,
                gananciasRate: '0',
                gananciasMinAmount: '0',
            }]);

            const result = await service.validateConfiguration('company-1');

            expect(result.valid).toBe(false);
            expect(result.issues).toContain(
                'IIBB rate configured but jurisdiction not specified'
            );
        });
    });
});
