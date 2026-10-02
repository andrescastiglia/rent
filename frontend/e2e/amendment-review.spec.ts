import { test, expect } from "@playwright/test";
import axe from "axe-core";

test("reviews a contract amendment and recovers a lost response in the rendered interface", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  const base = {
    id: "amendment-review-ui",
    leaseId: "1",
    companyId: "ui-company",
    amendmentNumber: 2,
    effectiveDate: "2026-10-01",
    description: "Aumento acordado para octubre",
    newValues: { monthlyRent: 1750 },
    status: "approved",
    applicationStatus: "legacy_review",
    appliedAt: null,
    applicationSnapshot: null,
    updatedAt: "2026-09-29T12:00:00.000Z",
  };
  let current = { ...base },
    attempts = 0;
  const requests: unknown[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("auth_token", "amendment-browser-fixture"),
  );
  await page.route("**/users/profile/me", (route) =>
    route.fulfill({
      json: {
        id: "ui-admin",
        companyId: "ui-company",
        role: "admin",
        roles: ["admin"],
        firstName: "Admin",
        lastName: "Prueba",
        email: "admin@ui.test",
        isActive: true,
      },
    }),
  );
  await page.route("**/amendments/lease/1", (route) =>
    route.fulfill({ json: [current] }),
  );
  await page.route(
    "**/amendments/amendment-review-ui/reviews",
    async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: [] });
      requests.push(route.request().postDataJSON());
      attempts++;
      current = { ...base, status: "cancelled", applicationStatus: "none" };
      if (attempts === 1) return route.abort("failed");
      return route.fulfill({
        json: { amendment: current, review: { id: "review" } },
      });
    },
  );
  await page.goto("/es/leases/1");
  const panel = page.getByRole("region", { name: "Enmiendas del contrato" });
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: "Anular enmienda", exact: true })
    .click();
  await panel
    .getByLabel("Motivo de la revisión")
    .fill("Las partes acordaron retirar este cambio.");
  await expect(
    panel.getByRole("button", { name: "Confirmar revisión" }),
  ).toBeDisabled();
  await panel.getByRole("checkbox").check();
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const browserAxe = (window as unknown as { axe: typeof axe }).axe;
    return (
      await browserAxe.run(
        document.querySelector('section[aria-label="Enmiendas del contrato"]')!,
        {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
          },
        },
      )
    ).violations;
  });
  expect(violations).toEqual([]);
  await panel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await panel.screenshot({
    path: testInfo.outputPath("amendment-review-desktop.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 1300 });
  await panel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await panel.screenshot({
    path: testInfo.outputPath("amendment-review-mobile.png"),
    animations: "disabled",
  });
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await panel.getByRole("button", { name: "Confirmar revisión" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "No se confirmó la respuesta",
  );
  await panel.getByRole("button", { name: "Recuperar resultado" }).click();
  await expect(panel).toContainText("Anulada");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});
