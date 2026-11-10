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
  const btnPause = document.getElementById("btnPause");
  const pauseLabel = document.getElementById("pauseLabel");
  const pausedState = document.getElementById("pausedState");
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
  // Timestamp differences, never interval ticks: stays accurate when background timers throttle.
  let activeSince = null;
  let recordedMs = 0;
  let timerId = null;
  let elapsedSec = 0;
  let mimeType = "";
  let pauseReason = "";
  let finishNotice = "";
  let wakeLock = null;
  let wakeRequestPending = false;
  const mobileRecorder = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") ||
    (/Macintosh/.test(navigator.userAgent || "") && navigator.maxTouchPoints > 1);

  function releaseWakeLock() {
    if (wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      try { lock.release().catch(() => {}); } catch (_) {}
    }
  }

  async function requestWakeLock() {
    if (!navigator.wakeLock || !navigator.wakeLock.request || wakeLock || wakeRequestPending ||
        document.hidden || !mediaRecorder || mediaRecorder.state !== "recording") return;
    wakeRequestPending = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (document.hidden || !mediaRecorder || mediaRecorder.state !== "recording") {
        await lock.release();
      } else {
        wakeLock = lock;
        lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
      }
    } catch (_) {
      // Optional: the browser, host iframe policy or battery saver may refuse it.
    } finally { wakeRequestPending = false; }
  }

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

  function recordedTimeMs() {
    return recordedMs + (activeSince === null ? 0 : Math.max(0, Date.now() - activeSince));
  }

  function updateTimerDisplay() {
    elapsedSec = Math.min(MAX_SECONDS, Math.floor(recordedTimeMs() / 1000));
    timerEl.textContent = formatTime(elapsedSec);
    if (elapsedSec >= MAX_SECONDS && mediaRecorder && mediaRecorder.state !== "inactive") {
      stopRecording();
      setMsg("Reached the 3-minute limit — recording stopped.", "ok");
    }
  }

  function pausedUi(paused) {
    pausedState.hidden = !paused;
    recIndicator.classList.toggle("is-paused", paused);
    waveform.classList.toggle("paused", paused);
    pauseLabel.textContent = paused ? "Resume" : "Pause";
    btnPause.querySelector(".btn-icon").textContent = paused ? "▶" : "❚❚";
    btnPause.setAttribute("aria-label", paused ? "Resume recording" : "Pause recording");
  }

  function onRecorderPaused() {
    if (!mediaRecorder || mediaRecorder.state !== "paused") return;
    if (activeSince !== null) {
      recordedMs += Math.max(0, Date.now() - activeSince);
      activeSince = null;
    }
    stopTimer();
    releaseWakeLock();
    updateTimerDisplay();
    pausedUi(true);
    setMsg(pauseReason || "Paused — nothing is being recorded. Resume when you're ready, or Stop to finish.");
  }

  function onRecorderResumed() {
    if (!mediaRecorder || mediaRecorder.state !== "recording") return;
    if (activeSince === null) activeSince = Date.now();
    pauseReason = "";
    pausedUi(false);
    requestWakeLock();
    setMsg("Recording…");
    if (!timerId) timerId = setInterval(updateTimerDisplay, 250);
  }

  function toggleRecordingPause() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    try {
      if (mediaRecorder.state === "paused") {
        const tracks = mediaStream ? mediaStream.getAudioTracks() : [];
        if (!tracks.length || tracks.every(t => t.readyState === "ended")) {
          finishNotice = "The microphone disconnected. Your recorded audio is ready to preview — start a new note to continue.";
          stopRecording();
          return;
        }
        if (tracks.some(t => t.muted)) {
          setMsg("The microphone is temporarily unavailable (another app or call may be using it). Return here and tap Resume when it is available, or Stop to keep this note.", "error");
          return;
        }
        if (mobileRecorder && document.hidden) return;
        mediaRecorder.resume();
        onRecorderResumed(); // some browsers change state now; events handle others
      } else {
        updateTimerDisplay();
        if (mediaRecorder.state !== "recording") return;
        pauseReason = "";
        mediaRecorder.pause();
        onRecorderPaused();
      }
    } catch (err) {
      // Old browsers may expose the method without implementing pause.
      // Never strand a paused note: Stop still finishes it.
      if (mediaRecorder.state !== "paused") btnPause.hidden = true;
      setMsg("This browser couldn't pause/resume. You can still Stop to finish the note.", "error");
    }
  }

  function pauseForInterruption(message) {
    if (!mediaRecorder || mediaRecorder.state !== "recording") return;
    pauseReason = message;
    try {
      if (typeof mediaRecorder.pause !== "function" || typeof mediaRecorder.resume !== "function") throw new Error("No pause support");
      mediaRecorder.pause();
      onRecorderPaused();
      // Flush what is available; keep using the SAME recorder/chunks on Resume.
      try { mediaRecorder.requestData(); } catch (_) {}
    } catch (_) {
      // Older browsers without pause: finalize, don't silently lose this note.
      finishNotice = "Recording stopped because it was interrupted. Your recorded audio is ready to preview; record another note to continue.";
      stopRecording();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      releaseWakeLock();
      if (mobileRecorder) {
        // Proactively pause BEFORE iOS/Android can suspend capture. Never auto-resume.
        pauseForInterruption("Paused because you left the page — tap Resume when you return. Your recorded audio is kept here.");
      }
      // Desktop: deliberately keep recording; switching tabs is allowed.
    } else {
      if (mediaRecorder && mediaRecorder.state !== "inactive") updateTimerDisplay();
      requestWakeLock();
    }
  });

  // Chromium may freeze an inactive page. This is a best-effort safeguard, not a
  // promise against the OS killing a tab. No beforeunload handler that blocks navigation.
  document.addEventListener("freeze", () => {
    pauseForInterruption("Paused because the browser suspended this page — tap Resume when you return.");
  });

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
    pauseReason = "";
    finishNotice = "";
    try {
      mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
    } catch (err) {
      mediaRecorder = new MediaRecorder(mediaStream);
    }

    pausedUi(false);
    btnPause.hidden = typeof mediaRecorder.pause !== "function" || typeof mediaRecorder.resume !== "function";
    mediaStream.getAudioTracks().forEach(track => {
      track.addEventListener("mute", () => {
        pauseForInterruption("Paused because the microphone was interrupted — tap Resume when it is available again, or Stop to keep this note.");
      });
      track.addEventListener("ended", () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          finishNotice = "The microphone disconnected. Your recorded audio is ready to preview.";
          stopRecording();
        }
      });
    });
    mediaRecorder.onpause = onRecorderPaused;
    mediaRecorder.onresume = onRecorderResumed;
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      // Also handle a recorder that stops itself (e.g. microphone disconnected).
      if (activeSince !== null) {
        recordedMs += Math.max(0, Date.now() - activeSince);
        activeSince = null;
      }
      elapsedSec = Math.min(MAX_SECONDS, Math.floor(recordedMs / 1000));
      timerEl.textContent = formatTime(elapsedSec);
      stopTracks();
      stopTimer();
      releaseWakeLock();
      pausedUi(false);
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
        setMsg(finishNotice || "Preview your note, then post to get a shareable link.", "ok");
        btnPost.disabled = false;
      }
    };

    mediaRecorder.start(250);
    recordedMs = 0;
    activeSince = Date.now();
    elapsedSec = 0;
    timerEl.textContent = "0:00";
    recIndicator.hidden = false;
    waveform.classList.add("active");
    showActions("recording");
    setMsg("Recording…");
    timerId = setInterval(updateTimerDisplay, 250);
    requestWakeLock();
    // Mic permission may have resolved after the person already switched apps.
    if (mobileRecorder && document.hidden) {
      pauseForInterruption("Paused because you left the page — tap Resume when you return. Your recorded audio is kept here.");
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      if (activeSince !== null) {
        recordedMs += Math.max(0, Date.now() - activeSince);
        activeSince = null;
      }
      stopTimer();
      releaseWakeLock();
      mediaRecorder.stop(); // valid both during recording and while paused
    }
  }

  function resetToIdle() {
    stopTimer();
    releaseWakeLock();
    pauseReason = "";
    finishNotice = "";
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.onstop = null;
      mediaRecorder.onpause = null;
      mediaRecorder.onresume = null;
      try { mediaRecorder.stop(); } catch (_) {}
    }
    stopTracks();
    activeSince = null;
    recordedMs = 0;
    pausedUi(false);
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
  btnPause.addEventListener("click", toggleRecordingPause);
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
