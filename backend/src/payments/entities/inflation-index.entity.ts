import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tipo de índice de inflación.
 */
export enum InflationIndexType {
  ICL = 'icl',
  IPC = 'ipc',
  IGPM = 'igp_m',
}

/**
 * Índice de inflación (ICL Argentina, IGP-M Brasil).
 * Almacena valores históricos para cálculo de ajustes de alquiler.
 */
@Entity('inflation_indices')
export class InflationIndex {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'index_type',
    type: 'enum',
    enum: InflationIndexType,
  })
  indexType: InflationIndexType;

  @Column({ name: 'period_date', type: 'date' })
  periodDate: Date;

  @Column({ type: 'decimal', precision: 12, scale: 6 })
  value: number;

  @Column({
    name: 'variation_monthly',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  variationMonthly: number;

  @Column({
    name: 'variation_yearly',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  variationYearly: number;

  @Column({ nullable: false })
  source: string;

  @Column({ name: 'source_url', nullable: true })
  sourceUrl: string;

  @Column({ name: 'published_at', type: 'date', nullable: true })
  publishedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
