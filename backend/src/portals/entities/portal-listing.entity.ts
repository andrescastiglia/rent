import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';

export enum PortalName {
  ZONAPROP = 'zonaprop',
  ARGENPROP = 'argenprop',
  MERCADOLIBRE = 'mercadolibre',
  PROPERATI = 'properati',
  NAVENT = 'navent',
}

export enum PortalListingStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  PAUSED = 'paused',
  REMOVED = 'removed',
  ERROR = 'error',
}

@Entity('portal_listings')
export class PortalListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ name: 'property_id' })
  propertyId: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({
    type: 'enum',
    enum: PortalName,
    enumName: 'portal_name',
  })
  portal: PortalName;

  @Column({
    type: 'enum',
    enum: PortalListingStatus,
    enumName: 'portal_listing_status',
    default: PortalListingStatus.DRAFT,
  })
  status: PortalListingStatus;

  @Column({ name: 'external_id', nullable: true })
  externalId: string | null;

  @Column({ name: 'external_url', type: 'text', nullable: true })
  externalUrl: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'listing_data', type: 'jsonb', default: '{}' })
  listingData: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
