import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

await import("../src/core.js");

function loadMarkup(markup = "", url = "https://x.com/home") {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, { url });
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
  assert.equal(ui.profileHandleFromPath("/premium"), "");
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

test("profile card keeps note text closed and opens an extension-origin editor", async () => {
  loadMarkup();
  const opens = [];
  const composer = ui.createComposer(document, "ada", "Compiler expert", async (handle) => opens.push(handle));
  document.body.append(composer);

  assert.equal(composer.shadowRoot, null);
  assert.equal(composer.querySelector("textarea"), null);
  assert.doesNotMatch(document.body.textContent, /Compiler expert/);

  const root = ui.shadowRootFor(composer);
  assert.equal(root.querySelector("textarea"), null);
  assert.match(root.textContent, /Only you can see this/i);
  assert.match(root.textContent, /Compiler expert/i);

  root.querySelector("button").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(opens, ["ada"]);
});

test("decorateTweet hides notes from the host DOM and refreshes exact text", () => {
  loadMarkup(`
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/ada"><span>@ada</span></a></div>
      <div data-testid="tweetText">hello</div>
    </article>
  `);
  const article = document.querySelector("article");

  ui.decorateTweet(article, { ada: { handle: "ada", text: "Long compiler expert note", updatedAt: 1 } });
  ui.decorateTweet(article, { ada: { handle: "ada", text: "compiler expert", updatedAt: 2 } });

  const annotation = article.querySelector(".sidenote-feed-note");
  assert.equal(article.querySelectorAll(".sidenote-feed-note").length, 1);
  assert.doesNotMatch(article.textContent, /compiler expert/i);
  assert.match(ui.shadowRootFor(annotation).textContent, /compiler expert/);
  assert.doesNotMatch(ui.shadowRootFor(annotation).textContent, /Long compiler/);
});

test("renderProfile refreshes the open composer after an external note change", () => {
  loadMarkup('<main><div data-testid="UserName">@ada</div></main>', "https://x.com/ada");
  const save = async () => {};

  ui.renderProfile(document, { ada: { handle: "ada", text: "old", updatedAt: 1 } }, save);
  ui.renderProfile(document, { ada: { handle: "ada", text: "new", updatedAt: 2 } }, save);

  const composer = document.querySelector(".sidenote-composer");
  assert.match(ui.shadowRootFor(composer).textContent, /new/);
  assert.doesNotMatch(ui.shadowRootFor(composer).textContent, /old/);
});
