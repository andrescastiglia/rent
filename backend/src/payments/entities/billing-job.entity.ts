import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tipo de job de facturación batch.
 */
export enum BillingJobType {
  BILLING = 'billing',
  OVERDUE = 'overdue',
  REMINDERS = 'reminders',
  LATE_FEES = 'late_fees',
  SYNC_INDICES = 'sync_indices',
  REPORTS = 'reports',
  EXCHANGE_RATES = 'exchange_rates',
}

/**
 * Estado del job de facturación.
 */
export enum BillingJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL_FAILURE = 'partial_failure',
}

/**
 * Registro de ejecución de trabajos batch.
 * Almacena información de seguimiento para auditoría y debugging.
 */
@Entity('billing_jobs')
export class BillingJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'job_type',
    type: 'enum',
    enum: BillingJobType,
  })
  jobType: BillingJobType;

  @Column({
    type: 'enum',
    enum: BillingJobStatus,
    default: BillingJobStatus.PENDING,
  })
  status: BillingJobStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number;

  @Column({ name: 'records_total', type: 'integer', default: 0 })
  recordsTotal: number;

  @Column({ name: 'records_processed', type: 'integer', default: 0 })
  recordsProcessed: number;

  @Column({ name: 'records_failed', type: 'integer', default: 0 })
  recordsFailed: number;

  @Column({ name: 'records_skipped', type: 'integer', default: 0 })
  recordsSkipped: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'error_log', type: 'jsonb', default: '[]' })
  errorLog: Record<string, unknown>[];

  @Column({ type: 'jsonb', default: '{}' })
  parameters: Record<string, unknown>;

  @Column({ name: 'dry_run', default: false })
  dryRun: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
