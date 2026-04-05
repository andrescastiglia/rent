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

@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

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

  @Column({ name: 'bank_name' })
  bankName: string;

  @Column({ name: 'account_type' })
  accountType: string;

  @Column({ name: 'account_number' })
  accountNumber: string;

  @Column({ nullable: true })
  cbu: string | null;

  @Column({ default: 'ARS' })
  currency: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
