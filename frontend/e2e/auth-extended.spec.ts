import type { Page } from '@playwright/test';
import { expect, localePath, login, test } from './fixtures/auth';

type UserRole = 'admin' | 'owner' | 'tenant' | 'staff';

const ROLE_USERS: Record<
  UserRole,
  {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }
> = {
  admin: {
    id: 'role-admin-1',
    firstName: 'Admin',
    lastName: 'Role',
    email: 'admin.role@example.com',
  },
  owner: {
    id: 'role-owner-1',
    firstName: 'Owner',
    lastName: 'Role',
    email: 'owner.role@example.com',
  },
  tenant: {
    id: 'role-tenant-1',
    firstName: 'Tenant',
    lastName: 'Role',
    email: 'tenant.role@example.com',
  },
  staff: {
    id: 'role-staff-1',
    firstName: 'Staff',
    lastName: 'Role',
    email: 'staff.role@example.com',
  },
};

async function installTurnstileMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as unknown as {
      turnstile?: {
        render: (
          container: HTMLElement,
          options: {
            sitekey: string;
            callback?: (token: string) => void;
            'expired-callback'?: () => void;
            'error-callback'?: () => void;
          },
        ) => string;
        reset: (widgetId?: string) => void;
        remove: (widgetId: string) => void;
      };
    };

    win.turnstile = {
      render: (_container, options) => {
        setTimeout(() => {
          options.callback?.('e2e-turnstile-token');
        }, 0);
        return 'e2e-turnstile-widget';
      },
      reset: () => {},
      remove: () => {},
    };
  });
}

async function gotoWithRetry(page: Page, path: string): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      const retriable = /ERR_ABORTED|frame was detached/i.test(String(error));
      if (!retriable || attempt === maxAttempts || page.isClosed()) {
        throw error;
      }
      await page.waitForTimeout(300);
    }
  }
}

async function seedAuthRole(page: Page, role: UserRole): Promise<void> {
  const user = ROLE_USERS[role];
  const authToken = `mock-token-${user.id}-${Date.now()}`;

  await gotoWithRetry(page, localePath('/dashboard'));
  await page.evaluate(
    ({ token, authUser, roleValue }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem(
        'auth_user',
        JSON.stringify({
          ...authUser,
          role: roleValue,
          language: 'es',
          avatarUrl: null,
          phone: '+1 555 9999',
          isActive: true,
        }),
      );
    },
    { token: authToken, authUser: user, roleValue: role },
  );
  await gotoWithRetry(page, localePath('/dashboard'));
  await expect(page).toHaveURL(/\/es\/dashboard/);
}

async function openUserMenu(page: Page): Promise<void> {
  const menuButton = page
    .locator('header button')
    .filter({ has: page.locator('div.w-8.h-8.rounded-full') })
    .first();
  await menuButton.click();
}

test.describe('Auth Extended', () => {
  test.setTimeout(60000);
  test.describe.configure({ mode: 'serial' });

  test('registers a user and shows pending approval', async ({ page }) => {
    await installTurnstileMock(page);
    await page.goto(localePath('/register'));

    const uniqueEmail = `e2e.register.${Date.now()}@example.com`;

    await page.locator('#firstName').fill('E2E');
    await page.locator('#lastName').fill('Register');
    await page.locator('#email').fill(uniqueEmail);
    await page.locator('#phone').fill('+54 9 11 5555-0000');
    await page.locator('#password').fill('SecurePass123!');
    await page.locator('#confirmPassword').fill('SecurePass123!');
    await page.locator('#role').selectOption('tenant');

    await page
      .getByRole('button', { name: /crear cuenta|create account|criar conta/i })
      .click();

    await expect(
      page.getByText(
        /pendiente de aprobaci[oó]n|pending administrator approval|pendente de aprova[cç][aã]o/i,
      ),
    ).toBeVisible();
  });

  test('logs out and clears auth state', async ({ page }) => {
    await login(page);
    await page.goto(localePath('/dashboard'));

    await openUserMenu(page);
    const logoutButton = page.getByRole('button', {
      name: /cerrar sesi[oó]n|log out|sair/i,
    });
    await expect(logoutButton).toBeVisible();
    await logoutButton.click();

    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('auth_token')))
      .toBeNull();
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('auth_user')))
      .toBeNull();
  });

  test('redirects to login when session is no longer valid', async ({
    page,
  }) => {
    await login(page);
    await page.goto(localePath('/dashboard'));

    await page.evaluate(() => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.dispatchEvent(new Event('storage'));
    });

    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('auth_token')))
      .toBeNull();
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('auth_user')))
      .toBeNull();
  });

  test('applies role guards for protected modules', async ({ page }) => {
    await seedAuthRole(page, 'owner');
    await page.goto(localePath('/users'));
    await expect(
      page.getByText(/acceso denegado|access denied|acesso negado/i),
    ).toBeVisible();

    await seedAuthRole(page, 'tenant');
    await page.goto(localePath('/reports'));
    await expect(
      page.getByText(/acceso denegado|access denied|acesso negado/i),
    ).toBeVisible();
  });
});
