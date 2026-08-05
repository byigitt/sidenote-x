import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "evidence");
const noteText = "Reliable on technical topics; tends to repost the same AI directory thread.";
const profileHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}.shell{width:min(600px,100%);margin:auto;min-height:100vh;border-inline:1px solid #2f3336}.cover{height:150px;background:#333639}.profile{padding:16px}.avatar{width:88px;height:88px;margin-top:-60px;background:#536471;border:4px solid #000;border-radius:50%}.name{margin-top:12px;font-size:21px;font-weight:700}.handle{color:#71767b}.bio{margin:14px 0 0;line-height:20px}
</style></head><body><main class="shell"><div class="cover"></div><div class="profile"><div class="avatar"></div><div data-testid="UserName"><div class="name">Ada Lovelace</div><div class="handle">@ada</div></div><p class="bio">Poetical science, analytical engines, and impossible ideas.</p></div></main></body></html>`;
const feedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}.shell{width:min(600px,100%);margin:auto;min-height:100vh;border-inline:1px solid #2f3336}h1{padding:16px;margin:0;border-bottom:1px solid #2f3336;font-size:20px}article{display:grid;grid-template-columns:48px minmax(0,1fr);gap:12px;padding:12px 16px;border-bottom:1px solid #2f3336}.avatar{width:40px;height:40px;border-radius:50%;background:#536471}.tweet-content{min-width:0}a{color:inherit;text-decoration:none}.handle{color:#71767b}.post{margin:6px 0 10px;font-size:17px;line-height:1.35}.action-wrapper{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));min-width:0}.actions{grid-column:1/-1;height:28px;margin-top:4px;color:#71767b;font-size:13px}
</style></head><body><main class="shell"><h1>Home</h1><article data-testid="tweet"><div class="avatar"></div><div class="tweet-content"><div data-testid="User-Name"><a href="/ada"><b>Ada Lovelace</b> <span class="handle">@ada</span></a></div><div data-testid="tweetText" class="post">The Analytical Engine weaves algebraic patterns just as the Jacquard loom weaves flowers and leaves.</div><div class="action-wrapper"><div role="group" aria-label="Tweet actions" class="actions">Reply · Repost · Like</div></div></div></article></main></body></html>`;

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

  const profile = await browser.newPage({ viewport: { width: 760, height: 620 }, colorScheme: "dark" });
  await profile.route("https://x.com/ada", (route) => route.fulfill({ status: 200, contentType: "text/html", body: profileHtml }));
  await profile.goto("https://x.com/ada");
  await profile.addScriptTag({ path: path.join(root, "src/core.js") });
  await profile.evaluate((text) => {
    globalThis.SidenoteStorage = {
      getAll: async () => ({ ada: { handle: "ada", text, updatedAt: Date.now() } }),
      subscribe: () => () => {},
      openEditor: async () => {},
    };
  }, noteText);
  await profile.addScriptTag({ path: path.join(root, "src/content.js") });
  await profile.locator(".sidenote-composer").waitFor({ state: "visible" });
  await profile.locator("main").screenshot({ path: path.join(evidenceDir, "after-profile-desktop.png") });
  await profile.close();

  const [popupHtml, popupCss] = await Promise.all([
    readFile(path.join(root, "src/popup.html"), "utf8"),
    readFile(path.join(root, "src/popup.css"), "utf8"),
  ]);
  const popup = await browser.newPage({ viewport: { width: 400, height: 680 }, colorScheme: "dark" });
  await popup.setContent(
    popupHtml
      .replace('<link rel="stylesheet" href="popup.css">', `<style>${popupCss}</style>`)
      .replace(/<script[^>]*><\/script>/g, ""),
  );
  await popup.screenshot({ path: path.join(evidenceDir, "after-popup.png"), fullPage: true });
  await popup.close();

  const editorMarkup = popupHtml
    .replace('<link rel="stylesheet" href="popup.css">', `<style>${popupCss}</style>`)
    .replace(/<script[^>]*><\/script>/g, "");
  const editor = await browser.newPage({ viewport: { width: 520, height: 470 }, colorScheme: "dark" });
  await editor.route("https://extension.test/src/popup.html?handle=ada", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: editorMarkup,
  }));
  await editor.goto("https://extension.test/src/popup.html?handle=ada");
  await editor.addScriptTag({ path: path.join(root, "src/core.js") });
  await editor.evaluate((text) => {
    globalThis.SidenoteStorage = {
      getAll: async () => ({ ada: { handle: "ada", text, updatedAt: Date.now() } }),
      subscribe: () => () => {},
      save: async () => {},
      remove: async () => {},
      clear: async () => {},
      exportNotes: async () => ({}),
      importNotes: async () => 0,
    };
  }, noteText);
  await editor.addScriptTag({ path: path.join(root, "src/popup.js") });
  await editor.locator("body.editor-mode").waitFor();
  await editor.screenshot({ path: path.join(evidenceDir, "after-editor.png"), fullPage: true });
  await editor.close();
  console.log(`Visual evidence written to ${evidenceDir}`);
} finally {
  await browser.close();
}
