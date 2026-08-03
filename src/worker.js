(() => {
  function createHandler(store, actions = {}) {
    return async function handle(message) {
      switch (message?.type) {
        case "sidenote:getAll": return store.getAll();
        case "sidenote:save": return store.save(message.handle, message.text, message.updatedAt);
        case "sidenote:remove": return store.remove(message.handle);
        case "sidenote:clear": return store.clear();
        case "sidenote:export": return store.exportNotes();
        case "sidenote:import": return store.importNotes(message.payload);
        case "sidenote:openEditor": return actions.openEditor(message.handle);
        default: throw new Error("Unknown Sidenote command.");
      }
    };
  }

  function createEditorAction({ normalizeHandle, getURL, createWindow }) {
    return async function openEditor(rawHandle) {
      const handle = normalizeHandle(rawHandle);
      if (!handle) throw new Error("Invalid X handle.");
      await createWindow({
        url: getURL(`src/popup.html?handle=${encodeURIComponent(handle)}`),
        type: "popup",
        width: 430,
        height: 680,
        focused: true,
      });
      return { opened: true };
    };
  }

  function gateHandler(handle, readiness) {
    return async function gatedHandle(message) {
      const state = await readiness;
      if (!state.ok) throw state.error;
      return handle(message);
    };
  }

  globalThis.SidenoteWorker = Object.freeze({ createHandler, createEditorAction, gateHandler });
})();
