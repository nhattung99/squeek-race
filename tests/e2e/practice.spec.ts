import { expect, test } from "@playwright/test";
test("practice race starts, moves, steers and boosts without hardware", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByText("Đua tập ngoại tuyến · không lưu thành tích", { exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Live Wheel Companion" }),
  ).not.toBeVisible();
  const practice = page.getByRole("region", { name: "Arcade practice race" });
  await practice.getByRole("button", { name: "Đua tập ngay" }).click();
  await expect(practice.getByRole("button", { name: "Tăng tốc" })).toBeEnabled({
    timeout: 7000,
  });
  await expect
    .poll(async () =>
      Number(
        await practice
          .getByTestId("practice-distance")
          .getAttribute("data-distance"),
      ),
    )
    .toBeGreaterThan(15);
  const before = await practice
    .locator(".practice-lane-lines")
    .getAttribute("style");
  await expect
    .poll(() => practice.locator(".practice-lane-lines").getAttribute("style"))
    .not.toBe(before);
  await practice.getByRole("button", { name: "Đổi làn trái" }).click();
  await expect(practice.locator(".practice-hamster")).toHaveAttribute(
    "style",
    /16\.666/,
  );
  await practice.getByRole("button", { name: "Tăng tốc" }).click();
  await expect(practice.locator(".practice-road")).toHaveClass(/boosting/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await practice.screenshot({ path: "docs/screenshots/arcade-practice.png" });
  await practice.getByRole("button", { name: "Dừng đua tập" }).click();
  await expect(
    practice.getByRole("button", { name: "Đua tập ngay" }),
  ).toBeVisible();
});

test("embedded visibility flag does not freeze practice and the race reaches the finish", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.addInitScript(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    }),
  );
  await page.goto("/");
  await page
    .getByText("Đua tập ngoại tuyến · không lưu thành tích", { exact: true })
    .click();
  const practice = page.getByRole("region", { name: "Arcade practice race" });
  await practice.getByRole("button", { name: "Đua tập ngay" }).click();
  await expect
    .poll(
      async () =>
        Number(
          await practice
            .getByTestId("practice-distance")
            .getAttribute("data-distance"),
        ),
      { timeout: 8000 },
    )
    .toBeGreaterThan(20);
  await expect(practice.getByText("VỀ ĐÍCH! 🏆", { exact: true })).toBeVisible({
    timeout: 35000,
  });
  await expect(practice.getByTestId("practice-distance")).toHaveAttribute(
    "data-distance",
    "600",
  );
});
