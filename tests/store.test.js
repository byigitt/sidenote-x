import test from "node:test";
import assert from "node:assert/strict";

await import("../src/core.js");
await import("../src/store.js");

function createAdapter(initial = {}) {
  let notes = structuredClone(initial);
  return {
    async read() {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return structuredClone(notes);
    },
    async write(next) {
      await new Promise((resolve) => setTimeout(resolve, 2));
      notes = structuredClone(next);
    },
    value() {
      return structuredClone(notes);
    },
  };
}

test("store serializes concurrent saves so neither note is lost", async () => {
  const adapter = createAdapter();
  const store = globalThis.SidenoteStore.create(adapter);

  await Promise.all([
    store.save("ada", "A", 1),
    store.save("bob", "B", 2),
  ]);

  assert.deepEqual(Object.keys(adapter.value()).sort(), ["ada", "bob"]);
});

test("store serializes save and remove against the same latest snapshot", async () => {
  const adapter = createAdapter({ ada: { handle: "ada", text: "old", updatedAt: 1 } });
  const store = globalThis.SidenoteStore.create(adapter);

  await Promise.all([
    store.save("bob", "new", 2),
    store.remove("ada"),
  ]);

  assert.deepEqual(adapter.value(), { bob: { handle: "bob", text: "new", updatedAt: 2 } });
});

test("store normalizes imported timestamps to a renderable date", async () => {
  const adapter = createAdapter();
  const store = globalThis.SidenoteStore.create(adapter);

  const count = await store.importNotes({
    version: 1,
    notes: [{ handle: "ada", text: "valid", updatedAt: 1e100 }],
  }, 123);

  assert.equal(count, 1);
  assert.equal(adapter.value().ada.updatedAt, 123);
  assert.doesNotThrow(() => new Date(adapter.value().ada.updatedAt).toISOString());
});
