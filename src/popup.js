(() => {
  const core = globalThis.SidenoteCore;
  const storage = globalThis.SidenoteStorage;

  function renderNotes(doc, notes, handlers = {}) {
    const list = doc.querySelector("#note-list");
    list.replaceChildren();
    if (!notes.length) {
      const empty = doc.createElement("div");
      empty.className = "empty";
      empty.innerHTML = "<strong>No private notes yet.</strong><span>Add one here or open a profile on X.</span>";
      list.append(empty);
      return;
    }

    for (const note of notes) {
      const card = doc.createElement("article");
      card.className = "note-card";
      card.dataset.handle = note.handle;
      const head = doc.createElement("div");
      head.className = "note-card-head";
      const link = doc.createElement("a");
      link.href = `https://x.com/${note.handle}`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `@${note.handle}`;
      const time = doc.createElement("time");
      const updatedAt = core.normalizeTimestamp(note.updatedAt, 0);
      const updatedDate = new Date(updatedAt);
      time.dateTime = updatedDate.toISOString();
      time.textContent = updatedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      head.append(link, time);

      const form = doc.createElement("form");
      const textarea = doc.createElement("textarea");
      textarea.maxLength = core.MAX_NOTE_LENGTH;
      textarea.value = note.text;
      textarea.setAttribute("aria-label", `Private note for @${note.handle}`);
      const actions = doc.createElement("div");
      actions.className = "note-actions";
      const remove = doc.createElement("button");
      remove.type = "button";
      remove.dataset.action = "delete";
      remove.textContent = "Delete";
      const save = doc.createElement("button");
      save.type = "submit";
      save.dataset.action = "save";
      save.textContent = "Save";
      actions.append(remove, save);
      form.append(textarea, actions);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await handlers.save?.(note.handle, textarea.value);
      });
      remove.addEventListener("click", async () => handlers.remove?.(note.handle));
      card.append(head, form);
      list.append(card);
    }
  }

  function downloadBackup(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sidenote-x-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function updateEditorCount(doc) {
    const text = doc.querySelector("#new-text").value;
    doc.querySelector("#editor-count").textContent = `${text.length}/${core.MAX_NOTE_LENGTH}`;
  }

  function enterEditorMode(doc, handle, title = "Add private note") {
    doc.body.classList.add("editor-mode");
    doc.querySelector(".wordmark").textContent = title;
    doc.querySelector("#editor-handle").textContent = `@${handle}`;
    const label = doc.querySelector("#new-note-form > label");
    label.textContent = "Private note";
  }

  function prefillRequestedEditor(doc, search, notes) {
    const handle = core.normalizeHandle(new URLSearchParams(search).get("handle"));
    if (!handle) return false;
    const text = notes[handle]?.text ?? "";
    enterEditorMode(doc, handle, text ? "Edit private note" : "Add private note");
    doc.querySelector("#new-handle").value = handle;
    doc.querySelector("#new-text").value = text;
    doc.querySelector("#new-note-form button[type=submit]").textContent = text ? "Update note" : "Save note";
    updateEditorCount(doc);
    doc.querySelector("#new-text").focus();
    return true;
  }

  async function closeEditorWindow(windowsApi) {
    const current = await windowsApi.getCurrent();
    if (current?.id !== undefined && current.type === "popup") await windowsApi.remove(current.id);
  }

  function start() {
    let notes = {};
    const requestedHandle = core.normalizeHandle(new URLSearchParams(window.location.search).get("handle"));
    const search = document.querySelector("#search");
    const status = document.querySelector("#status");
    if (requestedHandle) enterEditorMode(document, requestedHandle);
    const update = () => {
      const filtered = core.filterNotes(notes, search.value);
      renderNotes(document, filtered, {
        save: async (handle, text) => {
          await storage.save(handle, text);
          status.textContent = `Saved @${handle} locally.`;
        },
        remove: async (handle) => {
          await storage.remove(handle);
          status.textContent = `Removed @${handle}.`;
        },
      });
      const count = Object.keys(notes).length;
      document.querySelector("#note-total").textContent = `${count} ${count === 1 ? "note" : "notes"}`;
    };

    storage.getAll().then((stored) => {
      notes = stored;
      prefillRequestedEditor(document, window.location.search, notes);
      update();
    });
    storage.subscribe((stored) => { notes = stored; update(); });
    search.addEventListener("input", update);
    document.querySelector("#new-text").addEventListener("input", () => updateEditorCount(document));
    document.querySelector("#editor-cancel").addEventListener("click", async () => {
      if (requestedHandle) await closeEditorWindow(chrome.windows);
    });
    document.querySelector("#new-note-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      await storage.save(data.get("handle"), data.get("text"));
      form.reset();
      status.textContent = "Note saved locally.";
      if (core.normalizeHandle(new URLSearchParams(window.location.search).get("handle"))) {
        await closeEditorWindow(chrome.windows);
      }
    });
    document.querySelector("#export").addEventListener("click", async () => {
      downloadBackup(await storage.exportNotes());
      status.textContent = "Backup exported.";
    });
    document.querySelector("#import-trigger").addEventListener("click", () => document.querySelector("#import").click());
    document.querySelector("#import").addEventListener("change", async (event) => {
      try {
        const file = event.target.files[0];
        if (!file) return;
        const count = await storage.importNotes(JSON.parse(await file.text()));
        status.textContent = `Imported ${count} note${count === 1 ? "" : "s"}.`;
      } catch {
        status.textContent = "That file is not a valid Sidenote backup.";
      } finally {
        event.target.value = "";
      }
    });
    document.querySelector("#clear").addEventListener("click", async () => {
      if (confirm("Delete every private Sidenote from this browser?")) {
        await storage.clear();
        status.textContent = "All notes cleared.";
      }
    });
  }

  globalThis.SidenotePopup = Object.freeze({ renderNotes, downloadBackup, prefillRequestedEditor, closeEditorWindow });
  if (typeof document !== "undefined" && storage) start();
})();
