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
    button { font: inherit; }
  `;
  const COMPOSER_STYLES = `${BASE_STYLES}
    :host { display: block; margin: 16px 0; }
    section { padding: 16px; background: #f7f7f5; border: 1px solid rgba(15,20,25,.16); border-radius: 2px; }
    .heading { display: flex; gap: 10px; align-items: flex-start; }
    .mark { color: rgba(15,20,25,.62); font-size: 18px; line-height: 1; }
    .heading div { display: flex; flex-direction: column; gap: 3px; }
    strong { font-size: 11px; font-weight: 600; letter-spacing: 1.4px; }
    .heading div > span { color: rgba(15,20,25,.62); font: 12px/1.4 system-ui, sans-serif; }
    .note { margin: 14px 0; color: inherit; font: 14px/1.5 system-ui, sans-serif; overflow-wrap: anywhere; }
    .note.empty { color: rgba(15,20,25,.5); font-style: italic; }
    .actions { display: flex; justify-content: flex-end; }
    button { min-height: 36px; padding: 0 14px; color: #fff; background: #0f1419; border: 0; border-radius: 2px; font: 600 11px/1 ui-monospace, monospace; letter-spacing: 1.2px; cursor: pointer; }
    button:disabled { opacity: .5; cursor: wait; }
    @media (prefers-color-scheme: dark) {
      section { background: #1f2228; border-color: rgba(255,255,255,.16); }
      .mark, .heading div > span { color: rgba(255,255,255,.62); }
      .note.empty { color: rgba(255,255,255,.5); }
      button { color: #1f2228; background: #fff; }
    }
    @media (max-width: 500px) { :host { margin-inline: 12px; } }
  `;
  const FEED_STYLES = `${BASE_STYLES}
    :host { display: block; width: 100%; min-width: 0; margin: 10px 0 6px; }
    aside { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; width: 100%; min-width: 0; padding: 9px 12px; background: rgba(15,20,25,.035); border: 1px solid rgba(15,20,25,.09); border-radius: 10px; }
    .label { display: inline-flex; flex: 0 0 auto; gap: 6px; align-items: baseline; color: rgba(15,20,25,.56); white-space: nowrap; }
    .mark { font-size: 11px; letter-spacing: -1px; }
    strong { font-size: 10px; font-weight: 600; letter-spacing: 1.15px; }
    p { flex: 1 1 220px; min-width: 0; margin: 0; overflow-wrap: break-word; color: rgba(15,20,25,.78); font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    @media (prefers-color-scheme: dark) {
      aside { background: rgba(239,243,244,.055); border-color: rgba(239,243,244,.10); }
      .label { color: rgba(239,243,244,.52); }
      p { color: rgba(239,243,244,.78); }
    }
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

  function createComposer(doc, handle, initialText, onEdit) {
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
      <p class="note"></p>
      <div class="actions"><button type="button"></button></div>`;
    root.append(card);

    const note = root.querySelector(".note");
    const button = root.querySelector("button");
    HOST_STATE.set(host, { handle, text: initialText });
    note.textContent = initialText || "No private note yet.";
    note.classList.toggle("empty", !initialText);
    button.textContent = initialText ? "EDIT NOTE" : "ADD PRIVATE NOTE";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await onEdit(handle);
      } finally {
        button.disabled = false;
      }
    });
    return host;
  }

  function feedMountPoint(article) {
    const actionRow = [...article.querySelectorAll('[role="group"]')]
      .reverse()
      .find((element) => element.closest("article") === article);
    if (actionRow?.parentElement) return { parent: actionRow.parentElement, before: actionRow };

    const tweetText = article.querySelector('[data-testid="tweetText"]');
    if (tweetText?.parentElement) return { parent: tweetText.parentElement, before: tweetText.nextSibling };
    return { parent: article, before: null };
  }

  function decorateTweet(article, notes) {
    const existing = [...article.querySelectorAll(".sidenote-feed-note")]
      .find((element) => element.closest("article") === article);
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
    annotation.innerHTML = '<span class="label"><span class="mark" aria-hidden="true">//</span><strong>SIDENOTE</strong></span><p></p>';
    annotation.querySelector("p").textContent = note.text;
    root.append(annotation);
    HOST_STATE.set(host, { handle, text: note.text });
    existing?.remove();
    const mount = feedMountPoint(article);
    mount.parent.insertBefore(host, mount.before);
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
    if (oldState?.handle === handle && oldState.text === noteText) return;
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
      renderProfile(document, notes, (handle) => storage.openEditor(handle));
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
