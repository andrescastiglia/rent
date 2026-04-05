export enum MaintenanceTicketStatus {
  OPEN = "open",
  ASSIGNED = "assigned",
  IN_PROGRESS = "in_progress",
  PENDING_PARTS = "pending_parts",
  RESOLVED = "resolved",
  CLOSED = "closed",
  CANCELLED = "cancelled",
}

export enum MaintenanceTicketPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}

export enum MaintenanceTicketArea {
  KITCHEN = "kitchen",
  BATHROOM = "bathroom",
  BEDROOM = "bedroom",
  LIVING_ROOM = "living_room",
  ELECTRICAL = "electrical",
  PLUMBING = "plumbing",
  HEATING_COOLING = "heating_cooling",
  EXTERIOR = "exterior",
  COMMON_AREA = "common_area",
  OTHER = "other",
}

export enum MaintenanceTicketSource {
  TENANT = "tenant",
  OWNER = "owner",
  STAFF = "staff",
  ADMIN = "admin",
  INSPECTION = "inspection",
}

export interface MaintenanceTicket {
  id: string;
  companyId: string;
  propertyId: string;
  property?: { id: string; address: string };
  reportedByUserId?: string;
  reportedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  source: MaintenanceTicketSource;
  assignedToStaffId?: string;
  assignedStaff?: { id: string; user: { firstName: string; lastName: string } };
  assignedAt?: string;
  title: string;
  description?: string;
  area: MaintenanceTicketArea;
  priority: MaintenanceTicketPriority;
  status: MaintenanceTicketStatus;
  scheduledAt?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  estimatedCost?: number;
  actualCost?: number;
  costCurrency: string;
  externalRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceTicketComment {
  id: string;
  ticketId: string;
  userId?: string;
  user?: { firstName: string; lastName: string };
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface MaintenanceFilters {
  propertyId?: string;
  status?: MaintenanceTicketStatus;
  priority?: MaintenanceTicketPriority;
  assignedToStaffId?: string;
  search?: string;
}

export interface CreateMaintenanceTicketInput {
  title: string;
  propertyId: string;
  area: MaintenanceTicketArea;
  priority: MaintenanceTicketPriority;
  description?: string;
  estimatedCost?: number;
  scheduledAt?: string;
  source?: MaintenanceTicketSource;
}

export type UpdateMaintenanceTicketInput = Partial<{
  title: string;
  area: MaintenanceTicketArea;
  priority: MaintenanceTicketPriority;
  status: MaintenanceTicketStatus;
  description: string;
  estimatedCost: number;
  actualCost: number;
  scheduledAt: string;
  resolvedAt: string;
  resolutionNotes: string;
  assignedToStaffId: string;
  externalRef: string;
}>;
