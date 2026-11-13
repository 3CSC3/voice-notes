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

  var MSG_TYPE = "voice-notes:link";
  var DB_NAME = "voice-notes-demo";
  var DB_STORE = "notes";
  var MIC_ATTR = "data-vn-mic-for";

  function readScriptData() {
    var scripts = document.getElementsByTagName("script");
    var me = document.currentScript;
    if (!me) {
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (/floating-button\.js(?:[?#]|$)/.test(scripts[i].src || "")) { me = scripts[i]; break; }
      }
    }
    if (!me) me = scripts[scripts.length - 1];
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
  window.__vnFloatInstalled = true;
  var micStatus = window.__vnMicStatus = { version: "2026-11-13-listen-and-record", loaded: true, composers: 0, visibleMics: 0, lastError: "" };

  function appOrigin() {
    try {
      var base = (cfg.appUrl || "").trim() || window.location.href;
      return new URL(base, window.location.href).origin;
    } catch (_) {
      return window.location.origin;
    }
  }

  function buildAppSrc(draftTitle) {
    var url = (cfg.appUrl || "").trim();
    if (!url) {
      try { url = new URL("index.html", window.location.href).href; }
      catch (_) { url = "index.html"; }
    }
    var name = (cfg.userName || "").trim();
    try {
      var u = new URL(url, window.location.href);
      if (name) u.searchParams.set("name", name);
      if (draftTitle) u.searchParams.set("title", draftTitle);
      return u.href;
    } catch (_) {
      return url;
    }
  }

  var accentInk = cfg.iconColor || "#ffffff";
  // Readers only ever see the ▶ button: voice-note links/embeds outside editors are hidden
  // by CSS straight away (no flash of the URL before the script swaps in the button).
  var playBase = "";
  try { playBase = new URL("play.html", new URL((cfg.appUrl || "").trim() || window.location.href, window.location.href)).href; } catch (_) {}
  var NOT_IN_EDITOR = ':not([contenteditable]:not([contenteditable="false"]) *):not(.ql-editor *):not(.ProseMirror *):not([role="textbox"] *)';
  var preHideCss = playBase
    ? 'a[href^="' + playBase.replace(/["\\]/g, "") + '"]' + NOT_IN_EDITOR + ',iframe[src^="' + playBase.replace(/["\\]/g, "") + '"]' + NOT_IN_EDITOR + "{display:none!important;}"
    : "";
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
    /* Non-blocking, movable recorder panel: no backdrop, page stays scrollable. */
    "#vn-float-overlay{position:fixed;inset:0;z-index:" + (Number(cfg.zIndex) + 3) + ";pointer-events:none;background:transparent;}",
    "#vn-float-overlay[hidden]{display:none!important;}",
    "#vn-float-modal{position:fixed;left:16px;top:16px;pointer-events:auto;box-sizing:border-box;",
    "background:#fff;border-radius:16px;border:1px solid #f7d9a7;width:380px;height:600px;",
    "display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 48px rgba(15,23,42,.32);}",
    "#vn-float-header{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 10px;",
    "border-bottom:1px solid #e4e8f0;background:#fff8ec;cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;",
    "font:600 .95rem system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1f36;}",
    "#vn-float-grip{appearance:none;border:0;background:transparent;color:#a16207;cursor:move;touch-action:none;",
    "display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 4px;font:inherit;flex:1 1 auto;min-width:0;text-align:left;}",
    "#vn-float-grip .vn-grip-dots{font-size:1.1rem;letter-spacing:-2px;color:#f7a425;}",
    "#vn-float-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1a1f36;}",
    "#vn-float-hint{font-weight:400;font-size:.75rem;color:#5b6478;white-space:nowrap;}",
    "#vn-float-compact,#vn-float-close{appearance:none;border:none;background:#eef0f7;color:#1a1f36;flex:0 0 auto;",
    "width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:1.15rem;line-height:1;}",
    "#vn-float-compact:hover,#vn-float-close:hover{background:#e2e5ef;}",
    "#vn-float-compact:focus-visible,#vn-float-close:focus-visible,#vn-float-grip:focus-visible{outline:3px solid " + cfg.buttonColor + ";outline-offset:2px;}",
    ".vn-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;}",
    "#vn-float-shield{position:absolute;inset:0;display:none;cursor:move;z-index:2;}",
    "#vn-float-modal.vn-dragging #vn-float-shield{display:block;}",
    "#vn-float-modal.vn-dragging iframe{pointer-events:none;}",
    "#vn-float-modal.vn-dragging{box-shadow:0 24px 60px rgba(15,23,42,.42);opacity:.97;}",
    "@media(max-width:600px){#vn-float-hint{display:none;}}",
    "#vn-float-frame{flex:1 1 auto;width:100%;min-height:0;border:0;background:#f4f6fb;}",
    "#vn-float-toast{",
    "position:fixed;left:50%;bottom:max(88px,env(safe-area-inset-bottom));",
    "transform:translateX(-50%);z-index:" + (Number(cfg.zIndex) + 4) + ";",
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
    ".vn-voice-pill{min-height:44px!important;min-width:44px!important;touch-action:manipulation;}",
    ".vn-voice-pill:hover{filter:brightness(0.95);}",
    ".vn-voice-pill:focus-visible{outline:2px solid #fff;outline-offset:2px;box-shadow:0 0 0 4px " + cfg.buttonColor + ";}",
    ".vn-voice-pill__icon{font-size:0.75rem;line-height:1;}",
    ".vn-voice-pill__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:14rem;}",
    "a.vn-voice-link-hidden,.vn-voice-link-hidden{display:none!important;}",
    preHideCss,
    /* Non-blocking docked player: no full-screen backdrop, page stays usable. */
    "#vn-player-overlay{position:fixed;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));",
    "bottom:max(12px,env(safe-area-inset-bottom));z-index:" + (Number(cfg.zIndex) + 1) + ";pointer-events:none;}",
    "#vn-player-overlay[hidden]{display:none!important;}",
    "#vn-player-modal{pointer-events:auto;box-sizing:border-box;margin:0 auto;width:min(850px,100%);",
    "background:#fff;border:1px solid #f7d9a7;border-top:3px solid #f7a425;border-radius:14px;padding:10px 12px;",
    "box-shadow:0 8px 36px rgba(15,23,42,.24);font:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1f36;",
    "display:grid;grid-template-columns:48px minmax(0,1fr) auto 44px;gap:6px 10px;align-items:center;}",
    "#vn-player-details{min-width:0;}",
    "#vn-player-title{font-weight:700;font-size:.95rem;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    "#vn-player-meta{margin:.15rem 0 0;color:#5b6478;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    "#vn-player-toggle,#vn-player-reply,#vn-player-close{appearance:none!important;border:0!important;cursor:pointer;",
    "display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;border-radius:999px;padding:8px 12px;",
    "font:600 .85rem system-ui,-apple-system,Segoe UI,Roboto,sans-serif;touch-action:manipulation;",
    "background:#f7a425!important;color:#fff!important;-webkit-text-fill-color:#fff!important;}",
    "#vn-player-toggle{min-height:48px;padding:8px;}",
    "#vn-player-toggle .vn-player-toggle-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);}",
    "#vn-player-toggle span,#vn-player-reply span{color:#fff!important;-webkit-text-fill-color:#fff!important;}",
    "#vn-player-reply svg{width:18px;height:18px;fill:#fff!important;flex:none;}",
    "#vn-player-close{font-size:1.25rem;padding:8px;}",
    "#vn-player-toggle:disabled,#vn-player-reply:disabled,#vn-player-back:disabled{opacity:.5;cursor:default;}",
    "#vn-player-back{appearance:none!important;border:0!important;cursor:pointer;flex:none;min-height:44px;min-width:56px;padding:6px 10px;border-radius:999px;",
    "background:#f7a425!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font:700 .8rem system-ui,-apple-system,Segoe UI,Roboto,sans-serif;touch-action:manipulation;}",
    "#vn-player-back span{color:#fff!important;-webkit-text-fill-color:#fff!important;}",
    "#vn-player-back:focus-visible,#vn-player-toggle:focus-visible,#vn-player-reply:focus-visible,#vn-player-close:focus-visible{outline:3px solid #1a1f36;outline-offset:2px;}",
    "#vn-player-seek-row{grid-column:1/-1;display:flex;align-items:center;gap:10px;min-height:28px;}",
    "#vn-player-seek{appearance:auto!important;flex:1;min-width:0;width:auto;height:28px;padding:0;margin:0;accent-color:#f7a425;cursor:pointer;}",
    "#vn-player-time{font-size:.78rem;color:#5b6478;font-variant-numeric:tabular-nums;white-space:nowrap;}",
    "#vn-player-audio{display:none!important;}",
    "#vn-player-status{grid-column:1/-1;margin:0;font-size:.8rem;color:#5b6478;}",
    "#vn-player-status:empty{display:none;}",
    "#vn-player-status.is-error{color:#dc2626;}",
    "@media(max-width:600px){",
    "#vn-player-overlay{top:max(8px,env(safe-area-inset-top));bottom:auto;left:8px;right:8px;}",
    "#vn-player-modal{grid-template-columns:44px minmax(0,1fr) auto 44px;gap:4px 6px;padding:8px;}",
    "#vn-player-reply{padding:8px;font-size:.8rem;}",
    "#vn-player-reply span{display:none;}#vn-player-reply:after{content:'Reply';}",
    "#vn-player-toggle{min-height:44px;}#vn-player-title{font-size:.85rem;}",
    "}",
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
  overlay.innerHTML =
    '<div id="vn-float-modal" role="dialog" aria-modal="false" aria-label="Voice note recorder">' +
    '<div id="vn-float-header" title="Drag to move">' +
    '<button type="button" id="vn-float-grip">' +
    '<span class="vn-grip-dots" aria-hidden="true">⠿</span><span id="vn-float-title"></span><span id="vn-float-hint">drag to move</span>' +
    '<span class="vn-sr-only">. Use the arrow keys to move the recorder.</span></button>' +
    '<button type="button" id="vn-float-compact" aria-pressed="false" aria-label="Make recorder smaller" title="Make smaller">–</button>' +
    '<button type="button" id="vn-float-close" aria-label="Close recorder" title="Close">×</button>' +
    "</div>" +
    '<div style="position:relative;flex:1 1 auto;display:flex;min-height:0;">' +
    '<iframe id="vn-float-frame" title="Voice note recorder" allow="microphone; screen-wake-lock"></iframe>' +
    '<div id="vn-float-shield" aria-hidden="true"></div>' +
    "</div>" +
    "</div>";

  // Permanent, visually hidden live region for screen-reader announcements.
  var srStatus = document.createElement("div");
  srStatus.id = "vn-sr-status";
  srStatus.setAttribute("role", "status");
  srStatus.setAttribute("aria-live", "polite");
  srStatus.setAttribute("aria-atomic", "true");
  srStatus.style.cssText = "position:fixed!important;left:-10000px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;";
  var srTimer = null;
  function announce(msg) {
    if (!msg) return;
    srStatus.textContent = "";
    if (srTimer) clearTimeout(srTimer);
    // Clear then set so repeated messages are still announced.
    srTimer = setTimeout(function () { srStatus.textContent = msg; }, 60);
  }

  var toast = document.createElement("div");
  toast.id = "vn-float-toast";
  toast.setAttribute("hidden", "");
  toast.setAttribute("aria-hidden", "true"); // announced via #vn-sr-status

  function mountChrome() {
    document.body.appendChild(floatBtn);
    document.body.appendChild(overlay);
    document.body.appendChild(toast);
    document.body.appendChild(srStatus);
  }
  if (document.body) mountChrome();
  else document.addEventListener("DOMContentLoaded", mountChrome);

  var frame = null;
  var closeBtn = null;
  var titleEl = null;
  var lastFocus = null;
  var toastTimer = null;
  var recorderGeneration = 0;

  function ensureEls() {
    frame = overlay.querySelector("#vn-float-frame");
    closeBtn = overlay.querySelector("#vn-float-close");
    titleEl = overlay.querySelector("#vn-float-title");
    if (titleEl) titleEl.textContent = cfg.title || "Voice Notes";
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.removeAttribute("hidden");
    announce(msg);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.setAttribute("hidden", "");
    }, 3500);
  }

  function openModal(forEditable, draftTitle) {
    ensureEls();
    toast.hidden = true;
    if (toastTimer) clearTimeout(toastTimer);
    recorderGeneration++;
    // Listening and recording take turns. Do not change the source or playhead.
    try { pausePlayerForRecording(); } catch (_) {}
    insertionTarget = null;
    if (forEditable) {
      insertionTarget = forEditable;
      lastEditable = forEditable;
      rememberFocus(forEditable);
    } else if (document.activeElement) {
      rememberFocus(document.activeElement);
    }
    lastFocus = document.activeElement;
    if (frame) frame.src = buildAppSrc(draftTitle);
    overlay.removeAttribute("hidden");
    // Page stays scrollable: no scroll lock and no backdrop.
    applyCompactUi();
    layoutRecorder();
    if (closeBtn) closeBtn.focus();
    announce("Voice note recorder opened. Press Tab to reach the Record button.");
    try { syncPlaybackUi(); } catch (_) {}
  }

  function closeModal(restoreFocus) {
    var hadFocus = overlay.contains(document.activeElement);
    overlay.setAttribute("hidden", "");
    recorderGeneration++;
    endDrag(false);
    if (frame) {
      try { frame.src = "about:blank"; } catch (_) {}
    }
    // Feedback ends with the student's note STILL paused at the same position.
    try { syncPlaybackUi(); } catch (_) {}
    if (restoreFocus || hadFocus) {
      // Send keyboard / screen-reader focus back to where the user was.
      var back = (insertionTarget && document.contains(insertionTarget) && insertionTarget) ||
        (lastFocus && document.contains(lastFocus) && lastFocus) || null;
      if (back && back.focus) { try { back.focus(); } catch (_) {} }
      if (restoreFocus) announce("Recorder closed.");
    }
  }

  // ---- Movable / compact recorder panel ----
  var COMPACT_KEY = "vn-recorder-compact-v1";
  var compactMode = false;
  var compactContentHeight = 0;
  var drag = null;
  function lsGet(key) { try { return JSON.parse(window.localStorage.getItem(key) || "null"); } catch (_) { return null; } }
  function lsSet(key, val) { try { window.localStorage.setItem(key, JSON.stringify(val)); } catch (_) {} }
  compactMode = lsGet(COMPACT_KEY) === true;
  function phoneLayout() {
    try { return window.matchMedia("(max-width:600px)").matches; } catch (_) { return window.innerWidth <= 600; }
  }
  function posKey() { return "vn-recorder-pos-v1-" + (phoneLayout() ? "phone" : "desktop"); }
  function recorderModal() { return overlay.querySelector("#vn-float-modal"); }
  function headerHeight() { var h = overlay.querySelector("#vn-float-header"); return h ? Math.ceil(h.getBoundingClientRect().height) || 53 : 53; }
  function panelSize() {
    var vw = window.innerWidth, vh = window.innerHeight, phone = phoneLayout();
    var w = phone ? vw - 16 : Math.min(380, vw - 32);
    var h;
    if (compactMode) h = headerHeight() + (compactContentHeight || 190);
    else h = phone ? Math.min(Math.round(vh * 0.62), 620) : Math.min(640, vh - 32);
    return { w: Math.max(240, w), h: Math.max(120, Math.min(h, vh - 16)) };
  }
  function clampPosition(x, y, w, h) {
    var m = 8;
    return {
      x: Math.round(Math.min(Math.max(m, x), Math.max(m, window.innerWidth - w - m))),
      y: Math.round(Math.min(Math.max(m, y), Math.max(m, window.innerHeight - h - m)))
    };
  }
  function defaultPosition(w, h) {
    if (phoneLayout()) return { x: 8, y: window.innerHeight - h - 8 }; // bottom sheet; mini-player is at top
    var bottomGap = 16;
    try {
      // Desktop mini-player docks at the bottom: start the panel just above it.
      if (playerOverlay && !playerOverlay.hidden) bottomGap += Math.ceil(playerOverlay.getBoundingClientRect().height) + 8;
    } catch (_) {}
    return { x: window.innerWidth - w - 16, y: window.innerHeight - h - bottomGap };
  }
  function placeRecorder(x, y) {
    var modal = recorderModal();
    if (!modal) return null;
    var w = modal.offsetWidth, h = modal.offsetHeight;
    var p = clampPosition(x, y, w, h);
    modal.style.left = p.x + "px";
    modal.style.top = p.y + "px";
    return p;
  }
  // Keep the recorder off the student's mini-player (bottom on desktop, top on phones),
  // without forgetting where the user parked it.
  function avoidPlayerOverlap() {
    var modal = recorderModal();
    if (!modal || overlay.hidden || drag) return;
    var pm = playerOverlay && !playerOverlay.hidden ? playerOverlay.querySelector("#vn-player-modal") : null;
    if (!pm) {
      if (modal.dataset.vnSquashed) { delete modal.dataset.vnSquashed; layoutRecorder(); }
      return;
    }
    var r = modal.getBoundingClientRect(), p = pm.getBoundingClientRect();
    if (!(r.right > p.left && r.left < p.right && r.bottom > p.top - 8 && r.top < p.bottom + 8)) return;
    var vh = window.innerHeight, h = r.height, y;
    if (p.top + p.height / 2 > vh / 2) {
      // player docked at the bottom: recorder goes above it
      y = p.top - 8 - h;
      if (y < 8) { h = Math.max(120, p.top - 16); y = 8; }
    } else {
      // player docked at the top: recorder goes below it
      y = p.bottom + 8;
      if (y + h > vh - 8) { h = Math.max(120, vh - 8 - y); }
    }
    if (h !== r.height) { modal.style.height = Math.round(h) + "px"; modal.dataset.vnSquashed = "1"; }
    modal.style.top = Math.round(y) + "px";
  }
  function layoutRecorder() {
    if (overlay.hidden) return;
    var modal = recorderModal();
    if (!modal) return;
    var size = panelSize();
    modal.style.width = size.w + "px";
    modal.style.height = size.h + "px";
    var saved = lsGet(posKey());
    var p;
    if (saved && isFinite(saved.x) && isFinite(saved.y)) {
      p = { x: saved.x, y: saved.y };
      // A panel parked in the lower half keeps its bottom edge where it was.
      if (isFinite(saved.h) && saved.y + saved.h / 2 > window.innerHeight / 2) p.y = saved.y + saved.h - size.h;
    } else {
      p = defaultPosition(size.w, size.h);
    }
    placeRecorder(p.x, p.y);
    avoidPlayerOverlap();
  }
  function saveRecorderPosition() {
    var modal = recorderModal();
    if (!modal) return;
    lsSet(posKey(), { x: parseFloat(modal.style.left) || 0, y: parseFloat(modal.style.top) || 0, h: modal.offsetHeight });
  }
  function postCompactToFrame() {
    try {
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: "voice-notes:compact", compact: compactMode }, appOrigin());
    } catch (_) {}
  }
  function applyCompactUi() {
    var btn = overlay.querySelector("#vn-float-compact");
    if (btn) {
      btn.textContent = compactMode ? "□" : "–";
      btn.setAttribute("aria-pressed", compactMode ? "true" : "false");
      btn.setAttribute("aria-label", compactMode ? "Make recorder bigger" : "Make recorder smaller");
      btn.title = compactMode ? "Make bigger" : "Make smaller";
    }
    postCompactToFrame();
  }
  function setCompact(on) {
    var modal = recorderModal();
    var oldBottom = modal ? (parseFloat(modal.style.top) || 0) + modal.offsetHeight : 0;
    compactMode = !!on;
    lsSet(COMPACT_KEY, compactMode);
    applyCompactUi();
    if (!modal || overlay.hidden) return;
    var size = panelSize();
    modal.style.width = size.w + "px";
    modal.style.height = size.h + "px";
    // Keep the bottom edge anchored so a bottom panel stays at the bottom.
    var p = placeRecorder(parseFloat(modal.style.left) || 0, oldBottom - size.h);
    if (p) saveRecorderPosition();
    avoidPlayerOverlap();
  }
  function endDrag(save) {
    if (!drag) return;
    var modal = recorderModal();
    var header = overlay.querySelector("#vn-float-header");
    try { if (header && header.releasePointerCapture) header.releasePointerCapture(drag.id); } catch (_) {}
    if (modal) modal.classList.remove("vn-dragging");
    drag = null;
    if (save) saveRecorderPosition();
    avoidPlayerOverlap();
  }
  (function wirePanel() {
    var header = overlay.querySelector("#vn-float-header");
    var modal = recorderModal();
    if (!header || !modal) return;
    header.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      if (e.target.closest && e.target.closest("#vn-float-compact, #vn-float-close")) return;
      var r = modal.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
      modal.classList.add("vn-dragging"); // shield covers the iframe so it can't steal moves
      try { if (header.setPointerCapture) header.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    header.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      placeRecorder(e.clientX - drag.dx, e.clientY - drag.dy);
      e.preventDefault();
    });
    header.addEventListener("pointerup", function (e) { if (drag && e.pointerId === drag.id) endDrag(true); });
    header.addEventListener("pointercancel", function (e) { if (drag && e.pointerId === drag.id) endDrag(true); });
    header.addEventListener("lostpointercapture", function (e) { if (drag && e.pointerId === drag.id) endDrag(true); });
    // Shield fallback (if pointer capture is unavailable)
    var shield = overlay.querySelector("#vn-float-shield");
    if (shield) {
      shield.addEventListener("pointermove", function (e) { if (drag && e.pointerId === drag.id) placeRecorder(e.clientX - drag.dx, e.clientY - drag.dy); });
      shield.addEventListener("pointerup", function (e) { if (drag && e.pointerId === drag.id) endDrag(true); });
    }
    var grip = overlay.querySelector("#vn-float-grip");
    if (grip) grip.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 60 : 20, dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step; else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step; else if (e.key === "ArrowDown") dy = step; else return;
      e.preventDefault();
      placeRecorder((parseFloat(modal.style.left) || 0) + dx, (parseFloat(modal.style.top) || 0) + dy);
      saveRecorderPosition();
      announce("Recorder moved");
    });
    var compactBtn = overlay.querySelector("#vn-float-compact");
    if (compactBtn) compactBtn.addEventListener("click", function () {
      setCompact(!compactMode);
      announce(compactMode ? "Recorder made smaller" : "Recorder made bigger");
    });
    var fr = overlay.querySelector("#vn-float-frame");
    if (fr) fr.addEventListener("load", postCompactToFrame);
    window.addEventListener("resize", function () { if (!overlay.hidden) layoutRecorder(); });
    window.addEventListener("message", function (event) {
      var d = event.data;
      if (!d || d.type !== "voice-notes:size" || event.origin !== appOrigin()) return;
      if (!frame || event.source !== frame.contentWindow) return;
      var h = Math.max(80, Math.min(1200, Number(d.height) || 0));
      if (!compactMode || Math.abs(h - compactContentHeight) < 2) { compactContentHeight = h; return; }
      var oldBottom = (parseFloat(modal.style.top) || 0) + modal.offsetHeight;
      compactContentHeight = h;
      var size = panelSize();
      modal.style.height = size.h + "px";
      if (placeRecorder(parseFloat(modal.style.left) || 0, oldBottom - size.h) && !drag) saveRecorderPosition();
      avoidPlayerOverlap();
    });
  })();

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
    var inserted = insertLink(link);
    if (inserted) {
      closeModal();
      showToast("Voice note added to your comment — press Send when ready");
      var el = insertionTarget || lastEditable;
      if (el && el.focus) {
        try { el.focus(); } catch (_) {}
      }
      scheduleEnhance();
      return;
    }
    // No comment box to put it in: keep the recorder open (the note is saved) and let
    // the recorder offer "Add to comment" once a box is clicked. The URL is never shown.
    showToast("Click into a comment box, then press “Add to comment” in the recorder");
    try {
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: "voice-notes:insert-result", ok: false }, appOrigin());
    } catch (_) {}
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (_) {}
    }
  }

  floatBtn.addEventListener("click", function () {
    openModal(null);
  });
  // Clicking the page never closes the recorder (it would discard a recording).
  overlay.addEventListener("click", function (e) {
    if (e.target && e.target.id === "vn-float-close") closeModal(true);
  });
  document.addEventListener("keydown", function (e) {
    // Escape closes only when focus is in the recorder panel itself, so reading or
    // typing on the page never discards a recording by accident.
    if (e.key === "Escape" && !overlay.hasAttribute("hidden") && overlay.contains(document.activeElement)) {
      e.preventDefault();
      closeModal(true);
    }
  });

  window.addEventListener("message", function (event) {
    var d = event.data;
    if (!d || d.type !== "voice-notes:escape" || event.origin !== appOrigin()) return;
    if (!frame || event.source !== frame.contentWindow || overlay.hidden) return;
    closeModal(true);
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
  var attached = new WeakMap(); // editable/closed-composer trigger -> mic button
  var composerOwners = Object.create(null);
  var composerRoots = new WeakMap();
  var composerEntries = [];
  var EDITOR_SELECTOR = 'textarea, [contenteditable]:not([contenteditable="false"]), .ql-editor, .ProseMirror, [role="textbox"]';

  function isVisibleComposer(el) {
    try {
      if (!el || !document.contains(el) || !el.getClientRects().length) return false;
      if (el.closest('[hidden], [aria-hidden="true"]')) return false;
      var cs = window.getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && cs.visibility !== "collapse";
    } catch (_) { return false; }
  }

  function actualComposer(el) {
    if (isEditable(el)) return el;
    var root = composerRoots.get(el);
    if (root) {
      var editors = root.querySelectorAll(EDITOR_SELECTOR);
      for (var i = 0; i < editors.length; i++) {
        if (isEditable(editors[i]) && isVisibleComposer(editors[i])) return editors[i];
      }
    }
    return null;
  }

  function inVoiceUi(el) {
    return !!(el.closest && el.closest("#vn-float-overlay, #vn-float-modal, #vn-float-btn, .vn-composer-mic, .vn-voice-pill, #vn-player-overlay, .vn-inline-player"));
  }

  function looksLikeComposer(el) {
    if (!el || el.nodeType !== 1) return false;
    if (inVoiceUi(el) || !isVisibleComposer(el)) return false;
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

    document.querySelectorAll(EDITOR_SELECTOR).forEach(function (el) {
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

    // Desktop LearnWorlds can initially render a clickable placeholder rather than
    // an editor. Recognize that CLOSED composer too, but only beside a real Share toolbar.
    var hintPattern = /^\s*(?:type something\b|write a (?:comment|reply|post)\b|add a comment\b|escreva (?:algo|um coment))/i;
    function addClosed(el, hint) {
      if (!el || seen.has(el) || !hintPattern.test(hint || "") || !looksLikeComposer(el)) return;
      if (el.closest('[contenteditable="true"], [contenteditable="plaintext-only"], textarea')) { add(el); return; }
      var info = findToolbar(el);
      if (!info || !info.share || !info.root || info.root === document.body || info.root === document.documentElement) return;
      var real = info.root.querySelectorAll(EDITOR_SELECTOR);
      for (var i = 0; i < real.length; i++) {
        if (isEditable(real[i]) && isVisibleComposer(real[i])) return;
      }
      composerRoots.set(el, info.root);
      add(el);
    }
    document.querySelectorAll('[data-placeholder], [placeholder]').forEach(function (el) {
      addClosed(el, el.getAttribute("data-placeholder") || el.getAttribute("placeholder"));
    });
    try {
      var walker = document.createTreeWalker(document.body || document.documentElement, 4);
      var text;
      while ((text = walker.nextNode())) {
        if (hintPattern.test(text.nodeValue || "")) addClosed(text.parentElement, text.nodeValue);
      }
    } catch (_) {}
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
        if (isShareControl(candidates[i]) && isVisibleComposer(candidates[i])) {
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
      if (toolbar && toolbar !== editable && !editable.contains(toolbar) && isVisibleComposer(toolbar)) {
        return { row: toolbar, share: null, root: parent };
      }
      node = parent;
    }
    return null;
  }

  function ensureComposerId(el) {
    var id = el.dataset.vnComposerId;
    // Responsive frameworks may clone an editor AND its data attributes. Never
    // reuse a hidden/mobile editor's microphone for a different desktop element.
    if (!id || (composerOwners[id] && composerOwners[id] !== el)) {
      do { composerIdSeq += 1; id = "c" + composerIdSeq; } while (composerOwners[id]);
      el.dataset.vnComposerId = id;
    }
    composerOwners[id] = el;
    return id;
  }

  function openRecorderForComposer(editable, draftTitle) {
    var target = editable ? actualComposer(editable) : null;
    if (!target && editable) {
      try { editable.click(); } catch (_) {} // activate placeholder, NEVER Share
      target = actualComposer(editable);
    }
    if (target) rememberFocus(target);
    openModal(target, draftTitle);
    var generation = recorderGeneration;
    if (!target && editable) {
      [80, 250, 600].forEach(function (delay) {
        setTimeout(function () {
          if (generation !== recorderGeneration || overlay.hidden) return;
          var real = actualComposer(editable);
          if (real) { insertionTarget = real; rememberFocus(real); }
        }, delay);
      });
    }
  }

  function makeMicButton(editable) {
    var id = ensureComposerId(editable);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "vn-composer-mic";
    b.setAttribute(MIC_ATTR, id);
    b.setAttribute("aria-label", "Record voice note");
    b.setAttribute("title", "Record voice note");
    b.innerHTML = MIC_SVG;
    b.addEventListener("mousedown", function (e) {
      // Keep focus/selection in the composer; don't steal caret before we snapshot
      e.preventDefault();
    });
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openRecorderForComposer(editable);
    });
    return b;
  }

  function placeMicInToolbar(editable, toolbarInfo, mic) {
    if (mic.classList.contains("vn-composer-mic--corner")) mic.classList.remove("vn-composer-mic--corner");
    if (editable && editable.classList && editable.classList.contains("vn-has-corner-mic")) {
      editable.classList.remove("vn-has-corner-mic");
      editable.style.removeProperty("padding-right");
    }
    var row = toolbarInfo.row;
    var share = toolbarInfo.share;
    if (share && share.parentNode === row) {
      // Insert before the share button (end of icon cluster)
      if (mic.parentNode !== row || mic.nextSibling !== share) row.insertBefore(mic, share);
    } else if (share && share.parentNode) {
      if (mic.parentNode !== share.parentNode || mic.nextSibling !== share) share.parentNode.insertBefore(mic, share);
    } else {
      if (mic.parentNode !== row) row.appendChild(mic);
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
    var toolbar = findToolbar(editable);
    if (toolbar && toolbar.root) composerRoots.set(editable, toolbar.root);
    var existing = attached.get(editable);
    if (existing && document.contains(existing)) {
      if (existing.hidden) existing.hidden = false;
      if (toolbar && toolbar.row) placeMicInToolbar(editable, toolbar, existing);
      return;
    }
    var mic = makeMicButton(editable);
    if (toolbar && toolbar.row) placeMicInToolbar(editable, toolbar, mic);
    else placeMicCorner(editable, mic);
    attached.set(editable, mic);
    composerEntries.push({ editor: editable, mic: mic });
  }

  function scanComposers() {
    if (cfg.mode === "floating") {
      floatBtn.hidden = false;
      return;
    }
    var list = collectComposers();
    micStatus.composers = list.length;
    composerEntries = composerEntries.filter(function (entry) {
      if (!document.contains(entry.editor)) {
        var retiredId = entry.editor.dataset.vnComposerId;
        if (retiredId && composerOwners[retiredId] === entry.editor) delete composerOwners[retiredId];
        if (entry.mic.parentNode) entry.mic.parentNode.removeChild(entry.mic);
        return false;
      }
      var inactive = list.indexOf(entry.editor) === -1;
      if (entry.mic.hidden !== inactive) entry.mic.hidden = inactive;
      return true;
    });
    for (var i = 0; i < list.length; i++) {
      try { attachMic(list[i]); } catch (err) { micStatus.lastError = String(err && err.message || err); console.error(err); }
    }
    var allMics = document.querySelectorAll(".vn-composer-mic");
    var anyMic = false;
    micStatus.visibleMics = 0;
    for (var j = 0; j < allMics.length; j++) {
      if (isVisibleComposer(allMics[j])) { anyMic = true; micStatus.visibleMics++; }
    }
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
      try { scanComposers(); } catch (err) { micStatus.lastError = String(err && err.message || err); console.warn("[voice-notes mic]", err); }
      try { scheduleEnhance(); } catch (err) { console.warn("[voice-notes player]", err); }
    }, 200);
  }

  // Mount the mic independently: optional audio/player/privacy failures must
  // not prevent it from appearing. No storage, microphone or wake-lock access here.
  function boot() {
    try { scanComposers(); } catch (err) { micStatus.lastError = String(err && err.message || err); console.warn("[voice-notes mic]", err); }
    setTimeout(function () { try { scheduleEnhance(); } catch (_) {} }, 0);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("resize", scheduleScan);
  document.addEventListener("focusin", scheduleScan, true);
  try {
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target;
        if (target && target.nodeType === 1 && inVoiceUi(target)) continue;
        scheduleScan();
        break;
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["contenteditable", "hidden", "aria-hidden", "class", "style"] });
  } catch (_) {}

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

  // ---- Non-blocking mini-player ----
  var playerOverlay = document.createElement("div");
  playerOverlay.id = "vn-player-overlay";
  playerOverlay.setAttribute("hidden", "");
  playerOverlay.innerHTML =
    '<section id="vn-player-modal" role="region" aria-label="Voice note player" tabindex="-1">' +
    '<audio id="vn-player-audio" preload="metadata"></audio>' +
    '<button type="button" id="vn-player-toggle" aria-label="Play voice note" disabled><span aria-hidden="true">▶</span><span class="vn-player-toggle-label">Play</span></button>' +
    '<div id="vn-player-details"><h2 id="vn-player-title">Voice note</h2><p id="vn-player-meta"></p></div>' +
    '<button type="button" id="vn-player-reply" aria-label="Reply with voice" title="Pause and record your feedback" disabled>' + MIC_SVG + '<span>Reply with voice</span></button>' +
    '<button type="button" id="vn-player-close" aria-label="Close voice note player" title="Close">×</button>' +
    '<div id="vn-player-seek-row"><button type="button" id="vn-player-back" title="Back 5 seconds" disabled><span aria-hidden="true">↺ 5s</span><span class="vn-sr-only">Back 5 seconds</span></button><input id="vn-player-seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="Position in voice note" disabled><span id="vn-player-time" aria-hidden="true">0:00 / 0:00</span></div>' +
    '<p id="vn-player-status" role="status"></p>' +
    '</section>';

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
    var focusWasInside = ov.contains(document.activeElement);
    ov.setAttribute("hidden", "");
    restorePlayerSpace();
    avoidPlayerOverlap();
    if (focusWasInside) {
      var back = playerReturnFocus && document.contains(playerReturnFocus) ? playerReturnFocus : null;
      if (back && back.focus) { try { back.focus(); } catch (_) {} }
    }
    announce("Voice note player closed");
    var audio = document.getElementById("vn-player-audio");
    if (audio) {
      try { audio.pause(); } catch (_) {}
      // Keep the source/position: opening this same note again resumes it.
      syncPlaybackUi();
    }
  }

  var currentPlayerNote = null;
  var currentPlayerContext = null;
  var dockPadding = null;

  function reservePlayerSpace() {
    if (!playerOverlay || playerOverlay.hidden || !document.body) return;
    var h = Math.ceil(playerOverlay.getBoundingClientRect().height) + 16;
    var phone = window.matchMedia ? window.matchMedia("(max-width:600px)").matches : window.innerWidth <= 600;
    if (!dockPadding) {
      var cs = window.getComputedStyle(document.body);
      dockPadding = { top: document.body.style.getPropertyValue("padding-top"), topPriority: document.body.style.getPropertyPriority("padding-top"),
        bottom: document.body.style.getPropertyValue("padding-bottom"), bottomPriority: document.body.style.getPropertyPriority("padding-bottom"),
        topPx: parseFloat(cs.paddingTop) || 0, bottomPx: parseFloat(cs.paddingBottom) || 0 };
    }
    var top = phone ? (dockPadding.topPx + h) + "px" : dockPadding.top;
    var bottom = phone ? dockPadding.bottom : (dockPadding.bottomPx + h) + "px";
    if (document.body.style.paddingTop !== top) document.body.style.setProperty("padding-top", top, phone ? "important" : dockPadding.topPriority);
    if (document.body.style.paddingBottom !== bottom) document.body.style.setProperty("padding-bottom", bottom, phone ? dockPadding.bottomPriority : "important");
    if (document.documentElement.style.getPropertyValue("--vn-feedback-player-height") !== h + "px") {
      document.documentElement.style.setProperty("--vn-feedback-player-height", h + "px");
    }
  }

  function restorePlayerSpace() {
    if (!dockPadding || !document.body) return;
    document.body.style.setProperty("padding-top", dockPadding.top, dockPadding.topPriority);
    document.body.style.setProperty("padding-bottom", dockPadding.bottom, dockPadding.bottomPriority);
    document.documentElement.style.removeProperty("--vn-feedback-player-height");
    dockPadding = null;
    overlay.classList.remove("vn-with-player");
  }

  function keepComposerClear(target) {
    if (!target || !isEditable(target) || !playerOverlay || playerOverlay.hidden || !overlay.hidden) return;
    var a = target.getBoundingClientRect(), b = playerOverlay.getBoundingClientRect();
    if (a.top < b.bottom && a.bottom > b.top && a.left < b.right && a.right > b.left) {
      try { target.scrollIntoView({ block: "center", behavior: "auto" }); } catch (_) {}
    }
  }
  window.addEventListener("resize", reservePlayerSpace);
  document.addEventListener("focusin", function (e) { setTimeout(function () { keepComposerClear(e.target); }, 0); }, true);
  try { if (window.ResizeObserver) new ResizeObserver(function () { reservePlayerSpace(); avoidPlayerOverlap(); }).observe(playerOverlay); } catch (_) {}

  // ---- Listening + recording at the same time ----
  var myRecordingState = "idle";
  function pauseMyRecordingForPlayback() {
    if (overlay.hidden || !frame || !frame.contentWindow) return;
    try { frame.contentWindow.postMessage({ type: "voice-notes:pause-recording" }, appOrigin()); } catch (_) {}
  }
  window.addEventListener("message", function (event) {
    var d = event.data;
    if (!d || d.type !== "voice-notes:recording-state" || event.origin !== appOrigin()) return;
    if (!frame || event.source !== frame.contentWindow) return;
    myRecordingState = String(d.state || "");
    if (myRecordingState === "recording") {
      var a = playerOverlay.querySelector("#vn-player-audio");
      if (a && !a.paused && !a.ended) {
        a.pause();
        announce("Student's note paused while you record.");
      }
      syncPlaybackUi();
    }
  });

  function pausePlayerForRecording() {
    var audio = playerOverlay && playerOverlay.querySelector("#vn-player-audio");
    if (audio) audio.pause();
    if (playerOverlay) syncPlaybackUi();
  }

  function spokenDuration(sec) {
    var t = Math.max(0, Math.floor(Number(sec) || 0)), m = Math.floor(t / 60), r = t % 60;
    var parts = [];
    if (m) parts.push(m + (m === 1 ? " minute" : " minutes"));
    if (r || !m) parts.push(r + (r === 1 ? " second" : " seconds"));
    return parts.join(" ");
  }
  // Accessible name for a ▶ button: "Play voice note: My weekend, by Maria, 20 seconds".
  function pillAccessibleName(pill, playing) {
    // Starts with the action, then repeats the visible text exactly (so voice-control
    // users can say what they see), then the author if it isn't already shown.
    var n = pill._vnNote || {};
    var name = (playing ? "Pause" : "Play") + " voice note";
    var label = pill.querySelector(".vn-voice-pill__label");
    var shown = label ? (label.textContent || "").trim() : "";
    if (shown === "Loading…") return name + ", loading";
    if (shown && shown !== "Voice note") name += ": " + shown;
    if (n.name && shown.indexOf(n.name) === -1) name += ", by " + n.name;
    return name;
  }
  function updatePlayerTime() {
    var audio = playerOverlay.querySelector("#vn-player-audio");
    var known = Number(currentPlayerNote && currentPlayerNote.duration) || 0;
    var duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : known;
    var position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    var seek = playerOverlay.querySelector("#vn-player-seek");
    seek.max = Math.max(duration, position, 0);
    seek.value = position;
    seek.disabled = !currentPlayerNote || !duration;
    seek.setAttribute("aria-valuetext", spokenDuration(position) + " of " + spokenDuration(duration));
    playerOverlay.querySelector("#vn-player-time").textContent = formatDuration(position) + " / " + formatDuration(duration);
  }

  function findFeedbackComposer(context) {
    if (!context || !document.contains(context)) return null;
    var all = collectComposers();
    var semantic = 'article, [data-post-id], [data-comment-id], [data-activity-id], .post, .comment, .reply, .community-post, .social-post, [data-testid*="post" i], [class*="post-card" i], [class*="comment-card" i]';
    var node = context.parentElement;
    for (var depth = 0; node && node !== document.body && depth < 12; depth++, node = node.parentElement) {
      // Do not wander across a feed into another student's post. Prefer an explicit
      // post/comment boundary; otherwise only consider a small single-note wrapper.
      var named = node.matches && node.matches(semantic);
      var pills = node.querySelectorAll(".vn-voice-pill");
      if (!named && pills.length > 1) break;
      var candidates = all.filter(function (el) { return node.contains(el) && !inVoiceUi(el); });
      if (candidates.length) {
        if (lastEditable && candidates.indexOf(lastEditable) !== -1) return lastEditable;
        var origin = context.getBoundingClientRect();
        candidates.sort(function (a, b) {
          function score(el) {
            var r = el.getBoundingClientRect();
            var hint = (el.id || "") + " " + (el.getAttribute("placeholder") || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.className || "");
            var comment = /comment|reply|respost|coment/i.test(hint) || !!el.closest('[class*="comment" i], [class*="reply" i]');
            return Math.abs(r.top - origin.bottom) + (r.top < origin.top ? 200 : 0) - (comment ? 1000 : 0);
          }
          return score(a) - score(b);
        });
        return candidates[0];
      }
      if (named) break; // no composer in this post: use explicit last-focus/copy fallback
    }
    return null;
  }

  function replyWithVoice() {
    pausePlayerForRecording();
    if (!overlay.hidden) {
      // Recorder already open next to the player: just hand over to it.
      var grip = overlay.querySelector("#vn-float-grip");
      if (grip) { try { grip.focus(); } catch (_) {} }
      announce("Student's note paused. Your recorder is open.");
      return;
    }
    var audio = playerOverlay.querySelector("#vn-player-audio");
    var target = findFeedbackComposer(currentPlayerContext);
    if (!target && lastEditable && document.contains(lastEditable) && isVisibleComposer(lastEditable)) target = lastEditable;
    var draftTitle = "Feedback at " + formatDuration(audio.currentTime);
    openRecorderForComposer(target, draftTitle);
    if (!target) showToast("No reply box found — click into a comment box before you post.");
  }

  function matchesCurrentNote(id, src) {
    if (!currentPlayerNote) return false;
    if (id && currentPlayerNote.id) return id === currentPlayerNote.id;
    return !!src && src === currentPlayerNote.audioUrl;
  }

  function syncPlaybackUi() {
    var audio = playerOverlay.querySelector("#vn-player-audio");
    var playing = !!audio && !audio.paused && !audio.ended;
    var toggle = playerOverlay.querySelector("#vn-player-toggle");
    // Listening and recording work side by side: nothing here is disabled by the recorder.
    toggle.disabled = !currentPlayerNote || !audio.getAttribute("src");
    playerOverlay.querySelector("#vn-player-reply").disabled = !currentPlayerNote;
    var back = playerOverlay.querySelector("#vn-player-back");
    if (back) back.disabled = !currentPlayerNote || !audio.getAttribute("src");
    updatePlayerTime();
    toggle.querySelector("span:first-child").textContent = playing ? "❚❚" : "▶";
    toggle.querySelector("span:last-child").textContent = playing ? "Pause" : "Play";
    var noteName = currentPlayerNote && currentPlayerNote.title ? ": " + currentPlayerNote.title : "";
    toggle.setAttribute("aria-label", (playing ? "Pause voice note" : "Play voice note") + noteName);
    var pills = document.querySelectorAll(".vn-voice-pill");
    for (var i = 0; i < pills.length; i++) {
      var pill = pills[i];
      var active = matchesCurrentNote(pill.getAttribute("data-vn-play-id"), pill.getAttribute("data-vn-play-src"));
      var on = active && playing;
      var icon = pill.querySelector(".vn-voice-pill__icon");
      if (icon && icon.textContent !== (on ? "❚❚" : "▶")) icon.textContent = on ? "❚❚" : "▶";
      pill.setAttribute("aria-label", pillAccessibleName(pill, on));
    }
  }

  function playCurrentAudio() {
    var audio = playerOverlay.querySelector("#vn-player-audio");
    var statusEl = playerOverlay.querySelector("#vn-player-status");
    if (!currentPlayerNote || !audio.getAttribute("src")) return;
    // If my recording is running, pause it first so the student's audio isn't captured.
    if (!overlay.hidden) pauseMyRecordingForPlayback();
    if (audio.ended) audio.currentTime = 0;
    var promise = audio.play();
    if (promise && promise.catch) promise.catch(function () {
      statusEl.textContent = "Press Play to listen.";
      syncPlaybackUi();
    });
  }

  function toggleCurrentAudio() {
    var audio = playerOverlay.querySelector("#vn-player-audio");
    if (audio.paused || audio.ended) playCurrentAudio();
    else audio.pause();
    syncPlaybackUi();
  }

  try {
  playerOverlay.querySelector("#vn-player-toggle").addEventListener("click", toggleCurrentAudio);
  playerOverlay.querySelector("#vn-player-reply").addEventListener("click", replyWithVoice);
  playerOverlay.querySelector("#vn-player-back").addEventListener("click", function () {
    var a = playerOverlay.querySelector("#vn-player-audio");
    try { a.currentTime = Math.max(0, (a.currentTime || 0) - 5); } catch (_) {}
    updatePlayerTime();
    announce("Back 5 seconds, " + spokenDuration(a.currentTime || 0));
  });
  playerOverlay.querySelector("#vn-player-seek").addEventListener("input", function (e) {
    try { playerOverlay.querySelector("#vn-player-audio").currentTime = Number(e.target.value) || 0; } catch (_) {}
    updatePlayerTime();
  });
  ["timeupdate", "durationchange", "loadedmetadata"].forEach(function (event) {
    playerOverlay.querySelector("#vn-player-audio").addEventListener(event, updatePlayerTime);
  });
  ["play", "pause", "ended", "emptied", "error"].forEach(function (event) {
    playerOverlay.querySelector("#vn-player-audio").addEventListener(event, function () {
      if (event === "play") {
        if (!overlay.hidden) pauseMyRecordingForPlayback();
        playerOverlay.querySelector("#vn-player-status").textContent = "";
      }
      syncPlaybackUi();
    });
  });

  } catch (err) {
    console.warn("[voice-notes player] Audio controls unavailable; the recorder mic is still active.", err);
  }

  var playerReturnFocus = null;
  function openPlayerPopup(note, context) {
    mountPlayerChrome();
    var ov = document.getElementById("vn-player-overlay");
    var titleEl = document.getElementById("vn-player-title");
    var metaEl = document.getElementById("vn-player-meta");
    var statusEl = document.getElementById("vn-player-status");
    var audio = document.getElementById("vn-player-audio");
    ov.removeAttribute("hidden");
    if (context) currentPlayerContext = context;
    reservePlayerSpace();
    avoidPlayerOverlap();
    // The same pill is a real play/pause toggle, not a restart-from-zero button.
    if (note && matchesCurrentNote(note.id, note.audioUrl) && audio.getAttribute("src")) {
      toggleCurrentAudio();
      return;
    }
    audio.pause();
    titleEl.textContent = (note && note.title) || "Voice note";
    var bits = [];
    if (note && note.name) bits.push(note.name);
    if (note && note.duration) bits.push(formatDuration(note.duration));
    metaEl.textContent = bits.join(" · ");
    statusEl.textContent = "";
    statusEl.className = "";
    currentPlayerNote = null;
    audio.removeAttribute("src");
    syncPlaybackUi();
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
    currentPlayerNote = note;
    audio.src = note.audioUrl;
    syncPlaybackUi();
    playCurrentAudio();
    // Move keyboard / screen-reader focus into the player; Escape or Close returns it.
    if (context && context.classList && context.classList.contains("vn-voice-pill")) playerReturnFocus = context;
    var toggleBtn = document.getElementById("vn-player-toggle");
    if (toggleBtn && !toggleBtn.disabled) { try { toggleBtn.focus(); } catch (_) {} }
    announce("Playing voice note" + (note.title ? ": " + note.title : "") + (note.name ? ", by " + note.name : "") +
      ". Player controls: Pause, Reply with voice, position slider, and Close. Press Escape to close.");
  }

  playerOverlay.addEventListener("click", function (e) {
    if (e.target && e.target.id === "vn-player-close") closePlayerPopup();
  });
  document.addEventListener("keydown", function (e) {
    var ovEl = document.getElementById("vn-player-overlay");
    var inPlayer = !!(ovEl && ovEl.contains(document.activeElement));
    if (e.key === "Escape" && !e.defaultPrevented && (overlay.hidden || inPlayer)) {
      var ov = ovEl;
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
    btn._vnNote = noteHint || null;
    btn.setAttribute("aria-label", pillAccessibleName(btn, false));
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var id = btn.getAttribute("data-vn-play-id") || parsed.id;
      var src = btn.getAttribute("data-vn-play-src") || parsed.src;
      if (matchesCurrentNote(id, src)) { openPlayerPopup(currentPlayerNote, btn); return; }
      btn.querySelector(".vn-voice-pill__label").textContent = "Loading…";
      resolveNote(id, src).then(function (note) {
        btn.querySelector(".vn-voice-pill__label").textContent = pillLabel(note || noteHint);
        if (note) btn._vnNote = note;
        btn.setAttribute("aria-label", pillAccessibleName(btn, false));
        openPlayerPopup(note || { id: id, title: "Voice note", audioUrl: src }, btn);
      });
    });
    // Prefetch meta for nicer label when we have supabase / src
    resolveNote(parsed.id, parsed.src).then(function (note) {
      if (!note) return;
      if (note.title || note.name || note.duration) {
        btn.querySelector(".vn-voice-pill__label").textContent = pillLabel(note);
      }
      btn._vnNote = note;
      if (note.id) btn.setAttribute("data-vn-play-id", note.id);
      if (note.audioUrl && /^https?:/i.test(note.audioUrl)) {
        btn.setAttribute("data-vn-play-src", note.audioUrl);
      }
      syncPlaybackUi();
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

  // Where a pill for this note would already be visible (same comment/post).
  function pillScope(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return null;
    return (el.closest && el.closest('[class*="comment" i], article, li, [class*="post" i]')) || el.parentElement || el;
  }
  function hasPillFor(scope, id) {
    if (!scope || !id || !scope.querySelector) return false;
    try { return !!scope.querySelector('.vn-voice-pill[data-vn-play-id="' + String(id).replace(/["\\]/g, "") + '"]'); } catch (_) { return false; }
  }
  function hideLinkNode(el) {
    el.classList.add("vn-voice-link-hidden");
    el.setAttribute("aria-hidden", "true");
    if (el.tagName === "A" || el.tagName === "IFRAME") el.setAttribute("tabindex", "-1");
    el.dataset.vnEnhanced = "1";
  }
  // A link preview / embed card that LearnWorlds (or the browser) generated for the URL.
  var PREVIEW_SEL = '[class*="preview" i],[class*="embed" i],[class*="unfurl" i],[class*="link-card" i],[class*="linkcard" i],' +
    '[class*="opengraph" i],[class*="og-card" i],[class*="rich-link" i],[class*="oembed" i],[class*="bookmark" i],[data-link-preview]';
  function previewContainer(node) {
    var start = node.parentElement;
    var c = start && start.closest ? start.closest(PREVIEW_SEL) : null;
    if (!c || c === document.body || c === document.documentElement) return null;
    if (c.matches("article, main") || c.querySelector("article, textarea, [contenteditable], .vn-voice-pill")) return null;
    var links = c.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) if (!parsePlayUrl(links[i].href || links[i].getAttribute("href") || "")) return null;
    var host = "";
    try { host = new URL(playBase).hostname; } catch (_) {}
    var text = (c.textContent || "").replace(PLAY_URL_RE, " ");
    PLAY_URL_RE.lastIndex = 0;
    var looksLikeCard = !!c.querySelector("img, picture, svg, iframe, video") || /voice\s*notes?/i.test(text) || (host && text.indexOf(host) !== -1);
    var rest = text.replace(/voice\s*notes?/gi, "").split(host || "\u0000").join("").replace(/github(\.io)?/gi, "").replace(/[\s\W_]+/g, "");
    return looksLikeCard && rest.length <= 30 ? c : null;
  }

  function enhanceAnchor(anchor) {
    if (!anchor || anchor.dataset.vnEnhanced === "1") return;
    if (isInsideComposer(anchor)) return;
    if (anchor.closest && anchor.closest(".vn-voice-pill, #vn-player-overlay, #vn-float-overlay")) return;
    var href = anchor.tagName === "IFRAME" ? (anchor.getAttribute("src") || "") : (anchor.href || anchor.getAttribute("href") || "");
    var parsed = parsePlayUrl(href);
    if (!parsed) return;
    var card = previewContainer(anchor);
    var hideTarget = card || anchor;
    hideLinkNode(anchor);
    if (card) hideLinkNode(card);

    // Intercept any click that still reaches the anchor
    if (anchor.tagName === "A") anchor.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      resolveNote(parsed.id, parsed.src).then(function (note) {
        openPlayerPopup(note || { id: parsed.id, title: "Voice note", audioUrl: parsed.src }, anchor);
      });
    });

    // Don't duplicate pills
    var next = hideTarget.nextSibling;
    while (next && next.nodeType === 3 && !(next.nodeValue || "").trim()) next = next.nextSibling;
    if (next && next.classList && next.classList.contains("vn-voice-pill")) {
      if (!parsed.id || next.getAttribute("data-vn-play-id") === parsed.id) return;
    }
    if (parsed.id && (hasPillFor(hideTarget.parentNode, parsed.id) || hasPillFor(pillScope(hideTarget), parsed.id))) return;

    var pill = makePill(parsed);
    if (hideTarget.parentNode) hideTarget.parentNode.insertBefore(pill, hideTarget.nextSibling);
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
      hidden.setAttribute("aria-hidden", "true");
      hidden.textContent = raw;
      hidden.dataset.vnEnhanced = "1";
      frag.appendChild(hidden);
      if (!(parsed.id && (hasPillFor(parent, parsed.id) || hasPillFor(pillScope(parent), parsed.id)))) {
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

    var links = document.querySelectorAll("a[href], iframe[src]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.dataset.vnEnhanced === "1") continue;
      if (a.closest && a.closest(".vn-voice-pill")) continue;
      try {
        var h = a.tagName === "IFRAME" ? a.getAttribute("src") || "" : a.href || a.getAttribute("href") || "";
        if (parsePlayUrl(h)) enhanceAnchor(a);
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


})();
