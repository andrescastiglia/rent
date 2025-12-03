import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('currencies')
export class Currency {
  @PrimaryColumn({ length: 3 })
  code: string; // ISO 4217 code (ARS, USD, BRL, etc.)

  @Column({ length: 5 })
  symbol: string; // $, US$, R$, etc.

  @Column({ name: 'decimal_places', default: 2 })
  decimalPlaces: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
