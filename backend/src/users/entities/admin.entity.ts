import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, JoinColumn, OneToOne } from 'typeorm';
import { User } from './user.entity';

@Entity('admins')
export class Admin {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'is_super_admin', default: false })
  isSuperAdmin: boolean;

  @Column({ type: 'jsonb', default: {} })
  permissions: {
    users?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean };
    properties?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean };
    leases?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean };
    payments?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean };
    maintenance?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean };
    reports?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean };
  };

  @Column({ name: 'ip_whitelist', type: 'text', array: true, default: [] })
  ipWhitelist: string[];

  @Column({ name: 'allowed_modules', type: 'text', array: true, nullable: true })
  allowedModules: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
