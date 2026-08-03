(() => {
  const core = globalThis.SidenoteCore;

  function create(adapter) {
    let queue = Promise.resolve();

    function enqueue(operation) {
      const result = queue.then(operation, operation);
      queue = result.then(() => undefined, () => undefined);
      return result;
    }

    async function publish(notes) {
      await adapter.write(notes);
      try {
        await adapter.notify?.(notes);
      } catch {
        // Persistence succeeded; a sleeping view will refresh on its next read.
      }
      return notes;
    }

    function getAll() {
      return enqueue(async () => (await adapter.read()) ?? {});
    }

    function save(handle, text, updatedAt = Date.now()) {
      return enqueue(async () => publish(core.upsertNote((await adapter.read()) ?? {}, handle, text, updatedAt)));
    }

    function remove(handle) {
      return enqueue(async () => publish(core.removeNote((await adapter.read()) ?? {}, handle)));
    }

    function clear() {
      return enqueue(async () => publish({}));
    }

    function exportNotes() {
      return enqueue(async () => ({
        version: 1,
        exportedAt: new Date().toISOString(),
        notes: core.filterNotes((await adapter.read()) ?? {}),
      }));
    }

    function importNotes(payload, fallbackTime = Date.now()) {
      return enqueue(async () => {
        if (!payload || payload.version !== 1 || !Array.isArray(payload.notes)) {
          throw new Error("Unsupported Sidenote backup format.");
        }

        let notes = (await adapter.read()) ?? {};
        let imported = 0;
        for (const record of payload.notes) {
          const handle = core.normalizeHandle(record?.handle);
          const text = core.normalizeNote(record?.text);
          if (!handle || !text) continue;
          const updatedAt = core.normalizeTimestamp(record.updatedAt, fallbackTime);
          notes = core.upsertNote(notes, handle, text, updatedAt);
          imported += 1;
        }
        await publish(notes);
        return imported;
      });
    }

    return Object.freeze({ getAll, save, remove, clear, exportNotes, importNotes });
  }

  globalThis.SidenoteStore = Object.freeze({ create });
})();
