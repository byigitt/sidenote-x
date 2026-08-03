importScripts("core.js", "store.js", "worker.js");

const STORAGE_KEY = "sidenoteNotes";

async function notify(notes) {
  const message = { type: "sidenote:changed", notes };
  const deliveries = [chrome.runtime.sendMessage(message)];
  const tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
  for (const tab of tabs) {
    if (tab.id !== undefined) deliveries.push(chrome.tabs.sendMessage(tab.id, message));
  }
  await Promise.allSettled(deliveries);
}

const store = globalThis.SidenoteStore.create({
  async read() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ?? {};
  },
  async write(notes) {
    await chrome.storage.local.set({ [STORAGE_KEY]: notes });
  },
  notify,
});
const handle = globalThis.SidenoteWorker.createHandler(store);

chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "sidenote:changed") return false;
  handle(message)
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
