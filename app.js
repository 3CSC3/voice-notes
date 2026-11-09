(function () {
  "use strict";

  const MAX_SECONDS = 180;
  const DB_NAME = "voice-notes-demo";
  const DB_STORE = "notes";
  const DB_VERSION = 1;
  const MSG_TYPE = "voice-notes:link";

  const cfg = window.VOICE_NOTES_CONFIG || {};
  const hasSupabase =
    typeof cfg.SUPABASE_URL === "string" &&
    cfg.SUPABASE_URL.trim() !== "" &&
    typeof cfg.SUPABASE_ANON_KEY === "string" &&
    cfg.SUPABASE_ANON_KEY.trim() !== "";

  let supabase = null;
  if (hasSupabase && window.supabase) {
    supabase = window.supabase.createClient(
      cfg.SUPABASE_URL.trim(),
      cfg.SUPABASE_ANON_KEY.trim()
    );
  }

  const modeBadge = document.getElementById("modeBadge");
  const timerEl = document.getElementById("timer");
  const maxHint = document.getElementById("maxHint");
  const recIndicator = document.getElementById("recIndicator");
  const waveform = document.getElementById("waveform");
  const preview = document.getElementById("preview");
  const displayName = document.getElementById("displayName");
  const noteTitle = document.getElementById("noteTitle");
  const actionsIdle = document.getElementById("actionsIdle");
  const actionsRecording = document.getElementById("actionsRecording");
  const actionsPreview = document.getElementById("actionsPreview");
  const btnRecord = document.getElementById("btnRecord");
  const btnStop = document.getElementById("btnStop");
  const btnRerecord = document.getElementById("btnRerecord");
  const btnPost = document.getElementById("btnPost");
  const recorderMsg = document.getElementById("recorderMsg");
  const recorderSection = document.getElementById("recorderSection");
  const resultSection = document.getElementById("resultSection");
  const shareLink = document.getElementById("shareLink");
  const btnCopy = document.getElementById("btnCopy");
  const btnAnother = document.getElementById("btnAnother");
  const copyMsg = document.getElementById("copyMsg");

  maxHint.textContent = "Max " + formatTime(MAX_SECONDS);

  if (hasSupabase && supabase) {
    modeBadge.textContent = "Live · Supabase";
    modeBadge.classList.add("live");
  } else {
    modeBadge.textContent = "Demo mode";
    modeBadge.classList.remove("live");
  }

  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromUrl = (params.get("name") || "").trim();
    if (fromUrl) {
      displayName.value = fromUrl;
      try { localStorage.setItem("vn_display_name", fromUrl); } catch (_) {}
    } else {
      const saved = localStorage.getItem("vn_display_name");
      if (saved) displayName.value = saved;
    }
  } catch (_) {}

  displayName.addEventListener("change", () => {
    try { localStorage.setItem("vn_display_name", displayName.value.trim()); } catch (_) {}
  });

  let mediaRecorder = null;
  let mediaStream = null;
  let chunks = [];
  let blob = null;
  let objectUrl = null;
  let startedAt = 0;
  let timerId = null;
  let elapsedSec = 0;
  let mimeType = "";

  function setMsg(text, kind) {
    recorderMsg.textContent = text || "";
    recorderMsg.className = "msg" + (kind ? " " + kind : "");
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function showActions(which) {
    actionsIdle.hidden = which !== "idle";
    actionsRecording.hidden = which !== "recording";
    actionsPreview.hidden = which !== "preview";
  }

  function pickMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    if (!window.MediaRecorder) return "";
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  function clearPreview() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    blob = null;
    chunks = [];
    preview.hidden = true;
    preview.removeAttribute("src");
    preview.load();
  }

  function stopTracks() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function updateTimerDisplay() {
    elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    timerEl.textContent = formatTime(elapsedSec);
    if (elapsedSec >= MAX_SECONDS && mediaRecorder && mediaRecorder.state === "recording") {
      stopRecording();
      setMsg("Reached the 3-minute limit — recording stopped.", "ok");
    }
  }

  async function startRecording() {
    setMsg("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg("This browser cannot access the microphone.", "error");
      return;
    }
    if (!window.MediaRecorder) {
      setMsg("MediaRecorder is not supported in this browser.", "error");
      return;
    }

    clearPreview();
    mimeType = pickMimeType();

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error(err);
      setMsg(
        "Microphone permission denied or unavailable. Allow mic access and try again. If this is in an iframe, it needs allow=\"microphone\".",
        "error"
      );
      return;
    }

    chunks = [];
    try {
      mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
    } catch (err) {
      mediaRecorder = new MediaRecorder(mediaStream);
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stopTracks();
      stopTimer();
      recIndicator.hidden = true;
      waveform.classList.remove("active");

      const type = mediaRecorder.mimeType || mimeType || "audio/webm";
      blob = new Blob(chunks, { type });
      objectUrl = URL.createObjectURL(blob);
      preview.src = objectUrl;
      preview.hidden = false;
      showActions("preview");

      if (elapsedSec < 1) {
        setMsg("Recording was too short. Try again.", "error");
        btnPost.disabled = true;
      } else {
        setMsg("Preview your note, then post to get a shareable link.", "ok");
        btnPost.disabled = false;
      }
    };

    mediaRecorder.start(250);
    startedAt = Date.now();
    elapsedSec = 0;
    timerEl.textContent = "0:00";
    recIndicator.hidden = false;
    waveform.classList.add("active");
    showActions("recording");
    setMsg("Recording…");
    timerId = setInterval(updateTimerDisplay, 250);
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  function resetToIdle() {
    stopTimer();
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.onstop = null;
      try { mediaRecorder.stop(); } catch (_) {}
    }
    stopTracks();
    clearPreview();
    recIndicator.hidden = true;
    waveform.classList.remove("active");
    elapsedSec = 0;
    timerEl.textContent = "0:00";
    btnPost.disabled = false;
    showActions("idle");
    setMsg("");
  }

  function extForMime(type) {
    if (!type) return "webm";
    if (type.includes("mp4")) return "m4a";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
    return "webm";
  }

  function newId() {
    return (crypto && crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          const store = db.createObjectStore(DB_STORE, { keyPath: "id" });
          store.createIndex("created_at", "created_at");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function blobToDataUrl(b) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(b);
    });
  }

  async function demoSaveNote(note) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(note);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function supabaseSaveNote({ id, name, title, duration, blob }) {
    const ext = extForMime(blob.type);
    const path = id + "." + ext;

    const { error: upErr } = await supabase.storage
      .from("voice-notes")
      .upload(path, blob, {
        contentType: blob.type || "audio/webm",
        upsert: false,
      });
    if (upErr) throw upErr;

    const { error: insErr } = await supabase.from("notes").insert({
      id,
      name,
      title: title || null,
      audio_path: path,
      duration,
    });
    if (insErr) throw insErr;

    const { data: urlData } = supabase.storage.from("voice-notes").getPublicUrl(path);
    return { audio_path: path, audio_url: urlData.publicUrl };
  }

  function buildShareLink(id, _audioUrl) {
    // Short link: play.html?id=… only. Player / community popup resolve audio via Supabase.
    // Old links with &src= remain supported for playback.
    const u = new URL("play.html", window.location.href);
    u.searchParams.set("id", id);
    return u.href;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      shareLink.focus();
      shareLink.select();
      const ok = document.execCommand("copy");
      shareLink.setSelectionRange(0, 0);
      return ok;
    } catch (_) {
      return false;
    }
  }

  function notifyParent(link, id) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: MSG_TYPE, link: link, id: id },
          "*"
        );
      }
    } catch (err) {
      console.error(err);
    }
  }

  function showResult(link) {
    recorderSection.hidden = true;
    resultSection.hidden = false;
    shareLink.value = link;
    copyMsg.textContent = "";
    copyText(link).then((ok) => {
      copyMsg.textContent = ok
        ? "Link copied to clipboard."
        : "Select the link and copy it manually.";
      copyMsg.className = "msg " + (ok ? "ok" : "error");
    });
  }

  async function postNote() {
    const name = displayName.value.trim();
    if (!name) {
      setMsg("Please enter your name.", "error");
      displayName.focus();
      return;
    }
    if (!blob) {
      setMsg("Nothing to post — record a note first.", "error");
      return;
    }
    if (elapsedSec < 1) {
      setMsg("Recording was too short.", "error");
      return;
    }

    btnPost.disabled = true;
    setMsg("Uploading…");

    const id = newId();
    try {
      let audioUrl = "";
      if (hasSupabase && supabase) {
        const saved = await supabaseSaveNote({
          id,
          name,
          title: noteTitle.value.trim(),
          duration: elapsedSec,
          blob,
        });
        audioUrl = saved.audio_url || "";
      } else {
        const dataUrl = await blobToDataUrl(blob);
        await demoSaveNote({
          id,
          created_at: new Date().toISOString(),
          name,
          title: noteTitle.value.trim(),
          duration: elapsedSec,
          audio_data_url: dataUrl,
        });
        // Demo: same-origin play page reads IndexedDB; no long data URL in the link
      }

      try { localStorage.setItem("vn_display_name", name); } catch (_) {}

      const link = buildShareLink(id, audioUrl || undefined);
      notifyParent(link, id);
      showResult(link);
      resetToIdle();
      noteTitle.value = "";
    } catch (err) {
      console.error(err);
      setMsg(
        "Could not post: " + (err && err.message ? err.message : "unknown error"),
        "error"
      );
      btnPost.disabled = false;
      showActions("preview");
    }
  }

  btnRecord.addEventListener("click", startRecording);
  btnStop.addEventListener("click", stopRecording);
  btnRerecord.addEventListener("click", () => {
    resetToIdle();
    startRecording();
  });
  btnPost.addEventListener("click", postNote);
  btnCopy.addEventListener("click", async () => {
    const ok = await copyText(shareLink.value);
    copyMsg.textContent = ok ? "Copied again." : "Could not copy — select the link manually.";
    copyMsg.className = "msg " + (ok ? "ok" : "error");
  });
  btnAnother.addEventListener("click", () => {
    resultSection.hidden = true;
    recorderSection.hidden = false;
    copyMsg.textContent = "";
    resetToIdle();
  });

  showActions("idle");
})();
