import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum CommunicationChannel {
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  SMS = 'sms',
}

export enum CommunicationRecipientRole {
  ADMIN = 'admin',
  STAFF = 'staff',
  BUYER = 'buyer',
  TENANT = 'tenant',
  OWNER = 'owner',
  INTERESTED = 'interested',
}

export enum CommunicationEvent {
  WHATSAPP_MANUAL_REPLY = 'whatsapp_manual_reply',
  WHATSAPP_ASSISTANT_RESPONSE = 'whatsapp_assistant_response',
  CREDIT_NOTE_ISSUED = 'credit_note_issued',
  PAYMENT_RECEIVED = 'payment_received',
  INVOICE_ISSUED = 'invoice_issued',
  PAYMENT_REMINDER = 'payment_reminder',
  INVOICE_OVERDUE = 'invoice_overdue',
  RENT_ADJUSTMENT = 'rent_adjustment',
  SETTLEMENT_AVAILABLE = 'settlement_available',
  SETTLEMENT_PAID = 'settlement_paid',
  OFFICE_PROSPECT_WELCOME_RENT = 'office_prospect_welcome_rent',
  OFFICE_PROSPECT_WELCOME_SALE = 'office_prospect_welcome_sale',
  PROPERTY_VISIT_SCHEDULED = 'property_visit_scheduled',
  PROPERTY_VISIT_COMPLETED = 'property_visit_completed',
  PROPERTY_VISIT_OFFER = 'property_visit_offer',
}

@Entity('communication_templates')
export class CommunicationTemplate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'company_id' }) companyId: string;
  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'enum', enum: CommunicationEvent }) event: CommunicationEvent;
  @Column({
    name: 'recipient_role',
    type: 'enum',
    enum: CommunicationRecipientRole,
  })
  recipientRole: CommunicationRecipientRole;
  @Column({ type: 'enum', enum: CommunicationChannel })
  channel: CommunicationChannel;
  @Column({ type: 'varchar', length: 10, default: 'es' }) locale: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) subject:
    string | null;
  @Column({ type: 'text' }) body: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'auto_send', default: true }) autoSend: boolean;
  @Column({ name: 'requires_approval', default: false })
  requiresApproval: boolean;
  @Column({ type: 'jsonb', default: () => "'[]'" }) variables: string[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
