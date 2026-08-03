import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

await import("../src/core.js");

function loadMarkup(markup = "") {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, { url: "https://x.com/home" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;
  return dom;
}

loadMarkup();
await import("../src/content.js");
const ui = globalThis.SidenoteUI;

test("profileHandleFromPath recognizes user profiles but not X routes", () => {
  assert.equal(ui.profileHandleFromPath("/satyanadella"), "satyanadella");
  assert.equal(ui.profileHandleFromPath("/@jack"), "jack");
  assert.equal(ui.profileHandleFromPath("/home"), "");
  assert.equal(ui.profileHandleFromPath("/search?q=test"), "");
  assert.equal(ui.profileHandleFromPath("/long_handle_over_15"), "");
});

test("tweetHandle finds a valid profile link inside a post", () => {
  loadMarkup(`
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/Ada"><span>@Ada</span></a></div>
    </article>
  `);

  assert.equal(ui.tweetHandle(document.querySelector("article")), "ada");
});

test("createComposer renders an existing private note and saves edits", async () => {
  loadMarkup();
  const saves = [];
  const composer = ui.createComposer(document, "ada", "Compiler expert", async (handle, text) => {
    saves.push([handle, text]);
  });
  document.body.append(composer);

  const textarea = composer.querySelector("textarea");
  assert.equal(textarea.value, "Compiler expert");
  assert.match(composer.textContent, /Only you can see this/i);

  textarea.value = "Trustworthy on compilers";
  composer.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(saves, [["ada", "Trustworthy on compilers"]]);
});

test("decorateTweet adds one local note and remains idempotent", () => {
  loadMarkup(`
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/ada"><span>@ada</span></a></div>
      <div data-testid="tweetText">hello</div>
    </article>
  `);
  const article = document.querySelector("article");
  const notes = { ada: { handle: "ada", text: "Compiler expert", updatedAt: 1 } };

  ui.decorateTweet(article, notes);
  ui.decorateTweet(article, notes);

  assert.equal(article.querySelectorAll(".sidenote-feed-note").length, 1);
  assert.match(article.textContent, /Compiler expert/);
});
