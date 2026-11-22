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
  "SafariForge-images/Baby Gazelle at Ngorongoro.jpg",
  "SafariForge-images/Serengeti Vast Plain.jpg",
  "SafariForge-images/Zebra_1.jpeg.jpg",
  "SafariForge-images/Girrafes.jpeg.jpg",
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
        "Baby gazelle",
        "Serengeti plain",
        "Zebra",
        "Giraffes",
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
      title: index === 0 ? "Title Safari Page With A Deliberately Long Editorial Heading" : ["", "Across the open plains", "Wildlife at the crater", "A final evening"] [index],
      location: "Serengeti, Tanzania",
      date: `2027-01-0${index + 1}`,
      heroMediaId: mediaIds[index],
      overlayPosition,
      objectPosition: "50% 50%",
    },
    rightPanel: {
      blocks: [
        { id: `heading-${index}`, type: "heading", text: `Editorial chapter ${index + 1}` },
        ...(index === 0
          ? [
              {
                id: "existing-image-block",
                type: "imageGrid" as const,
                mediaIds: mediaIds.slice(4, 7),
              },
            ]
          : index < 3 ? [
              {
                id: `carousel-${index}`,
                type: "carousel" as const,
                mediaIds: index === 1 ? mediaIds.slice(7, 9) : mediaIds.slice(9, 11),
              },
              {
                id: `paragraph-${index}`,
                type: "paragraph" as const,
                text: index === 1 ? "A quiet editorial passage confirms the two-panel visitor layout. ".repeat(24) : "A distinct editorial passage accompanies this page's own hero.",
              },
            ] : [{ id: `paragraph-${index}`, type: "paragraph" as const, text: "The closing page remains paired with its own photographic hero." }]),
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
  position: LeftPanel["overlayPosition"],
  index = 0,
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
        .locator(".spread-hero > img, .carousel-viewport > img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        );
      assert(loadedImages, "A hero or carousel fixture failed to load");
      assert((await page.locator(".safari-spread").count()) === 4, "Public journal did not render all four Safari Pages continuously");
      assert((await page.locator(".page-navigation, .page-position").count()) === 0, "Manual Safari Page navigation remained visible");
      assert((await page.getByRole("button", { name: /Safari Page/ }).count()) === 0, "Previous or next Safari Page controls remained visible");
      assert((await page.getByRole("dialog", { name: "Table of Contents" }).count()) === 0, "Table of Contents was open initially");
      assert((await page.getByText("A SUB SECTION", { exact: true }).count()) === 0, "A SUB SECTION remained visible to public visitors");
      const dates = await page.locator(".safari-spread .spread-copy time").allTextContents();
      assert(dates.join("|") === "January 1, 2027|January 2, 2027|January 3, 2027|January 4, 2027", "Safari Page dates did not remain paired and ordered");
      const heroSources = await page.locator(".safari-spread .spread-hero > img").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).getAttribute("src")));
      assert(new Set(heroSources).size === 4, "Safari Page spreads did not retain four distinct heroes");
      for (let index = 0; index < 4; index++) {
        const spread = page.locator(".safari-spread").nth(index);
        assert((await spread.locator(".spread-hero").count()) === 1 && (await spread.locator(".spread-story").count()) === 1, `Spread ${index + 1} did not contain its paired hero and story`);
        assert(await spread.getByText(`Editorial chapter ${index + 1}`, { exact: true }).isVisible(), `Spread ${index + 1} lost its editorial content`);
      }
      const longSpreadHeight = await page.locator(".safari-spread").nth(1).evaluate((spread) => spread.getBoundingClientRect().height);
      assert(longSpreadHeight > viewport.height * 1.5, "Long editorial content was clipped to a viewport-height spread");
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
          "01 / 03 photos",
        "Initial carousel counter was not 01 / 03 PHOTOS",
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
          "02 / 03 photos",
        "Next did not advance the counter to 02 / 03 PHOTOS",
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
      const secondCarousel = page.locator(".safari-spread").nth(1).locator(".carousel");
      assert((await secondCarousel.locator(".carousel-position").textContent())?.trim() === "01 / 02 photos", "Second carousel did not keep independent initial state");
      for (const [index, position] of positions.entries()) {
        await verifyPosition(page, position, index);
        await page.locator(".safari-spread").nth(index).screenshot({
          path: path.join(outputDir, `${viewport.width}x${viewport.height}-${position}.png`),
        });
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      const scrollBefore = await page.evaluate(() => window.scrollY);
      const secondTop = await page.locator(".safari-spread").nth(1).evaluate((section) => (section as HTMLElement).offsetTop);
      await page.mouse.wheel(0, secondTop + 10);
      await page.waitForFunction((minimum) => window.scrollY >= minimum, Math.min(secondTop, viewport.height));
      const scrollAfter = await page.evaluate(() => window.scrollY);
      assert(scrollAfter > scrollBefore, "Ordinary vertical scrolling did not advance to the next complete spread");
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), secondTop);
      const secondSectionId = await page.locator(".safari-spread").nth(1).getAttribute("id");
      await page.getByRole("button", { name: "Open Table of Contents" }).click();
      const contents = page.getByRole("dialog", { name: "Table of Contents" });
      assert(await contents.isVisible(), "Table of Contents did not open from the menu icon");
      await page.waitForFunction((id) => document.querySelector('#journal-contents a[aria-current="location"]')?.getAttribute("href") === `#${id}`, secondSectionId);
      await contents.getByRole("link", { name: /Wildlife at the crater/ }).click();
      assert((await contents.count()) === 0, "Table of Contents did not close after section selection");
      assert(page.url().endsWith(`#page-${encodeURIComponent((await page.locator(".safari-spread").nth(2).getAttribute("id"))!.replace(/^page-/, ""))}`), "Section selection did not update the fragment URL");
      await page.reload({ waitUntil: "networkidle" });
      assert(page.url().includes("#page-"), "Direct section fragment did not survive refresh");
      assert(await page.locator(".safari-spread").nth(2).isVisible(), "Direct section refresh did not retain the target spread");
      await page.goto(adminAccessUrl, { waitUntil: "networkidle" });
      await page.goto(`${origin}/admin/pages/${firstPageId}/preview`, {
        waitUntil: "networkidle",
      });
      assert(
        await page.locator(".preview-banner").isVisible(),
        "Authenticated draft preview did not load",
      );
      await verifyPosition(page, "top-left");
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
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(origin, { waitUntil: "networkidle" });
    assert((await mobile.locator(".safari-spread").count()) === 4, "Mobile journal did not render every spread");
    assert((await mobile.locator(".page-navigation").count()) === 0, "Safari Page navigation remained on mobile");
    assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "Mobile journal introduced horizontal scrolling");
    await mobile.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const mobileBefore = await mobile.evaluate(() => window.scrollY);
    const mobileSecondTop = await mobile.locator(".safari-spread").nth(1).evaluate((section) => (section as HTMLElement).offsetTop);
    await mobile.mouse.wheel(0, mobileSecondTop + 10);
    await mobile.waitForFunction((minimum) => window.scrollY >= minimum, Math.min(mobileSecondTop, 844));
    assert((await mobile.evaluate(() => window.scrollY)) > mobileBefore, "Mobile journal did not advance through natural scrolling");
    assert(await mobile.locator(".safari-spread").nth(1).getByText("Editorial chapter 2", { exact: true }).isVisible(), "Mobile second spread lost its paired editorial panel");
    assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "Scrolled mobile journal introduced horizontal scrolling");
    await mobile.screenshot({ path: path.join(outputDir, "390x844-mobile.png"), fullPage: true });
    await mobile.close();
  } finally {
    await browser.close();
  }
  console.log(
    JSON.stringify(
      {
        viewports: ["1366x768", "1600x900", "1920x1080", "390x844"],
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
