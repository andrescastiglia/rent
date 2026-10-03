import { UserRole } from '../../users/entities/user.entity';

export type CapabilityRisk = 'read' | 'write' | 'financial' | 'destructive';
export type CapabilityConfirmation = 'none' | 'explicit' | 'reauthenticated';

export interface ProductCapability {
  id: string;
  status: 'available' | 'partial' | 'planned';
  roles: UserRole[];
  permissions: string[];
  companyScoped: boolean;
  channels: Array<'api' | 'web' | 'mobile' | 'ai' | 'whatsapp' | 'batch'>;
  risk: CapabilityRisk;
  confirmation: CapabilityConfirmation;
  evidence: string[];
}

export const CAPABILITY_MANIFEST = {
  schemaVersion: '1.0.0',
  product: 'rent',
  capabilities: [
    {
      id: 'agenda.read',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: [],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'ai'],
      risk: 'read',
      confirmation: 'none',
      evidence: ['agenda_entries', 'agenda_people'],
    },
    {
      id: 'agenda.manage',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: [],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'ai', 'whatsapp'],
      risk: 'write',
      confirmation: 'explicit',
      evidence: ['agenda_tasks', 'agenda_history', 'domain_operation_receipts'],
    },
    {
      id: 'agenda.notifications',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: [],
      companyScoped: true,
      channels: ['api', 'web', 'batch'],
      risk: 'write',
      confirmation: 'explicit',
      evidence: [
        'web_notifications',
        'web_push_deliveries',
        'notification_preferences',
      ],
    },
    {
      id: 'agenda.proposals.review',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: ['approvals'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile'],
      risk: 'write',
      confirmation: 'reauthenticated',
      evidence: ['pending_actions', 'ai_tool_mutation_confirmations'],
    },

    {
      id: 'portfolio.manage',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER],
      permissions: ['properties', 'owners'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'ai'],
      risk: 'write',
      confirmation: 'explicit',
      evidence: ['properties', 'owners', 'property_images'],
    },
    {
      id: 'crm.manage',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: ['interested'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'ai', 'whatsapp'],
      risk: 'write',
      confirmation: 'explicit',
      evidence: [
        'interested_profiles',
        'interested_activities',
        'property_reservations',
      ],
    },
    {
      id: 'leases.manage',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: ['leases'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'ai', 'batch'],
      risk: 'write',
      confirmation: 'explicit',
      evidence: ['leases', 'lease_versions', 'lease_amendments'],
    },
    {
      id: 'payments.post',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: ['payments'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'ai', 'batch'],
      risk: 'financial',
      confirmation: 'explicit',
      evidence: ['payments', 'payment_allocations', 'tenant_account_movements'],
    },
    {
      id: 'sales.manage',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: ['sales'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'ai'],
      risk: 'financial',
      confirmation: 'explicit',
      evidence: [
        'sales',
        'sale_agreements',
        'sale_installments',
        'sale_receipts',
      ],
    },
    {
      id: 'maintenance.manage',
      status: 'partial',
      roles: [UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT],
      permissions: ['maintenance'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'ai'],
      risk: 'write',
      confirmation: 'explicit',
      evidence: ['maintenance_tickets', 'maintenance_ticket_comments'],
    },
    {
      id: 'communications.review',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: ['communications'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'whatsapp'],
      risk: 'write',
      confirmation: 'explicit',
      evidence: ['person_communications', 'communication_deliveries'],
    },
    {
      id: 'ai.query',
      status: 'partial',
      roles: [
        UserRole.ADMIN,
        UserRole.STAFF,
        UserRole.OWNER,
        UserRole.TENANT,
        UserRole.BUYER,
      ],
      permissions: ['ai'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile', 'whatsapp'],
      risk: 'read',
      confirmation: 'none',
      evidence: ['ai_rag_runs', 'ai_tool_execution_audit'],
    },
    {
      id: 'ai.approve-mutation',
      status: 'available',
      roles: [UserRole.ADMIN, UserRole.STAFF],
      permissions: ['approvals'],
      companyScoped: true,
      channels: ['api', 'web', 'mobile'],
      risk: 'destructive',
      confirmation: 'reauthenticated',
      evidence: ['pending_actions', 'ai_tool_mutation_confirmations'],
    },
  ] satisfies ProductCapability[],
} as const;
