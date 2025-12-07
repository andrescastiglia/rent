import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';

export enum StaffSpecialization {
  MAINTENANCE = 'maintenance',
  CLEANING = 'cleaning',
  SECURITY = 'security',
  ADMINISTRATION = 'administration',
  ACCOUNTING = 'accounting',
  LEGAL = 'legal',
  OTHER = 'other',
}

@Entity('staff')
export class Staff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({
    type: 'enum',
    enum: StaffSpecialization,
  })
  specialization: StaffSpecialization;

  @Column({
    name: 'hourly_rate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  hourlyRate: number;

  @Column({ default: 'ARS' })
  currency: string;

  @Column({
    name: 'availability_schedule',
    type: 'jsonb',
    default: '{}',
  })
  availabilitySchedule: Record<string, any>;

  @Column({ name: 'service_areas', type: 'text', array: true, nullable: true })
  serviceAreas: string[];

  @Column({ type: 'text', array: true, nullable: true })
  certifications: string[];

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  rating: number;

  @Column({ name: 'total_jobs', default: 0 })
  totalJobs: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
