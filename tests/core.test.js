import test from "node:test";
import assert from "node:assert/strict";

await import("../src/core.js");
const { normalizeHandle, normalizeNote, upsertNote, removeNote, filterNotes } = globalThis.SidenoteCore;

test("normalizeHandle strips @ and normalizes case", () => {
  assert.equal(normalizeHandle("  @Jack  "), "jack");
});

test("normalizeHandle rejects invalid X handles", () => {
  assert.equal(normalizeHandle("not a handle"), "");
  assert.equal(normalizeHandle("a".repeat(16)), "");
});

test("normalizeNote trims text and limits it to 280 characters", () => {
  assert.equal(normalizeNote(`  ${"a".repeat(300)}  `), "a".repeat(280));
});

test("upsertNote creates a normalized immutable record", () => {
  const source = {};
  const result = upsertNote(source, "@Ada", "  Trustworthy on compilers. ", 1234);

  assert.deepEqual(result, {
    ada: { handle: "ada", text: "Trustworthy on compilers.", updatedAt: 1234 },
  });
  assert.deepEqual(source, {});
});

test("upsertNote removes a record when its text is empty", () => {
  const result = upsertNote({ ada: { handle: "ada", text: "old", updatedAt: 1 } }, "ada", " ", 2);
  assert.deepEqual(result, {});
});

test("removeNote leaves the input untouched", () => {
  const source = { ada: { handle: "ada", text: "old", updatedAt: 1 } };
  const result = removeNote(source, "@ADA");
  assert.deepEqual(result, {});
  assert.equal(source.ada.text, "old");
});

test("filterNotes searches handles and text and sorts newest first", () => {
  const notes = {
    ada: { handle: "ada", text: "Compiler expert", updatedAt: 2 },
    bob: { handle: "bob", text: "Posts about databases", updatedAt: 3 },
  };

  assert.deepEqual(filterNotes(notes, "compiler").map((note) => note.handle), ["ada"]);
  assert.deepEqual(filterNotes(notes, "").map((note) => note.handle), ["bob", "ada"]);
});
