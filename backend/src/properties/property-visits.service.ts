import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { PropertyVisit } from './entities/property-visit.entity';
import {
  PropertyVisitNotification,
  VisitNotificationChannel,
  VisitNotificationStatus,
} from './entities/property-visit-notification.entity';
import { CreatePropertyVisitDto } from './dto/create-property-visit.dto';

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
  ) {}

  async create(
    propertyId: string,
    dto: CreatePropertyVisitDto,
    user: VisitUserContext,
  ): Promise<PropertyVisit> {
    const property = await this.getPropertyForAccess(propertyId, user);

    const visitedAt = dto.visitedAt ? new Date(dto.visitedAt) : new Date();
    if (Number.isNaN(visitedAt.getTime())) {
      throw new BadRequestException('Invalid visit date');
    }

    const hasOffer = dto.hasOffer ?? typeof dto.offerAmount === 'number';
    if (hasOffer && dto.offerAmount === undefined) {
      throw new BadRequestException('Offer amount is required when hasOffer');
    }

    const visit = this.propertyVisitsRepository.create({
      propertyId,
      visitedAt,
      interestedName: dto.interestedName,
      comments: dto.comments,
      hasOffer,
      offerAmount: dto.offerAmount,
      offerCurrency: dto.offerCurrency ?? 'ARS',
      createdByUserId: user.id,
    });

    const savedVisit = await this.propertyVisitsRepository.save(visit);

    const notifications = this.buildNotifications(property, savedVisit);
    if (notifications.length > 0) {
      const savedNotifications = await this.notificationsRepository.save(
        notifications,
      );
      savedVisit.notifications = savedNotifications;
      await this.dispatchNotifications(savedNotifications);
    }

    return savedVisit;
  }

  async findAll(
    propertyId: string,
    user: VisitUserContext,
  ): Promise<PropertyVisit[]> {
    await this.getPropertyForAccess(propertyId, user);

    return this.propertyVisitsRepository.find({
      where: { propertyId },
      order: { visitedAt: 'DESC' },
    });
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
    const messageParts = [
      `Visita registrada para ${property.name}.`,
      `Fecha: ${visit.visitedAt.toISOString()}.`,
      `Interesado: ${visit.interestedName}.`,
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

    const ownerEmail = property.owner?.user?.email;
    if (ownerEmail) {
      notifications.push(
        this.notificationsRepository.create({
          visitId: visit.id,
          channel: VisitNotificationChannel.EMAIL,
          recipient: ownerEmail,
          message,
          status: VisitNotificationStatus.QUEUED,
        }),
      );
    }

    return notifications;
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
      console.info(
        `WhatsApp notification to ${notification.recipient}: ${notification.message}`,
      );
      return;
    }

    if (notification.channel === VisitNotificationChannel.EMAIL) {
      console.info(
        `Email notification to ${notification.recipient}: ${notification.message}`,
      );
      return;
    }
  }
}
