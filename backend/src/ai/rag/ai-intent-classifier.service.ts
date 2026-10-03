import { Injectable } from '@nestjs/common';
import { AiRagStrategy } from './ai-rag.types';

const MUTATION_VERBS = new Set(
  `crea crear creame cree creeme agrega agregar agregue actualiza actualizar actualice actualicen modifica modificar modifique modifiquen elimina eliminar elimine borra borrar borre registra registrar registre cobra cobrar cobre paga pagar pague envia enviar envie cancela cancelar cancele reserva reservar reserve cambia cambiar cambie edita editar edite asigna asignar asigne`.split(
    ' ',
  ),
);
const STRUCTURED_WORDS = new Set(
  `saldo deuda debe factura facturas pago pagos cobro cobros cobranza cobranzas vencido vencida vencidos vencidas monto montos importe importes total cuanto cuanta cuantos cuantas estado vigencia contrato contratos alquiler disponible disponibles ocupado ocupada ocupados ocupadas cartera portfolio dashboard`.split(
    ' ',
  ),
);
const DOCUMENT_STATE_WORDS = new Set(
  `estado saldo monto importe fecha vence vencimiento clausula`.split(' '),
);
const SEMANTIC_PREFIXES = [
  'describ',
  'explic',
  'resum',
  'detalle',
  'documento',
  'clausula',
  'menciona',
  'dice',
  'caracteristica',
  'amenit',
  'mascota',
  'garantia',
];

@Injectable()
export class AiIntentClassifierService {
  classify(prompt: string): AiRagStrategy {
    const text = prompt.trim().toLocaleLowerCase('es');
    if (!text) return 'unsupported';
    if (/\b(?:or\s+1\s*=\s*1|union\s+select)\b|--|\/\*/i.test(text))
      return 'unsupported';
    const normalized = text.normalize('NFD').replaceAll(/\p{M}/gu, '');
    const words = normalized.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
    const lifecycleMutation = /\b(?:da|dar|de)\s+de\s+(?:alta|baja)\b/u.test(
      normalized,
    );
    if (words.some((word) => MUTATION_VERBS.has(word)) || lifecycleMutation)
      return 'mutation';
    if (
      words.some((word) => word === 'documento' || word === 'documentos') &&
      !words.some((word) => DOCUMENT_STATE_WORDS.has(word))
    )
      return 'semantic';
    const structured = words.some((word) => STRUCTURED_WORDS.has(word));
    const semantic = words.some((word) =>
      SEMANTIC_PREFIXES.some((prefix) => word.startsWith(prefix)),
    );
    if (structured && semantic) return 'hybrid';
    return structured ? 'structured' : 'semantic';
  }
}
