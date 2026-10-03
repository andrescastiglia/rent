import { AiExecutionContext, AiUiAction } from './types/ai-tool.types';
export function normalizePrompt(prompt: string): string {
  return prompt.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase().trim();
}

export function isApplicationContinuation(prompt: string): boolean {
  return /^(?:y ahora|como (?:sigo|continuo)|donde (?:empiezo|continuo)|que sigue|ayudame)(?:[?.!\s])*$/u.test(
    normalizePrompt(prompt).replace(/^[¿¡]\s*/, ''),
  );
}

export function applicationGuidance(
  prompt: string,
  context: AiExecutionContext,
):
  | {
      outputText: string;
      uiAction?: AiUiAction;
    }
  | undefined {
  const text = normalizePrompt(prompt);
  if (
    /\b(?:usuario|usuarios|inquilino|propietario|staff)\b|\b(?:password|contrasena|clave) de (?!mi\b)/u.test(
      text,
    )
  )
    return undefined;
  // Only password help has a deterministic shortcut, so secrets never go to
  // the model. Every other page/field is planned from the application catalog.
  if (!/\b(?:password|contrasena|clave|senha)\b/u.test(text)) return undefined;
  return {
    outputText:
      '**Cambiar contraseña**\n\nEn **Configuración → Cambiar contraseña**, completá la contraseña actual, la nueva (mínimo 8 caracteres) y su confirmación. Ingresá las contraseñas únicamente en ese formulario. El guardado lo realizás vos.',
    ...(context.channel === 'web'
      ? {
          uiAction: {
            type: 'navigate' as const,
            path: '/settings',
            guide: 'password' as const,
          },
        }
      : {}),
  };
}

// Only the unfiltered daily report is handled here. More specific queries go to
// the authorized tool planner, so a named tenant or other filter is never lost.
export function isDailyCollectionRequest(prompt: string): boolean {
  const text = normalizePrompt(prompt)
    .replace(/[¿?!.]/g, '')
    .trim();
  if (
    /^(?:(?:quiero|necesito) saber )?cuanto (?:se cobro|cobramos|cobre)(?: el dia de| en el dia de)? hoy$/u.test(
      text,
    )
  )
    return true;
  return /^(?:(?:quiero|quisiera|necesito|puedo|podria)\s+)?(?:(?:ver|consultar|saber|mostrame|mostrar|muestra|dame|mostrarme)\s+)?(?:la\s+|los\s+)?(?:cobranza|cobranzas|cobros)(?:\s+(?:de|del))?(?:\s+(?:el\s+)?dia)?\s+(?:de\s+)?hoy$/u.test(
    text,
  );
}
