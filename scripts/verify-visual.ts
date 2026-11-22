import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import unzipper from "unzipper";
import type { LeftPanel, SafariPageDocument } from "../src/types";

const root = process.cwd();
const runtimeDir = path.resolve(root, "runtime", "visual-verification");
const databasePath = path.join(runtimeDir, "visual.sqlite");
const mediaDir = path.join(runtimeDir, "media");
const outputDir = path.resolve(root, "artifacts", "visual-verification");
const origin = "http://127.0.0.1:3217";
const edgePath =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

if (!runtimeDir.startsWith(path.resolve(root, "runtime") + path.sep))
  throw new Error(
    "Visual runtime path escaped the workspace runtime directory.",
  );
fs.rmSync(runtimeDir, { recursive: true, force: true });
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(mediaDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
process.env.DATABASE_PATH = databasePath;
process.env.MEDIA_STORAGE_DIR = mediaDir;
process.env.NEXT_PUBLIC_SITE_URL = origin;
process.env.TOKEN_HASH_KEY = "visual-verification-only-key-32-characters";

const [{ db, migrate }, pagesModule, authCore] = await Promise.all([
  import("../src/lib/db"),
  import("../src/lib/pages"),
  import("../src/lib/auth-core"),
]);
const { createPage, getPage, publishPage } = pagesModule;
migrate();

const archive = await unzipper.Open.file(
  path.resolve(root, "assets", "SafariForge-images.zip"),
);
const requested = [
  "SafariForge-images/Tarangire Elephants.jpg",
  "SafariForge-images/Elephants_4.jpeg.jpg",
  "SafariForge-images/Elephants_1.jpeg.jpg",
  "SafariForge-images/Elephant.jpeg.jpg",
  "SafariForge-images/Cheetahs.jpeg.jpg",
  "SafariForge-images/Lions at Ngorongoro Crater.jpg",
  "SafariForge-images/Pride of Lion.jpeg.jpg",
];
const sourceFiles = new Map(archive.files.map((entry) => [entry.path, entry]));
const mediaIds: string[] = [];
for (const [index, sourceName] of requested.entries()) {
  const entry = sourceFiles.get(sourceName);
  if (!entry) throw new Error(`Missing visual fixture ${sourceName}`);
  const data = await entry.buffer();
  const id = `visual-media-${index + 1}`;
  const storageKey = `${crypto.randomUUID()}.jpg`;
  const thumbnailKey = `${crypto.randomUUID()}.jpg`;
  fs.writeFileSync(path.join(mediaDir, storageKey), data);
  fs.writeFileSync(path.join(mediaDir, thumbnailKey), data);
  db()
    .prepare(
      "INSERT INTO media(id,storage_key,thumbnail_key,original_name,mime_type,size_bytes,sha256,width,height,tags_json,alt_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      storageKey,
      thumbnailKey,
      `visual-${index + 1}.jpg`,
      "image/jpeg",
      data.length,
      crypto.randomUUID(),
      1600,
      1067,
      '["visual-verification"]',
      [
        "Elephant hero",
        "Elephant herd",
        "Elephant portrait",
        "Elephant landscape",
        "Cheetahs",
        "Lions",
        "Lion pride",
      ][index],
      new Date().toISOString(),
    );
  mediaIds.push(id);
}

const positions = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;
let firstPageId = "";
for (const [index, overlayPosition] of positions.entries()) {
  const created = createPage(`Visual ${overlayPosition}`);
  if (index === 0) firstPageId = created.id;
  const draft = getPage(created.id, "draft")!;
  const document: SafariPageDocument = {
    leftPanel: {
      eyebrow: "A SUB SECTION",
      title: "Title Safari Page With A Deliberately Long Editorial Heading",
      location: "Serengeti, Tanzania",
      date: `2027-01-0${index + 1}`,
      heroMediaId: mediaIds[index],
      overlayPosition,
      objectPosition: "50% 50%",
    },
    rightPanel: {
      blocks: [
        { id: `heading-${index}`, type: "heading", text: "First header" },
        ...(index === 0
          ? [
              {
                id: "existing-image-block",
                type: "imageGrid" as const,
                mediaIds: mediaIds.slice(4, 7),
              },
            ]
          : [
              {
                id: `paragraph-${index}`,
                type: "paragraph" as const,
                text: "A quiet editorial passage confirms the two-panel visitor layout.",
              },
            ]),
      ],
    },
  };
  const published = publishPage(created.id, document, draft.revisionId, draft.revisionVersion);
  if (index === 0) {
    const legacy = structuredClone(document) as SafariPageDocument & { leftPanel: SafariPageDocument["leftPanel"] & { startDate?: string; endDate?: string } };
    delete legacy.leftPanel.date;
    legacy.leftPanel.startDate = "2027-01-01";
    legacy.leftPanel.endDate = "2027-01-02";
    db().prepare("UPDATE safari_page_revisions SET document_json=? WHERE id=?").run(JSON.stringify(legacy), published.published.revisionId);
  }
}
const adminToken = authCore.randomToken();
db()
  .prepare(
    "INSERT INTO credentials(role,token_hash,version,rotated_at) VALUES('ADMIN',?,1,?)",
  )
  .run(authCore.secretHash(adminToken), new Date().toISOString());
const adminAccessUrl = `${origin}/access/admin?token=${adminToken}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function verifyPosition(
  page: Page,
  index: number,
  position: LeftPanel["overlayPosition"],
) {
  const spread = page.locator(".safari-spread").nth(index);
  await spread.scrollIntoViewIfNeeded();
  const hero = await spread.locator(".spread-hero").boundingBox();
  const copy = await spread.locator(".spread-copy").boundingBox();
  assert(hero && copy, `${position}: missing measurable hero/copy geometry`);
  const top = copy.y - hero.y;
  const left = copy.x - hero.x;
  const right = hero.x + hero.width - (copy.x + copy.width);
  const bottom = hero.y + hero.height - (copy.y + copy.height);
  assert(
    top >= -1 && left >= -1 && right >= -1 && bottom >= -1,
    `${position}: copy escaped the hero`,
  );
  if (position?.startsWith("top")) {
    assert(
      top >= 80 && top <= hero.height * 0.35,
      `${position}: top inset ${top} is outside the upper hero region`,
    );
  } else {
    assert(
      bottom >= 20 && bottom <= 80,
      `${position}: bottom inset ${bottom} is not near the lower edge`,
    );
  }
  if (position?.endsWith("left")) {
    assert(
      left >= 20 && left <= 80 && right > left,
      `${position}: left alignment is not visually distinct`,
    );
  } else {
    assert(
      right >= 20 && right <= 80 && left > right,
      `${position}: right alignment is not visually distinct`,
    );
  }
  const titleContained = await spread
    .locator(".spread-copy h2")
    .evaluate((title) => title.scrollWidth <= title.clientWidth + 1);
  assert(
    titleContained,
    `${position}: long title overflowed its available column width`,
  );
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Visual verification server did not become ready");
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", "3217"],
  { cwd: root, env: process.env, stdio: "ignore", windowsHide: true },
);
try {
  await waitForServer();
  assert(fs.existsSync(edgePath), "Microsoft Edge executable was not found");
  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
  });
  try {
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1600, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.locator(".spread-hero > img").first().waitFor();
      const loadedImages = await page
        .locator(".spread-hero > img, .carousel > img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        );
      assert(loadedImages, "A hero or carousel fixture failed to load");
      for (const [index, position] of positions.entries()) {
        await verifyPosition(page, index, position);
        await page
          .locator(".safari-spread")
          .nth(index)
          .screenshot({
            path: path.join(
              outputDir,
              `${viewport.width}x${viewport.height}-${position}.png`,
            ),
          });
      }
      const heroDate = page.locator(".safari-spread").first().locator(".spread-copy time");
      assert((await heroDate.count()) === 1, "Left hero did not render exactly one date");
      assert((await heroDate.textContent())?.trim() === "January 1, 2027", "Left hero date was not the expected single formatted calendar date");
      const carousel = page
        .locator(".safari-spread")
        .first()
        .locator(".carousel");
      await carousel.scrollIntoViewIfNeeded();
      assert(
        (await carousel.locator("img").count()) === 1,
        "Legacy imageGrid did not show exactly one image",
      );
      assert(
        (await page.locator(".spread-story .image-grid").count()) === 0,
        "Legacy imageGrid retained a tiled fallback",
      );
      assert(
        (await carousel.locator(".carousel-position").textContent())?.trim() ===
          "1 / 3",
        "Initial carousel counter was not 1 / 3",
      );
      await carousel.screenshot({
        path: path.join(
          outputDir,
          `${viewport.width}x${viewport.height}-carousel-first.png`,
        ),
      });
      const firstSource = await carousel.locator("img").getAttribute("src");
      await carousel.getByRole("button", { name: "Next image" }).click();
      assert(
        (await carousel.locator(".carousel-position").textContent())?.trim() ===
          "2 / 3",
        "Next did not advance the counter to 2 / 3",
      );
      assert(
        (await carousel.locator("img").getAttribute("src")) !== firstSource,
        "Next did not change the visible image",
      );
      await carousel.screenshot({
        path: path.join(
          outputDir,
          `${viewport.width}x${viewport.height}-carousel-second.png`,
        ),
      });
      await page.goto(adminAccessUrl, { waitUntil: "networkidle" });
      await page.goto(`${origin}/admin/pages/${firstPageId}/preview`, {
        waitUntil: "networkidle",
      });
      assert(
        await page.locator(".preview-banner").isVisible(),
        "Authenticated draft preview did not load",
      );
      await verifyPosition(page, 0, "top-left");
      assert(
        (await page.locator(".carousel img").count()) === 1,
        "Draft preview did not use the shared carousel presentation",
      );
      assert(
        (await page.locator(".spread-story .image-grid").count()) === 0,
        "Draft preview retained a tiled imageGrid fallback",
      );
      await page.goto(`${origin}/admin/pages/${firstPageId}`, {
        waitUntil: "networkidle",
      });
      assert(
        (await page
          .locator(".add-content button")
          .filter({ hasText: /^carousel/i })
          .count()) === 1,
        "Editor does not expose one clear Carousel add action",
      );
      assert(
        (await page
          .locator(".add-content button")
          .filter({ hasText: /image grid/i })
          .count()) === 0,
        "Editor still exposes a new Image grid action",
      );
      assert(
        await page.getByText("Carousel (legacy image block)").isVisible(),
        "Editor did not retain and identify the existing legacy image block",
      );
      assert((await page.locator('input[type="date"]').count()) === 1, "Editor did not expose exactly one date input");
      assert(await page.getByLabel("Page Date").isVisible(), "Editor page date input was not labeled");
      const editCopy = await page
        .locator(".hero-edit .spread-copy")
        .boundingBox();
      const editTools = await page
        .locator(".hero-edit .hero-tools")
        .boundingBox();
      assert(editCopy && editTools, "Editor hero controls were not measurable");
      const controlsOverlapCopy = !(
        editCopy.x + editCopy.width <= editTools.x ||
        editTools.x + editTools.width <= editCopy.x ||
        editCopy.y + editCopy.height <= editTools.y ||
        editTools.y + editTools.height <= editCopy.y
      );
      assert(
        !controlsOverlapCopy,
        "Editor hero controls obscured the selected text corner",
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(
    JSON.stringify(
      {
        viewports: ["1366x768", "1600x900", "1920x1080"],
        positions,
        carousel: ["first", "second"],
        screenshots: outputDir,
      },
      null,
      2,
    ),
  );
} finally {
  server.kill();
}
