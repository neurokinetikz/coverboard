# Songbook

A fast, local songbook app — paste chords straight from Ultimate Guitar and get a
clean, color-highlighted chord sheet with chord diagrams. No account, no server,
no subscription; your library lives in your browser.

## Run it

Open `index.html` in any modern browser (double-click works — no server needed).

Or use the single-file build: `dist/songbook.html` is the whole app in one file —
copy it to a phone/tablet, email it to yourself, put it anywhere.
Rebuild it after changes with `node build.js`.

## The import flow (the whole point)

1. Hit **＋ New** and paste anything:
   - Ultimate Guitar CHORDS pages (chords-over-lyrics, `[Verse 1]` headers)
   - UG raw markup (`[tab]`/`[ch]` tags are stripped automatically)
   - ChordPro files (`{title:}`, inline `[C]lyrics`)
   - Plain lyrics
2. Title / artist / capo / key are auto-detected. A live preview shows the parsed,
   color-highlighted result as you paste.
3. Save. Done.

Section headers in any style — `[Chorus]`, `Chorus:`, `CHORUS`, `(Bridge)`,
`Pre-Chorus 2`, `Middle 8` — are recognized and color-coded by type
(verse=blue, chorus=amber, pre-chorus=teal, bridge=pink, intro=purple, solo=orange,
instrumental=green, outro=gray). Tap a section header to collapse it.

## Everything else

- **Search** — instant, fuzzy, across titles, artists, lyrics, and chords.
- **Chord diagrams** — every chord in the song gets a diagram strip up top;
  tap any chord (in the strip or in the lyrics) for alternate voicings.
  Common chords use curated fingerings; anything else is generated on the fly.
- **Transpose** — ± semitones with correct flat/sharp spelling for the target key.
- **Autoscroll** — ▶ button or spacebar; speed slider in the toolbar.
- **Setlists** — build, reorder, and Perform (arrow keys flip between songs).
- **Print** — clean printable sheets (chrome hidden, sections kept intact).
- **Export / Import** — JSON backup of the whole library (Settings ⚙).
- **Tabs** — tab blocks (`e|---3---`) are preserved verbatim in monospace.

## Tests

```
node tests/run.js
```
