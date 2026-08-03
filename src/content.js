(() => {
  const core = globalThis.SidenoteCore;
  const storage = globalThis.SidenoteStorage;
  const SHADOW_ROOTS = new WeakMap();
  const HOST_STATE = new WeakMap();
  const RESERVED_ROUTES = new Set([
    "about", "compose", "download", "explore", "grok", "home", "i", "intent",
    "jobs", "login", "messages", "monetization", "notifications", "premium",
    "privacy", "search", "settings", "share", "signup", "tos", "verified",
  ]);

  const BASE_STYLES = `
    :host { color-scheme: light dark; box-sizing: border-box; color: #0f1419; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    *, *::before, *::after { box-sizing: border-box; }
    @media (prefers-color-scheme: dark) { :host { color: #fff; } }
    button, textarea { font: inherit; }
    .sr-only { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  `;
  const COMPOSER_STYLES = `${BASE_STYLES}
    :host { display: block; margin: 16px 0; }
    section { padding: 16px; background: #f7f7f5; border: 1px solid rgba(15,20,25,.16); border-radius: 2px; }
    .heading { display: flex; gap: 10px; align-items: flex-start; }
    .mark { color: rgba(15,20,25,.62); font-size: 18px; line-height: 1; }
    .heading div { display: flex; flex-direction: column; gap: 3px; }
    strong { font-size: 11px; font-weight: 600; letter-spacing: 1.4px; }
    .heading div > span { color: rgba(15,20,25,.62); font: 12px/1.4 system-ui, sans-serif; }
    textarea { width: 100%; min-height: 76px; resize: vertical; margin: 14px 0 10px; padding: 10px 12px; color: inherit; background: rgba(15,20,25,.035); border: 1px solid rgba(15,20,25,.16); border-radius: 2px; font: 14px/1.5 system-ui, sans-serif; }
    textarea:focus { outline: 2px solid #1d9bf0; outline-offset: 2px; }
    .actions { display: flex; align-items: center; gap: 10px; min-height: 36px; }
    .count, .status { color: rgba(15,20,25,.62); font-size: 11px; }
    .status { margin-left: auto; }
    button { min-height: 36px; padding: 0 14px; color: #fff; background: #0f1419; border: 0; border-radius: 2px; font: 600 11px/1 ui-monospace, monospace; letter-spacing: 1.2px; cursor: pointer; }
    button:disabled { opacity: .5; cursor: wait; }
    @media (prefers-color-scheme: dark) {
      section { background: #1f2228; border-color: rgba(255,255,255,.16); }
      .mark, .heading div > span, .count, .status { color: rgba(255,255,255,.62); }
      textarea { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.16); }
      button { color: #1f2228; background: #fff; }
    }
    @media (max-width: 500px) { :host { margin-inline: 12px; } }
  `;
  const FEED_STYLES = `${BASE_STYLES}
    :host { display: block; margin: 10px 16px 2px; }
    aside { display: grid; grid-template-columns: auto auto 1fr; gap: 7px; align-items: baseline; padding: 9px 11px; background: rgba(15,20,25,.035); border-left: 2px solid currentColor; }
    span { color: rgba(15,20,25,.62); }
    strong { font-size: 11px; font-weight: 600; letter-spacing: 1.4px; }
    p { min-width: 0; margin: 0; overflow-wrap: anywhere; color: rgba(15,20,25,.62); font: 13px/1.4 system-ui, sans-serif; }
    @media (prefers-color-scheme: dark) { aside { background: rgba(255,255,255,.04); } span, p { color: rgba(255,255,255,.62); } }
    @media (max-width: 500px) { aside { grid-template-columns: auto 1fr; } p { grid-column: 1 / -1; } }
  `;

  function profileHandleFromPath(path) {
    const segment = String(path).split(/[/?#]/).filter(Boolean)[0] ?? "";
    const handle = core.normalizeHandle(segment);
    return handle && !RESERVED_ROUTES.has(handle) ? handle : "";
  }

  function tweetHandle(article) {
    const container = article?.querySelector('[data-testid="User-Name"], [data-testid="UserName"]');
    const anchors = container ? [...container.querySelectorAll('a[href^="/"]')] : [];
    for (const anchor of anchors) {
      const handle = profileHandleFromPath(anchor.getAttribute("href"));
      if (handle && anchor.textContent.includes("@")) return handle;
    }
    return "";
  }

  function attachClosedRoot(host, styles) {
    const root = host.attachShadow({ mode: "closed" });
    const style = host.ownerDocument.createElement("style");
    style.textContent = styles;
    root.append(style);
    SHADOW_ROOTS.set(host, root);
    return root;
  }

  function createComposer(doc, handle, initialText, onSave) {
    const host = doc.createElement("div");
    host.className = "sidenote-composer";
    host.dataset.sidenoteHandle = handle;
    const root = attachClosedRoot(host, COMPOSER_STYLES);
    const card = doc.createElement("section");
    card.innerHTML = `
      <div class="heading">
        <span class="mark" aria-hidden="true">//</span>
        <div><strong>SIDENOTE</strong><span>Only you can see this</span></div>
      </div>
      <form>
        <label class="sr-only" for="sidenote-${handle}">Private note for @${handle}</label>
        <textarea id="sidenote-${handle}" maxlength="${core.MAX_NOTE_LENGTH}" placeholder="What should future-you remember about @${handle}?"></textarea>
        <div class="actions">
          <span class="count" aria-live="polite"></span>
          <span class="status" role="status"></span>
          <button type="submit"></button>
        </div>
      </form>`;
    root.append(card);

    const textarea = root.querySelector("textarea");
    const count = root.querySelector(".count");
    const status = root.querySelector(".status");
    const button = root.querySelector("button");
    const state = { handle, text: initialText, saving: false };
    HOST_STATE.set(host, state);
    textarea.value = initialText;
    count.textContent = `${initialText.length}/${core.MAX_NOTE_LENGTH}`;
    button.textContent = initialText ? "UPDATE NOTE" : "SAVE NOTE";
    textarea.addEventListener("input", () => {
      count.textContent = `${textarea.value.length}/${core.MAX_NOTE_LENGTH}`;
      status.textContent = "";
    });
    root.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      state.saving = true;
      button.disabled = true;
      status.textContent = "Saving…";
      try {
        await onSave(handle, textarea.value);
        const savedText = core.normalizeNote(textarea.value);
        state.text = savedText;
        textarea.value = savedText;
        count.textContent = `${savedText.length}/${core.MAX_NOTE_LENGTH}`;
        button.textContent = savedText ? "UPDATE NOTE" : "SAVE NOTE";
        status.textContent = savedText ? "Saved locally" : "Note removed";
      } catch {
        status.textContent = "Could not save";
      } finally {
        state.saving = false;
        button.disabled = false;
      }
    });
    return host;
  }

  function decorateTweet(article, notes) {
    const existing = article.querySelector(":scope > .sidenote-feed-note");
    const handle = tweetHandle(article);
    const note = notes[handle];
    if (!note) {
      existing?.remove();
      return;
    }
    const existingState = existing && HOST_STATE.get(existing);
    if (existingState?.handle === handle && existingState.text === note.text) return;

    const host = document.createElement("div");
    host.className = "sidenote-feed-note";
    host.dataset.sidenoteHandle = handle;
    const root = attachClosedRoot(host, FEED_STYLES);
    const annotation = document.createElement("aside");
    annotation.setAttribute("aria-label", `Your private note about @${handle}`);
    annotation.innerHTML = '<span aria-hidden="true">//</span><strong>YOUR NOTE</strong><p></p>';
    annotation.querySelector("p").textContent = note.text;
    root.append(annotation);
    HOST_STATE.set(host, { handle, text: note.text });
    existing?.remove();
    article.append(host);
  }

  function profileMountPoint(doc) {
    return [...doc.querySelectorAll('main [data-testid="UserName"], main [data-testid="User-Name"]')]
      .find((element) => !element.closest("article"));
  }

  function renderProfile(doc, notes, save) {
    const handle = profileHandleFromPath(doc.defaultView.location.pathname);
    const oldComposer = doc.querySelector(".sidenote-composer");
    if (!handle) {
      oldComposer?.remove();
      return;
    }
    const noteText = notes[handle]?.text ?? "";
    const oldState = oldComposer && HOST_STATE.get(oldComposer);
    if (oldState?.handle === handle && (oldState.saving || oldState.text === noteText)) return;
    oldComposer?.remove();
    const mount = profileMountPoint(doc);
    if (!mount) return;
    mount.insertAdjacentElement("afterend", createComposer(doc, handle, noteText, save));
  }

  function start() {
    let notes = {};
    let scheduled = false;
    const render = () => {
      scheduled = false;
      document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => decorateTweet(article, notes));
      renderProfile(document, notes, (handle, text) => storage.save(handle, text));
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(render);
    };

    storage.getAll().then((storedNotes) => { notes = storedNotes; schedule(); });
    storage.subscribe((storedNotes) => { notes = storedNotes; schedule(); });
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", schedule);
  }

  globalThis.SidenoteUI = Object.freeze({
    profileHandleFromPath,
    tweetHandle,
    createComposer,
    decorateTweet,
    renderProfile,
    shadowRootFor: (host) => SHADOW_ROOTS.get(host),
  });

  if (typeof document !== "undefined" && storage && /^x\.com$|^twitter\.com$/.test(window.location.hostname)) start();
})();
