import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  JoinColumn,
  OneToOne,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';
import { Company } from '../../companies/entities/company.entity';

@Entity('admins')
export class Admin {
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

  @Column({ name: 'is_super_admin', default: false })
  isSuperAdmin: boolean;

  @Column({ type: 'jsonb', default: {} })
  permissions: {
    users?: {
      create?: boolean;
      read?: boolean;
      update?: boolean;
      delete?: boolean;
    };
    properties?: {
      create?: boolean;
      read?: boolean;
      update?: boolean;
      delete?: boolean;
    };
    leases?: {
      create?: boolean;
      read?: boolean;
      update?: boolean;
      delete?: boolean;
    };
    payments?: {
      create?: boolean;
      read?: boolean;
      update?: boolean;
      delete?: boolean;
    };
    maintenance?: {
      create?: boolean;
      read?: boolean;
      update?: boolean;
      delete?: boolean;
    };
    reports?: {
      create?: boolean;
      read?: boolean;
      update?: boolean;
      delete?: boolean;
    };
  };

  @Column({ name: 'ip_whitelist', type: 'text', array: true, default: [] })
  ipWhitelist: string[];

  @Column({
    name: 'allowed_modules',
    type: 'text',
    array: true,
    default: [],
  })
  allowedModules: string[];

  @Column({ nullable: true })
  department: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
