import test from "node:test";
import assert from "node:assert/strict";

await import("../src/core.js");

function createChrome(initial = {}) {
  let state = structuredClone(initial);
  const listeners = new Set();
  return {
    chrome: {
      storage: {
        local: {
          async get(key) {
            return { [key]: structuredClone(state[key]) };
          },
          async set(value) {
            const previous = structuredClone(state);
            state = { ...state, ...structuredClone(value) };
            for (const listener of listeners) {
              listener(
                Object.fromEntries(Object.keys(value).map((key) => [key, { oldValue: previous[key], newValue: state[key] }])),
                "local",
              );
            }
          },
        },
        onChanged: {
          addListener(listener) {
            listeners.add(listener);
          },
          removeListener(listener) {
            listeners.delete(listener);
          },
        },
      },
    },
    read() {
      return structuredClone(state);
    },
  };
}

test("storage returns an empty note collection on first run", async () => {
  const fake = createChrome();
  globalThis.chrome = fake.chrome;
  await import(`../src/storage.js?empty=${Date.now()}`);

  assert.deepEqual(await globalThis.SidenoteStorage.getAll(), {});
});

test("storage saves and deletes normalized notes", async () => {
  const fake = createChrome({ sidenoteNotes: {} });
  globalThis.chrome = fake.chrome;
  await import(`../src/storage.js?write=${Date.now()}`);
  const storage = globalThis.SidenoteStorage;

  await storage.save("@Ada", "  Compiler expert  ", 42);
  assert.deepEqual(fake.read().sidenoteNotes.ada, {
    handle: "ada",
    text: "Compiler expert",
    updatedAt: 42,
  });

  await storage.remove("ADA");
  assert.deepEqual(fake.read().sidenoteNotes, {});
});

test("storage imports valid records and ignores malformed entries", async () => {
  const fake = createChrome({ sidenoteNotes: { existing: { handle: "existing", text: "keep", updatedAt: 1 } } });
  globalThis.chrome = fake.chrome;
  await import(`../src/storage.js?import=${Date.now()}`);

  const count = await globalThis.SidenoteStorage.importNotes({
    version: 1,
    notes: [
      { handle: "@Ada", text: "Good source", updatedAt: 5 },
      { handle: "bad handle", text: "ignored", updatedAt: 6 },
      { handle: "empty", text: "   ", updatedAt: 7 },
    ],
  });

  assert.equal(count, 1);
  assert.deepEqual(Object.keys(fake.read().sidenoteNotes).sort(), ["ada", "existing"]);
});

test("storage subscriptions receive changes and can unsubscribe", async () => {
  const fake = createChrome({ sidenoteNotes: {} });
  globalThis.chrome = fake.chrome;
  await import(`../src/storage.js?subscribe=${Date.now()}`);
  const seen = [];
  const unsubscribe = globalThis.SidenoteStorage.subscribe((notes) => seen.push(notes));

  await globalThis.SidenoteStorage.save("ada", "new", 10);
  unsubscribe();
  await globalThis.SidenoteStorage.save("bob", "later", 11);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].ada.text, "new");
});
