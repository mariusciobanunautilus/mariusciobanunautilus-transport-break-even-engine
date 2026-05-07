// @ts-check
import { expect, test } from "@playwright/test";

test("dashboard explains the first run and exposes the main break-even result", async ({
  page
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /pricing workspace/i })).toBeVisible();
  await expect(page.getByText("First run")).toBeVisible();
  await expect(page.getByText(/Break-even covers the annual fleet cost/i)).toBeVisible();
  await expect(page.getByText("Global break-even")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print PDF" })).toBeVisible();
});

test("editing an input marks results stale and recalculation clears the warning", async ({
  page
}) => {
  await page.goto("/#/inputs");

  await expect(page.getByRole("heading", { name: "Activity And Load" })).toBeVisible();
  await page.getByLabel("Daily km").fill("500");
  await expect(page.getByText("Recalculate needed")).toBeVisible();

  await page.getByRole("button", { name: "Recalculate now" }).click();
  await expect(page.getByText("Recalculate needed")).toBeHidden();
  await expect(page.getByText("Computed Fleet Preview")).toBeVisible();
});

test("input section nav, validation, undo and reset are available", async ({ page }) => {
  await page.goto("/#/inputs");

  await page.getByRole("button", { name: "Variable Cost" }).click();
  await expect(page.getByLabel("Fuel price")).toBeVisible();
  await page.getByLabel("Fuel price").fill("0");
  await expect(page.getByText("Must be greater than 0.00")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Must be greater than 0.00")).toBeHidden();
  await page.getByRole("button", { name: "Reset defaults" }).click();
  await expect(page.getByText("Defaults restored")).toBeVisible();
});

test("pricing slider updates the selected markup and scenarios can be pinned", async ({
  page
}) => {
  await page.goto("/#/pricing");

  await expect(page.getByRole("heading", { name: "Selected Markup" })).toBeVisible();
  await page.getByLabel("Markup over break-even").fill("0.30");
  await expect(page.getByRole("button", { name: "Aggressive" })).toHaveClass(/active/);

  const firstPin = page.getByRole("button", { name: "Pin" }).first();
  await firstPin.click();
  await expect(page.getByRole("button", { name: "Pinned" }).first()).toBeVisible();
});

test("break-even result explains formulas as a calculation breakdown", async ({ page }) => {
  await page.goto("/#/results");

  await expect(page.getByRole("heading", { name: "How the break-even is built" })).toBeVisible();
  await expect(page.getByText("Activity").first()).toBeVisible();
  await expect(page.getByText("Total annual cost").first()).toBeVisible();
  await expect(page.getByText("Customer rate excl. VAT")).toBeVisible();
  await expect(page.getByText("Advanced formula audit")).toBeVisible();
});

test("sensitivity page stacks expandable sensitivity cards", async ({ page }) => {
  await page.goto("/#/sensitivity");

  await expect(
    page.getByRole("heading", { name: "Hover a card to inspect the moving parts" })
  ).toBeVisible();
  await expect(page.locator(".hover-sensitivity-card")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Vehicle Class Sensitivity" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Payload Utilisation" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Fuel Price" })).toBeVisible();

  const fuelCard = page.getByRole("region", { name: "Fuel Price" });
  await fuelCard.hover();
  await expect(fuelCard.locator(".sensitivity-bar").first()).toBeVisible();
});
