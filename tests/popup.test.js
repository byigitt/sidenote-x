import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";

await import("../src/core.js");
await import("../src/popup.js");

function documentFrom(markup = '<main><div id="note-list"></div></main>') {
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

test("renderNotes explains the empty state", () => {
  const document = documentFrom();
  globalThis.SidenotePopup.renderNotes(document, [], {});
  assert.match(document.body.textContent, /No private notes yet/i);
});

test("renderNotes creates editable cards without interpolating note HTML", () => {
  const document = documentFrom();
  const notes = [{ handle: "ada", text: "<b>Compiler expert</b>", updatedAt: 1 }];
  globalThis.SidenotePopup.renderNotes(document, notes, {});

  const card = document.querySelector("[data-handle='ada']");
  assert.equal(card.querySelector("textarea").value, "<b>Compiler expert</b>");
  assert.equal(card.querySelector("b"), null);
  assert.equal(card.querySelector("a").getAttribute("href"), "https://x.com/ada");
});

test("renderNotes tolerates legacy records with invalid dates", () => {
  const document = documentFrom();
  assert.doesNotThrow(() => globalThis.SidenotePopup.renderNotes(document, [
    { handle: "ada", text: "safe", updatedAt: 1e100 },
  ], {}));
});

test("renderNotes wires save and delete actions", async () => {
  const document = documentFrom();
  const calls = [];
  const notes = [{ handle: "ada", text: "old", updatedAt: 1 }];
  globalThis.SidenotePopup.renderNotes(document, notes, {
    save: async (handle, text) => calls.push(["save", handle, text]),
    remove: async (handle) => calls.push(["remove", handle]),
  });

  const card = document.querySelector("[data-handle='ada']");
  card.querySelector("textarea").value = "new";
  card.querySelector("form").dispatchEvent(new document.defaultView.Event("submit", { bubbles: true, cancelable: true }));
  card.querySelector("[data-action='delete']").click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, [["save", "ada", "new"], ["remove", "ada"]]);
});

test("popup exposes labelled note input and keyboard-operable import button", async () => {
  const html = await readFile(new URL("../src/popup.html", import.meta.url), "utf8");
  const document = new JSDOM(html).window.document;

  assert.equal(document.querySelector('label[for="new-text"]').textContent.trim(), "Private note");
  const importButton = document.querySelector("#import-trigger");
  assert.equal(importButton.tagName, "BUTTON");
  assert.equal(importButton.type, "button");
});

test("profile editor window prefills the requested handle and existing note", async () => {
  const html = await readFile(new URL("../src/popup.html", import.meta.url), "utf8");
  const document = new JSDOM(html).window.document;

  const populated = globalThis.SidenotePopup.prefillRequestedEditor(
    document,
    "?handle=@Ada",
    { ada: { handle: "ada", text: "Compiler expert", updatedAt: 1 } },
  );

  assert.equal(populated, true);
  assert.equal(document.querySelector("#new-handle").value, "ada");
  assert.equal(document.querySelector("#new-text").value, "Compiler expert");
  assert.equal(document.querySelector("#new-note-form button[type=submit]").textContent, "UPDATE NOTE");
});

test("profile editor closes its Chromium window after saving", async () => {
  const removed = [];
  await globalThis.SidenotePopup.closeEditorWindow({
    getCurrent: async () => ({ id: 9, type: "popup" }),
    remove: async (id) => removed.push(id),
  });
  await globalThis.SidenotePopup.closeEditorWindow({
    getCurrent: async () => ({ id: 10, type: "normal" }),
    remove: async (id) => removed.push(id),
  });
  assert.deepEqual(removed, [9]);
});
