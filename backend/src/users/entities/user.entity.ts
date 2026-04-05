import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum UserRole {
  ADMIN = 'admin',
  OWNER = 'owner',
  TENANT = 'tenant',
  STAFF = 'staff',
  BUYER = 'buyer',
}

export type UserModulePermissionKey =
  | 'dashboard'
  | 'properties'
  | 'owners'
  | 'interested'
  | 'tenants'
  | 'leases'
  | 'templates'
  | 'payments'
  | 'invoices'
  | 'sales'
  | 'reports'
  | 'users';

export type UserModulePermissions = Partial<
  Record<UserModulePermissionKey, boolean>
>;

// Default company ID for new users
export const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
export const USER_EMAIL_MAX_LENGTH = 255;

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', default: DEFAULT_COMPANY_ID })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({
    type: 'varchar',
    length: USER_EMAIL_MAX_LENGTH,
    unique: true,
    nullable: true,
  })
  email: string | null;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  permissions: UserModulePermissions;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({ name: 'language', type: 'varchar', length: 8, default: 'es' })
  language: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'email_verified', default: false })
  isEmailVerified: boolean;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'password_reset_token', type: 'varchar', nullable: true })
  passwordResetToken: string;

  @Column({
    name: 'password_reset_expires',
    type: 'timestamptz',
    nullable: true,
  })
  passwordResetExpires: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
