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
    :host { display: block; margin: 14px 0; font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    section { padding: 16px; color: #0f1419; background: #f7f9f9; border: 1px solid #cfd9de; border-radius: 12px; }
    .heading { display: flex; gap: 8px; align-items: flex-start; }
    svg { flex: 0 0 18px; width: 18px; height: 18px; color: #536471; }
    .heading div { display: flex; flex-direction: column; gap: 1px; }
    strong { font-size: 15px; font-weight: 700; line-height: 18px; }
    .heading div > span { color: #536471; font-size: 13px; line-height: 17px; }
    .note { margin: 10px 0 12px 26px; color: inherit; font-size: 14px; line-height: 19px; overflow-wrap: anywhere; }
    .note.empty { color: #536471; }
    .actions { display: flex; justify-content: flex-end; }
    button { min-height: 34px; padding: 0 16px; color: #fff; background: #0f1419; border: 0; border-radius: 9999px; font-size: 14px; font-weight: 700; cursor: pointer; }
    button:hover { background: #272c30; }
    button:disabled { opacity: .5; cursor: wait; }
    @media (prefers-color-scheme: dark) {
      section { color: #e7e9ea; background: #16181c; border-color: #2f3336; }
      svg, .heading div > span, .note.empty { color: #71767b; }
      button { color: #0f1419; background: #eff3f4; }
      button:hover { background: #d7dbdc; }
    }
    @media (max-width: 500px) { :host { margin-inline: 12px; } }
  `;
  const FEED_STYLES = `${BASE_STYLES}
    :host { display: block; width: 100%; min-width: 0; margin: 8px 0 4px; font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    aside { display: flex; gap: 8px; align-items: flex-start; width: 100%; min-width: 0; padding: 12px 14px; color: #0f1419; background: #f7f9f9; border: 1px solid #cfd9de; border-radius: 12px; }
    svg { flex: 0 0 16px; width: 16px; height: 16px; margin-top: 1px; color: #536471; }
    p { min-width: 0; margin: 0; overflow-wrap: anywhere; color: inherit; font-size: 14px; font-weight: 400; line-height: 18px; }
    strong { font-weight: 700; }
    .separator { color: #536471; }
    @media (prefers-color-scheme: dark) {
      aside { color: #e7e9ea; background: #16181c; border-color: #2f3336; }
      svg, .separator { color: #71767b; }
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
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6.75 3.75h10.5a2 2 0 0 1 2 2v12.5a2 2 0 0 1-2 2H6.75a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
        <div><strong>Your private note</strong><span>Only you can see this</span></div>
      </div>
      <p class="note"></p>
      <div class="actions"><button type="button"></button></div>`;
    root.append(card);

    const note = root.querySelector(".note");
    const button = root.querySelector("button");
    HOST_STATE.set(host, { handle, text: initialText });
    note.textContent = initialText || "No private note yet.";
    note.classList.toggle("empty", !initialText);
    button.textContent = initialText ? "Edit note" : "Add note";
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

  function commonAncestor(first, second, boundary) {
    const ancestors = new Set();
    for (let node = first; node && node !== boundary; node = node.parentElement) ancestors.add(node);
    for (let node = second; node && node !== boundary; node = node.parentElement) {
      if (ancestors.has(node)) return node;
    }
    return null;
  }

  function childWithin(parent, descendant) {
    let child = descendant;
    while (child?.parentElement && child.parentElement !== parent) child = child.parentElement;
    return child?.parentElement === parent ? child : null;
  }

  function feedMountPoint(article) {
    const actionRow = [...article.querySelectorAll('[role="group"]')]
      .reverse()
      .find((element) => element.closest("article") === article);
    const tweetText = [...article.querySelectorAll('[data-testid="tweetText"]')]
      .find((element) => element.closest("article") === article && !element.closest('[role="link"]'))
      ?? article.querySelector('[data-testid="tweetText"]');
    const contentColumn = actionRow && tweetText && commonAncestor(tweetText, actionRow, article);
    const actionBranch = contentColumn && childWithin(contentColumn, actionRow);
    if (contentColumn && actionBranch) return { parent: contentColumn, before: actionBranch };
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
    annotation.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6.75 3.75h10.5a2 2 0 0 1 2 2v12.5a2 2 0 0 1-2 2H6.75a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg><p><strong>Your note</strong><span class="separator" aria-hidden="true"> · </span><span class="text"></span></p>';
    annotation.querySelector(".text").textContent = note.text;
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
