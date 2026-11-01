import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
test("real hardware: lock, daily challenge, settle once, and replay", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.LIVE_ACCEPTANCE !== "1",
    "Opt-in: waits several minutes for real hardware evidence",
  );
  test.setTimeout(480000);
  const origin = "http://127.0.0.1:3000";
  await request.post("/api/sync", { headers: { Origin: origin }, data: {} });
  let state = await (await request.get("/api/state")).json();
  expect(state.feed.caught_up).toBe(true);
  const nickname = `QA_Live_${Date.now().toString().slice(-6)}`;
  const created = await request.post("/api/profile", {
    headers: { Origin: origin },
    data: { nickname, avatar: 1 },
  });
  expect(created.ok()).toBe(true);
  await page.context().addCookies((await request.storageState()).cookies);
  const round = state.rounds
    .filter(
      (r: { status: string; locks_at: string }) =>
        r.status === "open" && Number(r.locks_at) > state.serverNow,
    )
    .sort(
      (a: { starts_at: string }, b: { starts_at: string }) =>
        Number(a.starts_at) - Number(b.starts_at),
    )[0];
  expect(round).toBeTruthy();
  const prediction = await request.post("/api/predict", {
    headers: { Origin: origin },
    data: { roundId: round.id, choice: "cozy" },
  });
  expect(prediction.ok()).toBe(true);
  expect(
    (
      await request.post("/api/predict", {
        headers: { Origin: origin },
        data: { roundId: round.id, choice: "zoom" },
      })
    ).status(),
  ).toBe(400);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: new RegExp(nickname) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play daily challenge", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Cozy paws/ })
    .click();
  await expect(
    page.getByRole("dialog").getByText(/accepted passages/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  console.log(
    `Locked real round ${round.id}; waiting for ${new Date(Number(round.ends_at) + 120000).toISOString()}`,
  );
  await expect
    .poll(
      async () => {
        await request.post("/api/sync", {
          headers: { Origin: origin },
          data: {},
        });
        state = await (await request.get("/api/state")).json();
        return state.rounds.find((r: { id: string }) => r.id === round.id)
          ?.status;
      },
      { timeout: 420000, intervals: [15000] },
    )
    .toBe("settled");
  const settled = state.rounds.find((r: { id: string }) => r.id === round.id);
  const result = state.predictions.find(
    (p: { round_id: string }) => p.round_id === round.id,
  );
  expect(settled.evidence.certifiedCoreWork).toBe(false);
  expect(result.points).toBe(result.correct ? 100 : 0);
  const points = state.profile.points;
  await request.post("/api/sync", { headers: { Origin: origin }, data: {} });
  expect((await (await request.get("/api/state")).json()).profile.points).toBe(
    points,
  );
  await page.goto("/history");
  await page.getByRole("button", { name: "Details" }).first().click();
  await page
    .getByRole("button", { name: "Replay actual passage timeline" })
    .click();
  await expect(page.getByText(/Source references/)).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/verified-replay.png",
    fullPage: true,
  });
  await writeFile(
    "docs/sources/live-acceptance.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        round: settled,
        prediction: {
          choice: result.choice,
          points: result.points,
          correct: result.correct,
        },
        profilePoints: points,
      },
      null,
      2,
    ),
  );
});
