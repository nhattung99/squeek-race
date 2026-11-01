import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
test("403 falls back to labeled direct telemetry, without client-authoritative results", async ({
  page,
  request,
}) => {
  const state = await (await request.get("/api/state")).json();
  const snapshot = JSON.parse(readFileSync("docs/sources/status.json", "utf8"));
  snapshot.measurement.observedAt = new Date().toISOString();
  snapshot.measurement.receivedAt = new Date().toISOString();
  await page.route("**/api/state", (route) =>
    route.fulfill({
      json: {
        ...state,
        wheel: null,
        sourceError: "Squeekchain HTTP 403",
        feed: { ...state.feed, caught_up: false },
        rounds: [],
        predictions: [],
      },
    }),
  );
  await page.route("**/api/sync", (route) =>
    route.fulfill({ status: 400, json: { error: "Squeekchain HTTP 403" } }),
  );
  await page.route("https://api.squeekchain.com/v1/status", (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: snapshot,
    }),
  );
  await page.goto("/");
  await expect(page.locator(".source-notice")).toContainText(
    "directly from the official public API for display only",
  );
  await expect(
    page.getByText("Squeektoshi is online", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Squeekchain HTTP 403" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Squeek Grand Prix" }),
  ).toBeVisible();
});
