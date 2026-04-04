import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';

export enum NotificationType {
  INVOICE_ISSUED = 'invoice_issued',
  PAYMENT_REMINDER = 'payment_reminder',
  PAYMENT_RECEIVED = 'payment_received',
  OVERDUE_NOTICE = 'overdue_notice',
  LATE_FEE_APPLIED = 'late_fee_applied',
  MONTHLY_REPORT = 'monthly_report',
  LEASE_EXPIRING = 'lease_expiring',
  RENT_ADJUSTMENT = 'rent_adjustment',
}

export enum NotificationFrequency {
  IMMEDIATE = 'immediate',
  DAILY_DIGEST = 'daily_digest',
  WEEKLY_DIGEST = 'weekly_digest',
  DISABLED = 'disabled',
}

@Entity('notification_preferences')
export class NotificationPreference {
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

  @Column({
    name: 'notification_type',
    type: 'enum',
    enum: NotificationType,
  })
  notificationType: NotificationType;

  @Column({ type: 'varchar' })
  channel: string;

  @Column({
    type: 'enum',
    enum: NotificationFrequency,
    default: NotificationFrequency.IMMEDIATE,
  })
  frequency: NotificationFrequency;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column({ name: 'custom_data', type: 'jsonb', nullable: true })
  customData: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
