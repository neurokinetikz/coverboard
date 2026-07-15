# Songbook

A fast, local songbook app — paste chords straight from Ultimate Guitar and get a
clean, color-highlighted chord sheet with chord diagrams. Then go deeper: built-in
triad/CAGED practice tools, a full-neck fretboard explorer, and theory-aware chord
substitutions turn every song in your library into a lesson.

No account, no server, no subscription, no dependencies; your library lives in your
browser (with optional sync to a local file).

## Run it

Open `index.html` in any modern browser (double-click works — no server needed).

Or use the single-file build: `dist/songbook.html` is the whole app in one file —
copy it to a phone/tablet, email it to yourself, put it anywhere.
Rebuild it after changes with `node build.js`.

## The import flow

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

## Learn: triads & CAGED

Toggle **△ Triads** in the song toolbar and the diagram strip switches to
**triad charts** — every chord in the song reduced to its playable three-note
shape, with each note color-coded by interval role:

> ● root (blue) · ● 3rd (amber) · ● 5th (green) · ● 7th/6th (violet)

Two controls drive the strip:

- **Position** — `Any` or one of the five CAGED positions of the song's key
  (`G·Open | E·3fr | D·5fr | C·7fr | A·10fr` in G). Pick one and *every chord*
  is voiced inside that neck window, so you can play the whole song without
  leaving the position. When a chord has no strict in-window voicing, the
  engine widens by a fret and says so (`±1fr`), or flags a genuine position
  break (`off-pos`) — it never lies.
- **Strings** — which adjacent string set to practice on (`1-3 | 2-4 | 3-5 | 4-6`).
  Hold a position and cycle the sets, or hold a set and walk the positions.

Chords richer than a triad reduce honestly:

| you wrote | chart shows | why |
|---|---|---|
| `C7` `C9` `C13` | R·3·♭7 shell | guide tones define a dominant; the 9/13 is the first note a trio drops |
| `Am7` `Am9` | R·♭3·♭7 shell | same idea, minor |
| `Cmaj7` `Cmaj9` | R·3·7 shell | natural-7 shell |
| `C6` / `Cm6` | R·3·6 shell | pitch-identical to the relative minor's shape — half the lesson |
| `Cadd9` | plain triad | a closed R·3·9 on adjacent strings is an unplayable cluster |
| `Dm7b5` → `Ddim`, `E7#5` → `Eaug`, `D/F#` → `D` | badged | the origin symbol shows above the chart |

Transpose the song and the strip follows, including the position labels.

## Learn: fretboard explorer

**Fretboard** in the sidebar (or "Explore neck →" from the strip) opens a
full-width neck view: pick any root (sharp and flat spellings are separate
buttons — tapping `F♯` vs `G♭` spells everything accordingly) and any quality
(maj, min, 7, m7, maj7, 6, m6, dim, aug, sus2, sus4). You get:

- every chord tone across 15 frets, labeled by **interval** (default) or note name
- a **scale layer** (`none | pentatonic | full scale`) — scale tones as small ghost
  dots behind the chord tones, so you see the triad-inside-the-box relationship;
  chord-correct flavors (minor pent / major pent; Mixolydian for 7ths, Dorian for m6)
- a **string set + inversion filter** that narrows the cloud to actual closed voicings
- an optional **CAGED overlay** shading the five position windows
- the discrete voicing charts below the neck — tap any to open substitutions

And in the song view: pick a CAGED position in the triad strip and a compact
**pentatonic-box card** appears at the end of the row — that exact five-fret
window with the key's pentatonic dots, tonics in root-blue. Tap it to open the
explorer with everything pre-set.

## Learn: chord substitutions

Click any chord — in the lyrics, either diagram strip, or the explorer — and the
modal answers one question: **"what else could I play right here?"** The chart
you clicked sits on top; below it, up to six substitution candidates, each voiced
*near the same position on the same string set*, each with a one-line why:

- **Same function** — diatonic swaps (C→Em/Am; in minor keys iv→iiø, v→V7…)
- **Relative** major/minor
- **Tritone sub** — only for genuinely dominant-function chords (G7→D♭7)
- **Secondary dominant** — reads the actual progression (Dm→D7 when D heads to G)
- **Borrowed** — iv, ♭VI, backdoor ♭VII in major; Picardy and Dorian IV in minor
- **Color** — same-root upgrades (C→Cmaj7/Cadd9/C6/Csus4)

Reasons show shared tones ("relative minor — keeps G·B") with chord-correct
spelling (Amaj7 adds G♯, never A♭). Tap a candidate to make it the focus and
chain deeper; `‹` walks back.

## Everything else

- **Search** — instant, fuzzy, across titles, artists, lyrics, and chords.
- **Chord diagrams** — the ◫ Chords strip shows a voicing for every song chord;
  curated fingerings for the classics, generated for the rest. Charts shrink to
  keep any song's chords on one centered row.
- **Transpose** — ± semitones with correct flat/sharp spelling for the target key.
- **Fit mode** — ⛶ fits the entire song on screen in auto-sized columns
  (binary-searches the largest font that fits). Toggle off for scroll + autoscroll.
- **Autoscroll** — ▶ button or spacebar; speed slider in the toolbar.
- **Setlists** — build, reorder, and Perform (arrow keys flip between songs).
- **Library file sync** — link a local JSON file (Settings ⚙) and every change
  streams to it; a browser-data wipe can never lose your songs. Newer side wins
  on reconnect.
- **Export / Import** — JSON backup of the whole library (Settings ⚙).
- **Themes** — dark/light (◐ in the sidebar); all charts and role colors adapt.
- **Collapsible sidebar** — ☰ slides the library away on desktop (persisted),
  and is the drawer toggle on narrow screens.
- **Print** — clean printable sheets: chrome hidden, ink-safe chart colors even
  from dark mode, strips wrap instead of clipping.
- **Tabs** — tab blocks (`e|---3---`) are preserved verbatim in monospace.

## Architecture

Plain ES5-style scripts on `window`, loaded in dependency order — no framework,
no bundler, runs from `file://`. UI state lives in one object with full re-render;
events are delegated through `data-act` attributes.

| module | role |
|---|---|
| `js/chordtheory.js` | note/chord parsing, transposition, key detection |
| `js/parser.js` | UG/ChordPro/freeform song text → sections/lines/chords |
| `js/voicings.js` | full chord voicings: curated shapes + search-based generator |
| `js/diagrams.js` | chord chart SVG renderer (interval-role coloring optional) |
| `js/triads.js` | triad/shell engine: closed voicings per string set × rotation, CAGED position model, position-constrained picker |
| `js/subs.js` | substitution engine: six rule families with major/minor key tables |
| `js/fretboard.js` | full-neck SVG renderer for the explorer |
| `js/search.js` | fuzzy library search |
| `js/store.js` | localStorage persistence, settings, parse cache |
| `js/filestore.js` | File System Access sync to a linked library file |
| `js/app.js` | all UI: views, strips, modals, routing, event delegation |

Everything except `app.js`/`filestore.js` is pure and Node-testable. New modules
follow the same pattern: IIFE exporting to `window` + CommonJS, registered in
both `index.html` and `build.js` (the build fails loudly if they drift).

## Tests

```
node tests/run.js
```

856 assertions across the parser, chord theory, voicing generator, triad/CAGED
engine (including hand-verified fret literals), substitution rule tables, and
both SVG renderers. Pure Node — no browser or DOM required.
