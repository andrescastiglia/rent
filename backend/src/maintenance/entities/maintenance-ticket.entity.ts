import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import { Staff } from '../../staff/entities/staff.entity';
import { User } from '../../users/entities/user.entity';
import { MaintenanceTicketComment } from './maintenance-ticket-comment.entity';

export enum MaintenanceTicketStatus {
  OPEN = 'open',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  PENDING_PARTS = 'pending_parts',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum MaintenanceTicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum MaintenanceTicketArea {
  KITCHEN = 'kitchen',
  BATHROOM = 'bathroom',
  BEDROOM = 'bedroom',
  LIVING_ROOM = 'living_room',
  ELECTRICAL = 'electrical',
  PLUMBING = 'plumbing',
  HEATING_COOLING = 'heating_cooling',
  EXTERIOR = 'exterior',
  COMMON_AREA = 'common_area',
  OTHER = 'other',
}

export enum MaintenanceTicketSource {
  TENANT = 'tenant',
  OWNER = 'owner',
  STAFF = 'staff',
  ADMIN = 'admin',
  INSPECTION = 'inspection',
}

@Entity('maintenance_tickets')
export class MaintenanceTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ name: 'property_id' })
  propertyId: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ name: 'reported_by_user_id' })
  reportedByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reported_by_user_id' })
  reportedBy: User;

  @Column({
    type: 'enum',
    enum: MaintenanceTicketSource,
    enumName: 'maintenance_ticket_source',
    default: MaintenanceTicketSource.ADMIN,
  })
  source: MaintenanceTicketSource;

  @Column({ name: 'assigned_to_staff_id', nullable: true, type: 'uuid' })
  assignedToStaffId: string | null;

  @ManyToOne(() => Staff, { nullable: true })
  @JoinColumn({ name: 'assigned_to_staff_id' })
  assignedStaff: Staff | null;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: MaintenanceTicketArea,
    enumName: 'maintenance_ticket_area',
    default: MaintenanceTicketArea.OTHER,
  })
  area: MaintenanceTicketArea;

  @Column({
    type: 'enum',
    enum: MaintenanceTicketPriority,
    enumName: 'maintenance_ticket_priority',
    default: MaintenanceTicketPriority.MEDIUM,
  })
  priority: MaintenanceTicketPriority;

  @Column({
    type: 'enum',
    enum: MaintenanceTicketStatus,
    enumName: 'maintenance_ticket_status',
    default: MaintenanceTicketStatus.OPEN,
  })
  status: MaintenanceTicketStatus;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes: string | null;

  @Column({
    name: 'estimated_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  estimatedCost: number | null;

  @Column({
    name: 'actual_cost',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  actualCost: number | null;

  @Column({ name: 'cost_currency', default: 'ARS' })
  costCurrency: string;

  @Column({ name: 'external_ref', type: 'varchar', nullable: true })
  externalRef: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @OneToMany(() => MaintenanceTicketComment, (comment) => comment.ticket)
  comments: MaintenanceTicketComment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
