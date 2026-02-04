import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Property } from './property.entity';
import { PropertyVisitNotification } from './property-visit-notification.entity';

@Entity('property_visits')
export class PropertyVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'property_id' })
  propertyId: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ name: 'visited_at', type: 'timestamptz' })
  visitedAt: Date;

  @Column({ name: 'interested_name' })
  interestedName: string;

  @Column({ type: 'text', nullable: true })
  comments: string;

  @Column({ name: 'has_offer', default: false })
  hasOffer: boolean;

  @Column({
    name: 'offer_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  offerAmount: number;

  @Column({ name: 'offer_currency', default: 'ARS' })
  offerCurrency: string;

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId: string;

  @OneToMany(
    () => PropertyVisitNotification,
    (notification) => notification.visit,
  )
  notifications: PropertyVisitNotification[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
