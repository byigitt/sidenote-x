import { chromium } from "playwright";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userDataDir = path.join(root, ".tmp-chromium-profile");

const profileHtml = `<!doctype html><html><head><style>
  body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}.shell{width:600px;margin:auto;min-height:100vh;border-inline:1px solid #2f3336}.cover{height:160px;background:#333639}.profile{padding:16px}.avatar{width:96px;height:96px;border:4px solid #000;border-radius:50%;margin-top:-68px;background:#777}.name{margin-top:14px;font-size:21px;font-weight:700}.handle,.bio{color:#71767b}.bio{margin-top:14px;color:#e7e9ea}
</style></head><body><main class="shell"><div class="cover"></div><div class="profile"><div class="avatar"></div><div data-testid="UserName"><div class="name">Ada Lovelace</div><div class="handle">@ada</div></div><p class="bio">Poetical science, analytical engines, and impossible ideas.</p></div></main></body></html>`;

const feedHtml = `<!doctype html><html><head><style>
  body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}.shell{width:600px;margin:auto;min-height:100vh;border-inline:1px solid #2f3336}h1{padding:16px;margin:0;border-bottom:1px solid #2f3336;font-size:20px}article{padding:16px;border-bottom:1px solid #2f3336}a{color:inherit;text-decoration:none}.post{margin:10px 0;font-size:17px}
</style></head><body><main class="shell"><h1>Home</h1><article data-testid="tweet"><div data-testid="User-Name"><a href="/ada"><b>Ada Lovelace</b> <span>@ada</span></a></div><div data-testid="tweetText" class="post">The Analytical Engine weaves algebraic patterns just as the Jacquard loom weaves flowers and leaves.</div></article></main></body></html>`;

const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("ok");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  viewport: { width: 1100, height: 820 },
});

try {
  await context.route("https://x.com/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({ status: 200, contentType: "text/html", body: pathname === "/home" ? feedHtml : profileHtml });
  });

  const page = await context.newPage();
  await page.goto("https://x.com/ada");
  const composer = page.locator(".sidenote-composer");
  await composer.waitFor({ state: "visible" });
  await composer.locator("textarea").fill("Trustworthy on technical history.");
  await composer.locator("button[type=submit]").click();
  await composer.getByText("Saved locally").waitFor();
  await page.goto("https://x.com/home");
  const feedNote = page.locator(".sidenote-feed-note");
  await feedNote.waitFor({ state: "visible" });
  const text = await feedNote.textContent();
  if (!text.includes("Trustworthy on technical history.")) throw new Error("Saved note did not appear in the feed.");
  console.log("Extension smoke test passed: profile save persisted into the feed.");
} finally {
  await context.close();
  server.close();
}
