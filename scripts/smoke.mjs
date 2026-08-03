import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userDataDir = path.join(root, ".tmp-chromium-profile");
const noteText = "Trustworthy on technical history.";

const profileHtml = `<!doctype html><html><head><style>
  body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}.shell{width:600px;margin:auto;min-height:100vh;border-inline:1px solid #2f3336}.cover{height:160px;background:#333639}.profile{padding:16px}.avatar{width:96px;height:96px;border:4px solid #000;border-radius:50%;margin-top:-68px;background:#777}.name{margin-top:14px;font-size:21px;font-weight:700}.handle{color:#71767b}.bio{margin-top:14px}
</style></head><body><main class="shell"><div class="cover"></div><div class="profile"><div class="avatar"></div><div data-testid="UserName"><div class="name">Ada Lovelace</div><div class="handle">@ada</div></div><p class="bio">Poetical science, analytical engines, and impossible ideas.</p></div></main></body></html>`;

const feedHtml = `<!doctype html><html><head><style>
  body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}.shell{width:600px;margin:auto;min-height:100vh;border-inline:1px solid #2f3336}h1{padding:16px;margin:0;border-bottom:1px solid #2f3336;font-size:20px}article{padding:16px;border-bottom:1px solid #2f3336}a{color:inherit;text-decoration:none}.post{margin:10px 0;font-size:17px}
</style></head><body><main class="shell"><h1>Home</h1><article data-testid="tweet"><div data-testid="User-Name"><a href="/ada"><b>Ada Lovelace</b> <span>@ada</span></a></div><div data-testid="tweetText" class="post">The Analytical Engine weaves algebraic patterns just as the Jacquard loom weaves flowers and leaves.</div></article></main></body></html>`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function accessibilityIncludes(page, text) {
  const session = await page.context().newCDPSession(page);
  const tree = await session.send("Accessibility.getFullAXTree");
  await session.detach();
  return tree.nodes.some((node) => node.name?.value?.includes(text) || node.value?.value?.includes(text));
}

async function clickAccessibleNode(page, role, name) {
  const session = await page.context().newCDPSession(page);
  const tree = await session.send("Accessibility.getFullAXTree");
  const node = tree.nodes.find((candidate) => candidate.role?.value === role && candidate.name?.value === name);
  assert(node?.backendDOMNodeId, `Accessible ${role} “${name}” was not found.`);
  const { model } = await session.send("DOM.getBoxModel", { backendNodeId: node.backendDOMNodeId });
  await session.detach();
  const quad = model.border;
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  await page.mouse.click(x, y);
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  viewport: { width: 1100, height: 820 },
});

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;

  await context.route("https://x.com/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({ status: 200, contentType: "text/html", body: pathname === "/home" ? feedHtml : profileHtml });
  });

  const page = await context.newPage();
  await page.goto("https://x.com/ada");
  const composer = page.locator(".sidenote-composer");
  await composer.waitFor({ state: "visible" });

  const initialIsolation = await page.evaluate(() => {
    const host = document.querySelector(".sidenote-composer");
    return { closed: host.shadowRoot === null, noTextarea: host.querySelector("textarea") === null, noText: !host.textContent.includes("SIDENOTE") };
  });
  assert(initialIsolation.closed && initialIsolation.noTextarea && initialIsolation.noText, "Host page could inspect the closed composer.");

  await clickAccessibleNode(page, "textbox", "Private note for @ada");
  await page.keyboard.type(noteText);
  await clickAccessibleNode(page, "button", "SAVE NOTE");

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
  const savedCard = popup.locator('[data-handle="ada"]');
  await savedCard.waitFor();
  assert(await savedCard.locator("textarea").inputValue() === noteText, "Profile note did not persist through the worker.");

  const hostileAttempt = await page.evaluate(() => {
    const host = document.querySelector(".sidenote-composer");
    host.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return { closed: host.shadowRoot === null, text: host.textContent, textarea: host.querySelector("textarea") };
  });
  assert(hostileAttempt.closed && hostileAttempt.text === "" && hostileAttempt.textarea === null, "Host page reached private note controls.");

  const raceResponses = await popup.evaluate(async () => Promise.all([
    chrome.runtime.sendMessage({ type: "sidenote:save", handle: "bob", text: "B", updatedAt: 2 }),
    chrome.runtime.sendMessage({ type: "sidenote:save", handle: "eve", text: "E", updatedAt: 3 }),
  ]));
  assert(raceResponses.every((response) => response.ok), "Concurrent worker writes failed.");
  await popup.reload();
  await popup.locator('[data-handle="bob"]').waitFor();
  await popup.locator('[data-handle="eve"]').waitFor();

  await page.goto("https://x.com/home");
  const feedNote = page.locator(".sidenote-feed-note");
  await feedNote.waitFor({ state: "visible" });
  const feedIsolation = await page.evaluate((secret) => {
    const host = document.querySelector(".sidenote-feed-note");
    return host.shadowRoot === null && !host.textContent.includes(secret);
  }, noteText);
  assert(feedIsolation, "Host page could read the feed annotation.");
  assert(await accessibilityIncludes(page, noteText), "The private note was not rendered in Chromium's accessibility tree.");

  console.log("Extension security smoke passed: closed DOM, serialized writes, profile-to-feed persistence.");
} finally {
  await context.close();
}
