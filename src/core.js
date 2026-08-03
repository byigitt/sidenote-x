(() => {
  const MAX_NOTE_LENGTH = 280;
  const HANDLE_PATTERN = /^[a-zA-Z0-9_]{1,15}$/;

  function normalizeHandle(value) {
    const handle = String(value ?? "").trim().replace(/^@/, "").toLowerCase();
    return HANDLE_PATTERN.test(handle) ? handle : "";
  }

  function normalizeNote(value) {
    return String(value ?? "").trim().slice(0, MAX_NOTE_LENGTH);
  }

  function removeNote(notes, handle) {
    const normalizedHandle = normalizeHandle(handle);
    const next = { ...notes };
    if (normalizedHandle) delete next[normalizedHandle];
    return next;
  }

  function upsertNote(notes, handle, text, updatedAt = Date.now()) {
    const normalizedHandle = normalizeHandle(handle);
    const normalizedText = normalizeNote(text);
    if (!normalizedHandle) return { ...notes };
    if (!normalizedText) return removeNote(notes, normalizedHandle);

    return {
      ...notes,
      [normalizedHandle]: {
        handle: normalizedHandle,
        text: normalizedText,
        updatedAt,
      },
    };
  }

  function filterNotes(notes, query = "") {
    const normalizedQuery = String(query).trim().toLowerCase();
    return Object.values(notes ?? {})
      .filter((note) =>
        !normalizedQuery ||
        note.handle.toLowerCase().includes(normalizedQuery) ||
        note.text.toLowerCase().includes(normalizedQuery),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  globalThis.SidenoteCore = Object.freeze({
    MAX_NOTE_LENGTH,
    normalizeHandle,
    normalizeNote,
    upsertNote,
    removeNote,
    filterNotes,
  });
})();
