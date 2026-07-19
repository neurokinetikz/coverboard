# Coverboard

Your covers, on the board. A fast, local guitar songbook — paste chords
straight from Ultimate Guitar and get a clean, color-highlighted chord sheet
with diagrams. Then go deeper: built-in triad/CAGED tools, a fretboard
explorer, and theory-aware chord substitutions turn every cover you know into
a lesson on the neck.

No account, no server, no dependencies. Your library lives in your browser,
with optional sync to a local file.

## Run it

**Use it now: [neurokinetikz.github.io/coverboard](https://neurokinetikz.github.io/coverboard)** —
nothing to install, your library stays in your browser.

Or run it yourself: open `index.html` in a browser, or grab
`dist/coverboard.html` — the entire app in a single file you can copy anywhere.
Rebuild it with `node build.js`.

## Import

Hit **＋ New** and paste anything: Ultimate Guitar pages or raw `[tab]`/`[ch]`
markup, ChordPro, plain lyrics. Title, artist, capo, and key are auto-detected,
with a live preview as you paste. Section headers in any style are recognized
and color-coded by type; tap one to collapse it.

## Learn: triads & CAGED

Toggle **△ Triads** and the diagram strip shows every chord reduced to its
playable three-note shape, color-coded by interval role — root blue, 3rd amber,
5th green, 7th/6th purple. The colors follow function and stay consistent
across every view, so shapes become readable at a glance. (The ◫ Chords strip
keeps classic black-and-white fingerings.)

- **Position** — pick one of the key's five CAGED positions and every chord is
  voiced inside that window, so you can play the whole song without moving.
  Widened or broken positions are flagged, never hidden.
- **Voicing** — `Closed` triads, or `Open` spread triads for a bigger,
  ringing comping sound.
- **Strings** — pick a string set, or **Near**: each triad voiced closest to
  the previous one, so the progression connects with minimal hand movement.

7ths and 6ths reduce to honest three-note shells (guide tones win), slash
chords and rarities are badged with their origin symbol, and transposing keeps
everything — including position labels — in sync.

## Learn: fretboard explorer

**Fretboard** opens the neck vertically — nut at top, low E on the left, the
same orientation as the chord charts. Pick any root and quality and you get
every chord tone across 15 frets (interval or note-name labels), voicing
charts grouped by CAGED position and aligned beside their frets, an optional
pentatonic/full-scale ghost layer, string-set and inversion filters, and a
CAGED overlay.

In the song view, a **scales column** pins all five positions of the key's
scale to the right edge — Pentatonic, Full scale, or Mixolydian · Dorian —
with the parallel flavor alongside. Tap any card to open the explorer pre-set.

## Learn: chord substitutions

Click any chord anywhere and the modal answers one question: **"what else
could I play right here?"** Up to six candidates — same function, relative,
tritone sub, secondary dominant, borrowed, color — each voiced near the same
position, each with a one-line why ("relative minor — keeps G·B"). Tap a
candidate to chain deeper.

## Follow mode

Tap **🎤**, start singing, and the app follows you: the current line
highlights teleprompter-style and the words light up karaoke-style as you sing
them. Tap any line to re-sync. It never listens unless you turn it on.

Under the hood this is alignment, not transcription — the lyrics are known, so
the noisy recognition you get while strumming is plenty. The engine is the
browser's built-in speech recognition (Chrome, online; audio is processed by
the browser's speech service). If the mic is blocked on `file://`, serve
locally: `python3 -m http.server`.

## Everything else

- **Search** — instant and fuzzy across titles, artists, lyrics, chords
- **Transpose** — with correct flat/sharp spelling for the target key
- **Fit mode** — the whole song on screen in auto-sized columns; or scroll +
  spacebar autoscroll
- **Setlists** — build, reorder, perform (arrow keys)
- **Library file sync** — link a local JSON file and every change streams to it
- **Export / Import** — JSON backup of the whole library
- **Dark/light themes**, collapsible sidebar, clean **print** output, verbatim
  **tab** blocks

## Architecture

Plain ES5 scripts on `window`, no framework, no bundler, runs from `file://`.
One state object, full re-render, `data-act` event delegation.

| module | role |
|---|---|
| `js/chordtheory.js` | note/chord parsing, transposition, key detection |
| `js/parser.js` | UG/ChordPro/freeform song text → sections/lines/chords |
| `js/voicings.js` | chord voicings: curated shapes + generator |
| `js/diagrams.js` | chord chart SVG renderer |
| `js/triads.js` | triad/shell engine + CAGED position model |
| `js/subs.js` | substitution engine |
| `js/fretboard.js` | full-neck SVG renderer |
| `js/follow.js` | Follow mode: aligner, tracker, engine seam |
| `js/search.js` | fuzzy library search |
| `js/store.js` | localStorage persistence, settings, parse cache |
| `js/filestore.js` | File System Access sync to a linked library file |
| `js/app.js` | all UI: views, strips, modals, routing |

Everything except `app.js`/`filestore.js` is pure and Node-testable.

## Tests

```
node tests/run.js                          # 1500+ assertions, pure Node
npm install && node tests/browser/all.js   # headless-Chrome battery
```

The Node suite covers the parser, chord theory, voicings, the triad/CAGED
engine, substitutions, both SVG renderers, and the full Follow-mode stack
(driven by a fake recognizer). The browser battery drives the real app —
Follow e2e, toggles, routing, responsive layout, the fretboard view — covering
the DOM glue the Node suite can't see.

## Privacy

Everything is local: no server, no account, no network calls, with two
narrow exceptions. While **Follow mode** is listening, audio is processed by
the browser's built-in speech service — the mic never activates unless you
tap it. And the **hosted instance** uses [Plausible](https://plausible.io)
for anonymous, cookie-less page counts (no personal data, no cross-site
tracking). The analytics tag is injected only at deploy time — this source
tree, the single-file build, forks, and self-hosted copies contain no
analytics code at all.

## Contributing

Keep `node tests/run.js` green. New modules are plain IIFEs exporting to
`window` + CommonJS, registered in both `index.html` and `build.js` (the build
asserts if they drift). Follow mode's recognition layer is a swappable seam —
see `registerEngine` in `js/follow.js`.

## License

MIT — see [LICENSE](LICENSE).
