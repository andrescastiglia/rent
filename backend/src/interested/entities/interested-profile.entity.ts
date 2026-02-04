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
import { Company } from '../../companies/entities/company.entity';

export enum InterestedOperation {
  RENT = 'rent',
  SALE = 'sale',
}

export enum InterestedPropertyType {
  APARTMENT = 'apartment',
  HOUSE = 'house',
}

@Entity('interested_profiles')
export class InterestedProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'first_name', nullable: true })
  firstName: string;

  @Column({ name: 'last_name', nullable: true })
  lastName: string;

  @Column()
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ name: 'people_count', type: 'int', nullable: true })
  peopleCount: number;

  @Column({
    name: 'max_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  maxAmount: number;

  @Column({ name: 'has_pets', default: false })
  hasPets: boolean;

  @Column({ name: 'white_income', default: false })
  whiteIncome: boolean;

  @Column({
    name: 'guarantee_types',
    type: 'text',
    array: true,
    nullable: true,
  })
  guaranteeTypes: string[];

  @Column({
    name: 'property_type_preference',
    type: 'enum',
    enum: InterestedPropertyType,
    enumName: 'interested_property_type',
    nullable: true,
  })
  propertyTypePreference: InterestedPropertyType;

  @Column({
    type: 'enum',
    enum: InterestedOperation,
    enumName: 'interested_operation',
    default: InterestedOperation.RENT,
  })
  operation: InterestedOperation;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
