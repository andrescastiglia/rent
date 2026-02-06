import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { InterestedProfile } from './interested-profile.entity';
import { User } from '../../users/entities/user.entity';

export enum InterestedActivityType {
  CALL = 'call',
  TASK = 'task',
  NOTE = 'note',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  VISIT = 'visit',
}

export enum InterestedActivityStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('interested_activities')
export class InterestedActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'interested_profile_id' })
  interestedProfileId: string;

  @ManyToOne(() => InterestedProfile)
  @JoinColumn({ name: 'interested_profile_id' })
  interestedProfile: InterestedProfile;

  @Column({
    type: 'enum',
    enum: InterestedActivityType,
    enumName: 'interested_activity_type',
  })
  type: InterestedActivityType;

  @Column({
    type: 'enum',
    enum: InterestedActivityStatus,
    enumName: 'interested_activity_status',
    default: InterestedActivityStatus.PENDING,
  })
  status: InterestedActivityStatus;

  @Column({ length: 200 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  body: string;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @Column({ name: 'template_name', length: 120, nullable: true })
  templateName: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
