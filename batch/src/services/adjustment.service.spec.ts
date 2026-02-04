import { AdjustmentService } from './adjustment.service';

// Mock AppDataSource
jest.mock('../shared/database', () => ({
    AppDataSource: {
        query: jest.fn(),
    },
}));

import { AppDataSource } from '../shared/database';

describe('AdjustmentService', () => {
    let service: AdjustmentService;
    const mockQuery = AppDataSource.query as jest.Mock;

    beforeEach(() => {
        service = new AdjustmentService();
        mockQuery.mockReset();
    });

    describe('calculateAdjustedRent', () => {
        it('should return original amount for none adjustment type', async () => {
            const lease = {
                id: 'lease-1',
                rentAmount: 100000,
                adjustmentType: 'none' as const,
            };

            const result = await service.calculateAdjustedRent(lease);

            expect(result.originalAmount).toBe(100000);
            expect(result.adjustedAmount).toBe(100000);
            expect(result.adjustmentRate).toBe(0);
        });

        it('should apply fixed adjustment rate when due', async () => {
            const lease = {
                id: 'lease-1',
                rentAmount: 100000,
                adjustmentType: 'fixed' as const,
                adjustmentRate: 5,
                nextAdjustmentDate: new Date('2024-12-01'),
            };

            // Mock current date after adjustment date
            jest.useFakeTimers().setSystemTime(new Date('2024-12-15'));

            const result = await service.calculateAdjustedRent(lease);

            // 5% fixed increase should apply
            expect(result.adjustedAmount).toBe(105000);

            jest.useRealTimers();
        });

        it('should calculate ICL-based adjustment', async () => {
            const lease = {
                id: 'lease-1',
                rentAmount: 100000,
                adjustmentType: 'icl' as const,
                nextAdjustmentDate: new Date('2024-12-01'),
                lastAdjustmentDate: new Date('2024-11-01'),
            };

            // Mock current index
            mockQuery.mockResolvedValueOnce([{ value: '1200.00' }]);
            // Mock base index
            mockQuery.mockResolvedValueOnce([{ value: '1000.00' }]);

            jest.useFakeTimers().setSystemTime(new Date('2024-12-15'));

            const result = await service.calculateAdjustedRent(lease);

            // 20% increase (1200/1000 = 1.2)
            expect(result.adjustedAmount).toBeCloseTo(120000, 0);
            expect(result.adjustmentRate).toBeCloseTo(20, 0);

            jest.useRealTimers();
        });

        it('should calculate IGP-M based adjustment', async () => {
            const lease = {
                id: 'lease-1',
                rentAmount: 50000,
                adjustmentType: 'igp_m' as const,
                nextAdjustmentDate: new Date('2024-12-01'),
                lastAdjustmentDate: new Date('2024-06-01'),
            };

            // Mock current index
            mockQuery.mockResolvedValueOnce([{ value: '550.00' }]);
            // Mock base index
            mockQuery.mockResolvedValueOnce([{ value: '500.00' }]);

            jest.useFakeTimers().setSystemTime(new Date('2024-12-15'));

            const result = await service.calculateAdjustedRent(lease);

            // 10% increase (550/500 = 1.1)
            expect(result.adjustedAmount).toBeCloseTo(55000, 0);

            jest.useRealTimers();
        });

        it('should calculate Casa Propia adjustment', async () => {
            const lease = {
                id: 'lease-1',
                rentAmount: 80000,
                adjustmentType: 'casa_propia' as const,
                nextAdjustmentDate: new Date('2024-12-01'),
                lastAdjustmentDate: new Date('2024-06-01'),
            };

            mockQuery.mockResolvedValueOnce([{ value: '110.00' }]);
            mockQuery.mockResolvedValueOnce([{ value: '100.00' }]);

            jest.useFakeTimers().setSystemTime(new Date('2024-12-15'));

            const result = await service.calculateAdjustedRent(lease);

            expect(result.adjustedAmount).toBeCloseTo(88000, 0);

            jest.useRealTimers();
        });
    });

    describe('getLatestIndex', () => {
        it('should return latest ICL index', async () => {
            mockQuery.mockResolvedValueOnce([
                { value: '1234.56', period: '2024-12-01' },
            ]);

            const result = await service.getLatestIndex('icl');

            expect(result).toEqual({
                value: 1234.56,
                period: expect.any(Date),
            });
        });

        it('should return null when no index found', async () => {
            mockQuery.mockResolvedValueOnce([]);

            const result = await service.getLatestIndex('igp_m');

            expect(result).toBeNull();
        });
    });
});
