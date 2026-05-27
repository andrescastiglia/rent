import axe from 'axe-core';
import { expect, gotoWithRetry, localePath, login, test } from './fixtures/auth';

declare global {
  interface Window {
    axe: typeof axe;
  }
}

type AuditedRoute = {
  name: string;
  path: string;
  authenticated: boolean;
};

const auditedRoutes: AuditedRoute[] = [
  { name: 'login', path: '/login', authenticated: false },
  { name: 'register', path: '/register', authenticated: false },
  { name: 'dashboard', path: '/dashboard', authenticated: true },
  { name: 'properties', path: '/properties', authenticated: true },
  { name: 'new property', path: '/properties/new', authenticated: true },
  { name: 'tenants', path: '/tenants', authenticated: true },
  { name: 'new tenant', path: '/tenants/new', authenticated: true },
  { name: 'leases', path: '/leases', authenticated: true },
  { name: 'new lease', path: '/leases/new', authenticated: true },
  { name: 'payments', path: '/payments', authenticated: true },
  { name: 'new payment', path: '/payments/new', authenticated: true },
  { name: 'invoices', path: '/invoices', authenticated: true },
  { name: 'interested', path: '/interested', authenticated: true },
  { name: 'new interested', path: '/interested/new', authenticated: true },
  { name: 'users', path: '/users', authenticated: true },
  { name: 'settings', path: '/settings', authenticated: true },
  { name: 'templates', path: '/templates', authenticated: true },
  {
    name: 'template editor',
    path: '/templates/editor?scope=invoice',
    authenticated: true,
  },
  { name: 'maintenance', path: '/maintenance', authenticated: true },
  { name: 'reports', path: '/reports', authenticated: true },
];

async function waitForPageStructure(page: Parameters<typeof login>[0]) {
  await expect(page.locator('main')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(300);
}

async function runAxe(page: Parameters<typeof login>[0]) {
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async () => {
    return window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: [
          'wcag2a',
          'wcag2aa',
          'wcag21a',
          'wcag21aa',
          'wcag22aa',
          'best-practice',
        ],
      },
    });
  });
}

function formatViolations(violations: Awaited<ReturnType<typeof runAxe>>['violations']) {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 3)
        .map((node) => `    - ${node.target.join(' ')}: ${node.html}`)
        .join('\n');
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n${nodes}`;
    })
    .join('\n\n');
}

test.describe('WCAG 2.2 accessibility smoke audit', () => {
  test.describe.configure({ mode: 'serial' });

  for (const route of auditedRoutes) {
    test(`${route.name} has no automated WCAG A/AA or structural violations`, async ({
      page,
    }) => {
      if (route.authenticated) {
        await login(page);
      }

      await gotoWithRetry(page, localePath(route.path), {
        waitUntil: 'domcontentloaded',
      });
      await waitForPageStructure(page);

      const results = await runAxe(page);
      expect(results.violations, formatViolations(results.violations)).toEqual(
        [],
      );
    });
  }
});
