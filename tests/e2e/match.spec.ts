import { expect, test } from "@playwright/test";
test("main race: real server countdown, controls, AI finish and persisted classification", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const origin = "http://127.0.0.1:3000";
  const nickname = `QA_Race_${Date.now().toString().slice(-7)}`;
  const created = await request.post("/api/profile", {
    headers: { Origin: origin },
    data: { nickname, avatar: 0 },
  });
  expect(created.ok()).toBe(true);
  await page.context().addCookies((await request.storageState()).cookies);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#play");
  await expect(
    page.getByRole("button", { name: new RegExp(nickname) }),
  ).toBeVisible();
  const arena = page.getByRole("region", { name: "Server race match" });
  await arena.getByRole("button", { name: "Bắt đầu trận đấu" }).click();
  await expect(
    arena.getByText("Trận đã tạo trên server · sẵn sàng đổi làn!"),
  ).toBeVisible();
  await expect(arena.getByRole("button", { name: "Lái trái" })).toBeEnabled({
    timeout: 10000,
  });
  await arena.getByRole("button", { name: "Lái trái" }).click();
  await expect
    .poll(async () =>
      Number(
        await arena.getByTestId("match-distance").getAttribute("data-distance"),
      ),
    )
    .toBeGreaterThan(10000);
  await arena.getByRole("button", { name: /Tăng tốc ·/ }).click();
  await expect(arena.locator(".match-road")).toHaveClass(/boosting/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await arena.screenshot({ path: "docs/screenshots/main-race-mobile.png" });
  const latest = await (await request.get("/api/races")).json();
  const id = latest.match.id;
  const forged = await request.post("/api/races", {
    headers: { Origin: origin },
    data: {
      kind: "control",
      id,
      action: "boost",
      sequence: 3,
      rank: 1,
      finishMs: 1,
      distance: 1000000,
    },
  });
  expect(forged.status()).toBe(400);
  await expect(arena.getByTestId("confirmed-race-result")).toBeVisible({
    timeout: 90000,
  });
  const finished = await (await request.get(`/api/races?id=${id}`)).json();
  expect(finished.match.status).toBe("finished");
  expect(finished.match.resultDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(
    finished.match.riders.filter((r: { ai: boolean }) => r.ai),
  ).toHaveLength(2);
  const repeated = await (await request.get(`/api/races?id=${id}`)).json();
  expect(repeated.match.resultDigest).toBe(finished.match.resultDigest);
  await page.reload();
  await expect(page.getByTestId("confirmed-race-result")).toBeVisible({
    timeout: 15000,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("region", { name: "Server race match" })
    .screenshot({ path: "docs/screenshots/main-race-results.png" });
  expect(errors).toEqual([]);
});
