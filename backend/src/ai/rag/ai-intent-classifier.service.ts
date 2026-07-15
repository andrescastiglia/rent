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
      /\b(cre(?:a|á|ar|ame)|agreg(?:a|á|ar)|actualiz(?:a|á|ar)|modific(?:a|á|ar)|elimin(?:a|á|ar)|borr(?:a|á|ar)|registr(?:a|á|ar)|cobr(?:a|á|ar)|pag(?:a|á|ar)|envi(?:a|á|ar)|cancel(?:a|á|ar)|reserv(?:a|á|ar))(?=\s|$|[.,;:!?])/i;
    if (mutation.test(text)) return 'mutation';

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
