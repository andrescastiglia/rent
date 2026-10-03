import { test, expect, localePath } from "./fixtures/auth";

test("registered dialog guidance opens the folder form and never saves it", async ({
  authenticatedPage: page,
}) => {
  await page.evaluate(() =>
    sessionStorage.setItem(
      "rent:assistant-guidance",
      JSON.stringify({
        action: {
          type: "navigate",
          guide: "screen",
          path: "/sales",
          intent: "create",
          field: "folder-name",
          openControl: "sale-folder",
          instruction:
            "Ingresá el nombre de la carpeta; guardá cuando hayas revisado el formulario.",
        },
        expiresAt: Date.now() + 60000,
      }),
    ),
  );
  await page.goto(localePath("/sales"));
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#folder-name")).toHaveAttribute(
    "data-guidance-target",
    "",
  );
  await expect(dialog.locator("#folder-name")).toHaveValue("");
  await expect(dialog.locator("[data-guidance-ui] output")).toContainText(
    "nombre de la carpeta",
  );
});

test("general form guidance opens a page, highlights the requested field and leaves its value and Save untouched", async ({
  authenticatedPage: page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      ["POST", "PATCH", "PUT", "DELETE"].includes(request.method()) &&
      request.url().includes("/users")
    )
      writes.push(request.url());
  });
  await page.evaluate(() =>
    sessionStorage.setItem(
      "rent:assistant-guidance",
      JSON.stringify({
        action: {
          type: "navigate",
          guide: "screen",
          path: "/settings",
          intent: "edit",
          field: "phone",
          instruction:
            "Modificá tu teléfono y revisá los datos antes de guardar.",
        },
        expiresAt: Date.now() + 60000,
      }),
    ),
  );
  await page.goto(localePath("/settings"));
  const phone = page.locator('[data-guide="phone"]');
  await expect(phone).toHaveAttribute("data-guidance-target", "");
  const original = await phone.inputValue();
  await expect(page.locator("[data-guidance-ui] output")).toContainText(
    "Modificá tu teléfono",
  );
  await page
    .locator("[data-guidance-ui]")
    .getByRole("button", { name: "Ir al control" })
    .click();
  await expect(phone).toBeFocused();
  await expect(phone).toHaveValue(original);
  expect(writes).toEqual([]);
});

test("guidance applies to a new property form as well as settings", async ({
  authenticatedPage: page,
}) => {
  await page.evaluate(() =>
    sessionStorage.setItem(
      "rent:assistant-guidance",
      JSON.stringify({
        action: {
          type: "navigate",
          guide: "screen",
          path: "/properties/new",
          intent: "create",
          field: "name",
          instruction:
            "Ingresá el nombre de la propiedad y completá los datos del formulario.",
        },
        expiresAt: Date.now() + 60000,
      }),
    ),
  );
  await page.goto(localePath("/properties/new"));
  await expect(page.locator("#name")).toHaveAttribute(
    "data-guidance-target",
    "",
  );
  await expect(page.locator("#name")).toHaveValue("");
  await expect(page.locator("[data-guidance-ui] output")).toContainText(
    "nombre de la propiedad",
  );
});

test("a password assistance request survives navigation and guides the real form on mobile", async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    localStorage.setItem("rent:guidance:paused", "true");
    sessionStorage.setItem(
      "rent:assistant-guidance",
      JSON.stringify({
        action: { type: "navigate", path: "/settings", guide: "password" },
        expiresAt: Date.now() + 60000,
      }),
    );
  });
  await page.goto(localePath("/settings"));
  const current = page.locator('[data-guide="password-current"]');
  const next = page.locator('[data-guide="password-new"]');
  const confirmation = page.locator('[data-guide="password-confirm"]');
  const guidance = page.locator("[data-guidance-ui] output");
  await expect(current).toHaveAttribute("data-guidance-target", "");
  await expect(guidance).toContainText("contraseña actual");
  await expect(current).toBeInViewport();
  await current.fill("local-test-password");
  await expect(next).toHaveAttribute("data-guidance-target", "");
  await expect(guidance).toContainText("al menos 8 caracteres");
  await next.fill("new-local-test-password");
  await expect(confirmation).toHaveAttribute("data-guidance-target", "");
  await confirmation.fill("new-local-test-password");
  await expect(page.locator('[data-guide="password-submit"]')).toHaveAttribute(
    "data-guidance-target",
    "",
  );
  await expect(guidance).toContainText("Cambiar contraseña");
  await expect
    .poll(() =>
      page.locator('[data-guide="password-submit"]').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top > 70 && rect.bottom < window.innerHeight - 220;
      }),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("rent:guidance:paused")),
  ).toBe("true");
  await page.screenshot({ path: "/tmp/rent-ai-password-guidance.png" });
  await page.keyboard.press("Escape");
  await expect(guidance).toHaveCount(0);
});
