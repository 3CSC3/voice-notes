# Voice Notes (LearnWorlds community)

Record a short voice note, get a **shareable link**, and drop it into a LearnWorlds community post or comment. Others open the link (or hear it inline) to listen.

Free static app (HTML/CSS/vanilla JS) — host on GitHub Pages, embed via a floating mic button in LearnWorlds custom code.

## How it works

1. Learner focuses a post/comment box, taps the floating mic.
2. They record (up to 3 minutes), preview, then **Post & get link**.
3. Audio is uploaded (Supabase) or stored locally (Demo mode).
4. A `play.html?id=…` link is copied and, when opened from the floating button, **inserted into the composer** via `postMessage`.
5. They press Send/Enter as usual. Listeners open the link (or an inline player under the link).

There is **no community feed** in the app — sharing happens through your LearnWorlds posts.

## Accent

Primary accent color: **`#f7a425`** (buttons, floating mic, highlights). Text on accent uses dark ink for contrast.

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

`https://YOU.github.io/voice-notes/play.html?id=<uuid>&src=<public-audio-url>`

The optional `src` lets community pages show an **inline audio player** without extra API calls.

**Security:** prototype policies allow anonymous public insert/read. Tighten with auth before a large public school.

## Floating microphone on LearnWorlds (Learning Center)

### Plan support (cited)

- Pricing lists *“Javascript & CSS customization — Include your own custom Javascript and CSS code inside the school and templates”*: [learnworlds.com/plans](https://www.learnworlds.com/plans/).
- Custom code editor: *“Website → Design → Edit Website”* then *“Site → Site custom code”*: [General Overview: Custom Code](https://support.learnworlds.com/support/solutions/articles/12000075682-general-overview-custom-code).
- Global Body/Head slots inject across the site template; built-in **Social** (community) pages receive logged-in body HTML. Slug: **`social`**. Liquid conditionals (`{% %}`) including page slug / URL contains are *“available on the Learning Center plan”*: [How to add custom code](https://support.learnworlds.com/support/solutions/articles/12000082908-how-to-add-custom-code-in-your-learnworlds-school).
- User name variable: **`{{USER.NAME}}`** (same article).

### Install

1. Host this folder; note the base URL.
2. Edit `floating-button-snippet.html` — replace `APP_URL` with your base (e.g. `https://YOU.github.io/voice-notes`).
3. Paste into **Site custom code → Body logged in**.
4. Save/publish. On `/social`, use the orange mic.

Flow: focus the composer → mic → record → post → link is inserted (or copied with a toast if insertion isn’t possible).

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
  allow="microphone"
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

## Later ideas

Transcription / translation into English can be added once the share-link flow feels right in your community.
