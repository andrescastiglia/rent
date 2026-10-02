import { EntityManager } from 'typeorm';
import { CommunicationRecipientRole } from '../communications/entities/communication-template.entity';

export interface MaintenanceRecipient {
  id: string;
  role: CommunicationRecipientRole;
  name: string;
  phone: string;
  locale: string;
}
/** Every destination is derived from the current scoped property and its opt-in evidence. */
export function maintenanceNoticeRecipients(
  manager: Pick<EntityManager, 'query'>,
  companyId: string,
  ticketId: string,
): Promise<MaintenanceRecipient[]> {
  return manager.query<MaintenanceRecipient[]>(
    `WITH subject AS (
      SELECT t.* FROM maintenance_tickets t JOIN properties p ON p.id=t.property_id AND p.company_id=$1 AND p.deleted_at IS NULL
      WHERE t.id=$2 AND t.company_id=$1 AND t.deleted_at IS NULL
    ), destinations AS (
      SELECT o.id,'owner' AS role,u.first_name AS name,u.phone,COALESCE(u.language,'es') AS locale
      FROM subject t JOIN properties p ON p.id=t.property_id AND p.company_id=$1
      JOIN owners o ON o.id=p.owner_id AND o.company_id=$1 AND o.deleted_at IS NULL
      JOIN users u ON u.id=o.user_id AND u.company_id=$1 AND u.deleted_at IS NULL AND u.is_active=true AND u.whatsapp_enabled=true
      WHERE o.contact_consent=true AND (o.preferred_contact_channel IS NULL OR o.preferred_contact_channel='whatsapp')
      UNION
      SELECT n.id,'tenant',u.first_name,u.phone,COALESCE(u.language,'es')
      FROM subject t JOIN leases l ON l.property_id=t.property_id AND l.company_id=$1 AND l.status='active' AND l.contract_type='rental' AND l.deleted_at IS NULL
      JOIN tenants n ON n.id=l.tenant_id AND n.company_id=$1 AND n.deleted_at IS NULL
      JOIN users u ON u.id=n.user_id AND u.company_id=$1 AND u.deleted_at IS NULL AND u.is_active=true AND u.whatsapp_enabled=true
      WHERE n.contact_consent=true AND (n.preferred_contact_channel IS NULL OR n.preferred_contact_channel='whatsapp')
      UNION
      SELECT s.id,'staff',u.first_name,u.phone,COALESCE(u.language,'es')
      FROM subject t JOIN staff s ON s.id=t.assigned_to_staff_id AND s.company_id=$1 AND s.deleted_at IS NULL
      JOIN users u ON u.id=s.user_id AND u.company_id=$1 AND u.deleted_at IS NULL AND u.is_active=true
        AND u.whatsapp_enabled=true AND u.whatsapp_enabled_at IS NOT NULL
    ) SELECT id,role,name,phone,locale FROM destinations WHERE NULLIF(trim(phone),'') IS NOT NULL ORDER BY role,id`,
    [companyId, ticketId],
  );
}
