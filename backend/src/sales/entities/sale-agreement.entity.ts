import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { SaleFolder } from './sale-folder.entity';
import { SaleReceipt } from './sale-receipt.entity';

@Entity('sale_agreements')
export class SaleAgreement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ name: 'folder_id' })
  folderId: string;

  @ManyToOne(() => SaleFolder, (folder) => folder.agreements)
  @JoinColumn({ name: 'folder_id' })
  folder: SaleFolder;

  @Column({ name: 'buyer_name' })
  buyerName: string;

  @Column({ name: 'buyer_phone' })
  buyerPhone: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 14, scale: 2 })
  totalAmount: number;

  @Column({ name: 'currency', default: 'ARS' })
  currency: string;

  @Column({ name: 'installment_amount', type: 'decimal', precision: 14, scale: 2 })
  installmentAmount: number;

  @Column({ name: 'installment_count', type: 'integer' })
  installmentCount: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'due_day', type: 'integer', default: 10 })
  dueDay: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 14, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => SaleReceipt, (receipt) => receipt.agreement)
  receipts: SaleReceipt[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
