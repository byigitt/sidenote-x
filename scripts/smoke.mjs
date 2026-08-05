import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userDataDir = await mkdtemp(path.join(tmpdir(), "sidenote-x-smoke-"));
const noteText = "Trustworthy on technical history.";
const updatedNoteText = "Reliable on technical topics; tends to repost the same AI directory thread.";


const profileHtml = `<!doctype html><html><head><style>
  body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}.shell{width:600px;margin:auto;min-height:100vh;border-inline:1px solid #2f3336}.cover{height:160px;background:#333639}.profile{padding:16px}.avatar{width:96px;height:96px;border:4px solid #000;border-radius:50%;margin-top:-68px;background:#777}.name{margin-top:14px;font-size:21px;font-weight:700}.handle{color:#71767b}.bio{margin-top:14px}
</style></head><body><main class="shell"><div class="cover"></div><div class="profile"><div class="avatar"></div><div data-testid="UserName"><div class="name">Ada Lovelace</div><div class="handle">@ada</div></div><p class="bio">Poetical science, analytical engines, and impossible ideas.</p></div></main></body></html>`;

const feedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#000;color:#e7e9ea;font:15px Arial,sans-serif}.shell{width:min(600px,100%);margin:auto;min-height:100vh;border-inline:1px solid #2f3336}h1{padding:16px;margin:0;border-bottom:1px solid #2f3336;font-size:20px}article{display:grid;grid-template-columns:48px minmax(0,1fr);gap:12px;padding:12px 16px;border-bottom:1px solid #2f3336}.avatar{width:40px;height:40px;border-radius:50%;background:#536471}.tweet-content{min-width:0}a{color:inherit;text-decoration:none}.handle{color:#71767b}.post{margin:6px 0 10px;font-size:17px;line-height:1.35}.action-wrapper{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));min-width:0}.actions{grid-column:1/-1;height:28px;margin-top:4px;color:#71767b;font-size:13px}
</style></head><body><main class="shell"><h1>Home</h1><article data-testid="tweet"><div class="avatar"></div><div class="tweet-content"><div data-testid="User-Name"><a href="/ada"><b>Ada Lovelace</b> <span class="handle">@ada</span></a></div><div data-testid="tweetText" class="post">The Analytical Engine weaves algebraic patterns just as the Jacquard loom weaves flowers and leaves.</div><div class="action-wrapper"><div role="group" aria-label="Tweet actions" class="actions">Reply · Repost · Like</div></div></div></article></main></body></html>`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function accessibilityIncludes(page, text) {
  const session = await page.context().newCDPSession(page);
  const tree = await session.send("Accessibility.getFullAXTree");
  await session.detach();
  return tree.nodes.some((node) => node.name?.value?.includes(text) || node.value?.value?.includes(text));
}

async function waitForAccessibility(page, text, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await accessibilityIncludes(page, text)) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`Accessible text “${text}” was not found.`);
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

let context;
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    viewport: { width: 1100, height: 820 },
  });

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
    window.__sidenoteCapturedKeys = [];
    window.addEventListener("keydown", (event) => window.__sidenoteCapturedKeys.push(event.key), true);
    const host = document.querySelector(".sidenote-composer");
    return {
      closed: host.shadowRoot === null,
      noControls: host.querySelector("button,textarea,form") === null,
      noText: host.textContent === "",
    };
  });
  assert(initialIsolation.closed && initialIsolation.noControls && initialIsolation.noText, "Host page could inspect the profile card.");

  await page.evaluate(() => {
    const probe = document.createElement("input");
    probe.id = "host-keyboard-probe";
    document.body.append(probe);
  });
  await page.locator("#host-keyboard-probe").click();
  await page.keyboard.type("probe");
  assert(
    (await page.evaluate(() => window.__sidenoteCapturedKeys.join(""))) === "probe",
    "Hostile keyboard probe was not sensitive to real keydown events.",
  );
  await page.evaluate(() => {
    window.__sidenoteCapturedKeys = [];
    document.querySelector("#host-keyboard-probe").remove();
  });

  const editorPromise = context.waitForEvent("page");
  await clickAccessibleNode(page, "button", "Add note");
  const editor = await editorPromise;
  await editor.waitForURL(new RegExp(`^chrome-extension://${extensionId}/src/popup\\.html\\?handle=ada$`));
  assert(await editor.locator("#new-handle").inputValue() === "ada", "Editor did not prefill the profile handle.");
  const editorLayout = await editor.evaluate(() => {
    const body = document.body.getBoundingClientRect();
    const textarea = document.querySelector("#new-text").getBoundingClientRect();
    return {
      editorMode: document.body.classList.contains("editor-mode"),
      title: document.querySelector(".wordmark").textContent,
      handle: document.querySelector("#editor-handle").textContent,
      privacy: document.querySelector(".editor-meta").textContent,
      textareaHeight: textarea.height,
      overflow: Math.max(0, body.width - innerWidth, document.documentElement.scrollHeight - innerHeight),
    };
  });
  assert(editorLayout.editorMode && editorLayout.title === "Add private note", "Profile editor did not enter its X-native add-note mode.");
  assert(editorLayout.handle === "@ada" && editorLayout.privacy.includes("Only you can see this"), "Editor identity or privacy cue was missing.");
  assert(editorLayout.textareaHeight >= 124 && editorLayout.overflow <= 0, "Editor modal clipped or overflowed its Chromium window.");
  await editor.locator("#new-text").click();
  await editor.keyboard.type(noteText);
  assert(await editor.locator("#editor-count").textContent() === `${noteText.length}/280`, "Editor character count did not update while typing.");
  const editorErrors = [];
  editor.on("pageerror", (error) => editorErrors.push(error.message));
  editor.on("console", (message) => {
    if (message.type() === "error") editorErrors.push(message.text());
  });
  const editorClosed = editor.waitForEvent("close");
  await editor.locator('#new-note-form button[type="submit"]').click();
  const closeOutcome = await Promise.race([
    editorClosed.then(() => "closed"),
    new Promise((resolve) => setTimeout(() => resolve("open"), 3000)),
  ]);
  if (closeOutcome !== "closed") {
    const diagnostic = {
      url: editor.url(),
      status: await editor.locator("#status").textContent(),
      errors: editorErrors,
    };
    throw new Error(`Extension editor did not close: ${JSON.stringify(diagnostic)}`);
  }

  assert((await page.evaluate(() => window.__sidenoteCapturedKeys)).length === 0, "X captured keystrokes typed into the extension editor.");
  await waitForAccessibility(page, noteText);
  await waitForAccessibility(page, "Edit note");

  const hostileAttempt = await page.evaluate((secret) => {
    const host = document.querySelector(".sidenote-composer");
    host.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return {
      closed: host.shadowRoot === null,
      noSecret: !host.textContent.includes(secret),
      noControls: host.querySelector("button,textarea,form") === null,
    };
  }, noteText);
  assert(hostileAttempt.closed && hostileAttempt.noSecret && hostileAttempt.noControls, "Host page reached private note content or controls.");

  const feedPage = await context.newPage();
  await feedPage.goto("https://x.com/home");
  await feedPage.locator(".sidenote-feed-note").waitFor({ state: "visible" });
  await waitForAccessibility(feedPage, noteText);

  const editEditorPromise = context.waitForEvent("page");
  await clickAccessibleNode(page, "button", "Edit note");
  const editEditor = await editEditorPromise;
  await editEditor.waitForURL(new RegExp(`^chrome-extension://${extensionId}/src/popup\\.html\\?handle=ada$`));
  assert(await editEditor.locator("#new-text").inputValue() === noteText, "Edit window did not prefill the existing note.");
  assert(await editEditor.locator(".wordmark").textContent() === "Edit private note", "Existing note did not open in X-native edit mode.");
  assert(await editEditor.locator("#editor-count").textContent() === `${noteText.length}/280`, "Edit window character count did not match the existing note.");
  await editEditor.locator("#new-text").click();
  await editEditor.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await editEditor.keyboard.type(updatedNoteText);
  const editClosed = editEditor.waitForEvent("close");
  await editEditor.locator('#new-note-form button[type="submit"]').click();
  await editClosed;

  assert((await page.evaluate(() => window.__sidenoteCapturedKeys)).length === 0, "X captured keystrokes typed into the edit window.");
  await waitForAccessibility(page, updatedNoteText);
  await waitForAccessibility(feedPage, updatedNoteText);
  assert(!(await accessibilityIncludes(feedPage, noteText)), "Open feed retained the stale note after an edit.");

  const desktopLayout = await feedPage.evaluate(() => {
    const host = document.querySelector(".sidenote-feed-note");
    const content = document.querySelector(".tweet-content");
    const hostBox = host.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return {
      parentClass: host.parentElement.className,
      nextClass: host.nextElementSibling?.className,
      widthDelta: Math.abs(hostBox.width - contentBox.width),
      leftDelta: Math.abs(hostBox.left - contentBox.left),
      height: hostBox.height,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert(desktopLayout.parentClass === "tweet-content", "Feed note escaped X's tweet content column.");
  assert(desktopLayout.nextClass === "action-wrapper", "Feed note was inserted inside X's action grid instead of before it.");
  assert(desktopLayout.widthDelta <= 1 && desktopLayout.leftDelta <= 1, "Feed note did not fill and align with the tweet content column.");
  assert(desktopLayout.height <= 96 && desktopLayout.overflow <= 0, "Feed note wrapped into an oversized or overflowing desktop card.");

  await feedPage.setViewportSize({ width: 420, height: 760 });
  const narrowLayout = await feedPage.evaluate(() => {
    const host = document.querySelector(".sidenote-feed-note");
    const content = document.querySelector(".tweet-content");
    const hostBox = host.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return {
      widthDelta: Math.abs(hostBox.width - contentBox.width),
      height: hostBox.height,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert(narrowLayout.widthDelta <= 1, "Feed note lost its content-column width on a narrow viewport.");
  assert(narrowLayout.height <= 120 && narrowLayout.overflow <= 0, "Feed note overflowed or stacked into a vertical strip on a narrow viewport.");

  const manager = await context.newPage();
  await manager.goto(`chrome-extension://${extensionId}/src/popup.html`);
  const savedCard = manager.locator('[data-handle="ada"]');
  await savedCard.waitFor();
  assert(await savedCard.locator("textarea").inputValue() === updatedNoteText, "Edited profile note did not persist through the worker.");

  const raceResponses = await manager.evaluate(async () => Promise.all([
    chrome.runtime.sendMessage({ type: "sidenote:save", handle: "bob", text: "B", updatedAt: 2 }),
    chrome.runtime.sendMessage({ type: "sidenote:save", handle: "eve", text: "E", updatedAt: 3 }),
  ]));
  assert(raceResponses.every((response) => response.ok), "Concurrent worker writes failed.");
  await manager.reload();
  await manager.locator('[data-handle="bob"]').waitFor();
  await manager.locator('[data-handle="eve"]').waitFor();

  const feedIsolation = await feedPage.evaluate((secret) => {
    const host = document.querySelector(".sidenote-feed-note");
    return host.shadowRoot === null && !host.textContent.includes(secret);
  }, updatedNoteText);
  assert(feedIsolation, "Host page could read the feed annotation.");
  assert(await accessibilityIncludes(feedPage, updatedNoteText), "The private note was not rendered in Chromium's accessibility tree.");

  console.log("Extension security smoke passed: extension-origin editing, closed DOM, serialized writes, profile-to-feed persistence.");
} finally {
  if (context) await context.close();
  await rm(userDataDir, { recursive: true, force: true });
}
