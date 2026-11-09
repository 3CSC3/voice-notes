/**
 * Voice Notes — mic next to community composers (inline toolbar) + modal recorder.
 *
 * Config: window.VOICE_NOTES_FLOAT (or data-* on the script tag)
 *   appUrl, pathPattern (default "/community" — use "/social" on LearnWorlds),
 *   buttonColor (default "#f7a425"), userName, title, zIndex,
 *   enhancePosts (default true),
 *   mode: "inline" (default) | "floating",
 *   showFloatingFallback (default false) — show page FAB only if no composers found,
 *   composerSelector (optional CSS override to find editors)
 */
(function () {
  "use strict";
  if (window.__vnFloatInstalled) return;
  window.__vnFloatInstalled = true;

  var MSG_TYPE = "voice-notes:link";
  var DB_NAME = "voice-notes-demo";
  var DB_STORE = "notes";
  var MIC_ATTR = "data-vn-mic-for";

  function readScriptData() {
    var scripts = document.getElementsByTagName("script");
    var me = scripts[scripts.length - 1];
    var d = (me && me.dataset) || {};
    return {
      appUrl: d.appUrl,
      pathPattern: d.pathPattern,
      buttonColor: d.buttonColor,
      userName: d.userName,
      title: d.title,
      zIndex: d.zIndex,
      enhancePosts: d.enhancePosts,
      mode: d.mode,
      showFloatingFallback: d.showFloatingFallback,
      composerSelector: d.composerSelector,
    };
  }

  function pick(val, fallback) {
    if (val === undefined || val === null || val === "") return fallback;
    return val;
  }

  function asBool(val, fallback) {
    if (val === undefined || val === null || val === "") return fallback;
    if (val === true || val === "true" || val === "1") return true;
    if (val === false || val === "false" || val === "0") return false;
    return fallback;
  }

  var dataCfg = readScriptData();
  var winCfg = window.VOICE_NOTES_FLOAT || {};
  var cfg = {
    appUrl: pick(winCfg.appUrl, pick(dataCfg.appUrl, "")),
    pathPattern: pick(winCfg.pathPattern, pick(dataCfg.pathPattern, "/community")),
    buttonColor: pick(winCfg.buttonColor, pick(dataCfg.buttonColor, "#f7a425")),
    userName: pick(winCfg.userName, pick(dataCfg.userName, "")),
    title: pick(winCfg.title, pick(dataCfg.title, "Voice Notes")),
    zIndex: pick(winCfg.zIndex, pick(dataCfg.zIndex, 2147483000)),
    enhancePosts: asBool(pick(winCfg.enhancePosts, dataCfg.enhancePosts), true),
    mode: String(pick(winCfg.mode, pick(dataCfg.mode, "inline"))).toLowerCase(),
    showFloatingFallback: asBool(
      pick(winCfg.showFloatingFallback, dataCfg.showFloatingFallback),
      false
    ),
    composerSelector: pick(winCfg.composerSelector, pick(dataCfg.composerSelector, "")),
  };

  function pathMatches() {
    var pattern = cfg.pathPattern;
    if (!pattern || pattern === "*") return true;
    try {
      var path = window.location.pathname || "/";
      if (pattern instanceof RegExp) return pattern.test(path);
      return path.toLowerCase().indexOf(String(pattern).toLowerCase()) !== -1;
    } catch (_) {
      return false;
    }
  }

  if (!pathMatches()) return;

  function appOrigin() {
    try {
      var base = (cfg.appUrl || "").trim() || window.location.href;
      return new URL(base, window.location.href).origin;
    } catch (_) {
      return window.location.origin;
    }
  }

  function buildAppSrc() {
    var url = (cfg.appUrl || "").trim();
    if (!url) {
      try { url = new URL("index.html", window.location.href).href; }
      catch (_) { url = "index.html"; }
    }
    var name = (cfg.userName || "").trim();
    if (!name) return url;
    try {
      var u = new URL(url, window.location.href);
      u.searchParams.set("name", name);
      return u.href;
    } catch (_) {
      return url + (url.indexOf("?") >= 0 ? "&" : "?") + "name=" + encodeURIComponent(name);
    }
  }

  var accentInk = cfg.iconColor || "#ffffff";
  var style = document.createElement("style");
  style.textContent = [
    "#vn-float-btn{",
    "position:fixed;right:max(16px,env(safe-area-inset-right));",
    "bottom:max(16px,env(safe-area-inset-bottom));",
    "width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;",
    "display:flex;align-items:center;justify-content:center;",
    "background:" + cfg.buttonColor + ";color:" + accentInk + ";",
    "box-shadow:0 8px 24px rgba(26,31,54,.28);",
    "z-index:" + cfg.zIndex + ";",
    "transition:transform .15s ease,box-shadow .15s ease,filter .15s;",
    "}",
    "#vn-float-btn:hover{transform:scale(1.06);filter:brightness(0.95);}",
    "#vn-float-btn:focus-visible{outline:3px solid #fff;outline-offset:3px;box-shadow:0 0 0 6px " + cfg.buttonColor + ";}",
    "#vn-float-btn svg{width:26px;height:26px;display:block;}",
    "#vn-float-btn[hidden],.vn-composer-mic[hidden]{display:none!important;}",
    "#vn-float-overlay{",
    "position:fixed;inset:0;background:rgba(15,23,42,.55);",
    "z-index:" + (Number(cfg.zIndex) + 1) + ";",
    "display:flex;align-items:center;justify-content:center;",
    "padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right))",
    " max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));",
    "}",
    "#vn-float-overlay[hidden]{display:none!important;}",
    "#vn-float-modal{",
    "background:#fff;border-radius:16px;width:min(560px,100%);",
    "height:min(780px,92vh);max-height:92dvh;",
    "display:flex;flex-direction:column;overflow:hidden;",
    "box-shadow:0 24px 64px rgba(0,0,0,.35);",
    "}",
    "#vn-float-header{",
    "flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;",
    "gap:12px;padding:12px 14px;border-bottom:1px solid #e4e8f0;",
    "font:600 1rem system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1f36;",
    "}",
    "#vn-float-close{",
    "appearance:none;border:none;background:#eef0f7;color:#1a1f36;",
    "width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:1.25rem;line-height:1;",
    "}",
    "#vn-float-close:hover{background:#e2e5ef;}",
    "#vn-float-close:focus-visible{outline:3px solid " + cfg.buttonColor + ";outline-offset:2px;}",
    "#vn-float-frame{flex:1 1 auto;width:100%;border:0;background:#f4f6fb;}",
    "#vn-float-toast{",
    "position:fixed;left:50%;bottom:max(88px,env(safe-area-inset-bottom));",
    "transform:translateX(-50%);z-index:" + (Number(cfg.zIndex) + 2) + ";",
    "background:#1a1f36;color:#fff;padding:0.7rem 1rem;border-radius:999px;",
    "font:600 0.9rem system-ui,-apple-system,Segoe UI,Roboto,sans-serif;",
    "box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center;",
    "}",
    "#vn-float-toast[hidden]{display:none!important;}",
    ".vn-inline-player{",
    "display:block;margin:0.5rem 0;padding:0.65rem 0.75rem;",
    "background:#fff8ec;border:1px solid #f7a42555;border-radius:12px;",
    "}",
    ".vn-inline-player audio{width:100%;display:block;}",
    ".vn-inline-player a{font:600 0.8rem system-ui,sans-serif;color:#9a3412;}",
    /* Composer mic — toolbar icon size (~24–32px), LearnWorlds-friendly */
    ".vn-composer-mic{",
    "appearance:none;border:none;cursor:pointer;",
    "width:32px;height:32px;min-width:32px;padding:0;margin:0 2px;",
    "border-radius:50%;",
    "display:inline-flex;align-items:center;justify-content:center;",
    "background:" + cfg.buttonColor + ";color:" + accentInk + ";",
    "box-shadow:0 1px 2px rgba(26,31,54,.12);",
    "vertical-align:middle;flex:0 0 auto;",
    "transition:filter .15s,transform .1s;",
    "}",
    ".vn-composer-mic:hover{filter:brightness(0.95);transform:scale(1.05);}",
    ".vn-composer-mic:focus-visible{outline:2px solid " + cfg.buttonColor + ";outline-offset:2px;}",
    ".vn-composer-mic svg{width:18px;height:18px;display:block;}",
    ".vn-composer-mic--corner{",
    "position:absolute;right:8px;bottom:8px;z-index:5;",
    "width:36px;height:36px;min-width:36px;",
    "box-shadow:0 4px 12px rgba(26,31,54,.2);",
    "}",
    ".vn-composer-mic--corner svg{width:20px;height:20px;}",
    ".vn-composer-wrap{position:relative;}",
  ].join("");
  document.head.appendChild(style);

  var MIC_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2z"/>' +
    "</svg>";

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled || el.readOnly) return false;
    var tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      var t = (el.type || "text").toLowerCase();
      if (t === "search") return false;
      return t === "text" || t === "url" || t === "email" || t === "" || t === "tel";
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function deepestEditable(node) {
    var el = node;
    while (el && el !== document.documentElement) {
      if (isEditable(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  var lastEditable = null;
  var lastRange = null;
  var insertionTarget = null; // explicit target from mic click

  function rememberFocus(target) {
    var el = deepestEditable(target);
    if (!el) return;
    if (el.closest && el.closest("#vn-float-overlay, #vn-float-modal")) return;
    lastEditable = el;
    try {
      var sel = window.getSelection && window.getSelection();
      if (el.isContentEditable && sel && sel.rangeCount) {
        lastRange = sel.getRangeAt(0).cloneRange();
      } else {
        lastRange = null;
      }
    } catch (_) {
      lastRange = null;
    }
  }

  document.addEventListener("focusin", function (e) { rememberFocus(e.target); }, true);
  document.addEventListener("keyup", function (e) { rememberFocus(e.target); }, true);
  document.addEventListener("mouseup", function (e) { rememberFocus(e.target); }, true);

  var floatBtn = document.createElement("button");
  floatBtn.id = "vn-float-btn";
  floatBtn.type = "button";
  floatBtn.setAttribute("aria-label", "Record a voice note");
  floatBtn.setAttribute("title", "Record a voice note");
  floatBtn.innerHTML = MIC_SVG;
  floatBtn.hidden = true;

  var overlay = document.createElement("div");
  overlay.id = "vn-float-overlay";
  overlay.setAttribute("hidden", "");
  overlay.setAttribute("role", "presentation");
  overlay.innerHTML =
    '<div id="vn-float-modal" role="dialog" aria-modal="true" aria-labelledby="vn-float-title">' +
    '<div id="vn-float-header">' +
    '<span id="vn-float-title"></span>' +
    '<button type="button" id="vn-float-close" aria-label="Close">×</button>' +
    "</div>" +
    '<iframe id="vn-float-frame" title="Voice Notes" allow="microphone"></iframe>' +
    "</div>";

  var toast = document.createElement("div");
  toast.id = "vn-float-toast";
  toast.setAttribute("hidden", "");
  toast.setAttribute("role", "status");

  function mountChrome() {
    document.body.appendChild(floatBtn);
    document.body.appendChild(overlay);
    document.body.appendChild(toast);
  }
  if (document.body) mountChrome();
  else document.addEventListener("DOMContentLoaded", mountChrome);

  var frame = null;
  var closeBtn = null;
  var titleEl = null;
  var lastFocus = null;
  var toastTimer = null;

  function ensureEls() {
    frame = overlay.querySelector("#vn-float-frame");
    closeBtn = overlay.querySelector("#vn-float-close");
    titleEl = overlay.querySelector("#vn-float-title");
    if (titleEl) titleEl.textContent = cfg.title || "Voice Notes";
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.removeAttribute("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.setAttribute("hidden", "");
    }, 3500);
  }

  function openModal(forEditable) {
    ensureEls();
    if (forEditable) {
      insertionTarget = forEditable;
      lastEditable = forEditable;
      rememberFocus(forEditable);
    } else if (document.activeElement) {
      rememberFocus(document.activeElement);
    }
    lastFocus = document.activeElement;
    if (frame) frame.src = buildAppSrc();
    overlay.removeAttribute("hidden");
    document.documentElement.style.overflow = "hidden";
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    overlay.setAttribute("hidden", "");
    document.documentElement.style.overflow = "";
    if (frame) {
      try { frame.src = "about:blank"; } catch (_) {}
    }
  }

  function insertIntoTextField(el, text) {
    el.focus();
    var start = el.selectionStart;
    var end = el.selectionEnd;
    if (typeof start !== "number" || typeof end !== "number") {
      start = end = el.value.length;
    }
    if (typeof el.setRangeText === "function") {
      el.setRangeText(text, start, end, "end");
    } else {
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      try { el.selectionStart = el.selectionEnd = start + text.length; } catch (_) {}
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function insertIntoContentEditable(el, text) {
    el.focus();
    var sel = window.getSelection && window.getSelection();
    try {
      if (lastRange && el.contains(lastRange.commonAncestorContainer)) {
        sel.removeAllRanges();
        sel.addRange(lastRange);
      }
    } catch (_) {}

    var ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (_) { ok = false; }

    if (!ok && sel && sel.rangeCount) {
      try {
        var range = sel.getRangeAt(0);
        range.deleteContents();
        var node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        ok = true;
      } catch (_) { ok = false; }
    }

    if (!ok) {
      el.appendChild(document.createTextNode(text));
      ok = true;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    return ok;
  }

  function insertLink(link) {
    var el =
      (insertionTarget && document.contains(insertionTarget) && insertionTarget) ||
      (lastEditable && document.contains(lastEditable) && lastEditable) ||
      null;
    if (!el) return false;
    var text = link + " ";
    try {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        var pos = typeof el.selectionStart === "number" ? el.selectionStart : (el.value || "").length;
        if (pos > 0 && !/\s/.test((el.value || "").charAt(pos - 1))) text = " " + text;
        return insertIntoTextField(el, text);
      }
      if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
        try {
          var sel = window.getSelection && window.getSelection();
          if (sel && sel.rangeCount) {
            var r = sel.getRangeAt(0);
            if (r.startOffset > 0 && r.startContainer && r.startContainer.nodeType === 3) {
              var prev = r.startContainer.textContent.charAt(r.startOffset - 1);
              if (prev && !/\s/.test(prev)) text = " " + text;
            }
          }
        } catch (_) {}
        return insertIntoContentEditable(el, text);
      }
    } catch (err) {
      console.error(err);
      return false;
    }
    return false;
  }

  async function copyFallback(link) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function handleLinkMessage(link) {
    closeModal();
    var inserted = insertLink(link);
    if (inserted) {
      showToast("Voice link inserted — press Send when ready");
      var el = insertionTarget || lastEditable;
      if (el && el.focus) {
        try { el.focus(); } catch (_) {}
      }
      scheduleEnhance();
      return;
    }
    var copied = await copyFallback(link);
    showToast(copied
      ? "Link copied — paste it into your post"
      : "Could not insert — copy the link from the recorder");
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (_) {}
    }
  }

  floatBtn.addEventListener("click", function () {
    openModal(null);
  });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
    if (e.target && e.target.id === "vn-float-close") closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hasAttribute("hidden")) {
      e.preventDefault();
      closeModal();
    }
  });

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== MSG_TYPE || typeof data.link !== "string") return;

    var expected = appOrigin();
    if (event.origin !== expected) {
      if (event.origin !== window.location.origin) return;
      try {
        if (cfg.appUrl && new URL(cfg.appUrl, window.location.href).origin !== event.origin) return;
      } catch (_) {
        return;
      }
    }

    try {
      var u = new URL(data.link);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      if (u.origin !== expected && u.origin !== window.location.origin) return;
      if (u.pathname.indexOf("play.html") === -1) return;
    } catch (_) {
      return;
    }

    handleLinkMessage(data.link);
  });

  // ---- Find composers & attach mics ----
  var composerIdSeq = 0;
  var attached = new WeakMap(); // editable -> mic button

  function inVoiceUi(el) {
    return !!(el.closest && el.closest("#vn-float-overlay, #vn-float-modal, #vn-float-btn, .vn-composer-mic, .vn-inline-player"));
  }

  function looksLikeComposer(el) {
    if (!el || el.nodeType !== 1) return false;
    if (inVoiceUi(el)) return false;
    if (el.tagName === "INPUT") {
      var t = (el.type || "text").toLowerCase();
      if (t === "search" || t === "hidden" || t === "checkbox" || t === "radio" || t === "submit" || t === "button") {
        return false;
      }
    }
    try {
      var rect = el.getBoundingClientRect();
      if (rect.width && rect.width < 150) return false;
      if (rect.height && rect.height < 28 && el.tagName === "INPUT") return false;
    } catch (_) {}
    return true;
  }

  function collectComposers() {
    var found = [];
    var seen = new Set();

    function add(el) {
      if (!el || seen.has(el)) return;
      if (!looksLikeComposer(el)) return;
      // Prefer outermost contenteditable when nested
      if (el.isContentEditable) {
        var p = el.parentElement;
        while (p) {
          if (p.isContentEditable) return; // skip nested; outer will be collected
          p = p.parentElement;
        }
      }
      seen.add(el);
      found.push(el);
    }

    if (cfg.composerSelector) {
      try {
        document.querySelectorAll(cfg.composerSelector).forEach(add);
      } catch (_) {}
    }

    document.querySelectorAll(
      'textarea, [contenteditable="true"], [contenteditable=""], .ql-editor, .ProseMirror, [role="textbox"]'
    ).forEach(function (el) {
      if (el.matches && el.matches(".ql-editor, .ProseMirror, [role='textbox']") && !el.isContentEditable && el.tagName !== "TEXTAREA") {
        // role=textbox divs are usually contenteditable
        if (el.getAttribute("contenteditable") == null && el.tagName !== "TEXTAREA") {
          // still treat as composer if contenteditable-ish
          if (!el.isContentEditable) {
            // allow role=textbox without contenteditable (some frameworks)
          }
        }
      }
      if (el.tagName === "TEXTAREA" || el.isContentEditable || el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "" || el.classList.contains("ql-editor") || el.classList.contains("ProseMirror") || el.getAttribute("role") === "textbox") {
        add(el);
      }
    });

    return found;
  }

  function isShareControl(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag !== "BUTTON" && tag !== "A" && tag !== "DIV" && tag !== "SPAN") return false;
    var text = ((el.textContent || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "")).trim().toLowerCase();
    // LearnWorlds pink "share" button
    if (/\bshare\b/.test(text)) return true;
    return false;
  }

  function findToolbar(editable) {
    var node = editable;
    for (var depth = 0; depth < 8 && node; depth++) {
      var parent = node.parentElement;
      if (!parent) break;
      // Look for a sibling/descendant share button in this container
      var candidates = parent.querySelectorAll("button, a, [role='button']");
      var share = null;
      for (var i = 0; i < candidates.length; i++) {
        if (isShareControl(candidates[i])) {
          share = candidates[i];
          break;
        }
      }
      if (share) {
        // Prefer a horizontal toolbar row: the share button's parent that also holds other icon buttons
        var row = share.parentElement;
        if (row) {
          var iconish = row.querySelectorAll("button, a, [role='button']");
          if (iconish.length >= 2) {
            return { row: row, share: share, root: parent };
          }
        }
        return { row: share.parentElement || parent, share: share, root: parent };
      }
      // Also detect toolbar by class/name hints
      var toolbar = parent.querySelector(
        '[class*="toolbar" i], [class*="composer-actions" i], [class*="editor-actions" i], [data-testid*="toolbar" i]'
      );
      if (toolbar && toolbar !== editable && !editable.contains(toolbar)) {
        return { row: toolbar, share: null, root: parent };
      }
      node = parent;
    }
    return null;
  }

  function ensureComposerId(el) {
    if (!el.dataset.vnComposerId) {
      composerIdSeq += 1;
      el.dataset.vnComposerId = "c" + composerIdSeq;
    }
    return el.dataset.vnComposerId;
  }

  function makeMicButton(editable) {
    var id = ensureComposerId(editable);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "vn-composer-mic";
    b.setAttribute(MIC_ATTR, id);
    b.setAttribute("aria-label", "Record a voice note");
    b.setAttribute("title", "Record a voice note");
    b.innerHTML = MIC_SVG;
    b.addEventListener("mousedown", function (e) {
      // Keep focus/selection in the composer; don't steal caret before we snapshot
      e.preventDefault();
    });
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      rememberFocus(editable);
      insertionTarget = editable;
      openModal(editable);
    });
    return b;
  }

  function placeMicInToolbar(editable, toolbarInfo, mic) {
    mic.classList.remove("vn-composer-mic--corner");
    var row = toolbarInfo.row;
    var share = toolbarInfo.share;
    if (share && share.parentNode === row) {
      // Insert before the share button (end of icon cluster)
      row.insertBefore(mic, share);
    } else if (share && share.parentNode) {
      share.parentNode.insertBefore(mic, share);
    } else {
      row.appendChild(mic);
    }
    return true;
  }

  function placeMicCorner(editable, mic) {
    mic.classList.add("vn-composer-mic--corner");
    var host = editable;
    // Wrap or use parent if already positioned
    var parent = editable.parentElement;
    if (parent && parent.classList.contains("vn-composer-wrap")) {
      parent.appendChild(mic);
      return;
    }
    // Prefer making the editable's parent relative if it only wraps the editor
    if (parent) {
      var cs = window.getComputedStyle(parent);
      if (cs.position === "static") {
        // Use a wrap around the editable only
        var wrap = document.createElement("div");
        wrap.className = "vn-composer-wrap";
        parent.insertBefore(wrap, editable);
        wrap.appendChild(editable);
        wrap.appendChild(mic);
        return;
      }
      if (cs.position === "relative" || cs.position === "absolute" || cs.position === "fixed") {
        parent.appendChild(mic);
        return;
      }
    }
    var wrap2 = document.createElement("div");
    wrap2.className = "vn-composer-wrap";
    if (editable.parentNode) {
      editable.parentNode.insertBefore(wrap2, editable);
      wrap2.appendChild(editable);
      wrap2.appendChild(mic);
    }
  }

  function attachMic(editable) {
    if (attached.has(editable)) {
      var existing = attached.get(editable);
      if (existing && document.contains(existing)) return;
    }
    // Already has a mic pointing at this id?
    var id = ensureComposerId(editable);
    var prior = document.querySelector('.vn-composer-mic[' + MIC_ATTR + '="' + id + '"]');
    if (prior && document.contains(prior)) {
      attached.set(editable, prior);
      return;
    }

    var mic = makeMicButton(editable);
    var toolbar = findToolbar(editable);
    if (toolbar && toolbar.row) {
      placeMicInToolbar(editable, toolbar, mic);
    } else {
      placeMicCorner(editable, mic);
    }
    attached.set(editable, mic);
  }

  function scanComposers() {
    if (cfg.mode === "floating") {
      floatBtn.hidden = false;
      return;
    }
    var list = collectComposers();
    for (var i = 0; i < list.length; i++) {
      try { attachMic(list[i]); } catch (err) { console.error(err); }
    }
    var anyMic = document.querySelector(".vn-composer-mic");
    if (cfg.mode === "inline") {
      if (!anyMic && cfg.showFloatingFallback) {
        floatBtn.hidden = false;
      } else {
        floatBtn.hidden = true;
      }
    } else {
      floatBtn.hidden = false;
    }
  }

  var scanTimer = null;
  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(function () {
      scanComposers();
      scheduleEnhance();
    }, 200);
  }

  // ---- Inline player enhancement ----
  function playUrlPattern() {
    try {
      var base = (cfg.appUrl || "").trim() || window.location.href;
      var origin = new URL(base, window.location.href).origin;
      return {
        origin: origin,
        test: function (href) {
          try {
            var u = new URL(href, window.location.href);
            if (u.origin !== origin && u.origin !== window.location.origin) return false;
            return /play\.html$/i.test(u.pathname) || u.pathname.indexOf("/play.html") !== -1;
          } catch (_) {
            return false;
          }
        },
      };
    } catch (_) {
      return { origin: window.location.origin, test: function () { return false; } };
    }
  }

  function demoGetNote(id) {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onerror = function () { resolve(null); };
        req.onsuccess = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            resolve(null);
            return;
          }
          var tx = db.transaction(DB_STORE, "readonly");
          var get = tx.objectStore(DB_STORE).get(id);
          get.onsuccess = function () { resolve(get.result || null); };
          get.onerror = function () { resolve(null); };
        };
      } catch (_) {
        resolve(null);
      }
    });
  }

  function enhanceLink(anchor) {
    if (!anchor || anchor.dataset.vnEnhanced === "1") return;
    var href = anchor.href || anchor.getAttribute("href") || "";
    var pat = playUrlPattern();
    if (!pat.test(href)) return;
    anchor.dataset.vnEnhanced = "1";

    var u;
    try { u = new URL(href, window.location.href); } catch (_) { return; }
    var id = u.searchParams.get("id") || "";
    var src = u.searchParams.get("src") || "";

    var wrap = document.createElement("div");
    wrap.className = "vn-inline-player";
    wrap.setAttribute("data-vn-id", id);

    var audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";

    var open = document.createElement("a");
    open.href = href;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "Open player";

    function setSrc(url) {
      if (!url) return;
      if (/^(https?:|blob:|data:audio\/)/i.test(url)) {
        audio.src = url;
      }
    }

    function mountPlayer() {
      wrap.appendChild(audio);
      wrap.appendChild(open);
      if (anchor.parentNode) {
        anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
      }
    }

    if (src && /^https?:/i.test(src)) {
      setSrc(src);
      mountPlayer();
      return;
    }

    if (id) {
      demoGetNote(id).then(function (note) {
        if (note && note.audio_data_url) setSrc(note.audio_data_url);
        mountPlayer();
      });
      return;
    }

    mountPlayer();
  }

  function enhancePosts() {
    if (!cfg.enhancePosts) return;
    var pat = playUrlPattern();
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.closest && a.closest(".vn-inline-player")) continue;
      var href = a.getAttribute("href") || "";
      if (!href) continue;
      try {
        if (pat.test(a.href || href)) enhanceLink(a);
      } catch (_) {}
    }
  }

  var enhanceTimer = null;
  function scheduleEnhance() {
    if (enhanceTimer) clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(enhancePosts, 200);
  }

  function boot() {
    scanComposers();
    scheduleEnhance();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  try {
    var mo = new MutationObserver(function (mutations) {
      // Ignore our own mic/player/modal mutations to reduce loops
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.addedNodes && m.addedNodes.length) {
          scheduleScan();
          return;
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
})();
