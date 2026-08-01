import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { Company } from '../../companies/entities/company.entity';

export enum BankMovementDirection {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum BankMovementStatus {
  PENDING = 'pending',
  RECONCILED = 'reconciled',
  UNMATCHED = 'unmatched',
  IGNORED = 'ignored',
}

@Entity('bank_movements')
export class BankMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @ManyToOne(() => BankAccount, { nullable: true })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount | null;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ name: 'external_id', type: 'varchar', length: 150 })
  externalId: string;

  @Column({ type: 'varchar', length: 10 })
  direction: BankMovementDirection;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'ARS' })
  currency: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  counterparty: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb', default: {} })
  rawPayload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: BankMovementStatus.PENDING })
  status: BankMovementStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
