(() => {
  async function request(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Sidenote worker did not respond.");
    return response.value;
  }

  const getAll = () => request({ type: "sidenote:getAll" });
  const save = (handle, text, updatedAt = Date.now()) => request({ type: "sidenote:save", handle, text, updatedAt });
  const remove = (handle) => request({ type: "sidenote:remove", handle });
  const clear = () => request({ type: "sidenote:clear" });
  const exportNotes = () => request({ type: "sidenote:export" });
  const importNotes = (payload) => request({ type: "sidenote:import", payload });
  const openEditor = (handle) => request({ type: "sidenote:openEditor", handle });

  function subscribe(callback) {
    const listener = (message) => {
      if (message?.type === "sidenote:changed") callback(message.notes ?? {});
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }

  globalThis.SidenoteStorage = Object.freeze({
    getAll,
    save,
    remove,
    clear,
    exportNotes,
    importNotes,
    openEditor,
    subscribe,
  });
})();
