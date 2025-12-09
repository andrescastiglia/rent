import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Currency } from './currency.entity';

/**
 * Tipo de cambio histórico para soporte multi-moneda.
 * Almacena tipos de cambio diarios de diversas fuentes.
 */
@Entity('exchange_rates')
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'from_currency' })
  fromCurrency: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'from_currency', referencedColumnName: 'code' })
  fromCurrencyRef: Currency;

  @Column({ name: 'to_currency' })
  toCurrency: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'to_currency', referencedColumnName: 'code' })
  toCurrencyRef: Currency;

  @Column({ type: 'decimal', precision: 12, scale: 6 })
  rate: number;

  @Column({ name: 'rate_date', type: 'date' })
  rateDate: Date;

  @Column()
  source: string;

  @Column({ name: 'source_url', nullable: true })
  sourceUrl: string;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
