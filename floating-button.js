/**
 * Voice Notes floating mic — opens recorder modal, inserts share link into the
 * last focused composer field, and optionally enhances posted links with inline audio.
 *
 * Config: window.VOICE_NOTES_FLOAT or data-* on the script tag
 *   appUrl, pathPattern (default "/community"), buttonColor (default "#f7a425"),
 *   userName, title, zIndex, enhancePosts (default true)
 */
(function () {
  "use strict";
  if (window.__vnFloatInstalled) return;
  window.__vnFloatInstalled = true;

  var MSG_TYPE = "voice-notes:link";
  var DB_NAME = "voice-notes-demo";
  var DB_STORE = "notes";

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
    };
  }

  function pick(val, fallback) {
    if (val === undefined || val === null || val === "") return fallback;
    return val;
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
    enhancePosts: pick(winCfg.enhancePosts, pick(dataCfg.enhancePosts, true)),
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

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled || el.readOnly) return false;
    var tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      var t = (el.type || "text").toLowerCase();
      return t === "text" || t === "search" || t === "url" || t === "email" || t === "" || t === "tel";
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

  function rememberFocus(target) {
    var el = deepestEditable(target);
    if (!el) return;
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

  var accentInk = "#1a1f36";
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
  ].join("");
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.id = "vn-float-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Record a voice note");
  btn.setAttribute("title", "Record a voice note");
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2z"/>' +
    "</svg>";

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

  function mount() {
    document.body.appendChild(btn);
    document.body.appendChild(overlay);
    document.body.appendChild(toast);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

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

  function openModal() {
    ensureEls();
    // Capture focus target again right before open
    if (document.activeElement) rememberFocus(document.activeElement);
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

    // Preferred: insertText (works in many contenteditable composers)
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
      // Last resort: append
      el.appendChild(document.createTextNode(text));
      ok = true;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    return ok;
  }

  function insertLink(link) {
    var el = lastEditable && document.contains(lastEditable) ? lastEditable : null;
    if (!el) {
      return false;
    }
    var text = link + " ";
    try {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        var pos = typeof el.selectionStart === "number" ? el.selectionStart : (el.value || "").length;
        if (pos > 0 && !/\s/.test((el.value || "").charAt(pos - 1))) text = " " + text;
        return insertIntoTextField(el, text);
      }
      if (el.isContentEditable) {
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
      if (lastEditable && lastEditable.focus) {
        try { lastEditable.focus(); } catch (_) {}
      }
      // Re-run inline enhancement shortly in case they already had posts
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

  btn.addEventListener("click", openModal);
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
      // Also allow same-origin relative demo where appUrl may be same page origin
      if (event.origin !== window.location.origin) return;
      try {
        if (cfg.appUrl && new URL(cfg.appUrl, window.location.href).origin !== event.origin) return;
      } catch (_) {
        return;
      }
    }

    // Basic URL sanity: must be http(s) and match app origin path play.html when possible
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
    if (cfg.enhancePosts === false || cfg.enhancePosts === "false") return;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleEnhance);
  } else {
    scheduleEnhance();
  }

  try {
    var mo = new MutationObserver(scheduleEnhance);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
})();
