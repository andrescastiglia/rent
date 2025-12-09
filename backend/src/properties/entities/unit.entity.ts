import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Property } from './property.entity';
import { Company } from '../../companies/entities/company.entity';
import { Currency } from '../../currencies/entities/currency.entity';

export enum UnitStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  MAINTENANCE = 'maintenance',
  RESERVED = 'reserved',
}

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'property_id' })
  propertyId: string;

  @ManyToOne(() => Property, (property) => property.units)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'unit_number' })
  unitNumber: string;

  @Column({ nullable: true })
  floor: string;

  @Column({ type: 'enum', enum: UnitStatus, enumName: 'unit_status', default: UnitStatus.AVAILABLE })
  status: UnitStatus;

  @Column({ name: 'unit_type', nullable: true })
  unitType: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  area: number;

  @Column({ default: 0 })
  bedrooms: number;

  @Column({ type: 'decimal', precision: 3, scale: 1, default: 1 })
  bathrooms: number;

  @Column({ name: 'has_parking', default: false })
  hasParking: boolean;

  @Column({ name: 'parking_spots', default: 0 })
  parkingSpots: number;

  @Column({ name: 'has_storage', default: false })
  hasStorage: boolean;

  @Column({ name: 'is_furnished', default: false })
  isFurnished: boolean;

  @Column({ name: 'base_rent', type: 'decimal', precision: 12, scale: 2, nullable: true })
  baseRent: number;

  @Column({ default: 'ARS' })
  currency: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  expenses: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', array: true, nullable: true })
  features: string[];

  @Column({ type: 'jsonb', default: '[]' })
  images: any[];

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
