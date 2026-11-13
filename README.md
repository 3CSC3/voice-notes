# Voice Notes (LearnWorlds community)

Record a short voice note, get a **shareable link**, and drop it into a LearnWorlds community post or comment. Others tap the orange pill to listen in a non-blocking same-page mini-player.

Free static app (HTML/CSS/vanilla JS) — host on GitHub Pages, embed via a composer mic button in LearnWorlds custom code.

## How it works

1. Learner focuses a post/comment box, taps the orange mic in its toolbar.
2. They record (up to 3 minutes), preview, then **Post voice note**.
3. Audio is uploaded (Supabase) or stored locally (Demo mode).
4. A `play.html?id=…` link is copied and, when opened from the floating button, **inserted into the composer** via `postMessage`.
5. They press Send/Enter as usual. Listeners tap the pill for the same-page player.

There is **no community feed** in the app — sharing happens through your LearnWorlds posts.

## Accent

Primary accent color: **`#f7a425`** (buttons, floating mic, highlights). Microphone and Play/Pause icons are white.

## Try locally (Demo mode)

```bash
cd voice-notes
python3 -m http.server 8080
```

- Recorder: `http://localhost:8080/`
- Player: `http://localhost:8080/play.html?id=…` (after you post once)
- Floating button demo: `http://localhost:8080/floating-demo.html`

> Open via a local server (not `file://`) so the microphone and clipboard work.

In Demo mode, notes live in **this browser’s IndexedDB** only. Share links work on the same device/browser until you clear site data.

## Go live with free Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run `setup.sql` (table + **GRANTs to `anon`** + public read/insert RLS policies). If inserts fail with `permission denied for table notes`, run:
   `grant select, insert on table public.notes to anon, authenticated;`
3. **Storage** → create public bucket named exactly `voice-notes`.
4. Paste **Project URL** + **anon key** into `config.js`.
5. Host the folder on HTTPS (GitHub Pages, etc.).

Share links look like:

`https://YOU.github.io/voice-notes/play.html?id=<uuid>`

Older links with an optional `src` audio URL still play. New short links look up the audio by note ID.

**Security:** prototype policies allow anonymous public insert/read. Tighten with auth before a large public school.

## Floating microphone on LearnWorlds (Learning Center)

### Plan support (cited)

- Pricing lists *“Javascript & CSS customization — Include your own custom Javascript and CSS code inside the school and templates”*: [learnworlds.com/plans](https://www.learnworlds.com/plans/).
- Custom code editor: *“Website → Design → Edit Website”* then *“Site → Site custom code”*: [General Overview: Custom Code](https://support.learnworlds.com/support/solutions/articles/12000075682-general-overview-custom-code).
- Global Body/Head slots inject across the site template; built-in **Social** (community) pages receive logged-in body HTML. Slug: **`social`**. Liquid conditionals (`{% %}`) including page slug / URL contains are *“available on the Learning Center plan”*: [How to add custom code](https://support.learnworlds.com/support/solutions/articles/12000082908-how-to-add-custom-code-in-your-learnworlds-school).
- User name variable: **`{{USER.NAME}}`** (same article).

### Install

1. Host this folder (Catarina’s live app: `https://3csc3.github.io/voice-notes/`).
2. Use `floating-button-snippet.html` (already points at that URL) or set:
   - `appUrl`: `https://3csc3.github.io/voice-notes/index.html`
   - `pathPattern`: `*` inside the Liquid `/social` guard (or `"/social"`)
   - `mode`: `"inline"` (default) — mic in each post/comment **toolbar** near Share
   - `mode`: `"floating"` — old bottom-right FAB only
   - `showFloatingFallback`: `true` only if you want the FAB when no composer is found
3. Paste into **Site custom code → Body logged in**.
4. Save/publish. Open `/social` — orange mics appear beside Share on post/comment toolbars.

Flow: tap the mic on the toolbar of the box you’re writing in → record → post → link is inserted into **that** box (or copied with a toast if insertion isn’t possible).

Optional: `composerSelector` — CSS selector if LearnWorlds’ editor needs a tighter match.

### LearnWorlds composer (what we know / don’t)

Help Center documents posts/comments with emojis, @mentions, images, files, and polls ([How to Use the LearnWorlds Community](https://support.learnworlds.com/support/solutions/articles/12000097356-how-to-use-the-learnworlds-community)). It does **not** name the underlying editor (Quill, TinyMCE, Draft.js, etc.).

Our floating script therefore:

- Remembers the last focused `textarea`, text `input`, or `contenteditable`
- Inserts with `setRangeText` + `input` events (textarea/input) or `execCommand('insertText')` / Range API (contenteditable)
- Falls back to clipboard + toast: *“Link copied — paste it into your post”*

**Verified** on our demo page (contenteditable + textarea). **Uncertain** on the live LearnWorlds DOM until tested in your school — if their editor uses a closed React model that ignores `insertText`, use the clipboard fallback (still one paste).

## Embed without the floating button

You can still iframe the recorder on a page:

```html
<iframe
  src="https://YOU.github.io/voice-notes/"
  width="100%"
  height="640"
  style="border:0;border-radius:12px;"
  allow="microphone; screen-wake-lock"
  title="Voice Notes"
></iframe>
```

LearnWorlds Embed section: [school pages](https://support.learnworlds.com/support/solutions/articles/12000082673-how-to-add-embed-codes-to-your-school-pages), [course Embed activity](https://support.learnworlds.com/support/solutions/articles/12000003622-how-to-create-an-embed-learning-activity). Without the floating script, users copy the link manually after posting.

## Files

| File | Purpose |
|------|---------|
| `index.html` / `app.js` / `styles.css` | Recorder → share link |
| `play.html` | Listener player (`?id=` / optional `?src=`) |
| `config.js` | Supabase URL + anon key (empty = Demo) |
| `setup.sql` | Table + RLS + storage policies |
| `floating-button.js` | Mic FAB, modal, link insert, inline players |
| `floating-button-snippet.html` | Paste into LearnWorlds Site custom code |
| `floating-demo.html` | Local community composer simulation |
| `README.md` | This guide |

### Compact pills + mini-player

In rendered community posts, voice links are replaced visually with a compact orange **▶ Voice note** pill (the raw URL stays hidden in the DOM). Clicking the pill opens a **non-blocking mini-player** — no new tab or full-page player overlay. It docks at the bottom on desktop and the top on phones, leaving the composer available.

New recordings insert a short link: `play.html?id=<uuid>`. The mini-player (and `play.html`) load audio from Supabase by id. Older links that include `&src=` still work.

LearnWorlds snippet must include `supabaseUrl` and `supabaseAnonKey` (see `floating-button-snippet.html`) so pills can resolve audio on `/social` pages.


## Pause / resume (recording and listening)

- While recording, press **Pause** to take a break and **Resume** to continue the same note. The orange steady dot, **Paused** badge and frozen waveform make the state clear. **Stop** finishes the note even if it is paused.
- The timer and 3-minute limit count **only time actually recording**, not your thinking breaks. Your microphone may still show as in use while paused (so you can resume), but paused speech is not added to the note. Stop releases it.
- Pause/resume uses native `MediaRecorder.pause()` / `resume()` (modern iOS Safari and Android Chrome). If the browser does not implement both methods, the pause button is hidden and Record/Stop still work. Use an up-to-date browser; actual iPhone/Android hardware has not been tested here.
- When listening, the community mini-player has orange **Play / Pause**, **Reply with voice**, a seek slider, elapsed/total time and Close. The standalone `play.html` keeps its Play/Pause button and native audio controls. The post's pill changes from **▶** to **❚❚** while its note plays (matching copies update too), and toggles the loaded note rather than restarting it. The community page and composer mics remain usable with the player open.
- Closing the mini-player or pressing Escape pauses playback. Reopening the same note resumes at its saved position; selecting a different note switches audio. Pills and mini-player controls have at least 44-pixel tap targets. When the recorder is open, Escape closes only the recorder, not the mini-player.

### Installing this update

Unzip `voice-notes-update.zip` and upload the files **inside** the folder to the root of your existing GitHub repository (not a new subfolder). It includes the latest listen–record–continue feedback workflow plus recording/playback Pause controls and tab-switching safeguards, without any transcript or translation feature. No new SQL and no change to the LearnWorlds snippet are needed. Wait for GitHub Pages to publish, then refresh the community (a phone may need its website cache cleared).

Transcription and translation are deferred. Their source files are saved separately on the development box in `/workspace/voice-notes-transcripts-later/`, NOT in the app or this update. The shipped players never load those scripts or create their iframe/buttons. If old transcript files are already in your GitHub repo, you can leave them unused or delete them later; do not delete `play.html` or `floating-button.js`. Any previously added database text columns are unused and can stay — do not run SQL to remove them.

### Pause test coverage

Headless Chromium using the browser's synthetic microphone with a real MediaRecorder: 4.5 seconds of active audio decoded correctly from roughly 8 seconds of wall time; the timer froze while paused, resumed, and Stop worked while paused. A controlled clock jump verified a 10-minute pause does not count against the active 180-second limit. Preview, local save and short link creation still worked. Missing pause/resume methods hid the button. Pop-up/standalone Play-Pause, pill state, note switching, retaining position on close/reopen, Escape, native control visibility and tap sizes all passed. No live notes were created or modified by testing. Background tests simulated hidden/visible events in the actual recorder iframe and verified desktop recording continues, mobile recording pauses and needs an explicit Resume, the timer catches up from timestamp differences, microphone interruptions keep a playable preview, and both players keep playing. These are Chromium tests, not proof of real iOS/Android behavior.


## Switching tabs, other apps, and live classes

The orange mic opens a **modal iframe inside the LearnWorlds tab** (`#vn-float-frame`), NOT a separate `window.open` window. Clicking the other tab leaves this recorder intact. Closing the recorder's X, reloading or navigating away does not: finish and post your note first. Unsaved audio lives in memory, not permanent storage.

### Desktop computers

- Switching browser tabs while recording deliberately does **not** pause recording. MediaRecorder captures the microphone independently of the waveform and UI timer. The timer uses timestamp differences (`Date.now()`), not the number of interval callbacks, and refreshes when you return after timer throttling.
- Playback also keeps going in another tab; there is no visibility handler that pauses it. Close the player or press Pause to stop it.
- Sleep, microphone interruption, browser suspension, a discarded tab or closing the browser are different from ordinary tab switching. A detected microphone interruption/browser freeze pauses or finalizes the current audio rather than silently continuing a broken stream. When active recording resumes, use the Resume button.
- The 3-minute stop is checked by the browser timer and again when returning to the page. If the browser/OS freezes JavaScript completely, it cannot run a precise stop until it wakes; don't depend on the browser as an exact time limiter during sleep.

### Phones and tablets

- iOS and Android may suspend microphone recording when another app/tab takes over or the screen locks. To avoid silently missing words, we **proactively pause** when the recorder's document becomes hidden. It says: **“Paused because you left the page — tap Resume when you return.”** Returning never automatically restarts the microphone.
- Your captured chunks stay in that recorder, so Resume continues the same note. If the browser has no pause API, it instead finishes the note as a preview. If a call has muted the microphone, Resume asks you to wait; if the microphone disconnected, Stop/Resume finalizes the captured portion.
- Best-effort Screen Wake Lock is requested while actively recording, released on Pause/Stop/hide, and reacquired when appropriate. The iframe opts into `screen-wake-lock`. Browsers may deny it due to battery settings or host policy; it cannot prevent background suspension or OS tab eviction. Keep this tab open and foreground on a phone for uninterrupted recording.
- Playback normally continues in the background, but phone OS/audio focus rules may pause it, especially during a call. Resume playback when you return. It cannot be guaranteed through a call, battery saver or process termination.

### Using a live class in another tab

On desktop, browsers usually allow a meeting and the recorder to use the microphone together. Permissions, browser, headset or call software may still cause conflicts; try a short test before class. On phones, calls commonly interrupt web microphone capture. Use headphones to avoid echo. Recording captures **your microphone**, not the meeting's audio from the other tab. Playing a voice note will not automatically send it to students — share the tab/system audio in the meeting if you want them to hear playback.

References: [MDN: MediaRecorder timing and Safari/Android interruption caveats](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event), [MDN: Screen Wake Lock and its limits](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).


## Desktop / Brave microphone compatibility

The composer detector now recognizes a closed LearnWorlds **“Type something…”** placeholder even before it mounts a contenteditable editor. The microphone opens that editor first and stays before Share; it never presses Share. It also supports `contenteditable="plaintext-only"`, ignores hidden mobile/desktop duplicates, assigns distinct IDs to cloned editors, and rescans after resize/focus/editor attribute changes. This prevents a hidden mobile button from being mistaken for the desktop button.

Mic setup runs before the optional playback controls. If an extension or privacy feature makes audio-control initialization fail, that error no longer prevents the mic from appearing. The mic itself needs no cookies, localStorage, microphone permission or wake-lock permission just to render. Permission is only requested after you press Record inside the recorder.

Desktop-width headless Chromium tests compared the previous deployed commit (`4f10d28d07487807f1827c0d4fcd12253bf4800c`) and the November 10 update. Both render normal editors, including with `navigator.brave` defined, no wake lock, storage access throwing, and postMessage blocked; neither rendered the collapsed/cloned/plaintext-only desktop fixtures correctly. The corrected version passes those fixtures, resizing to/from phone width, and asynchronous editor replacement/link insertion. A simulated audio-listener initialization error also no longer prevents the mic from mounting. This identifies reproducible compatibility gaps, not proof of the exact DOM or Shields settings in a user's Brave browser.

If the mic still does not appear, check whether Brave is blocking the **whole script**. No change inside a blocked JavaScript file can make it execute. Brave normally allows JavaScript. For a one-site diagnostic, open the school in Brave, click the **lion (Shields) icon** beside the address, check **Advanced controls → Block scripts** is off, or temporarily lower Shields for **thelanguageunschool.com only**, and reload. Restore the protections after testing if it made no difference. Do not change global Shields settings. If a script-blocking rule is the cause, students with that same rule may encounter it too. [Brave's site-specific Shields documentation](https://support.brave.app/hc/en-us/articles/360023646212-How-do-I-configure-global-and-site-specific-Shields-settings).

For diagnosis, the developer console can inspect `window.__vnMicStatus` (loaded version, visible composer/mic counts and last scan error). If it is undefined, the script did not initialize (blocked/not included, wrong page/config, or an early error). No personal information or browser fingerprints are collected.

The desktop compatibility fixes remain included in the latest player. No SQL or LearnWorlds snippet changes are needed. Pausing, background-tab behavior and the intentionally absent transcript/translation features remain unchanged.


## Listen, record feedback, continue listening

The old full-screen player was a modal with a higher stacking order than the recorder. It covered the community composer and blocked its microphone button. This was a UI limitation, not a restriction on recording feedback.

The community player is now a compact, **non-modal** mini-player. Desktop: docked at the bottom; phone: docked at the top with safe-area spacing. It reserves page padding while visible and clears that padding when closed. Focusing an editor underneath the dock scrolls it into view. The recorder opens above the player and leaves space to keep the paused player visible.

### How to use it

1. Tap a student's voice-note pill. Listen, pause or use the seek slider.
2. Either use the microphone in the comment composer as usual, or press **Reply with voice** in the mini-player (labelled **Reply** on narrow screens).
3. Playback automatically pauses before the recorder opens, so speaker audio is not recorded into your feedback. The Reply shortcut pre-fills an editable title such as **Feedback at 0:42**.
4. Record, optionally pause/resume, then **Post voice note**. This uploads the note and inserts its link into the composer; **you still press Share/Send yourself**.
5. The mini-player stays paused at exactly the same position. Press Play to continue listening, and repeat as often as you want.

**Reply targeting:** the clicked pill supplies the post/comment context. The shortcut looks for the nearest existing visible composer in that post (including the collapsed desktop placeholder), favouring a comment/reply field. It does not automatically click the site's Share or reply-posting controls. If no suitable field is found, it uses the last focused composer; otherwise it leaves the recorder's result screen open so you can copy and paste its link yourself. If LearnWorlds renders the comment field only after expanding a thread, click that field once before using Reply. Real LearnWorlds markup can vary; the normal composer mic always explicitly selects its own field.

**Separation of listening/recording:** opening any recorder pauses the student audio without resetting or replacing it. The mini-player's playback/seek controls are disabled during recording. Posting or closing the recorder never resumes playback automatically. Closing a recorder with an unfinished recording still discards that unsaved recording as before; it does not discard the student's paused position. Switching to another student's note intentionally loads that other note.

**Scope:** changed `floating-button.js`, `app.js` (optional title from URL) and this README. No schema, snippet, standalone-player or transcription changes.

### Feedback regression tests

Headless Chromium at desktop 1280px and phone 390px: play/seek to 0:07, pause, open the recorder directly from the post's mic while the player is visible, record with native MediaRecorder pause/resume, insert into the correct comment among two posts, resume at the retained position, use Reply while playing (auto-pause and timestamp title), record/post again, close/cancel/Escape without resetting or hiding the mini-player, toggle the original pill, and manually copy when no composer exists. No Share was submitted, all backend writes were intercepted locally, and no transcript/model downloads occurred. Existing Brave-like/collapsed/clone/plaintext-only mic tests and desktop/mobile background safeguards still pass. Actual phone hardware and the school's authenticated comment markup were not accessible for these tests.

## Movable recorder panel (community page)

The recorder that opens from the mic buttons is a floating panel. It does not block the page:
- **No dark backdrop and no scroll lock.** You can still read, scroll and click the post behind it. Clicking the page does **not** close the recorder, so a recording is never lost that way.
- **Move it** by dragging its top bar (⠿ "drag to move"). This works with a mouse or a finger. You can also focus the bar and use the arrow keys (Shift moves faster). The panel always stays on screen.
- **Make it smaller** with the – button: only the timer and the Record/Pause/Stop/Post buttons stay. Press □ to make it big again. The name field still shows if your name is empty.
- **Default place.** On desktop it sits bottom-right (about 380 px wide), above the mini-player. On phones it is a bottom sheet (the mini-player is at the top).
- **Remembered in this browser.** Position (separately for desktop and phone) and small/big are saved in `localStorage` (`vn-recorder-pos-v1-*`, `vn-recorder-compact-v1`).
- **Closing.** Use × to close. Escape only closes it when focus is on the panel itself, not while you are typing or reading on the page.

## Button only: no visible links (and screen-reader friendly)

**What readers see.** Anyone reading a post or comment sees only the orange **▶ Voice note** button. Pressing it plays the note in the mini-player.
- **The link is hidden** in every form LearnWorlds may show it: an autolinked `<a>`, plain-text URLs, links with other text (e.g. "Open link"), link-preview cards and `<iframe>` embeds.
- **Hidden before the button appears.** CSS hides these straight away, so the address never flashes.
- **Hidden from screen readers too.** It uses `display:none` + `aria-hidden`, so the URL is never read out.
- **One button per note** in each post/comment.
- **Your own words stay.** Text around the link is kept.

**How it is stored.** The short `play.html?id=…` address is still saved in the comment text, because LearnWorlds only stores plain text. That is how the button is found. Nobody reading sees it.

**Recorder.** The flow is: Record → (Pause) → Stop → **Post voice note**. The note goes straight into the comment box and you press Send. No link, Copy or Open option is shown.
- **No comment box selected:** the recorder stays open. Click into a comment box and press **Add to comment**. A **Copy voice note** button is offered as a backup; it copies the note without showing the address.

**Limitation.** In the comment box itself, before you press Send (and when you edit a comment later), you still see the address. Comment editors only hold plain text, so replacing it with a button there would risk the editor breaking or dropping the link.

**Accessibility (screen readers, keyboard)**
- **▶ buttons** are real `<button>`s, with names like "Play voice note: My weekend · 0:20, by Maria". The name changes to "Pause …" while it plays.
- **Composer mic:** "Record voice note".
- **Mini-player:** a labelled region. When it opens, focus moves to its Play/Pause button, whose name changes with the state (e.g. "Pause voice note: My weekend").
  - The position slider reads e.g. "42 seconds of 1 minute 30 seconds".
  - It also has "Reply with voice" and "Close voice note player".
  - Escape closes it and focus goes back to the ▶ button.
- **Recorder:** a dialog named "Voice note recorder", and focus starts on its Close button.
  - The top bar can be moved with the arrow keys, and the smaller/bigger button reports its state.
  - Status ("Recording…", "Paused…", "Voice note added to your comment") is announced.
  - The timer is not read out every second.
  - Escape closes it when idle. It never throws away a recording you haven't posted.
  - When it closes, focus returns to the comment box.
