import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitsService } from './units.service';
import { Unit, UnitStatus } from './entities/unit.entity';
import { NotFoundException } from '@nestjs/common';

describe('UnitsService', () => {
    let service: UnitsService;
    let repository: MockRepository<Unit>;

    type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

    const createMockRepository = (): MockRepository => ({
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        softDelete: jest.fn(),
    });

    const mockUnit: Partial<Unit> = {
        id: 'unit-1',
        propertyId: 'property-1',
        unitNumber: '101',
        bedrooms: 2,
        bathrooms: 1,
        areaSqm: 65,
        monthlyRent: 1500,
        status: UnitStatus.AVAILABLE,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UnitsService,
                {
                    provide: getRepositoryToken(Unit),
                    useValue: createMockRepository(),
                },
            ],
        }).compile();

        service = module.get<UnitsService>(UnitsService);
        repository = module.get(getRepositoryToken(Unit));
    });

    it('should be defined', () => {
        expect(service).toBeDetermined();
    });

    describe('create', () => {
        it('should create a unit', async () => {
            const createUnitDto = {
                propertyId: 'property-1',
                unitNumber: '101',
                bedrooms: 2,
                bathrooms: 1,
                areaSqm: 65,
                monthlyRent: 1500,
            };

            repository.create.mockReturnValue(mockUnit);
            repository.save.mockResolvedValue(mockUnit);

            const result = await service.create(createUnitDto);

            expect(repository.create).toHaveBeenCalledWith(createUnitDto);
            expect(repository.save).toHaveBeenCalledWith(mockUnit);
            expect(result).toEqual(mockUnit);
        });
    });

    describe('findByProperty', () => {
        it('should return units for a property', async () => {
            const units = [mockUnit, { ...mockUnit, id: 'unit-2', unitNumber: '102' }];
            repository.find.mockResolvedValue(units);

            const result = await service.findByProperty('property-1');

            expect(repository.find).toHaveBeenCalledWith({
                where: { propertyId: 'property-1' },
                order: { unitNumber: 'ASC' },
            });
            expect(result).toEqual(units);
        });
    });

    describe('findOne', () => {
        it('should return a unit by id', async () => {
            repository.findOne.mockResolvedValue(mockUnit);

            const result = await service.findOne('unit-1');

            expect(repository.findOne).toHaveBeenCalledWith({
                where: { id: 'unit-1' },
                relations: ['property'],
            });
            expect(result).toEqual(mockUnit);
        });

        it('should throw NotFoundException when unit not found', async () => {
            repository.findOne.mockResolvedValue(null);

            await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
        });
    });

    describe('update', () => {
        it('should update a unit', async () => {
            const updateDto = { monthlyRent: 1600, status: UnitStatus.OCCUPIED };
            repository.findOne.mockResolvedValue(mockUnit);
            repository.save.mockResolvedValue({ ...mockUnit, ...updateDto });

            const result = await service.update('unit-1', updateDto);

            expect(repository.save).toHaveBeenCalled();
            expect(result.monthlyRent).toBe(1600);
            expect(result.status).toBe(UnitStatus.OCCUPIED);
        });
    });

    describe('remove', () => {
        it('should soft delete a unit', async () => {
            repository.findOne.mockResolvedValue(mockUnit);
            repository.softDelete.mockResolvedValue({ affected: 1, raw: [] });

            await service.remove('unit-1');

            expect(repository.findOne).toHaveBeenCalledWith({
                where: { id: 'unit-1' },
                relations: ['property'],
            });
            expect(repository.softDelete).toHaveBeenCalledWith('unit-1');
        });
    });
});
