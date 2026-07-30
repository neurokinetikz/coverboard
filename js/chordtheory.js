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

  /* ---------- roman numerals ---------- */

  // Base numerals per chromatic degree above the key root (case applied from
  // the quality). Major spells flat-side chromatics ♭; minor uses the
  // natural-minor reference — III/VI/VII plain, matching detectKey's degree
  // set and the subs-table labels — with ♯ for raised chromatic degrees.
  var RN_MAJOR = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'];
  var RN_MINOR = ['I', '♭II', 'II', 'III', '♯III', 'IV', '♭V', 'V', 'VI', '♯VI', 'VII', '♯VII'];
  // Slash basses as Nashville digits. No quality to gate on, so degree 6 is
  // always ♯4 (D/F# must read II/♯4) and the minor leading tone is ♯7.
  var RN_BASS_MAJOR = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];
  var RN_BASS_MINOR = ['1', '♭2', '2', '3', '♯3', '4', '♯4', '5', '6', '♯6', '7', '♯7'];
  // Key degrees whose diatonic third is minor — cases power chords, which
  // carry no third of their own (diatonic minor + diminished degrees).
  var RN_MIN_DEGS = { major: { 2: 1, 4: 1, 9: 1, 11: 1 }, minor: { 0: 1, 2: 1, 5: 1, 7: 1 } };
  // Ascending passing/common-tone dims spell sharp-side: C–C#°7–Dm7 is
  // ♯i°7, never ♭ii°. Deg 6 applies in both modes; 1/3/8 are chromatic
  // only in major (deg 3/8 are diatonic minor degrees).
  var RN_DIM_RAISED = { 1: '♯I', 3: '♯II', 6: '♯IV', 8: '♯V' };

  function rnGlyph(s) { return s.replace(/b/g, '♭').replace(/#/g, '♯'); }

  // quality -> { lower: 'l'|'u'|'k', sym, suffix } ('k' = case from the key
  // degree). Built once over QUALITIES so a future quality gets a sane
  // default instead of a hole.
  var RN_RENDER = (function () {
    var special = {
      '':        { lower: 'u', sym: '',  suffix: '' },
      'maj':     { lower: 'u', sym: '',  suffix: '' },
      'dim':     { lower: 'l', sym: '°', suffix: '' },
      'dim7':    { lower: 'l', sym: '°', suffix: '7' },
      'm7b5':    { lower: 'l', sym: 'ø', suffix: '' },
      'aug':     { lower: 'u', sym: '+', suffix: '' },
      'aug7':    { lower: 'u', sym: '+', suffix: '7' },
      'augmaj7': { lower: 'u', sym: '+', suffix: 'maj7' },
      '5':       { lower: 'k', sym: '',  suffix: '5' },
      'sus':     { lower: 'u', sym: '',  suffix: 'sus4' }
    };
    var out = {};
    Object.keys(QUALITIES).forEach(function (q) {
      if (special.hasOwnProperty(q)) out[q] = special[q];
      else if (/^m(?!aj)/.test(q)) out[q] = { lower: 'l', sym: '', suffix: rnGlyph(q.slice(1)) };
      else out[q] = { lower: 'u', sym: '', suffix: rnGlyph(q) };
    });
    return out;
  })();

  /* Roman numeral of a chord in a key, e.g. G7 in C → "V7", Bm7b5 in Am →
     "iiø", D/F# in C → "II/♯4". Takes a symbol string or a parseChord
     result (hot render path skips the re-parse). Total: null when the
     chord doesn't parse or there is no key; never throws. */
  function romanNumeral(symOrParsed, keyPc, minor) {
    if (typeof keyPc !== 'number' || !isFinite(keyPc)) return null;
    var p = (symOrParsed && typeof symOrParsed === 'object' &&
             typeof symOrParsed.rootPc === 'number' &&
             typeof symOrParsed.quality === 'string')
      ? symOrParsed : parseChord(symOrParsed);
    if (!p) return null;
    var k = ((keyPc % 12) + 12) % 12;
    minor = !!minor;
    var deg = ((p.rootPc - k) + 12) % 12;
    var dimFamily = p.quality === 'dim' || p.quality === 'dim7' || p.quality === 'm7b5';
    var base;
    if (dimFamily && (deg === 6 || (!minor && RN_DIM_RAISED[deg]))) {
      base = RN_DIM_RAISED[deg];                               // passing dim: ♯i° ♯ii° ♯iv° ♯v°
    } else if (dimFamily && minor && deg === 11) {
      base = 'VII';                                            // leading-tone vii°7
    } else {
      base = (minor ? RN_MINOR : RN_MAJOR)[deg];
    }
    var r = RN_RENDER[p.quality] ||
            { lower: 'u', sym: '', suffix: rnGlyph(p.quality) };
    var lower = r.lower === 'l' ||
      (r.lower === 'k' && RN_MIN_DEGS[minor ? 'minor' : 'major'][deg] === 1);
    var out = (lower ? base.toLowerCase() : base) + r.sym + r.suffix;
    if (p.bassPc != null && p.bassPc !== p.rootPc) {
      var bdig = (minor ? RN_BASS_MINOR : RN_BASS_MAJOR)[((p.bassPc - k) + 12) % 12];
      // a chord-tone third in the bass takes its accidental from the chord,
      // not the key: E/G# in C is III/♯5 (the chord's G#), never ♭6 (Ab)
      var bint = ((p.bassPc - p.rootPc) + 12) % 12;
      if (bint === 4 && bdig.charAt(0) === '♭') {
        bdig = '♯' + (+bdig.charAt(1) === 1 ? 7 : +bdig.charAt(1) - 1);
      } else if (bint === 3 && bdig.charAt(0) === '♯') {
        bdig = '♭' + (+bdig.charAt(1) === 7 ? 1 : +bdig.charAt(1) + 1);
      }
      out += '/' + bdig;
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
    chordPcs: chordPcs,
    romanNumeral: romanNumeral
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ChordTheory = api;
})(typeof window !== 'undefined' ? window : globalThis);
