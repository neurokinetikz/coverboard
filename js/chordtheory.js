/* chordtheory.js — note/chord parsing, transposition, key detection.
   Plain script (no modules) so it runs from file:// ; exports to window and CommonJS. */
(function (global) {
  'use strict';

  var NOTE_TO_PC = {
    'C': 0, 'B#': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'Fb': 4, 'E#': 5, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7,
    'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11
  };
  var SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Keys whose signatures use flats — used to pick note spelling after transpose.
  var FLAT_MAJOR_PCS = { 5: 1, 10: 1, 3: 1, 8: 1, 1: 1, 6: 1 };   // F Bb Eb Ab Db Gb
  var FLAT_MINOR_PCS = { 2: 1, 7: 1, 0: 1, 5: 1, 10: 1, 3: 1 };   // Dm Gm Cm Fm Bbm Ebm

  // quality suffix -> semitone intervals from root (root always 0)
  var QUALITIES = {
    '':        [0, 4, 7],
    'maj':     [0, 4, 7],
    'm':       [0, 3, 7],
    '5':       [0, 7],
    'dim':     [0, 3, 6],
    'dim7':    [0, 3, 6, 9],
    'aug':     [0, 4, 8],
    'sus2':    [0, 2, 7],
    'sus4':    [0, 5, 7],
    '6':       [0, 4, 7, 9],
    'm6':      [0, 3, 7, 9],
    '69':      [0, 4, 7, 9, 14],
    'm69':     [0, 3, 7, 9, 14],
    '7':       [0, 4, 7, 10],
    'maj7':    [0, 4, 7, 11],
    'm7':      [0, 3, 7, 10],
    'mmaj7':   [0, 3, 7, 11],
    'm7b5':    [0, 3, 6, 10],
    'aug7':    [0, 4, 8, 10],
    'augmaj7': [0, 4, 8, 11],
    '7sus4':   [0, 5, 7, 10],
    '7sus2':   [0, 2, 7, 10],
    '9':       [0, 4, 7, 10, 14],
    'maj9':    [0, 4, 7, 11, 14],
    'm9':      [0, 3, 7, 10, 14],
    'mmaj9':   [0, 3, 7, 11, 14],
    '9sus4':   [0, 5, 7, 10, 14],
    '11':      [0, 4, 7, 10, 14, 17],
    'm11':     [0, 3, 7, 10, 14, 17],
    '13':      [0, 4, 7, 10, 14, 21],
    'maj13':   [0, 4, 7, 11, 14, 21],
    'm13':     [0, 3, 7, 10, 14, 21],
    'add9':    [0, 4, 7, 14],
    'madd9':   [0, 3, 7, 14],
    'add11':   [0, 4, 7, 17],
    'madd11':  [0, 3, 7, 17],
    'add4':    [0, 4, 5, 7],
    '7b5':     [0, 4, 6, 10],
    '7#5':     [0, 4, 8, 10],
    '7b9':     [0, 4, 7, 10, 13],
    '7#9':     [0, 4, 7, 10, 15],
    '7#11':    [0, 4, 7, 10, 18],
    '7b13':    [0, 4, 7, 10, 20],
    '9b5':     [0, 4, 6, 10, 14],
    '9#5':     [0, 4, 8, 10, 14],
    '13b9':    [0, 4, 7, 10, 13, 21],
    '13#9':    [0, 4, 7, 10, 15, 21],
    'maj7b5':  [0, 4, 6, 11],
    'maj7#5':  [0, 4, 8, 11],
    'maj7#11': [0, 4, 7, 11, 18],
    'm7#5':    [0, 3, 8, 10],
    'sus':     [0, 5, 7],
    '6sus4':   [0, 5, 7, 9],
    'sus2sus4':[0, 2, 5, 7]
  };

  // alias -> canonical quality (applied after lowercase-insensitive normalization)
  var ALIASES = {
    'major': '', 'M': '', 'ma': '', 'maj': '',
    'min': 'm', 'mi': 'm', '-': 'm',
    'M7': 'maj7', 'Ma7': 'maj7', 'ma7': 'maj7', 'Maj7': 'maj7', 'MAJ7': 'maj7',
    'Δ': 'maj7', 'Δ7': 'maj7', '^7': 'maj7', '^': 'maj7', 'j7': 'maj7',
    'M9': 'maj9', 'Ma9': 'maj9', 'Maj9': 'maj9', 'M13': 'maj13', 'Maj13': 'maj13',
    'min7': 'm7', 'mi7': 'm7', '-7': 'm7',
    'min6': 'm6', 'min9': 'm9', 'min11': 'm11', 'min13': 'm13',
    'minmaj7': 'mmaj7', 'mM7': 'mmaj7', 'mMaj7': 'mmaj7', 'm(maj7)': 'mmaj7', 'minMaj7': 'mmaj7',
    'mmaj9': 'mmaj9', 'mM9': 'mmaj9',
    /* NOTE: no bare 'o' alias — it makes lyric words like "Do"/"Go" parse as
       diminished chords. '°' and 'o7' are unambiguous and stay. */
    '°': 'dim', 'o7': 'dim7', '°7': 'dim7', 'dim.': 'dim',
    'ø': 'm7b5', 'ø7': 'm7b5', 'm7-5': 'm7b5', 'min7b5': 'm7b5', '0': 'm7b5',
    '+': 'aug', '+5': 'aug', '#5': 'aug', 'augmented': 'aug',
    '+7': 'aug7', '7+': 'aug7', '7+5': 'aug7', '7aug': 'aug7',
    'sus': 'sus4', 'suspended': 'sus4',
    '2': 'sus2', 'add2': 'add9',
    '4': 'sus4',
    '6/9': '69', '6add9': '69', '6-9': '69',
    'm6/9': 'm69',
    '7sus': '7sus4',
    '9sus': '9sus4',
    'add(9)': 'add9', 'm(add11)': 'madd11', 'minadd11': 'madd11',
    '7-5': '7b5', '7+9': '7#9', '7-9': '7b9',
    'M7b5': 'maj7b5', 'M7#5': 'maj7#5', 'M7#11': 'maj7#11', 'maj7(#11)': 'maj7#11',
    'dom7': '7', 'dom': '7'
  };

  var ROOT_RE = /^([A-G](?:#|b|♯|♭)?)/;

  function normAccidental(s) {
    return s.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/×/g, 'x');
  }

  function normalizeQuality(q) {
    if (q == null) return null;
    q = q.replace(/[()]/g, ''); // C7(b9) -> C7b9, C(add9) -> Cadd9
    if (ALIASES.hasOwnProperty(q)) q = ALIASES[q];
    if (QUALITIES.hasOwnProperty(q)) return q;
    // case-tolerant retries for common spellings
    var lower = q.toLowerCase();
    var retries = [lower,
      lower.replace(/^maj(or)?/, 'maj'), lower.replace(/^min(or)?/, 'm'),
      lower.replace(/^sus$/, 'sus4')];
    for (var i = 0; i < retries.length; i++) {
      var r = retries[i];
      if (ALIASES.hasOwnProperty(r)) r = ALIASES[r];
      if (QUALITIES.hasOwnProperty(r)) return r;
    }
    return null;
  }

  /* Parse a chord symbol like "F#m7b5/C#". Returns
     { root, rootPc, quality, intervals, bass, bassPc, norm } or null. */
  function parseChord(sym) {
    if (!sym || typeof sym !== 'string') return null;
    var s = normAccidental(sym.trim());
    if (!s) return null;
    // Optional slash bass. Take the LAST slash whose right side is a bare note.
    var bass = null, body = s;
    var slash = s.lastIndexOf('/');
    if (slash > 0) {
      var after = s.slice(slash + 1);
      if (/^[A-G](#|b)?$/.test(after)) { bass = after; body = s.slice(0, slash); }
    }
    var m = ROOT_RE.exec(body);
    if (!m) return null;
    var root = normAccidental(m[1]);
    var rest = body.slice(m[1].length);
    var quality = normalizeQuality(rest);
    if (quality === null) return null;
    if (!NOTE_TO_PC.hasOwnProperty(root)) return null;
    if (bass !== null && !NOTE_TO_PC.hasOwnProperty(bass)) return null;
    return {
      root: root,
      rootPc: NOTE_TO_PC[root],
      quality: quality,
      intervals: QUALITIES[quality],
      bass: bass,
      bassPc: bass === null ? null : NOTE_TO_PC[bass],
      norm: root + quality + (bass ? '/' + bass : '')
    };
  }

  function isChordSymbol(sym) { return parseChord(sym) !== null; }

  function pcName(pc, preferFlat) {
    pc = ((pc % 12) + 12) % 12;
    return preferFlat ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
  }

  /* Transpose a chord symbol by `steps` semitones, preserving the quality text
     the user wrote (only root/bass letters change). */
  function transposeChord(sym, steps, preferFlat) {
    var p = parseChord(sym);
    if (!p) return sym;
    var s = normAccidental(sym.trim());
    var body = s, bassTxt = null;
    var slash = s.lastIndexOf('/');
    if (slash > 0 && /^[A-G](#|b)?$/.test(s.slice(slash + 1))) {
      bassTxt = s.slice(slash + 1);
      body = s.slice(0, slash);
    }
    var m = ROOT_RE.exec(body);
    var qualityTxt = body.slice(m[1].length);
    var newRoot = pcName(p.rootPc + steps, preferFlat);
    var out = newRoot + qualityTxt;
    if (bassTxt !== null) out += '/' + pcName(p.bassPc + steps, preferFlat);
    return out;
  }

  /* Given the (possibly transposed) key, decide whether to spell with flats. */
  function keyPrefersFlat(keyPc, isMinor) {
    return !!(isMinor ? FLAT_MINOR_PCS[((keyPc % 12) + 12) % 12]
                      : FLAT_MAJOR_PCS[((keyPc % 12) + 12) % 12]);
  }

  /* Guess the key from a list of chord symbols. Returns
     { pc, minor, name } or null. Scores all 24 keys by diatonic membership,
     weighting tonic and first/last chords. */
  function detectKey(chordSyms) {
    var parsed = [];
    for (var i = 0; i < chordSyms.length; i++) {
      var p = parseChord(chordSyms[i]);
      if (p) parsed.push(p);
    }
    if (!parsed.length) return null;
    // diatonic triad roots+qualities for major and natural/harmonic minor
    var best = null, bestScore = -1;
    for (var pc = 0; pc < 12; pc++) {
      for (var minor = 0; minor < 2; minor++) {
        var score = 0;
        var degrees = minor
          ? { 0: 'm', 2: 'dim', 3: '', 5: 'm', 7: 'm|', 8: '', 10: '' } // minor: v or V both common
          : { 0: '', 2: 'm', 4: 'm', 5: '', 7: '', 9: 'm', 11: 'dim' };
        for (var j = 0; j < parsed.length; j++) {
          var c = parsed[j];
          var deg = ((c.rootPc - pc) + 12) % 12;
          if (degrees.hasOwnProperty(deg)) {
            var want = degrees[deg];
            var q = c.quality;
            var qBase = q === '' || q === 'maj' || /^(maj7|maj9|maj13|6|69|add9|add11|sus2|sus4)$/.test(q) ? ''
                     : /^m/.test(q) && !/^maj/.test(q) ? 'm'
                     : /^(7|9|11|13|7sus4|7b9|7#9)$/.test(q) ? ''
                     : q === 'dim' || q === 'dim7' || q === 'm7b5' ? 'dim' : '?';
            if (want.indexOf('|') !== -1 ? true : want === qBase) score += 2;
            else score += 0.5; // right root, unexpected quality
            if (deg === 0 && want.indexOf(qBase) !== -1) score += 1.5; // tonic bonus
          }
        }
        // first and last chords weigh as likely tonics
        var first = parsed[0], last = parsed[parsed.length - 1];
        if (first.rootPc === pc && (minor ? /^m/.test(first.quality) : !/^m(?!aj)/.test(first.quality))) score += 3;
        if (last.rootPc === pc && (minor ? /^m/.test(last.quality) : !/^m(?!aj)/.test(last.quality))) score += 2;
        if (score > bestScore) { bestScore = score; best = { pc: pc, minor: !!minor }; }
      }
    }
    if (!best) return null;
    best.name = pcName(best.pc, keyPrefersFlat(best.pc, best.minor)) + (best.minor ? 'm' : '');
    return best;
  }

  /* pitch classes for a parsed chord (mod 12, deduped, order preserved) */
  function chordPcs(parsed) {
    var seen = {}, out = [];
    for (var i = 0; i < parsed.intervals.length; i++) {
      var pc = (parsed.rootPc + parsed.intervals[i]) % 12;
      if (!seen[pc]) { seen[pc] = 1; out.push(pc); }
    }
    return out;
  }

  var api = {
    NOTE_TO_PC: NOTE_TO_PC,
    QUALITIES: QUALITIES,
    parseChord: parseChord,
    isChordSymbol: isChordSymbol,
    transposeChord: transposeChord,
    pcName: pcName,
    keyPrefersFlat: keyPrefersFlat,
    detectKey: detectKey,
    chordPcs: chordPcs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ChordTheory = api;
})(typeof window !== 'undefined' ? window : globalThis);
