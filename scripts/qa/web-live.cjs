#!/usr/bin/env node
// Read-only visual and interaction QA against an isolated, populated API.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('../../frontend/node_modules/@playwright/test');
const axe = require('../../frontend/node_modules/axe-core');
const messages = require('../../frontend/messages/es.json');
const { localOrigin, loginFixture } = require('./web-qa-auth.cjs');
const apiUrl = localOrigin(process.env.RENT_QA_API_URL || 'http://127.0.0.1:3301');
const webUrl = localOrigin(process.env.RENT_QA_WEB_URL || 'http://127.0.0.1:3300');
const output = process.env.RENT_QA_OUTPUT_DIRECTORY;
function readInput(name) {
  assert(process.env[name], `${name} is required`);
  return JSON.parse(fs.readFileSync(process.env[name], 'utf8'));
}
async function capture(page, name, route, results) {
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(webUrl + route, { waitUntil: 'networkidle' });
      assert.equal(new URL(page.url()).pathname, route, `${name} must remain authenticated on its route`);
      await page.locator('main h1').first().waitFor();
      await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
      assert.equal(await page.locator('main [role="alert"]').count(), 0, `${name} has a visible error`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction((mode) => document.documentElement.classList.contains('dark') === (mode === 'dark'), theme);
      await page.addScriptTag({ content: axe.source });
      await page.waitForFunction((size) => {
        const sidebar = document.querySelector('#app-sidebar');
        return !sidebar || sidebar.hasAttribute('inert') === (size < 1024);
      }, width);
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth, root: document.documentElement.scrollWidth,
        body: document.body.scrollWidth, title: document.querySelector('main h1')?.textContent,
      }));
      assert(dimensions.root <= width && dimensions.body <= width, `${name}/${theme}/${width} overflows`);
      const violations = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
        return result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
      });
      const file = `${name}-${width}-${theme}.png`;
      await page.screenshot({ path: path.join(output, file), fullPage: true, animations: 'disabled' });
      results.push({ screen: name, route, width, theme, file, dimensions, violations });
    }
  }
  console.log(`Checked ${name}: six widths/themes`);
}
async function contextFor(browser, auth) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript((session) => {
    localStorage.setItem('auth_token', session.accessToken);
    localStorage.setItem('auth_user', JSON.stringify(session.user));
    localStorage.setItem('theme', 'light');
  }, auth);
  return context;
}
(async () => {
  assert(output, 'RENT_QA_OUTPUT_DIRECTORY is required');
  fs.mkdirSync(output, { recursive: true });
  const credentials = readInput('RENT_QA_CREDENTIALS_FILE');
  const fixtures = readInput('RENT_QA_FIXTURES_FILE');
  const portals = readInput('RENT_QA_PORTAL_SESSIONS_FILE');
  const portalCredentials = process.env.RENT_QA_PORTAL_CREDENTIALS_FILE
    ? readInput('RENT_QA_PORTAL_CREDENTIALS_FILE') : null;
  const auth = await loginFixture(apiUrl, credentials);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome' });
  const errors = [];
  const results = [];
  const interactions = [];
  try {
    const context = await contextFor(browser, auth);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const screens = [
      ['dashboard', '/es/dashboard'], ['properties', '/es/properties'],
      ['payments', '/es/payments'], ['contract', '/es/leases/' + fixtures.lease.id],
      ['sales', '/es/sales'], ['buyers', '/es/buyers'], ['owners', '/es/owners'],
      ['property-detail', '/es/properties/' + fixtures.properties[0].id],
      ['tenant-detail', '/es/tenants/' + fixtures.tenant.id],
      ['maintenance', '/es/maintenance'], ['reports', '/es/reports'],
      ['communications', '/es/settings/communications'],
    ];
    for (const [name, route] of screens) await capture(page, name, route, results);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(webUrl + '/es/properties', { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate((element) => element === document.activeElement), true, 'Skip link is first focus target');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#main-content').evaluate((element) => element === document.activeElement), true, 'Skip link focuses content');
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.locator('button[aria-controls="app-sidebar"]');
    await menu.click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#app-sidebar').getAttribute('inert'), '');
    assert.equal(await menu.evaluate((element) => element === document.activeElement), true, 'Menu returns focus');
    interactions.push('Skip link and mobile sidebar Escape/focus return');
    await context.close();
    for (const [role, routes] of Object.entries({
      owner: [['owner-portal', '/es/portal/owner']],
      tenant: [['tenant-portal', '/es/portal/tenant'], ['tenant-payments', '/es/portal/tenant/payments'], ['tenant-maintenance', '/es/portal/tenant/maintenance']],
      buyer: [['buyer-portal', '/es/portal/buyer']],
    })) {
      let portalAuth = portals[role];
      if (portalCredentials) {
        portalAuth = await loginFixture(apiUrl, portalCredentials[role]);
      }
      const portalContext = await contextFor(browser, portalAuth);
      const portalPage = await portalContext.newPage();
      portalPage.on('pageerror', (error) => errors.push(error.message));
      for (const [name, route] of routes) await capture(portalPage, name, route, results);
      if (role === 'buyer') {
        await portalPage.setViewportSize({ width: 1440, height: 1000 });
        await portalPage.getByRole('button', { name: /siguiente/i }).click();
        await portalPage.waitForLoadState('networkidle');
        const detail = portalPage.locator('[data-guide="review"]').first();
        await detail.waitFor({ state: 'visible' });
        assert(await detail.isVisible(), 'Buyer page after first is accessible');
        await detail.click();
        const region = portalPage.getByRole('region', { name: messages.buyerPortal.detail });
        await region.waitFor();
        await region.getByRole('table').first().waitFor();
        assert.equal(await region.locator('input[type=number]').count(), 0, 'Buyer detail is read only');
        await region.getByRole('button', { name: messages.buyerPortal.close }).click();
        assert.equal(await region.count(), 0);
        interactions.push('Buyer later page and own read-only installment detail');
      }
      await portalContext.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ at: new Date().toISOString(), backend: apiUrl, frontend: webUrl, mockMode: false, results, errors, interactions }, null, 2));
  }
  const violations = results.flatMap((result) => result.violations);
  assert.equal(errors.length, 0, 'No JavaScript runtime errors');
  assert.equal(violations.length, 0, 'No automated accessibility violations');
  console.log(`Live QA passed: ${results.length} captures, ${interactions.length} interactions, no runtime or accessibility violations`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
