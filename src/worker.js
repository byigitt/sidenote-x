(() => {
  function createHandler(store) {
    return async function handle(message) {
      switch (message?.type) {
        case "sidenote:getAll": return store.getAll();
        case "sidenote:save": return store.save(message.handle, message.text, message.updatedAt);
        case "sidenote:remove": return store.remove(message.handle);
        case "sidenote:clear": return store.clear();
        case "sidenote:export": return store.exportNotes();
        case "sidenote:import": return store.importNotes(message.payload);
        default: throw new Error("Unknown Sidenote command.");
      }
    };
  }

  globalThis.SidenoteWorker = Object.freeze({ createHandler });
})();
