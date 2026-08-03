(() => {
  const STORAGE_KEY = "sidenoteNotes";
  const core = globalThis.SidenoteCore;

  async function getAll() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ?? {};
  }

  async function write(notes) {
    await chrome.storage.local.set({ [STORAGE_KEY]: notes });
    return notes;
  }

  async function save(handle, text, updatedAt = Date.now()) {
    return write(core.upsertNote(await getAll(), handle, text, updatedAt));
  }

  async function remove(handle) {
    return write(core.removeNote(await getAll(), handle));
  }

  async function clear() {
    return write({});
  }

  async function exportNotes() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      notes: core.filterNotes(await getAll()),
    };
  }

  async function importNotes(payload) {
    if (!payload || payload.version !== 1 || !Array.isArray(payload.notes)) {
      throw new Error("Unsupported Sidenote backup format.");
    }

    let notes = await getAll();
    let imported = 0;
    for (const record of payload.notes) {
      const handle = core.normalizeHandle(record?.handle);
      const text = core.normalizeNote(record?.text);
      if (!handle || !text) continue;
      const updatedAt = Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now();
      notes = core.upsertNote(notes, handle, text, updatedAt);
      imported += 1;
    }
    await write(notes);
    return imported;
  }

  function subscribe(callback) {
    const listener = (changes, areaName) => {
      if (areaName === "local" && changes[STORAGE_KEY]) {
        callback(changes[STORAGE_KEY].newValue ?? {});
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  globalThis.SidenoteStorage = Object.freeze({
    STORAGE_KEY,
    getAll,
    save,
    remove,
    clear,
    exportNotes,
    importNotes,
    subscribe,
  });
})();
