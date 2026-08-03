import test from "node:test";
import assert from "node:assert/strict";

function createChrome(responder) {
  const listeners = new Set();
  const messages = [];
  return {
    chrome: {
      runtime: {
        async sendMessage(message) {
          messages.push(structuredClone(message));
          return responder(message);
        },
        onMessage: {
          addListener(listener) {
            listeners.add(listener);
          },
          removeListener(listener) {
            listeners.delete(listener);
          },
        },
      },
    },
    messages,
    emit(message) {
      for (const listener of listeners) listener(message);
    },
  };
}

test("storage client delegates reads and mutations to the extension worker", async () => {
  const fake = createChrome((message) => ({ ok: true, value: message.type === "sidenote:getAll" ? { ada: { text: "A" } } : "written" }));
  globalThis.chrome = fake.chrome;
  await import(`../src/storage.js?client=${Date.now()}`);
  const storage = globalThis.SidenoteStorage;

  assert.deepEqual(await storage.getAll(), { ada: { text: "A" } });
  assert.equal(await storage.save("@Ada", "note", 42), "written");
  assert.equal(await storage.openEditor("Ada"), "written");
  assert.deepEqual(fake.messages, [
    { type: "sidenote:getAll" },
    { type: "sidenote:save", handle: "@Ada", text: "note", updatedAt: 42 },
    { type: "sidenote:openEditor", handle: "Ada" },
  ]);
});

test("storage client surfaces worker failures", async () => {
  const fake = createChrome(() => ({ ok: false, error: "storage unavailable" }));
  globalThis.chrome = fake.chrome;
  await import(`../src/storage.js?error=${Date.now()}`);

  await assert.rejects(globalThis.SidenoteStorage.clear(), /storage unavailable/);
});

test("storage subscriptions receive worker broadcasts and can unsubscribe", async () => {
  const fake = createChrome(() => ({ ok: true }));
  globalThis.chrome = fake.chrome;
  await import(`../src/storage.js?subscribe=${Date.now()}`);
  const seen = [];
  const unsubscribe = globalThis.SidenoteStorage.subscribe((notes) => seen.push(notes));

  fake.emit({ type: "sidenote:changed", notes: { ada: { text: "new" } } });
  unsubscribe();
  fake.emit({ type: "sidenote:changed", notes: { bob: { text: "later" } } });

  assert.deepEqual(seen, [{ ada: { text: "new" } }]);
});
