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
      iconColor: d.iconColor,
      userName: d.userName,
      title: d.title,
      zIndex: d.zIndex,
      enhancePosts: d.enhancePosts,
      mode: d.mode,
      showFloatingFallback: d.showFloatingFallback,
      composerSelector: d.composerSelector,
      supabaseUrl: d.supabaseUrl,
      supabaseAnonKey: d.supabaseAnonKey,
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
  var pageCfg = window.VOICE_NOTES_CONFIG || {};
  var cfg = {
    appUrl: pick(winCfg.appUrl, pick(dataCfg.appUrl, "")),
    pathPattern: pick(winCfg.pathPattern, pick(dataCfg.pathPattern, "/community")),
    buttonColor: pick(winCfg.buttonColor, pick(dataCfg.buttonColor, "#f7a425")),
    iconColor: pick(winCfg.iconColor, pick(dataCfg.iconColor, "#ffffff")),
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
    supabaseUrl: pick(winCfg.supabaseUrl, pick(pageCfg.SUPABASE_URL, "")),
    supabaseAnonKey: pick(winCfg.supabaseAnonKey, pick(pageCfg.SUPABASE_ANON_KEY, "")),
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
    /* Compact voice-note pill (replaces huge inline player card) */
    ".vn-voice-pill{",
    "appearance:none;border:none;cursor:pointer;",
    "display:inline-flex;align-items:center;gap:0.4rem;",
    "margin:0.15rem 0.15rem 0.15rem 0;padding:0.35rem 0.75rem;",
    "border-radius:999px;vertical-align:middle;",
    "background:" + cfg.buttonColor + ";color:" + accentInk + ";",
    "font:600 0.85rem system-ui,-apple-system,Segoe UI,Roboto,sans-serif;",
    "box-shadow:0 1px 3px rgba(26,31,54,.15);",
    "max-width:100%;",
    "}",
    ".vn-voice-pill:hover{filter:brightness(0.95);}",
    ".vn-voice-pill:focus-visible{outline:2px solid #fff;outline-offset:2px;box-shadow:0 0 0 4px " + cfg.buttonColor + ";}",
    ".vn-voice-pill__icon{font-size:0.75rem;line-height:1;}",
    ".vn-voice-pill__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:14rem;}",
    "a.vn-voice-link-hidden, .vn-voice-link-hidden{",
    "position:absolute!important;width:1px!important;height:1px!important;",
    "padding:0!important;margin:-1px!important;overflow:hidden!important;",
    "clip:rect(0,0,0,0)!important;border:0!important;white-space:nowrap!important;",
    "}",
    /* Same-page popup player */
    "#vn-player-overlay{",
    "position:fixed;inset:0;background:rgba(15,23,42,.55);",
    "z-index:" + (Number(cfg.zIndex) + 3) + ";",
    "display:flex;align-items:center;justify-content:center;",
    "padding:16px;",
    "}",
    "#vn-player-overlay[hidden]{display:none!important;}",
    "#vn-player-modal{",
    "background:#fff;border-radius:16px;width:min(400px,100%);",
    "padding:1.1rem 1.15rem 1.2rem;box-shadow:0 24px 64px rgba(0,0,0,.35);",
    "font:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1f36;",
    "}",
    "#vn-player-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:0.75rem;}",
    "#vn-player-title{font-weight:700;font-size:1.05rem;margin:0;}",
    "#vn-player-meta{margin:0.2rem 0 0;color:#5b6478;font-size:0.88rem;}",
    "#vn-player-close{",
    "appearance:none;border:none;background:#eef0f7;color:#1a1f36;",
    "width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:1.25rem;flex:0 0 auto;",
    "}",
    "#vn-player-close:hover{background:#e2e5ef;}",
    "#vn-player-audio{width:100%;margin-top:0.35rem;}",
    "#vn-player-status{margin:0.5rem 0 0;font-size:0.85rem;color:#5b6478;min-height:1.2em;}",
    "#vn-player-status.is-error{color:#dc2626;}",
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
    /* Mobile hardening: stop site/browser styles from recolouring the buttons */
    "button.vn-composer-mic,button.vn-voice-pill,button#vn-float-btn,.vn-composer-mic,.vn-voice-pill,#vn-float-btn{",
    "-webkit-appearance:none!important;appearance:none!important;",
    "background:" + cfg.buttonColor + "!important;background-color:" + cfg.buttonColor + "!important;background-image:none!important;",
    "color:" + accentInk + "!important;-webkit-text-fill-color:" + accentInk + "!important;",
    "border:none!important;opacity:1!important;filter:none;",
    "-webkit-tap-highlight-color:transparent;",
    "}",
    ".vn-composer-mic svg,.vn-composer-mic svg *,#vn-float-btn svg,#vn-float-btn svg *{",
    "fill:" + accentInk + "!important;color:" + accentInk + "!important;stroke:none!important;opacity:1!important;",
    "}",
    ".vn-composer-mic:active,.vn-composer-mic:focus,.vn-voice-pill:active,.vn-voice-pill:focus{background:" + cfg.buttonColor + "!important;color:" + accentInk + "!important;}",
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
    return !!(el.closest && el.closest("#vn-float-overlay, #vn-float-modal, #vn-float-btn, .vn-composer-mic, .vn-voice-pill, #vn-player-overlay, .vn-inline-player"));
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
    if (editable && editable.classList && editable.classList.contains("vn-has-corner-mic")) {
      editable.classList.remove("vn-has-corner-mic");
      editable.style.removeProperty("padding-right");
    }
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
    // Keep typed/pasted text clear of the corner mic
    try {
      editable.classList.add("vn-has-corner-mic");
      editable.style.setProperty("padding-right", "52px", "important");
      editable.style.setProperty("box-sizing", "border-box", "important");
    } catch (_) {}
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


  // ---- Resolve note audio (src param, Supabase by id, or IndexedDB demo) ----
  function formatDuration(sec) {
    var s = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
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

  function supabaseFetchNote(id) {
    var base = (cfg.supabaseUrl || "").replace(/\/$/, "");
    var key = cfg.supabaseAnonKey || "";
    if (!base || !key || !id) return Promise.resolve(null);
    var url =
      base +
      "/rest/v1/notes?id=eq." +
      encodeURIComponent(id) +
      "&select=id,name,title,audio_path,duration,created_at";
    return fetch(url, {
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        Accept: "application/json",
      },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("notes " + r.status);
        return r.json();
      })
      .then(function (rows) {
        if (!rows || !rows.length) return null;
        var row = rows[0];
        var audioUrl =
          base +
          "/storage/v1/object/public/voice-notes/" +
          encodeURIComponent(row.audio_path).replace(/%2F/gi, "/");
        return {
          id: row.id,
          name: row.name || "",
          title: row.title || "",
          duration: row.duration,
          audioUrl: audioUrl,
        };
      })
      .catch(function () {
        return null;
      });
  }

  function resolveNote(id, srcParam) {
    var src = (srcParam || "").trim();
    return Promise.resolve()
      .then(function () {
        if (id) return supabaseFetchNote(id);
        return null;
      })
      .then(function (sb) {
        if (sb) {
          if (src && /^https?:/i.test(src)) sb.audioUrl = src;
          return sb;
        }
        if (id) {
          return demoGetNote(id).then(function (demo) {
            if (!demo) {
              if (src && /^https?:/i.test(src)) {
                return { id: id, name: "", title: "Voice note", audioUrl: src };
              }
              return null;
            }
            return {
              id: demo.id,
              name: demo.name || "",
              title: demo.title || "",
              duration: demo.duration,
              audioUrl: (src && /^https?:/i.test(src) ? src : null) || demo.audio_data_url || "",
            };
          });
        }
        if (src && /^https?:/i.test(src)) {
          return { id: "", name: "", title: "Voice note", audioUrl: src };
        }
        return null;
      });
  }

  // ---- Popup player ----
  var playerOverlay = document.createElement("div");
  playerOverlay.id = "vn-player-overlay";
  playerOverlay.setAttribute("hidden", "");
  playerOverlay.setAttribute("role", "presentation");
  playerOverlay.innerHTML =
    '<div id="vn-player-modal" role="dialog" aria-modal="true" aria-labelledby="vn-player-title">' +
    '<div id="vn-player-header">' +
    '<div><h2 id="vn-player-title">Voice note</h2><p id="vn-player-meta"></p></div>' +
    '<button type="button" id="vn-player-close" aria-label="Close">×</button>' +
    "</div>" +
    '<audio id="vn-player-audio" controls preload="metadata"></audio>' +
    '<p id="vn-player-status"></p>' +
    "</div>";

  function mountPlayerChrome() {
    if (!document.getElementById("vn-player-overlay")) {
      document.body.appendChild(playerOverlay);
    }
  }
  if (document.body) mountPlayerChrome();
  else document.addEventListener("DOMContentLoaded", mountPlayerChrome);

  function closePlayerPopup() {
    var ov = document.getElementById("vn-player-overlay");
    if (!ov) return;
    ov.setAttribute("hidden", "");
    var audio = document.getElementById("vn-player-audio");
    if (audio) {
      try { audio.pause(); } catch (_) {}
      try { audio.removeAttribute("src"); audio.load(); } catch (_) {}
    }
  }

  function openPlayerPopup(note) {
    mountPlayerChrome();
    var ov = document.getElementById("vn-player-overlay");
    var titleEl = document.getElementById("vn-player-title");
    var metaEl = document.getElementById("vn-player-meta");
    var statusEl = document.getElementById("vn-player-status");
    var audio = document.getElementById("vn-player-audio");
    titleEl.textContent = (note && note.title) || "Voice note";
    var bits = [];
    if (note && note.name) bits.push(note.name);
    if (note && note.duration) bits.push(formatDuration(note.duration));
    metaEl.textContent = bits.join(" · ");
    statusEl.textContent = "";
    statusEl.className = "";
    ov.removeAttribute("hidden");
    if (!note || !note.audioUrl) {
      statusEl.textContent = "Could not load this voice note.";
      statusEl.className = "is-error";
      return;
    }
    if (!/^(https?:|blob:|data:audio\/)/i.test(note.audioUrl)) {
      statusEl.textContent = "Invalid audio URL.";
      statusEl.className = "is-error";
      return;
    }
    audio.src = note.audioUrl;
    var playPromise = audio.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(function () {
        statusEl.textContent = "Press play to listen.";
      });
    }
  }

  playerOverlay.addEventListener("click", function (e) {
    if (e.target === playerOverlay) closePlayerPopup();
    if (e.target && e.target.id === "vn-player-close") closePlayerPopup();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var ov = document.getElementById("vn-player-overlay");
      if (ov && !ov.hasAttribute("hidden")) {
        e.preventDefault();
        closePlayerPopup();
      }
    }
  });

  function parsePlayUrl(href) {
    try {
      var u = new URL(href, window.location.href);
      var pat = playUrlPattern();
      if (!pat.test(u.href)) return null;
      return {
        href: u.href,
        id: u.searchParams.get("id") || "",
        src: u.searchParams.get("src") || "",
      };
    } catch (_) {
      return null;
    }
  }

  function pillLabel(note) {
    var label = "Voice note";
    if (note && note.title) label = note.title;
    else if (note && note.name) label = note.name + "'s voice note";
    if (note && note.duration) label += " · " + formatDuration(note.duration);
    return label;
  }

  function makePill(parsed, noteHint) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vn-voice-pill";
    btn.setAttribute("data-vn-play-id", parsed.id || "");
    if (parsed.src) btn.setAttribute("data-vn-play-src", parsed.src);
    btn.innerHTML =
      '<span class="vn-voice-pill__icon" aria-hidden="true">▶</span>' +
      '<span class="vn-voice-pill__label"></span>';
    btn.querySelector(".vn-voice-pill__label").textContent = pillLabel(noteHint || null);
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var id = btn.getAttribute("data-vn-play-id") || parsed.id;
      var src = btn.getAttribute("data-vn-play-src") || parsed.src;
      btn.querySelector(".vn-voice-pill__label").textContent = "Loading…";
      resolveNote(id, src).then(function (note) {
        btn.querySelector(".vn-voice-pill__label").textContent = pillLabel(note || noteHint);
        openPlayerPopup(note || { title: "Voice note", audioUrl: src });
      });
    });
    // Prefetch meta for nicer label when we have supabase / src
    resolveNote(parsed.id, parsed.src).then(function (note) {
      if (!note) return;
      if (note.title || note.name || note.duration) {
        btn.querySelector(".vn-voice-pill__label").textContent = pillLabel(note);
      }
      if (note.id) btn.setAttribute("data-vn-play-id", note.id);
      if (note.audioUrl && /^https?:/i.test(note.audioUrl)) {
        btn.setAttribute("data-vn-play-src", note.audioUrl);
      }
    });
    return btn;
  }

  function isInsideComposer(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== document.documentElement) {
      if (el.isContentEditable) return true;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true;
      if (el.classList && (el.classList.contains("ql-editor") || el.classList.contains("ProseMirror"))) return true;
      if (el.getAttribute && el.getAttribute("role") === "textbox") return true;
      if (el.closest && el.closest(".vn-composer-wrap, .lw-editor, #postComposer, #commentBox")) {
        // demo composers
        if (el.closest(".lw-editor, #postComposer, #commentBox, [contenteditable='true']")) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function enhanceAnchor(anchor) {
    if (!anchor || anchor.dataset.vnEnhanced === "1") return;
    if (isInsideComposer(anchor)) return;
    if (anchor.closest && anchor.closest(".vn-voice-pill, #vn-player-overlay, #vn-float-overlay")) return;
    var href = anchor.href || anchor.getAttribute("href") || "";
    var parsed = parsePlayUrl(href);
    if (!parsed) return;
    anchor.dataset.vnEnhanced = "1";
    anchor.classList.add("vn-voice-link-hidden");
    anchor.setAttribute("tabindex", "-1");
    anchor.setAttribute("aria-hidden", "true");

    // Intercept any click that still reaches the anchor
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      resolveNote(parsed.id, parsed.src).then(function (note) {
        openPlayerPopup(note || { title: "Voice note", audioUrl: parsed.src });
      });
    });

    // Don't duplicate pills
    var next = anchor.nextSibling;
    while (next && next.nodeType === 3 && !(next.nodeValue || "").trim()) next = next.nextSibling;
    if (next && next.classList && next.classList.contains("vn-voice-pill")) {
      if (!parsed.id || next.getAttribute("data-vn-play-id") === parsed.id) return;
    }
    if (parsed.id && anchor.parentNode && anchor.parentNode.querySelector('.vn-voice-pill[data-vn-play-id="' + parsed.id + '"]')) {
      return;
    }

    var pill = makePill(parsed);
    if (anchor.parentNode) {
      anchor.parentNode.insertBefore(pill, anchor.nextSibling);
    }
  }

  // Match absolute or site-relative play.html?id=… URLs in plain text
  var PLAY_URL_RE = /https?:\/\/[^\s<>"']+play\.html\?[^\s<>"']+|\/[^\s<>"']*play\.html\?[^\s<>"']+/gi;

  function enhanceTextNode(textNode) {
    if (!textNode || textNode.nodeType !== 3) return;
    if (isInsideComposer(textNode)) return;
    var parent = textNode.parentElement;
    if (!parent) return;
    if (parent.closest && parent.closest("a, .vn-voice-pill, .vn-voice-link-hidden, script, style, textarea, #vn-float-overlay, #vn-player-overlay")) return;
    if (parent.dataset && parent.dataset.vnTextEnhanced === "1") return;

    var text = textNode.nodeValue || "";
    PLAY_URL_RE.lastIndex = 0;
    if (!PLAY_URL_RE.test(text)) return;
    PLAY_URL_RE.lastIndex = 0;

    var frag = document.createDocumentFragment();
    var last = 0;
    var m;
    var matched = false;
    while ((m = PLAY_URL_RE.exec(text))) {
      var raw = m[0];
      // trim trailing punctuation
      raw = raw.replace(/[),.;!?]+$/g, "");
      var parsed = parsePlayUrl(raw);
      if (!parsed) continue;
      matched = true;
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      var hidden = document.createElement("span");
      hidden.className = "vn-voice-link-hidden";
      hidden.textContent = raw;
      hidden.dataset.vnEnhanced = "1";
      frag.appendChild(hidden);
      if (!(parsed.id && parent.querySelector && parent.querySelector('.vn-voice-pill[data-vn-play-id="' + parsed.id + '"]'))) {
        frag.appendChild(makePill(parsed));
      }
      last = m.index + m[0].length;
      // if we trimmed punctuation, put it back after pill
      if (m[0].length > raw.length) {
        frag.appendChild(document.createTextNode(m[0].slice(raw.length)));
      }
    }
    if (!matched) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    parent.dataset.vnTextEnhanced = "1";
    parent.replaceChild(frag, textNode);
  }

  function walkTextNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (var i = 0; i < nodes.length; i++) {
      try { enhanceTextNode(nodes[i]); } catch (err) { console.error(err); }
    }
  }

  function enhancePosts() {
    if (!cfg.enhancePosts) return;
    // Remove legacy big cards if any remain
    document.querySelectorAll(".vn-inline-player").forEach(function (el) {
      el.remove();
    });

    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.dataset.vnEnhanced === "1") continue;
      if (a.closest && a.closest(".vn-voice-pill")) continue;
      try {
        if (parsePlayUrl(a.href || a.getAttribute("href") || "")) enhanceAnchor(a);
      } catch (_) {}
    }

    // Plain-text URLs in post bodies (not composers)
    try {
      walkTextNodes(document.body);
    } catch (err) {
      console.error(err);
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
