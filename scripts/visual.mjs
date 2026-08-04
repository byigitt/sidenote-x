import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "evidence");
const noteText = "Reliable on technical topics; tends to repost the same AI directory thread.";
const feedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}.shell{width:min(600px,100%);margin:auto;min-height:100vh;border-inline:1px solid #2f3336}h1{padding:16px;margin:0;border-bottom:1px solid #2f3336;font-size:20px}article{display:grid;grid-template-columns:48px minmax(0,1fr);gap:12px;padding:12px 16px;border-bottom:1px solid #2f3336}.avatar{width:40px;height:40px;border-radius:50%;background:#536471}.tweet-content{min-width:0}a{color:inherit;text-decoration:none}.handle{color:#71767b}.post{margin:6px 0 10px;font-size:17px;line-height:1.35}.actions{height:28px;margin-top:4px;color:#71767b;font-size:13px}
</style></head><body><main class="shell"><h1>Home</h1><article data-testid="tweet"><div class="avatar"></div><div class="tweet-content"><div data-testid="User-Name"><a href="/ada"><b>Ada Lovelace</b> <span class="handle">@ada</span></a></div><div data-testid="tweetText" class="post">The Analytical Engine weaves algebraic patterns just as the Jacquard loom weaves flowers and leaves.</div><div role="group" aria-label="Tweet actions" class="actions">Reply · Repost · Like</div></div></article></main></body></html>`;

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 760, height: 500 }, colorScheme: "dark" });
try {
  await page.route("https://x.com/home", (route) => route.fulfill({ status: 200, contentType: "text/html", body: feedHtml }));
  await page.goto("https://x.com/home");
  await page.addScriptTag({ path: path.join(root, "src/core.js") });
  await page.evaluate((text) => {
    globalThis.SidenoteStorage = {
      getAll: async () => ({ ada: { handle: "ada", text, updatedAt: Date.now() } }),
      subscribe: () => () => {},
      openEditor: async () => {},
    };
  }, noteText);
  await page.addScriptTag({ path: path.join(root, "src/content.js") });
  const note = page.locator(".sidenote-feed-note");
  await note.waitFor({ state: "visible" });
  await page.locator('article[data-testid="tweet"]').screenshot({ path: path.join(evidenceDir, "after-feed-desktop.png") });

  await page.setViewportSize({ width: 420, height: 500 });
  await page.locator('article[data-testid="tweet"]').screenshot({ path: path.join(evidenceDir, "after-feed-narrow.png") });
  console.log(`Visual evidence written to ${evidenceDir}`);
} finally {
  await browser.close();
}
