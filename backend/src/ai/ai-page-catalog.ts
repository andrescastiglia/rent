import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AiExecutionContext, AiUiAction } from './types/ai-tool.types';
import { getUserRoles } from '../common/helpers/role-scope.helper';
import { UserModulePermissions, UserRole } from '../users/entities/user.entity';

type ApplicationPage = {
  path: string;
  title: string;
  permission: keyof UserModulePermissions | 'self-service';
  roles: UserRole[];
  fields: string[];
  openers: string[];
};
const file = 'ai-application-pages.json';
export const applicationPages: ApplicationPage[] = JSON.parse(
  readFileSync(join(__dirname, file), 'utf8'),
);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function accessiblePages(context: AiExecutionContext) {
  return applicationPages.filter((page) =>
    getUserRoles(context).some(
      (role) =>
        page.roles.includes(role) &&
        (role !== UserRole.STAFF ||
          page.permission === 'self-service' ||
          context.permissions?.[page.permission] === true),
    ),
  );
}

export function pageForPath(path: string, context: AiExecutionContext) {
  if (!isPageQuery(path)) return undefined;
  const segments = path.split('?')[0].split('/');
  return accessiblePages(context).find((page) => {
    const pattern = page.path.split('/');
    return (
      pattern.length === segments.length &&
      pattern.every((part, index) =>
        part.startsWith('[')
          ? UUID.test(segments[index])
          : part === segments[index],
      )
    );
  });
}

function isPageQuery(path: string): boolean {
  const [pathname, search, extra] = path.split('?');
  if (extra !== undefined || path.includes('#')) return false;
  if (search === undefined) return true;
  const params = new URLSearchParams(search);
  const keys = [...params.keys()];
  if (keys.length !== new Set(keys).size) return false;
  if (pathname === '/templates' || pathname === '/templates/editor')
    return keys.every((key) =>
      key === 'scope'
        ? [
            'contract_rental',
            'contract_sale',
            'receipt',
            'invoice',
            'credit_note',
          ].includes(params.get(key) ?? '')
        : key === 'templateId' &&
          pathname.endsWith('/editor') &&
          UUID.test(params.get(key) ?? ''),
    );
  if (pathname === '/payments/new')
    return keys.every(
      (key) => key === 'leaseId' && UUID.test(params.get(key) ?? ''),
    );
  return false;
}

export function validatePageAction(
  action: AiUiAction,
  context: AiExecutionContext,
  knownIds: ReadonlySet<string>,
): AiUiAction {
  const page = pageForPath(action.path, context);
  if (!page) throw new Error('Página inexistente o sin permiso de acceso.');
  const [pathname, search] = action.path.split('?');
  const ids = [
    ...pathname.split('/'),
    ...new URLSearchParams(search).values(),
  ].filter((part) => UUID.test(part));
  for (const part of ids) {
    if (!knownIds.has(part))
      throw new Error(
        'Consultá primero el registro autorizado antes de abrirlo.',
      );
  }
  if (action.recordId && !knownIds.has(action.recordId))
    throw new Error(
      'Consultá primero el registro autorizado antes de abrirlo.',
    );
  if (action.field && !page.fields.includes(action.field))
    throw new Error(
      'Ese control no pertenece a la página. Consultá el catálogo de controles.',
    );
  if (action.openControl && !page.openers.includes(action.openControl))
    throw new Error('Ese botón no está habilitado para abrir formularios.');
  return action;
}
