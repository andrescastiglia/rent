import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  InterestedProfile,
  InterestedStatus,
} from './interested-profile.entity';
import { User } from '../../users/entities/user.entity';

@Entity('interested_stage_history')
export class InterestedStageHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'interested_profile_id' })
  interestedProfileId: string;

  @ManyToOne(() => InterestedProfile)
  @JoinColumn({ name: 'interested_profile_id' })
  interestedProfile: InterestedProfile;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: InterestedStatus,
    enumName: 'interested_status',
  })
  fromStatus: InterestedStatus;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: InterestedStatus,
    enumName: 'interested_status',
  })
  toStatus: InterestedStatus;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ name: 'changed_by_user_id', nullable: true })
  changedByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'changed_by_user_id' })
  changedByUser: User;

  @Column({
    name: 'changed_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  changedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
