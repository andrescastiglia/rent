import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Invoice } from '../../payments/entities/invoice.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { BankMovement } from './bank-movement.entity';

export enum BankMatchStrategy {
  VIRTUAL_ALIAS = 'virtual_alias',
  EXACT_AMOUNT_DATE = 'exact_amount_date',
  MANUAL = 'manual',
}

export enum BankReconciliationStatus {
  PROCESSING = 'processing',
  MATCHED = 'matched',
  UNMATCHED = 'unmatched',
  FAILED = 'failed',
}

@Entity('bank_reconciliations')
export class BankReconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'movement_id', type: 'uuid' })
  movementId: string;

  @OneToOne(() => BankMovement)
  @JoinColumn({ name: 'movement_id' })
  movement: BankMovement;

  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId: string | null;

  @ManyToOne(() => Invoice, { nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice | null;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId: string | null;

  @ManyToOne(() => Payment, { nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment | null;

  @Column({
    name: 'match_strategy',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  matchStrategy: BankMatchStrategy | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: BankReconciliationStatus.PROCESSING,
  })
  status: BankReconciliationStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'matched_at', type: 'timestamptz', nullable: true })
  matchedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
