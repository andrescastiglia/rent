import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { DocumentsService } from '../documents/documents.service';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsappWebhookQueryDto } from './dto/whatsapp-webhook-query.dto';
import { WhatsappDocumentQueryDto } from './dto/whatsapp-document-query.dto';
import { WhatsappWebhookPayloadDto } from './dto/whatsapp-webhook-payload.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Post('messages')
  async sendMessage(@Body() dto: SendWhatsappMessageDto) {
    return this.whatsappService.sendTextMessage(dto.to, dto.text, dto.pdfUrl);
  }

  @Public()
  @Post('messages/internal')
  async sendMessageFromBatch(
    @Body() dto: SendWhatsappMessageDto,
    @Headers('x-batch-whatsapp-token') token?: string,
  ) {
    this.whatsappService.assertBatchToken(token);
    return this.whatsappService.sendTextMessage(dto.to, dto.text, dto.pdfUrl);
  }

  @Public()
  @Get('webhook')
  verifyWebhook(@Query() query: WhatsappWebhookQueryDto, @Res() res: Response) {
    const mode = query['hub.mode'];
    const verifyToken = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (
      mode === 'subscribe' &&
      this.whatsappService.verifyWebhookToken(verifyToken)
    ) {
      return res.status(HttpStatus.OK).send(challenge);
    }

    return res.sendStatus(HttpStatus.FORBIDDEN);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  receiveWebhook(@Body() payload: WhatsappWebhookPayloadDto) {
    this.whatsappService.handleIncomingWebhook(payload);
    return { received: true };
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
