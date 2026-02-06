import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Owner } from '../../owners/entities/owner.entity';
import { Unit } from './unit.entity';
import { PropertyFeature } from './property-feature.entity';

export enum PropertyType {
  APARTMENT = 'apartment',
  HOUSE = 'house',
  COMMERCIAL = 'commercial',
  OFFICE = 'office',
  WAREHOUSE = 'warehouse',
  LAND = 'land',
  PARKING = 'parking',
  OTHER = 'other',
}

export enum PropertyStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  UNDER_MAINTENANCE = 'under_maintenance',
  PENDING_APPROVAL = 'pending_approval',
}

@Entity('properties')
export class Property {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

  @Column({ name: 'owner_whatsapp', nullable: true })
  ownerWhatsapp: string;

  @Column()
  name: string;

  @Column({
    name: 'property_type',
    type: 'enum',
    enum: PropertyType,
    enumName: 'property_type',
  })
  propertyType: PropertyType;

  @Column({
    type: 'enum',
    enum: PropertyStatus,
    enumName: 'property_status',
    default: PropertyStatus.ACTIVE,
  })
  status: PropertyStatus;

  @Column({ name: 'address_street' })
  addressStreet: string;

  @Column({ name: 'address_number', nullable: true })
  addressNumber: string;

  @Column({ name: 'address_floor', nullable: true })
  addressFloor: string;

  @Column({ name: 'address_apartment', nullable: true })
  addressApartment: string;

  @Column({ name: 'address_city' })
  addressCity: string;

  @Column({ name: 'address_state' })
  addressState: string;

  @Column({ name: 'address_country', default: 'Argentina' })
  addressCountry: string;

  @Column({ name: 'address_postal_code', nullable: true })
  addressPostalCode: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  @Column({
    name: 'total_area',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  totalArea: number;

  @Column({
    name: 'built_area',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  builtArea: number;

  @Column({ name: 'year_built', nullable: true })
  yearBuilt: number;

  @Column({ name: 'total_units', default: 1 })
  totalUnits: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    name: 'sale_price',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  salePrice: number;

  @Column({ name: 'sale_currency', default: 'ARS' })
  saleCurrency: string;

  @Column({ name: 'allows_pets', default: true })
  allowsPets: boolean;

  @Column({
    name: 'accepted_guarantee_types',
    type: 'text',
    array: true,
    nullable: true,
  })
  acceptedGuaranteeTypes: string[];

  @Column({ name: 'max_occupants', type: 'integer', nullable: true })
  maxOccupants: number;

  @Column({ type: 'text', array: true, nullable: true })
  amenities: string[];

  @Column({ type: 'jsonb', default: '[]' })
  images: any[];

  @Column({ type: 'jsonb', default: '[]' })
  documents: any[];

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => Unit, (unit) => unit.property)
  units: Unit[];

  @OneToMany(() => PropertyFeature, (feature) => feature.property)
  features: PropertyFeature[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
