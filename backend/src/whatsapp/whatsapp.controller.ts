import {
  Body,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request as NestRequest,
  Req,
  Res,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DocumentsService } from '../documents/documents.service';
import { UserRole } from '../users/entities/user.entity';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappWebhookQueryDto } from './dto/whatsapp-webhook-query.dto';
import { WhatsappDocumentQueryDto } from './dto/whatsapp-document-query.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@Authenticated('tenants')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Post('messages')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async sendMessage(
    @Body() dto: SendWhatsappMessageDto,
    @NestRequest() req: { user: { companyId: string } },
  ) {
    if (!dto.activityEntity || !dto.activityId || !dto.relatedEntityId) {
      throw new BadRequestException(
        'Activity entity, activity id and recipient id are required',
      );
    }
    return this.whatsappService.enqueueMessage({
      ...dto,
      companyId: req.user.companyId,
      recipientRole: dto.activityEntity,
      recipientId: dto.relatedEntityId,
      idempotencyKey: `activity:${dto.activityEntity}:${dto.activityId}`,
    });
  }

  @Public()
  @Post('messages/internal')
  async sendMessageFromBatch(
    @Body() dto: SendWhatsappMessageDto,
    @Headers('x-batch-whatsapp-token') token?: string,
  ) {
    this.whatsappService.assertBatchToken(token);
    if (
      !dto.companyId ||
      !dto.recipientRole ||
      !dto.recipientId ||
      !dto.idempotencyKey
    ) {
      throw new BadRequestException(
        'Company, recipient and idempotency key are required',
      );
    }
    return this.whatsappService.enqueueMessage({
      ...dto,
      companyId: dto.companyId,
      recipientRole: dto.recipientRole,
      recipientId: dto.recipientId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Public()
  @Get('webhook')
  verifyWebhook(@Query() query: WhatsappWebhookQueryDto, @Res() res: Response) {
    const mode = query['hub.mode'];
    const verifyToken = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const isValidChallenge =
      typeof challenge === 'string' && /^\d{1,32}$/.test(challenge);

    if (!isValidChallenge) {
      return res.sendStatus(HttpStatus.BAD_REQUEST);
    }

    if (
      mode === 'subscribe' &&
      this.whatsappService.verifyWebhookToken(verifyToken)
    ) {
      return res.type('text/plain').status(HttpStatus.OK).send(challenge);
    }

    return res.sendStatus(HttpStatus.FORBIDDEN);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Body() payload: unknown,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    if (
      !this.whatsappService.verifyWebhookSignature(signature, request.rawBody)
    ) {
      throw new ForbiddenException('Invalid WhatsApp webhook signature');
    }
    return this.whatsappService.acceptIncomingWebhook(payload);
  }

  @Public()
  @Post('internal/process-inbox')
  processWebhookInbox(
    @Headers('x-batch-whatsapp-token') token?: string,
    @Query('limit') limit?: string,
  ) {
    this.whatsappService.assertBatchToken(token);
    return this.whatsappService.processDueWebhookInbox(Number(limit ?? 25));
  }

  @Public()
  @Post('internal/apply-retention')
  applyRetention(@Headers('x-batch-whatsapp-token') token?: string) {
    this.whatsappService.assertBatchToken(token);
    return this.whatsappService.applyRetentionPolicy();
  }

  @Public()
  @Get('documents/:documentId')
  async downloadDocument(
    @Param('documentId') documentId: string,
    @Query() query: WhatsappDocumentQueryDto,
    @Res() res: Response,
  ) {
    const { token } = query;
    if (!this.whatsappService.isDocumentTokenValid(documentId, token)) {
      throw new ForbiddenException('Invalid or expired document token');
    }

    const { buffer, contentType } = await this.documentsService.downloadByS3Key(
      `db://document/${documentId}`,
    );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="document-${documentId}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    });

    return res.send(buffer);
  }
}
