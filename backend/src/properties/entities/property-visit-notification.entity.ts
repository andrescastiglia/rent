import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PropertyVisit } from './property-visit.entity';

export enum VisitNotificationChannel {
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
}

export enum VisitNotificationStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('property_visit_notifications')
export class PropertyVisitNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'visit_id' })
  visitId: string;

  @ManyToOne(() => PropertyVisit, (visit) => visit.notifications)
  @JoinColumn({ name: 'visit_id' })
  visit: PropertyVisit;

  @Column({
    type: 'enum',
    enum: VisitNotificationChannel,
    enumName: 'visit_notification_channel',
  })
  channel: VisitNotificationChannel;

  @Column()
  recipient: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: VisitNotificationStatus,
    enumName: 'visit_notification_status',
    default: VisitNotificationStatus.QUEUED,
  })
  status: VisitNotificationStatus;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
