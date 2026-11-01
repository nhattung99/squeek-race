import { expect, test } from "@playwright/test";
test("desktop, profile, daily play, navigation and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Little paws/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hamster Sprint" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Join the arena" }).click();
  const nickname = `QA${Date.now().toString().slice(-8)}`;
  await page.getByLabel("Select cyan hamster").click();
  await page.getByLabel("Racer nickname").fill(nickname);
  await page.getByRole("button", { name: "Let’s squeek" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "arena_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Strict");
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.screenshot({
    path: "docs/screenshots/desktop.png",
    fullPage: true,
  });
  for (const route of [
    "/arena",
    "/predict",
    "/leaderboard",
    "/history",
    "/how-to-play",
    "/about",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
  }
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: new RegExp(nickname) }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Predict", exact: true })
    .click();
  await expect(page).toHaveURL(/\/predict$/);
  expect(errors).toEqual([]);
});
test("server rejects forged score, missing sessions, bad origins, and unprotected cron access", async ({
  request,
}) => {
  const forged = await request.post("/api/predict", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: { roundId: "fake", choice: "zoom", points: 999999 },
  });
  expect(forged.status()).toBe(400);
  const origin = await request.post("/api/profile", {
    headers: { Origin: "https://evil.example" },
    data: { nickname: "Evil", avatar: 0 },
  });
  expect(origin.status()).toBe(400);
  expect((await request.get("/api/sync")).status()).toBe(401);
  expect((await request.get("/api/daily")).status()).toBe(400);
});
