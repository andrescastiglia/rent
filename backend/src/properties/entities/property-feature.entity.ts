import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Property } from './property.entity';

@Entity('property_features')
export class PropertyFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'property_id' })
  propertyId: string;

  @ManyToOne(() => Property, (property) => property.features)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column()
  category: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  value: string;

  @Column({ name: 'is_highlighted', default: false })
  isHighlighted: boolean;

  @Column({ name: 'display_order', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
