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
import { Owner } from '../../owners/entities/owner.entity';
import { User } from '../../users/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';
import { Property } from '../../properties/entities/property.entity';

@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true, type: 'uuid' })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'owner_id', nullable: true, type: 'uuid' })
  ownerId: string | null;

  @ManyToOne(() => Owner, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: Owner | null;

  @Column({ name: 'property_id', nullable: true, type: 'uuid' })
  propertyId: string | null;

  @ManyToOne(() => Property, { nullable: true })
  @JoinColumn({ name: 'property_id' })
  property: Property | null;

  @Column({ name: 'bank_name' })
  bankName: string;

  @Column({ name: 'account_type' })
  accountType: string;

  @Column({ name: 'account_number' })
  accountNumber: string;

  @Column({ type: 'varchar', nullable: true })
  cbu: string | null;

  @Column({ name: 'cbu_cvu', type: 'varchar', nullable: true })
  cbuCvu: string | null;

  @Column({ type: 'varchar', nullable: true })
  alias: string | null;

  @Column({ name: 'holder_name', type: 'varchar', nullable: true })
  holderName: string | null;

  @Column({ name: 'holder_cuit', type: 'varchar', nullable: true })
  holderCuit: string | null;

  @Column({ default: 'ARS' })
  currency: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_virtual_alias', default: false })
  isVirtualAlias: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
