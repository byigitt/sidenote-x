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
  const handle = globalThis.SidenoteWorker.createHandler(store);

  assert.deepEqual(await handle({ type: "sidenote:getAll" }), { ada: {} });
  assert.equal(await handle({ type: "sidenote:save", handle: "ada", text: "A", updatedAt: 1 }), "saved");
  assert.equal(await handle({ type: "sidenote:remove", handle: "ada" }), "removed");
  assert.equal(await handle({ type: "sidenote:clear" }), "cleared");
  assert.deepEqual(await handle({ type: "sidenote:export" }), { version: 1 });
  assert.equal(await handle({ type: "sidenote:import", payload: { version: 1 } }), 2);
  assert.deepEqual(calls, [
    ["save", "ada", "A", 1],
    ["remove", "ada"],
    ["import", { version: 1 }],
  ]);
});

test("worker rejects unknown commands", async () => {
  const handle = globalThis.SidenoteWorker.createHandler({});
  await assert.rejects(handle({ type: "sidenote:unknown" }), /Unknown Sidenote command/);
});
