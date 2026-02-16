type TemplateContext = Record<string, unknown>;

const TEMPLATE_PLACEHOLDER_REGEX = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;

export function renderDocumentTemplate(
  templateBody: string,
  context: TemplateContext,
): string {
  return templateBody.replace(
    TEMPLATE_PLACEHOLDER_REGEX,
    (_token: string, key: string): string => {
      const value = resolveTemplateValue(context, key);
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'string') {
        return value;
      }
      return String(value);
    },
  );
}

function resolveTemplateValue(context: TemplateContext, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[part];
  }, context);
}
