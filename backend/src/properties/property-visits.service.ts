import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import {
  PropertyVisit,
  PropertyVisitKind,
} from './entities/property-visit.entity';
import {
  PropertyVisitNotification,
  VisitNotificationChannel,
  VisitNotificationStatus,
} from './entities/property-visit-notification.entity';
import { CreatePropertyVisitDto } from './dto/create-property-visit.dto';
import { CreatePropertyMaintenanceTaskDto } from './dto/create-property-maintenance-task.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  OwnerActivity,
  OwnerActivityStatus,
  OwnerActivityType,
} from '../owners/entities/owner-activity.entity';

interface VisitUserContext {
  id: string;
  role: string;
  companyId?: string;
}

@Injectable()
export class PropertyVisitsService {
  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(PropertyVisit)
    private readonly propertyVisitsRepository: Repository<PropertyVisit>,
    @InjectRepository(PropertyVisitNotification)
    private readonly notificationsRepository: Repository<PropertyVisitNotification>,
    @InjectRepository(OwnerActivity)
    private readonly ownerActivitiesRepository: Repository<OwnerActivity>,
    private readonly whatsappService: WhatsappService,
  ) {}

  async create(
    propertyId: string,
    dto: CreatePropertyVisitDto,
    user: VisitUserContext,
  ): Promise<PropertyVisit> {
    const property = await this.getPropertyForAccess(propertyId, user);
    const savedVisit = await this.createVisitRecord(
      property,
      {
        kind: PropertyVisitKind.VISIT,
        visitedAt: dto.visitedAt,
        interestedName: dto.interestedName,
        interestedProfileId: dto.interestedProfileId,
        comments: dto.comments,
        hasOffer: dto.hasOffer,
        offerAmount: dto.offerAmount,
        offerCurrency: dto.offerCurrency,
      },
      user,
    );

    await this.createOwnerVisitActivity(property, savedVisit, user);

    const notifications = this.buildNotifications(property, savedVisit);
    if (notifications.length > 0) {
      const savedNotifications =
        await this.notificationsRepository.save(notifications);
      savedVisit.notifications = savedNotifications;
      await this.dispatchNotifications(savedNotifications);
    }

    return savedVisit;
  }

  async createMaintenanceTask(
    propertyId: string,
    dto: CreatePropertyMaintenanceTaskDto,
    user: VisitUserContext,
  ): Promise<PropertyVisit> {
    const property = await this.getPropertyForAccess(propertyId, user);
    const maintenanceTask = await this.createVisitRecord(
      property,
      {
        kind: PropertyVisitKind.MAINTENANCE,
        visitedAt: dto.scheduledAt,
        interestedName: dto.title,
        comments: dto.notes,
        hasOffer: false,
      },
      user,
    );

    await this.createOwnerMaintenanceActivity(property, maintenanceTask, user);
    return maintenanceTask;
  }

  async findAll(
    propertyId: string,
    user: VisitUserContext,
  ): Promise<PropertyVisit[]> {
    await this.getPropertyForAccess(propertyId, user);

    return this.propertyVisitsRepository.find({
      where: { propertyId, kind: PropertyVisitKind.VISIT },
      relations: ['interestedProfile'],
      order: { visitedAt: 'DESC' },
    });
  }

  async findMaintenanceTasks(
    propertyId: string,
    user: VisitUserContext,
  ): Promise<PropertyVisit[]> {
    await this.getPropertyForAccess(propertyId, user);

    return this.propertyVisitsRepository.find({
      where: { propertyId, kind: PropertyVisitKind.MAINTENANCE },
      order: { visitedAt: 'DESC' },
    });
  }

  private async createVisitRecord(
    property: Property,
    input: {
      kind: PropertyVisitKind;
      visitedAt?: string;
      interestedName?: string;
      interestedProfileId?: string;
      comments?: string;
      hasOffer?: boolean;
      offerAmount?: number;
      offerCurrency?: string;
    },
    user: VisitUserContext,
  ): Promise<PropertyVisit> {
    const visitedAt = input.visitedAt ? new Date(input.visitedAt) : new Date();
    if (Number.isNaN(visitedAt.getTime())) {
      throw new BadRequestException('Invalid visit date');
    }

    const hasOffer = input.hasOffer ?? typeof input.offerAmount === 'number';
    if (hasOffer && input.offerAmount === undefined) {
      throw new BadRequestException('Offer amount is required when hasOffer');
    }

    if (
      input.kind === PropertyVisitKind.VISIT &&
      !input.interestedName &&
      !input.interestedProfileId
    ) {
      throw new BadRequestException(
        'Interested name or interested profile is required',
      );
    }

    if (
      input.kind === PropertyVisitKind.MAINTENANCE &&
      !input.interestedName?.trim()
    ) {
      throw new BadRequestException('Maintenance task title is required');
    }

    const visitData: Partial<PropertyVisit> = {
      propertyId: property.id,
      kind: input.kind,
      visitedAt,
      interestedName: input.interestedName?.trim() || undefined,
      interestedProfileId: input.interestedProfileId,
      comments: input.comments,
      hasOffer,
      offerAmount: input.offerAmount,
      offerCurrency: input.offerCurrency ?? 'ARS',
      createdByUserId: user.id,
    };

    const visit = this.propertyVisitsRepository.create(visitData);

    return this.propertyVisitsRepository.save(visit);
  }

  private async getPropertyForAccess(
    propertyId: string,
    user: VisitUserContext,
  ): Promise<Property> {
    const property = await this.propertiesRepository.findOne({
      where: { id: propertyId, deletedAt: IsNull() },
      relations: ['owner', 'owner.user'],
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    if (user.companyId && property.companyId !== user.companyId) {
      throw new ForbiddenException('You can only access your own company');
    }

    if (user.role === 'owner' && property.owner?.userId !== user.id) {
      throw new ForbiddenException('You can only access your own properties');
    }

    return property;
  }

  private buildNotifications(
    property: Property,
    visit: PropertyVisit,
  ): PropertyVisitNotification[] {
    if (visit.kind !== PropertyVisitKind.VISIT) {
      return [];
    }

    const messageParts = [
      `Se registró una visita para ${property.name}.`,
      `Fecha: ${this.formatWhatsappDate(visit.visitedAt)}.`,
      `Interesado: ${visit.interestedName ?? visit.interestedProfileId ?? 'N/D'}.`,
    ];

    if (visit.comments) {
      messageParts.push(`Comentarios: ${visit.comments}.`);
    }

    if (visit.hasOffer && visit.offerAmount !== undefined) {
      messageParts.push(
        `Oferta: ${visit.offerCurrency ?? 'ARS'} ${visit.offerAmount}.`,
      );
    }

    const message = messageParts.join(' ');

    const notifications: PropertyVisitNotification[] = [];

    if (property.ownerWhatsapp) {
      notifications.push(
        this.notificationsRepository.create({
          visitId: visit.id,
          channel: VisitNotificationChannel.WHATSAPP,
          recipient: property.ownerWhatsapp,
          message,
          status: VisitNotificationStatus.QUEUED,
        }),
      );
    }

    return notifications;
  }

  private async createOwnerVisitActivity(
    property: Property,
    visit: PropertyVisit,
    user: VisitUserContext,
  ): Promise<void> {
    if (!property.ownerId) {
      return;
    }

    const interested =
      visit.interestedName?.trim() || visit.interestedProfileId || 'Visita';

    await this.ownerActivitiesRepository.save(
      this.ownerActivitiesRepository.create({
        companyId: property.companyId,
        ownerId: property.ownerId,
        propertyId: property.id,
        type: OwnerActivityType.VISIT,
        status: OwnerActivityStatus.COMPLETED,
        subject: `Visita registrada en ${property.name}`,
        body: [
          `Interesado: ${interested}.`,
          visit.comments ? `Comentarios: ${visit.comments}.` : null,
          visit.hasOffer && visit.offerAmount !== undefined
            ? `Oferta: ${visit.offerCurrency ?? 'ARS'} ${visit.offerAmount}.`
            : null,
        ]
          .filter(Boolean)
          .join(' '),
        dueAt: visit.visitedAt,
        completedAt: new Date(),
        metadata: {
          visitId: visit.id,
          kind: visit.kind,
          interestedName: visit.interestedName ?? null,
          interestedProfileId: visit.interestedProfileId ?? null,
        },
        createdByUserId: user.id,
      }),
    );
  }

  private async createOwnerMaintenanceActivity(
    property: Property,
    task: PropertyVisit,
    user: VisitUserContext,
  ): Promise<void> {
    if (!property.ownerId) {
      return;
    }

    await this.ownerActivitiesRepository.save(
      this.ownerActivitiesRepository.create({
        companyId: property.companyId,
        ownerId: property.ownerId,
        propertyId: property.id,
        type: OwnerActivityType.TASK,
        status: OwnerActivityStatus.PENDING,
        subject: `Revisar mantenimiento de ${property.name}`,
        body: [
          `Tarea: ${task.interestedName ?? 'Mantenimiento'}.`,
          task.comments ? `Detalle: ${task.comments}.` : null,
        ]
          .filter(Boolean)
          .join(' '),
        dueAt: task.visitedAt,
        completedAt: null,
        metadata: {
          taskId: task.id,
          kind: task.kind,
          title: task.interestedName ?? null,
        },
        createdByUserId: user.id,
      }),
    );
  }

  private formatWhatsappDate(value: Date): string {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Argentina/Jujuy',
    }).format(value);
  }

  private async dispatchNotifications(
    notifications: PropertyVisitNotification[],
  ): Promise<void> {
    for (const notification of notifications) {
      try {
        await this.sendNotification(notification);
        notification.status = VisitNotificationStatus.SENT;
        notification.sentAt = new Date();
        notification.error = null;
      } catch (error) {
        notification.status = VisitNotificationStatus.FAILED;
        notification.error =
          error instanceof Error ? error.message : 'Failed to send';
      }
    }

    await this.notificationsRepository.save(notifications);
  }

  private async sendNotification(
    notification: PropertyVisitNotification,
  ): Promise<void> {
    if (notification.channel === VisitNotificationChannel.WHATSAPP) {
      await this.whatsappService.sendTextMessage(
        notification.recipient,
        notification.message,
      );
    }
  }
}
