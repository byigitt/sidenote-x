import test from "node:test";
import assert from "node:assert/strict";

await import("../src/worker.js");

test("worker routes every storage command through the serialized store", async () => {
  const calls = [];
  const store = {
    getAll: async () => ({ ada: {} }),
    save: async (...args) => { calls.push(["save", ...args]); return "saved"; },
    remove: async (...args) => { calls.push(["remove", ...args]); return "removed"; },
    clear: async () => "cleared",
    exportNotes: async () => ({ version: 1 }),
    importNotes: async (...args) => { calls.push(["import", ...args]); return 2; },
  };
  const handle = globalThis.SidenoteWorker.createHandler(store, {
    openEditor: async (...args) => { calls.push(["openEditor", ...args]); return "opened"; },
  });

  assert.deepEqual(await handle({ type: "sidenote:getAll" }), { ada: {} });
  assert.equal(await handle({ type: "sidenote:save", handle: "ada", text: "A", updatedAt: 1 }), "saved");
  assert.equal(await handle({ type: "sidenote:remove", handle: "ada" }), "removed");
  assert.equal(await handle({ type: "sidenote:clear" }), "cleared");
  assert.deepEqual(await handle({ type: "sidenote:export" }), { version: 1 });
  assert.equal(await handle({ type: "sidenote:import", payload: { version: 1 } }), 2);
  assert.equal(await handle({ type: "sidenote:openEditor", handle: "ada" }), "opened");
  assert.deepEqual(calls, [
    ["save", "ada", "A", 1],
    ["remove", "ada"],
    ["import", { version: 1 }],
    ["openEditor", "ada"],
  ]);
});

test("worker rejects unknown commands", async () => {
  const handle = globalThis.SidenoteWorker.createHandler({});
  await assert.rejects(handle({ type: "sidenote:unknown" }), /Unknown Sidenote command/);
});

test("editor action validates the handle and opens an extension-origin window", async () => {
  const windows = [];
  const openEditor = globalThis.SidenoteWorker.createEditorAction({
    normalizeHandle: (value) => value.replace(/^@/, "").toLowerCase(),
    getURL: (path) => `chrome-extension://id/${path}`,
    createWindow: async (options) => { windows.push(options); return { id: 7 }; },
  });

  assert.deepEqual(await openEditor("@Ada"), { opened: true });
  assert.deepEqual(windows, [{
    url: "chrome-extension://id/src/popup.html?handle=ada",
    type: "popup",
    width: 430,
    height: 680,
    focused: true,
  }]);
});

test("storage readiness gate fails closed before any command runs", async () => {
  let handled = false;
  const gated = globalThis.SidenoteWorker.gateHandler(
    async () => { handled = true; },
    Promise.resolve({ ok: false, error: new Error("storage isolation failed") }),
  );

  await assert.rejects(gated({ type: "sidenote:getAll" }), /storage isolation failed/);
  assert.equal(handled, false);
});
