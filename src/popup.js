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
      time.dateTime = new Date(note.updatedAt).toISOString();
      time.textContent = new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
      remove.textContent = "DELETE";
      const save = doc.createElement("button");
      save.type = "submit";
      save.dataset.action = "save";
      save.textContent = "SAVE";
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

  function start() {
    let notes = {};
    const search = document.querySelector("#search");
    const status = document.querySelector("#status");
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
      document.querySelector("#note-total").textContent = `${Object.keys(notes).length} NOTES`;
    };

    storage.getAll().then((stored) => { notes = stored; update(); });
    storage.subscribe((stored) => { notes = stored; update(); });
    search.addEventListener("input", update);
    document.querySelector("#new-note-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      await storage.save(data.get("handle"), data.get("text"));
      event.currentTarget.reset();
      status.textContent = "Note saved locally.";
    });
    document.querySelector("#export").addEventListener("click", async () => {
      downloadBackup(await storage.exportNotes());
      status.textContent = "Backup exported.";
    });
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

  globalThis.SidenotePopup = Object.freeze({ renderNotes, downloadBackup });
  if (typeof document !== "undefined" && storage) start();
})();
