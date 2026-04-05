import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MaintenanceTicket } from './maintenance-ticket.entity';
import { User } from '../../users/entities/user.entity';

@Entity('maintenance_ticket_comments')
export class MaintenanceTicketComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_id' })
  ticketId: string;

  @ManyToOne(() => MaintenanceTicket, (ticket) => ticket.comments)
  @JoinColumn({ name: 'ticket_id' })
  ticket: MaintenanceTicket;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'is_internal', default: false })
  isInternal: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
