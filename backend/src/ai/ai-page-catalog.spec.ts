import {
  accessiblePages,
  applicationPages,
  validatePageAction,
} from './ai-page-catalog';
import { UserRole } from '../users/entities/user.entity';

const context = {
  userId: 'u',
  companyId: 'c',
  role: UserRole.ADMIN,
  channel: 'web' as const,
};
const id = '10000000-0000-4000-8000-000000000001';
describe('Application page catalog', () => {
  it.each(applicationPages)(
    'validates real route $path with resolved IDs',
    (page) => {
      const path = page.path.replace(/\[[^\]]+\]/g, id);
      const subject = {
        ...context,
        roles: [
          UserRole.ADMIN,
          UserRole.OWNER,
          UserRole.TENANT,
          UserRole.BUYER,
        ],
      };
      expect(
        validatePageAction(
          { type: 'navigate', guide: 'screen', path },
          subject,
          new Set([id]),
        ).path,
      ).toBe(path);
    },
  );
  it('denies other modules, foreign IDs, unknown fields and unsafe navigation', () => {
    expect(
      accessiblePages({
        ...context,
        role: UserRole.STAFF,
        permissions: { tenants: true },
      }).some((page) => page.path === '/users'),
    ).toBe(false);
    for (const path of [
      '/properties/' + id + '/edit',
      'javascript:alert(1)',
      '/invoices/' + id + '?pay=mercadopago',
      '/settings?next=https://evil.test',
    ])
      expect(() =>
        validatePageAction(
          { type: 'navigate', guide: 'screen', path },
          context,
          new Set(),
        ),
      ).toThrow();
    expect(() =>
      validatePageAction(
        {
          type: 'navigate',
          guide: 'screen',
          path: '/properties/' + id + '/edit',
          field: 'made-up-control',
        },
        context,
        new Set([id]),
      ),
    ).toThrow();
    expect(
      validatePageAction(
        {
          type: 'navigate',
          guide: 'screen',
          path: '/templates/editor?scope=receipt&templateId=' + id,
        },
        context,
        new Set([id]),
      ),
    ).toBeDefined();
  });
});
