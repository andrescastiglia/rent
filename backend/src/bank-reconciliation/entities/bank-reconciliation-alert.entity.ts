import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { BankMovement } from './bank-movement.entity';

export enum BankReconciliationAlertStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}

@Entity('bank_reconciliation_alerts')
export class BankReconciliationAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'movement_id', type: 'uuid' })
  movementId: string;

  @ManyToOne(() => BankMovement)
  @JoinColumn({ name: 'movement_id' })
  movement: BankMovement;

  @Column({ type: 'varchar', length: 20 })
  status: BankReconciliationAlertStatus;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'occurrence_count', type: 'integer', default: 1 })
  occurrenceCount: number;

  @Column({ name: 'first_detected_at', type: 'timestamptz' })
  firstDetectedAt: Date;

  @Column({ name: 'last_detected_at', type: 'timestamptz' })
  lastDetectedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolver: User | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
