import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import { Property } from './entities/property.entity';
import {
  PropertyVisit,
  PropertyVisitKind,
  PropertyVisitResult,
} from './entities/property-visit.entity';
import {
  PropertyVisitNotification,
  VisitNotificationChannel,
  VisitNotificationStatus,
} from './entities/property-visit-notification.entity';
import { CreatePropertyVisitDto } from './dto/create-property-visit.dto';
import { CreatePropertyMaintenanceTaskDto } from './dto/create-property-maintenance-task.dto';
import { UpdatePropertyVisitResultDto } from './dto/update-property-visit-result.dto';
import {
  OwnerActivity,
  OwnerActivityStatus,
  OwnerActivityType,
} from '../owners/entities/owner-activity.entity';
import { InterestedProfile } from '../interested/entities/interested-profile.entity';
import {
  InterestedActivity,
  InterestedActivityStatus,
  InterestedActivityType,
} from '../interested/entities/interested-activity.entity';
import { CommunicationsService } from '../communications/communications.service';
import {
  CommunicationChannel,
  CommunicationEvent,
  CommunicationRecipientRole,
} from '../communications/entities/communication-template.entity';
import { UserRole } from '../users/entities/user.entity';
import { hasRole, isAdminOrStaff } from '../common/helpers/role-scope.helper';

interface VisitUserContext {
  id: string;
  role: string;
  roles?: UserRole[];
  companyId: string;
}

interface VisitWhatsappContext {
  companyId: string;
  relatedEntityId: string;
  activityId?: string;
  templateLanguage?: string;
  templateParameters: string[];
  visitSnapshot: Record<string, unknown>;
  ownerId: string;
  consented: boolean;
}

@Injectable()
export class PropertyVisitsService {
  private transactionManager?: EntityManager;
  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(PropertyVisit)
    private readonly propertyVisitsRepository: Repository<PropertyVisit>,
    @InjectRepository(PropertyVisitNotification)
    private readonly notificationsRepository: Repository<PropertyVisitNotification>,
    @InjectRepository(OwnerActivity)
    private readonly ownerActivitiesRepository: Repository<OwnerActivity>,
    @InjectRepository(InterestedProfile)
    private readonly interestedRepository: Repository<InterestedProfile>,
    @InjectRepository(InterestedActivity)
    private readonly interestedActivitiesRepository: Repository<InterestedActivity>,
    private readonly communicationsService: CommunicationsService,
  ) {}

  async create(
    propertyId: string,
    dto: CreatePropertyVisitDto,
    user: VisitUserContext,
    executionKey?: string,
  ): Promise<PropertyVisit> {
    if (!this.transactionManager) {
      await this.getPropertyForAccess(propertyId, user);
      return this.transact(
        user,
        executionKey,
        'property-visit.create',
        { propertyId, ...dto },
        (service) => service.create(propertyId, dto, user),
      );
    }
    const property = await this.getPropertyForAccess(propertyId, user);
    const interested = await this.getInterestedForVisit(
      dto.interestedProfileId,
      property.companyId,
    );
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
    if (interested) savedVisit.interestedProfile = interested;

    const ownerActivity = await this.createOwnerVisitActivity(
      property,
      savedVisit,
      user,
    );

    const notifications = this.buildNotifications(property, savedVisit);
    if (notifications.length > 0) {
      const savedNotifications =
        await this.notificationsRepository.save(notifications);
      savedVisit.notifications = savedNotifications;
      await this.dispatchNotifications(savedNotifications, {
        companyId: property.companyId,
        relatedEntityId: savedVisit.id,
        activityId: ownerActivity?.id,
        templateLanguage: property.owner?.user?.language ?? 'es',
        templateParameters: this.buildVisitTemplateParameters(
          property,
          savedVisit,
        ),
        ownerId: property.ownerId,
        consented: this.ownerConsented(property),
        visitSnapshot: this.noticeSnapshot(savedVisit),
      });
    }

    if (interested) {
      await this.dispatchInterestedVisitCommunication(
        property,
        savedVisit,
        interested,
        CommunicationEvent.PROPERTY_VISIT_SCHEDULED,
        user,
      );
    }

    return savedVisit;
  }

  async updateResult(
    propertyId: string,
    visitId: string,
    dto: UpdatePropertyVisitResultDto,
    user: VisitUserContext,
    executionKey?: string,
  ): Promise<PropertyVisit> {
    if (!isAdminOrStaff(user))
      throw new ForbiddenException(
        'Only staff or admin can record visit results',
      );
    if (!this.transactionManager) {
      await this.getPropertyForAccess(propertyId, user);
      return this.transact(
        user,
        executionKey,
        'property-visit.result',
        { propertyId, visitId, ...dto },
        (service) => service.updateResult(propertyId, visitId, dto, user),
      );
    }
    const property = await this.getPropertyForAccess(propertyId, user);
    await this.transactionManager.query(
      'SELECT id FROM property_visits WHERE id=$1 AND property_id=$2 FOR UPDATE',
      [visitId, propertyId],
    );
    const visit = await this.propertyVisitsRepository.findOne({
      where: { id: visitId, propertyId, kind: PropertyVisitKind.VISIT },
      relations: ['interestedProfile'],
    });
    if (!visit) throw new NotFoundException('Property visit not found');
    if (dto.result === PropertyVisitResult.OFFER)
      this.validateOffer(
        dto.offerAmount,
        dto.offerCurrency ?? visit.offerCurrency ?? 'ARS',
      );
    if (
      dto.result === PropertyVisitResult.NOT_INTERESTED &&
      !dto.reason?.trim()
    )
      throw new BadRequestException(
        'A reason is required when the visitor is not interested',
      );

    visit.result = dto.result;
    visit.resultReason = dto.reason?.trim() || null;
    visit.completedAt = new Date();
    visit.hasOffer = dto.result === PropertyVisitResult.OFFER;
    if (visit.hasOffer) {
      visit.offerAmount = dto.offerAmount!;
      visit.offerCurrency = dto.offerCurrency ?? visit.offerCurrency ?? 'ARS';
    } else {
      visit.offerAmount = null;
    }
    const savedVisit = await this.propertyVisitsRepository.save(visit);
    const event =
      dto.result === PropertyVisitResult.OFFER
        ? CommunicationEvent.PROPERTY_VISIT_OFFER
        : CommunicationEvent.PROPERTY_VISIT_COMPLETED;

    await this.dispatchOwnerResultCommunication(property, savedVisit, event);
    if (savedVisit.interestedProfile) {
      await this.dispatchInterestedVisitCommunication(
        property,
        savedVisit,
        savedVisit.interestedProfile,
        event,
        user,
      );
    }
    await this.createInterestedResultActivity(savedVisit, user);
    return savedVisit;
  }

  async createMaintenanceTask(
    propertyId: string,
    dto: CreatePropertyMaintenanceTaskDto,
    user: VisitUserContext,
    executionKey?: string,
  ): Promise<PropertyVisit> {
    if (!this.transactionManager) {
      await this.getPropertyForAccess(propertyId, user);
      return this.transact(
        user,
        executionKey,
        'property-visit.maintenance',
        { propertyId, ...dto },
        (service) => service.createMaintenanceTask(propertyId, dto, user),
      );
    }
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
    if (hasOffer)
      this.validateOffer(input.offerAmount, input.offerCurrency ?? 'ARS');

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
      offerAmount: hasOffer ? input.offerAmount : undefined,
      offerCurrency: input.offerCurrency ?? 'ARS',
      result: hasOffer
        ? PropertyVisitResult.OFFER
        : PropertyVisitResult.PENDING,
      completedAt: hasOffer ? new Date() : undefined,
      createdByUserId: user.id,
    };

    const visit = this.propertyVisitsRepository.create(visitData);

    return this.propertyVisitsRepository.save(visit);
  }

  private async getPropertyForAccess(
    propertyId: string,
    user: VisitUserContext,
  ): Promise<Property> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }
    if (!isAdminOrStaff(user) && !hasRole(user, UserRole.OWNER))
      throw new ForbiddenException('Property visit access is not allowed');
    const property = await this.propertiesRepository.findOne({
      where: {
        id: propertyId,
        companyId: user.companyId,
        deletedAt: IsNull(),
      },
      relations: ['owner', 'owner.user'],
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    if (
      hasRole(user, UserRole.OWNER) &&
      !isAdminOrStaff(user) &&
      property.owner?.userId !== user.id
    ) {
      throw new ForbiddenException('You can only access your own properties');
    }

    return property;
  }

  private async getInterestedForVisit(
    interestedProfileId: string | undefined,
    companyId: string,
  ): Promise<InterestedProfile | null> {
    if (!interestedProfileId) return null;
    const interested = await this.interestedRepository.findOne({
      where: { id: interestedProfileId, companyId },
    });
    if (!interested) {
      throw new BadRequestException('Interested profile was not found');
    }
    return interested;
  }

  private async dispatchInterestedVisitCommunication(
    property: Property,
    visit: PropertyVisit,
    interested: InterestedProfile,
    event: CommunicationEvent,
    user: VisitUserContext,
  ): Promise<void> {
    const channel =
      interested.preferredContactChannel ?? CommunicationChannel.WHATSAPP;
    if (channel !== CommunicationChannel.WHATSAPP) return;
    const recipient = interested.phone;
    if (!recipient) return;

    const name =
      [interested.firstName, interested.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || 'cliente';
    const delivery = await this.communicationsService.dispatchEvent(
      {
        companyId: property.companyId,
        event,
        recipientRole: CommunicationRecipientRole.INTERESTED,
        recipientId: interested.id,
        channel,
        recipient,
        variables: this.buildCommunicationVariables(property, visit, name),
        fallbackSubject: `Visita a ${property.name}`,
        fallbackBody:
          event === CommunicationEvent.PROPERTY_VISIT_SCHEDULED
            ? 'Hola {{nombre_interesado}}, confirmamos la visita a {{propiedad}} para el {{fecha_visita}} a las {{hora_visita}}. Detalle: {{link_visita}}'
            : 'Hola {{nombre_interesado}}, registramos el resultado de la visita a {{propiedad}}: {{resultado}}. {{motivo}} Detalle: {{link_visita}}',
        consented: interested.consentContact,
        relatedEntityType: 'property_visit',
        relatedEntityId: visit.id,
        metadata: {
          propertyId: property.id,
          result: visit.result,
          visitSnapshot: this.noticeSnapshot(visit),
        },
      },
      this.transactionManager,
    );

    await this.interestedActivitiesRepository.save(
      this.interestedActivitiesRepository.create({
        interestedProfileId: interested.id,
        type: InterestedActivityType.VISIT,
        status:
          delivery.status === 'sent'
            ? InterestedActivityStatus.COMPLETED
            : InterestedActivityStatus.PENDING,
        subject:
          event === CommunicationEvent.PROPERTY_VISIT_SCHEDULED
            ? `Visita agendada en ${property.name}`
            : `Resultado de visita en ${property.name}`,
        body: delivery.body,
        dueAt: visit.visitedAt,
        completedAt: delivery.status === 'sent' ? new Date() : undefined,
        metadata: {
          visitId: visit.id,
          deliveryId: delivery.id,
          deliveryStatus: delivery.status,
          consented: interested.consentContact,
        },
        createdByUserId: user.id,
      }),
    );
  }

  private async dispatchOwnerResultCommunication(
    property: Property,
    visit: PropertyVisit,
    event: CommunicationEvent,
  ): Promise<void> {
    if (!property.ownerWhatsapp) return;
    const ownerName =
      [property.owner?.user?.firstName, property.owner?.user?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || 'propietario';
    await this.communicationsService.dispatchEvent(
      {
        companyId: property.companyId,
        event,
        recipientRole: CommunicationRecipientRole.OWNER,
        recipientId: property.ownerId,
        channel: CommunicationChannel.WHATSAPP,
        recipient: property.ownerWhatsapp,
        variables: this.buildCommunicationVariables(property, visit, ownerName),
        fallbackSubject: `Resultado de visita a ${property.name}`,
        fallbackBody:
          'Se registró el resultado de la visita a {{propiedad}}: {{resultado}}. {{motivo}} {{detalle_oferta}} Detalle: {{link_visita}}',
        consented: this.ownerConsented(property),
        relatedEntityType: 'property_visit',
        relatedEntityId: visit.id,
        metadata: {
          propertyId: property.id,
          result: visit.result,
          visitSnapshot: this.noticeSnapshot(visit),
        },
      },
      this.transactionManager,
    );
  }

  private buildCommunicationVariables(
    property: Property,
    visit: PropertyVisit,
    recipientName: string,
  ): Record<string, string | number | null> {
    const frontendUrl = (process.env.FRONTEND_URL ?? '').split(',')[0].trim();
    return {
      nombre_interesado: recipientName,
      propiedad: property.name,
      fecha_visita: this.formatWhatsappDate(visit.visitedAt).split(',')[0],
      hora_visita:
        this.formatWhatsappDate(visit.visitedAt).split(',')[1]?.trim() ?? '',
      resultado: visit.result,
      motivo: visit.resultReason,
      detalle_oferta:
        visit.hasOffer && visit.offerAmount
          ? `${visit.offerCurrency ?? 'ARS'} ${visit.offerAmount}`
          : '',
      link_visita: `${frontendUrl}/es/properties/${property.id}#visits`,
    };
  }

  private async createInterestedResultActivity(
    visit: PropertyVisit,
    user: VisitUserContext,
  ): Promise<void> {
    if (!visit.interestedProfileId) return;
    await this.interestedActivitiesRepository.save(
      this.interestedActivitiesRepository.create({
        interestedProfileId: visit.interestedProfileId,
        type: InterestedActivityType.VISIT,
        status: InterestedActivityStatus.COMPLETED,
        subject: `Resultado comercial: ${visit.result}`,
        body: visit.resultReason ?? undefined,
        completedAt: visit.completedAt ?? undefined,
        metadata: {
          visitId: visit.id,
          result: visit.result,
          potentialBuyer:
            visit.result === PropertyVisitResult.INTERESTED ||
            visit.result === PropertyVisitResult.OFFER,
          offerAmount: visit.offerAmount ?? null,
          offerCurrency: visit.offerCurrency ?? null,
        },
        createdByUserId: user.id,
      }),
    );
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
  ): Promise<OwnerActivity | null> {
    if (!property.ownerId) {
      return null;
    }

    const interested =
      visit.interestedName?.trim() || visit.interestedProfileId || 'Visita';

    return this.ownerActivitiesRepository.save(
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
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(value);
  }

  private buildVisitTemplateParameters(
    property: Property,
    visit: PropertyVisit,
  ): string[] {
    const interested =
      visit.interestedName?.trim() || visit.interestedProfileId || 'N/D';
    const detailParts = [
      visit.comments?.trim() || 'Sin comentarios',
      visit.hasOffer && visit.offerAmount !== undefined
        ? `Oferta ${visit.offerCurrency ?? 'ARS'} ${visit.offerAmount}`
        : null,
    ].filter(Boolean);

    return [
      property.name,
      this.formatWhatsappDate(visit.visitedAt),
      interested,
      detailParts.join('. '),
    ];
  }

  private async dispatchNotifications(
    notifications: PropertyVisitNotification[],
    context?: VisitWhatsappContext,
  ): Promise<void> {
    for (const notification of notifications) {
      try {
        await this.sendNotification(notification, context);
        notification.status = VisitNotificationStatus.QUEUED;
        notification.sentAt = null;
        notification.error = null;
      } catch (error) {
        if (this.transactionManager) throw error;
        notification.status = VisitNotificationStatus.FAILED;
        notification.error =
          error instanceof Error ? error.message : 'Failed to send';
      }
    }

    await this.notificationsRepository.save(notifications);
  }

  private async sendNotification(
    notification: PropertyVisitNotification,
    context?: VisitWhatsappContext,
  ): Promise<void> {
    if (notification.channel === VisitNotificationChannel.WHATSAPP) {
      if (!context) {
        throw new BadRequestException('Missing visit notification context');
      }
      await this.communicationsService.dispatchEvent(
        {
          companyId: context.companyId,
          event: CommunicationEvent.PROPERTY_VISIT_SCHEDULED,
          recipientRole: CommunicationRecipientRole.OWNER,
          recipientId: context.ownerId,
          channel: CommunicationChannel.WHATSAPP,
          recipient: notification.recipient,
          variables: {},
          fallbackBody: notification.message,
          consented: context.consented,
          skipTemplateLookup: true,
          relatedEntityType: 'property_visit',
          relatedEntityId: context.relatedEntityId,
          metadata: {
            visitNotificationId: notification.id,
            ownerActivityId: context.activityId,
            templateName: 'property_visit_registered',
            templateLanguage: context.templateLanguage ?? 'es',
            templateParameters: context.templateParameters,
            visitSnapshot: context.visitSnapshot,
          },
        },
        this.transactionManager,
      );
    }
  }

  private ownerConsented(property: Property): boolean {
    return (
      property.owner?.contactConsent === true &&
      property.owner?.user?.whatsappEnabled === true &&
      (!property.owner.preferredContactChannel ||
        property.owner.preferredContactChannel ===
          CommunicationChannel.WHATSAPP)
    );
  }

  private noticeSnapshot(visit: PropertyVisit): Record<string, unknown> {
    return {
      result: visit.result,
      reason: visit.resultReason ?? null,
      offerAmount: visit.offerAmount == null ? null : String(visit.offerAmount),
      currency: visit.offerCurrency,
      visitedAt: visit.visitedAt.toISOString(),
    };
  }

  private validateOffer(amount: number | undefined, currency: string): void {
    if (
      amount === undefined ||
      amount <= 0 ||
      !/^\d{1,10}(\.\d{1,2})?$/.test(String(amount))
    )
      throw new BadRequestException(
        'Offer amount requires positive exact cents',
      );
    if (!['ARS', 'USD', 'BRL'].includes(currency))
      throw new BadRequestException('Unsupported offer currency');
  }

  private transact<T>(
    user: VisitUserContext,
    key: string | undefined,
    operation: string,
    request: Record<string, unknown>,
    execute: (service: PropertyVisitsService) => Promise<T>,
  ): Promise<T> {
    return this.propertiesRepository.manager.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        user.companyId,
        key,
        operation,
        { ...request, actorId: user.id },
        async () => {
          const scoped = new PropertyVisitsService(
            manager.getRepository(Property),
            manager.getRepository(PropertyVisit),
            manager.getRepository(PropertyVisitNotification),
            manager.getRepository(OwnerActivity),
            manager.getRepository(InterestedProfile),
            manager.getRepository(InterestedActivity),
            this.communicationsService,
          );
          scoped.transactionManager = manager;
          return execute(scoped);
        },
      ),
    );
  }
}
