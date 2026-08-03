(() => {
  const core = globalThis.SidenoteCore;
  const storage = globalThis.SidenoteStorage;
  const RESERVED_ROUTES = new Set([
    "compose", "explore", "home", "i", "intent", "messages", "notifications",
    "search", "settings", "share", "tos", "privacy", "login", "signup",
  ]);

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

  function createComposer(doc, handle, initialText, onSave) {
    const card = doc.createElement("section");
    card.className = "sidenote-composer";
    card.dataset.sidenoteHandle = handle;
    card.innerHTML = `
      <div class="sidenote-heading">
        <span class="sidenote-mark" aria-hidden="true">//</span>
        <div>
          <strong>SIDENOTE</strong>
          <span>Only you can see this</span>
        </div>
      </div>
      <form>
        <label class="sidenote-sr-only" for="sidenote-${handle}">Private note for @${handle}</label>
        <textarea id="sidenote-${handle}" maxlength="${core.MAX_NOTE_LENGTH}" placeholder="What should future-you remember about @${handle}?">${escapeHtml(initialText)}</textarea>
        <div class="sidenote-actions">
          <span class="sidenote-count" aria-live="polite">${initialText.length}/${core.MAX_NOTE_LENGTH}</span>
          <span class="sidenote-status" role="status"></span>
          <button type="submit">${initialText ? "UPDATE NOTE" : "SAVE NOTE"}</button>
        </div>
      </form>`;

    const form = card.querySelector("form");
    const textarea = card.querySelector("textarea");
    const count = card.querySelector(".sidenote-count");
    const status = card.querySelector(".sidenote-status");
    const button = card.querySelector("button");
    textarea.addEventListener("input", () => {
      count.textContent = `${textarea.value.length}/${core.MAX_NOTE_LENGTH}`;
      status.textContent = "";
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      status.textContent = "Saving…";
      try {
        await onSave(handle, textarea.value);
        const savedText = core.normalizeNote(textarea.value);
        textarea.value = savedText;
        count.textContent = `${savedText.length}/${core.MAX_NOTE_LENGTH}`;
        button.textContent = savedText ? "UPDATE NOTE" : "SAVE NOTE";
        status.textContent = savedText ? "Saved locally" : "Note removed";
      } catch {
        status.textContent = "Could not save";
      } finally {
        button.disabled = false;
      }
    });
    return card;
  }

  function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = value ?? "";
    return element.innerHTML;
  }

  function decorateTweet(article, notes) {
    const existing = article.querySelector(":scope > .sidenote-feed-note");
    const handle = tweetHandle(article);
    const note = notes[handle];
    if (!note) {
      existing?.remove();
      return;
    }
    if (existing?.dataset.sidenoteHandle === handle && existing.textContent.includes(note.text)) return;

    const annotation = document.createElement("aside");
    annotation.className = "sidenote-feed-note";
    annotation.dataset.sidenoteHandle = handle;
    annotation.setAttribute("aria-label", `Your private note about @${handle}`);
    annotation.innerHTML = `<span aria-hidden="true">//</span><strong>YOUR NOTE</strong><p></p>`;
    annotation.querySelector("p").textContent = note.text;
    existing?.remove();
    article.append(annotation);
  }

  function profileMountPoint(doc) {
    return [...doc.querySelectorAll('main [data-testid="UserName"], main [data-testid="User-Name"]')]
      .find((element) => !element.closest("article"));
  }

  function renderProfile(doc, notes, save) {
    const handle = profileHandleFromPath(window.location.pathname);
    const oldComposer = doc.querySelector(".sidenote-composer");
    if (!handle) {
      oldComposer?.remove();
      return;
    }
    if (oldComposer?.dataset.sidenoteHandle === handle) return;
    oldComposer?.remove();
    const mount = profileMountPoint(doc);
    if (!mount) return;
    mount.insertAdjacentElement("afterend", createComposer(doc, handle, notes[handle]?.text ?? "", save));
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

    storage.getAll().then((storedNotes) => {
      notes = storedNotes;
      schedule();
    });
    storage.subscribe((storedNotes) => {
      notes = storedNotes;
      schedule();
    });
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", schedule);
  }

  globalThis.SidenoteUI = Object.freeze({
    profileHandleFromPath,
    tweetHandle,
    createComposer,
    decorateTweet,
    renderProfile,
  });

  if (typeof document !== "undefined" && storage && /^x\.com$|^twitter\.com$/.test(window.location.hostname)) {
    start();
  }
})();
