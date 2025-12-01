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

  @Column({ name: 'unit_number' })
  unitNumber: string;

  @Column({ nullable: true })
  floor: number;

  @Column({ default: 0 })
  bedrooms: number;

  @Column({ default: 0 })
  bathrooms: number;

  @Column({ name: 'area_sqm', type: 'decimal', precision: 10, scale: 2 })
  areaSqm: number;

  @Column({ name: 'monthly_rent', type: 'decimal', precision: 10, scale: 2, nullable: true })
  monthlyRent: number;

  @Column({ default: 'ARS' })
  currency: string;

  @Column({ type: 'enum', enum: UnitStatus, default: UnitStatus.AVAILABLE })
  status: UnitStatus;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'has_parking', default: false })
  hasParking: boolean;

  @Column({ name: 'parking_spots', default: 0 })
  parkingSpots: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
