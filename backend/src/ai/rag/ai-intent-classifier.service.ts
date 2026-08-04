import { Injectable } from '@nestjs/common';
import { AiRagStrategy } from './ai-rag.types';

@Injectable()
export class AiIntentClassifierService {
  classify(prompt: string): AiRagStrategy {
    const text = prompt.trim().toLocaleLowerCase('es');
    if (!text) return 'unsupported';
    if (/\b(?:or\s+1\s*=\s*1|union\s+select)\b|--|\/\*/i.test(text)) {
      return 'unsupported';
    }

    const mutation =
      /\b(cr(?:e(?:a|á|ar|ame|e|é|eme)|é(?:ame|eme))|agreg(?:a|á|ar|ue)|actualiz(?:a|á|ar)|actualic(?:e|en)|modific(?:a|á|ar)|modifiqu(?:e|en)|elimin(?:a|á|ar|e)|borr(?:a|á|ar|e)|registr(?:a|á|ar|e)|cobr(?:a|á|ar|e)|pag(?:a|á|ar|ue)|env(?:i(?:a|á|ar|e)|í(?:a|e))|cancel(?:a|á|ar|e)|reserv(?:a|á|ar|e)|cambi(?:a|á|ar|e)|edit(?:a|á|ar|e)|asign(?:a|á|ar|e))(?=\s|$|[.,;:!?])/i;
    const lifecycleMutation = /\bd(?:a|á|ar|e|é)\s+de\s+(?:alta|baja)\b/i;
    if (mutation.test(text) || lifecycleMutation.test(text)) return 'mutation';

    if (
      /\bdocumentos?\b/i.test(text) &&
      !/\b(estado|saldo|monto|importe|fecha|vence|vencimiento|cl[aá]usula)\b/i.test(
        text,
      )
    ) {
      return 'semantic';
    }

    const structured =
      /\b(saldo|deuda|debe|facturas?|pagos?|vencid[ao]s?|montos?|importes?|total|cu[aá]nt[oa]s?|estado|vigencia|contratos?|alquiler|disponibles?|ocupad[ao]s?|cartera|portfolio|dashboard)\b/i;
    const semantic =
      /\b(describ|explic|resum|detalle|documento|cl[aá]usula|menciona|dice|caracter[ií]stica|amenit|mascota|garant[ií]a)\b/i;
    if (structured.test(text) && semantic.test(text)) return 'hybrid';
    if (structured.test(text)) return 'structured';
    return 'semantic';
  }
}
