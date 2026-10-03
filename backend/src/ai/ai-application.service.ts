import { Injectable } from '@nestjs/common';
import { AiConversationsService } from './ai-conversations.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiExecutionContext } from './types/ai-tool.types';
import {
  applicationGuidance,
  isDailyCollectionRequest,
  isApplicationContinuation,
} from './ai-application-guidance';
import type { CollectionSummary } from '../payments/payments.service';

@Injectable()
export class AiApplicationService {
  constructor(
    private readonly conversations: AiConversationsService,
    private readonly executor: AiToolExecutorService,
  ) {}

  async respond(
    prompt: string,
    context: AiExecutionContext,
    conversationId?: string,
  ) {
    let guidance = applicationGuidance(prompt, context);
    const dailyCollection = !guidance && isDailyCollectionRequest(prompt);
    if (!guidance && !dailyCollection && !isApplicationContinuation(prompt))
      return undefined;
    const conversation = await this.conversations.getOrCreateConversation({
      conversationId,
      userId: context.userId,
      companyId: context.companyId,
    });
    if (
      isApplicationContinuation(prompt) &&
      conversation.messages.at(-1)?.content.includes('**Cambiar contraseña**')
    ) {
      guidance = applicationGuidance('password', context);
    }
    try {
      let response = guidance;
      if (dailyCollection) {
        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        const summary = (await this.executor.execute(
          'get_payments_collection_summary',
          {
            fromDate: date,
            toDate: date,
          },
          { ...context, conversationId: conversation.id },
        )) as CollectionSummary;
        response = {
          outputText: this.formatCollection(
            summary,
            context.channel === 'whatsapp',
          ),
        };
      }
      if (!response) return undefined;
      const persisted = await this.conversations.appendExchange({
        conversationId: conversation.id,
        userId: context.userId,
        userPrompt: prompt,
        assistantText: response.outputText,
        model: 'application',
      });
      return {
        ...response,
        conversationId: conversation.id,
        model: 'application',
        toolState: persisted.toolState,
        insufficientEvidence: false,
        sources: [],
        retrieval: {
          strategy: 'structured' as const,
          resultCount: dailyCollection ? 1 : 0,
        },
        retrievalMode: 'TOOLS' as const,
      };
    } catch (error) {
      await this.conversations.appendAssistantError({
        conversationId: conversation.id,
        userId: context.userId,
        userPrompt: prompt,
        assistantError:
          error instanceof Error
            ? error.message
            : 'No pude consultar la cobranza.',
      });
      throw error;
    }
  }

  private formatCollection(
    summary: CollectionSummary,
    whatsapp: boolean,
  ): string {
    const money = (amount: string) => {
      const [whole, fraction = ''] = amount.split('.');
      return `${new Intl.NumberFormat('es-AR').format(BigInt(whole))},${fraction.padEnd(2, '0')}`;
    };
    const safe = (value: string) =>
      value.replace(/[\\`*_{}[\]()<>#|]/g, ' ').replace(/[\r\n]+/g, ' ');
    const lines = [
      `**Cobranza del ${summary.fromDate}**`,
      '',
      'Pagos completados por fecha de pago. Importes netos de devoluciones.',
      '',
    ];
    if (!summary.totalCount)
      return [
        ...lines,
        'No hay pagos completados registrados para este día.',
      ].join('\n');
    lines.push(
      `**${summary.totalCount} pago(s)**`,
      ...summary.totals.map(
        (total) =>
          `- **${safe(total.currency)} ${money(total.amount)}** (${total.count} pago(s))`,
      ),
      '',
    );
    if (whatsapp) {
      lines.push(
        ...summary.details.map(
          (payment) =>
            `- ${safe(payment.paymentNumber ?? 'Sin número')} · ${safe(payment.tenantName || 'Sin nombre')} · ${safe(payment.currency)} ${money(payment.amount)}`,
        ),
      );
    } else {
      lines.push(
        '| Pago | Inquilino | Moneda | Importe neto |',
        '| --- | --- | --- | ---: |',
        ...summary.details.map(
          (payment) =>
            `| ${safe(payment.paymentNumber ?? 'Sin número')} | ${safe(payment.tenantName || 'Sin nombre')} | ${safe(payment.currency)} | ${money(payment.amount)} |`,
        ),
      );
    }
    if (summary.totalCount > summary.details.length)
      lines.push(
        '',
        `Mostrando ${summary.details.length} de ${summary.totalCount} pagos. Los totales incluyen todos los pagos del día.`,
      );
    return lines.join('\n');
  }
}
