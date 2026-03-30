import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { ContractType } from './lease.entity';

export const LEASE_TEMPLATE_SOURCE_FILE_NAME_MAX_LENGTH = 255;
export const LEASE_TEMPLATE_SOURCE_MIME_TYPE_MAX_LENGTH = 120;

@Entity('lease_contract_templates')
export class LeaseContractTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 120 })
  name: string;

  @Column({
    name: 'contract_type',
    type: 'enum',
    enum: ContractType,
    enumName: 'contract_type',
  })
  contractType: ContractType;

  @Column({ name: 'template_body', type: 'text' })
  templateBody: string;

  @Column({
    name: 'template_format',
    type: 'varchar',
    length: 20,
    default: 'plain_text',
  })
  templateFormat: 'plain_text' | 'html';

  @Column({
    name: 'source_file_name',
    type: 'varchar',
    length: LEASE_TEMPLATE_SOURCE_FILE_NAME_MAX_LENGTH,
    nullable: true,
  })
  sourceFileName: string | null;

  @Column({
    name: 'source_mime_type',
    type: 'varchar',
    length: LEASE_TEMPLATE_SOURCE_MIME_TYPE_MAX_LENGTH,
    nullable: true,
  })
  sourceMimeType: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
