import { test, expect } from "@playwright/test";
import axe from "axe-core";

test("creates, recovers after reload, submits and approves an amendment", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1300 });
  const base = {
    id: "workflow-ui",
    leaseId: "1",
    companyId: "ui-company",
    amendmentNumber: 1,
    effectiveDate: "2026-10-01",
    description: "Aumento acordado",
    changeType: "rent_increase",
    newValues: { monthlyRent: "1750.00" },
    status: "draft",
    applicationStatus: "none",
    appliedAt: null,
    applicationSnapshot: null,
    updatedAt: "2026-09-29T12:00:00.000Z",
  };
  let current: typeof base | null = null;
  const creates: unknown[] = [],
    decisions: { action: string; body: Record<string, string> }[] = [];
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
    route.fulfill({ json: current ? [current] : [] }),
  );
  await page.route("**/amendments", async (route) => {
    creates.push(route.request().postDataJSON());
    current = { ...base };
    if (creates.length === 1) return route.abort("failed");
    return route.fulfill({ json: current });
  });
  await page.route("**/amendments/workflow-ui/*", async (route) => {
    const action = route.request().url().split("/").pop()!;
    decisions.push({ action, body: route.request().postDataJSON() });
    current = {
      ...base,
      status: action === "submit" ? "pending_approval" : "approved",
      applicationStatus: action === "approve" ? "pending" : "none",
      updatedAt:
        action === "submit"
          ? "2026-09-29T12:01:00.000Z"
          : "2026-09-29T12:02:00.000Z",
    };
    return route.fulfill({ json: current });
  });
  await page.goto("/es/leases/1");
  const panel = page.getByRole("region", { name: "Enmiendas del contrato" });
  const fillDraft = async () => {
    await panel.getByRole("button", { name: "Nueva enmienda" }).click();
    await panel.getByLabel("Vigencia", { exact: true }).fill("2026-10-01");
    await panel.getByLabel("Descripción del cambio").fill("Aumento acordado");
    await panel.getByLabel(/Canon mensual/).fill("1750");
    await panel.getByRole("checkbox").check();
  };
  await fillDraft();
  await page.addScriptTag({ content: axe.source });
  expect(
    await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector(
              'section[aria-label="Enmiendas del contrato"]',
            )!,
            {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
              },
            },
          )
        ).violations,
    ),
  ).toEqual([]);
  await panel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await panel.screenshot({
    path: testInfo.outputPath("amendment-workflow-desktop.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 1300 });
  await panel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await panel.screenshot({
    path: testInfo.outputPath("amendment-workflow-mobile.png"),
    animations: "disabled",
  });
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await panel.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "No se confirmó la respuesta",
  );
  await page.reload();
  await fillDraft();
  await panel.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(
    panel.getByRole("button", { name: "Enviar a aprobación" }),
  ).toBeVisible();
  expect(creates).toHaveLength(2);
  expect(creates[1]).toEqual(creates[0]);
  await panel.getByRole("button", { name: "Enviar a aprobación" }).click();
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Confirmar decisión" }).click();
  await panel
    .getByRole("button", { name: "Aprobar enmienda", exact: true })
    .click();
  await expect(panel).toContainText("Los valores se aplicarán automáticamente");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(panel).toContainText("Aprobada · Programada");
  expect(decisions.map((d) => d.action)).toEqual(["submit", "approve"]);
  expect(decisions[1].body.expectedUpdatedAt).toBe("2026-09-29T12:01:00.000Z");
  expect(decisions[0].body.idempotencyKey).not.toBe(
    decisions[1].body.idempotencyKey,
  );
});
