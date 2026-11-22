import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("renders and verifies the deterministic Safari journal fixture", () => {
  const root = process.cwd();
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "scripts", "verify-visual.ts")],
    {
      cwd: root,
      env: { ...process.env, VISUAL_REVIEW_STAGE: process.env.VISUAL_REVIEW_STAGE || "revised" },
      encoding: "utf8",
      timeout: 110_000,
    },
  );

  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
});
