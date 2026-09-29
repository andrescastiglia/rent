import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** Shared property-before-lease lock order for contract lifecycle mutations. */
export async function lockLeaseRows(
  manager: EntityManager,
  id: string,
  companyId: string,
  replacementPropertyId?: string,
): Promise<void> {
  const [target] = await manager.query(
    'SELECT property_id FROM leases WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL',
    [id, companyId],
  );
  if (!target) throw new NotFoundException('Lease not found');
  const propertyIds = [
    ...new Set(
      (
        [target.property_id, replacementPropertyId].filter(Boolean) as string[]
      ).map((id) => id.toLowerCase()),
    ),
  ].sort((left, right) => left.localeCompare(right, 'en'));
  for (const propertyId of propertyIds) {
    const [property] = await manager.query(
      'SELECT id FROM properties WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR NO KEY UPDATE',
      [propertyId, companyId],
    );
    if (!property) throw new NotFoundException('Property not found');
  }
  const [locked] = await manager.query(
    'SELECT property_id FROM leases WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE',
    [id, companyId],
  );
  if (!locked) throw new NotFoundException('Lease not found');
  if (locked.property_id !== target.property_id)
    throw new ConflictException(
      'Lease property changed; reload before confirming',
    );
}
