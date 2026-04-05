import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Owner } from '../../owners/entities/owner.entity';

export enum SettlementStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('settlements')
export class Settlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

  @Column()
  period: string;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 14, scale: 2 })
  grossAmount: number;

  @Column({
    name: 'commission_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
  })
  commissionAmount: number;

  @Column({
    name: 'withholdings_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  withholdingsAmount: number;

  @Column({ name: 'net_amount', type: 'decimal', precision: 14, scale: 2 })
  netAmount: number;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.PENDING,
  })
  status: SettlementStatus;

  @Column({ name: 'scheduled_date', type: 'date', nullable: true })
  scheduledDate: Date | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'transfer_reference', type: 'varchar', nullable: true })
  transferReference: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
