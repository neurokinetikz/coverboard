/* subs.js — chord substitution suggestions with reasons.
   Pure theory: given a chord symbol and a key/progression context, return
   ranked substitution candidates grouped by kind (function/relative/tritone/
   secondary/borrowed/color), each with shared-tone math for the captions.
   Depends only on chordtheory.js. Plain script; window + CommonJS. */
(function (global) {
  'use strict';

  var CT = (typeof module !== 'undefined' && module.exports)
    ? require('./chordtheory.js')
    : global.ChordTheory;

  var KIND_LABELS = {
    'function': 'Same function',
    relative: 'Relative',
    tritone: 'Tritone sub',
    secondary: 'Secondary dominant',
    borrowed: 'Borrowed',
    color: 'Color'
  };
  var KIND_ORDER = ['function', 'relative', 'tritone', 'secondary', 'borrowed', 'color'];
  var KIND_CAPS = { 'function': 3, relative: 1, tritone: 1, secondary: 1, borrowed: 2, color: 4 };

  /* quality family from raw intervals (same philosophy as Triads.reduceTriad:
     extensions stay un-modded, so 7#9's raw 15 can't read as a b3) */
  function qClass(parsed) {
    var iv = parsed.intervals;
    function has(n) { return iv.indexOf(n) !== -1; }
    if (iv.length === 2 && iv[0] === 0 && iv[1] === 7) return '5';
    if (has(3) && has(6)) return 'dim';
    if (has(4) && has(10)) return 'dom';
    if (has(4)) return 'maj';
    if (has(3)) return 'min';
    if (has(5) || has(2)) return 'sus';
    return 'other';
  }

  function pitchId(parsed) { return parsed.rootPc + '|' + parsed.quality; }

  function names(pcs, flat, cap) {
    return pcs.slice(0, cap || 3).map(function (pc) { return CT.pcName(pc, flat); }).join('·');
  }

  /* spelling context of a single chord: treat it as a momentary key, so the
     maj7 of A spells G# even inside a flat-side song key */
  function chordFlat(p) {
    var minorish = /^m(?!aj)/.test(p.quality) ||
      p.quality === 'dim' || p.quality === 'dim7';
    return CT.keyPrefersFlat(p.rootPc, minorish);
  }

  /* ---------- diatonic tables (offsets from keyPc) ---------- */

  // rows: fire when chord degree === deg AND qClass in gate
  var MAJOR_FN = [
    { deg: 0, gate: ['maj', 'dom'], subs: [
      { off: 4, q: 'm', roman: 'iii', why: 'mediant' },
      { off: 9, q: 'm', roman: 'vi', why: 'relative minor' }] },
    { deg: 4, gate: ['min'], subs: [
      { off: 0, q: '', roman: 'I', why: 'tonic family' },
      { off: 9, q: 'm', roman: 'vi', why: 'tonic family' }] },
    { deg: 9, gate: ['min'], subs: [
      { off: 0, q: '', roman: 'I', why: 'relative major' },
      { off: 4, q: 'm', roman: 'iii', why: 'tonic family' }] },
    { deg: 2, gate: ['min'], subs: [
      { off: 5, q: '', roman: 'IV', why: 'same subdominant role' }] },
    { deg: 5, gate: ['maj'], subs: [
      { off: 2, q: 'm', roman: 'ii', why: 'same subdominant role' }] },
    { deg: 7, gate: ['maj', 'dom'], subs: [
      { off: 11, q: 'm7b5', roman: 'viiø', whyFn: function (kn) {
        return 'viiø is ' + kn.V + '7 without its root'; } }] },
    { deg: 11, gate: ['dim'], subs: [
      { off: 7, q: '7', roman: 'V7', why: 'contains every note of the original' }] }
  ];

  var MINOR_FN = [
    { deg: 0, gate: ['min'], subs: [
      { off: 3, q: '', roman: 'III', why: 'relative major' },
      { off: 8, q: '', roman: 'VI', why: 'submediant' }] },
    { deg: 3, gate: ['maj'], subs: [
      { off: 0, q: 'm', roman: 'i', why: 'tonic family' },
      { off: 8, q: '', roman: 'VI', why: 'tonic family' }] },
    { deg: 8, gate: ['maj'], subs: [
      { off: 0, q: 'm', roman: 'i', why: 'tonic family' },
      { off: 3, q: '', roman: 'III', why: 'tonic family' }] },
    { deg: 5, gate: ['min'], subs: [
      { off: 2, q: 'm7b5', roman: 'iiø', why: 'iiø — iv with a leading tone' }] },
    { deg: 2, gate: ['dim'], subs: [
      { off: 5, q: 'm', roman: 'iv', why: 'same subdominant role' }] },
    { deg: 7, gate: ['min'], subs: [
      { off: 7, q: '7', roman: 'V7', why: 'raise the 3rd — harmonic-minor dominant' }] },
    { deg: 7, gate: ['maj', 'dom'], subs: [
      { off: 11, q: 'dim7', roman: 'vii°7', whyFn: function (kn) {
        return 'vii°7 is ' + kn.V + '7♭9 without its root'; } }] },
    { deg: 11, gate: ['dim'], subs: [
      { off: 7, q: '7', roman: 'V7', why: 'contains most of the original' }] },
    { deg: 10, gate: ['maj'], subs: [
      { off: 7, q: '7', roman: 'V7', why: 'stronger cadence — swap ♭VII for V7' }] }
  ];

  // flat: borrowed flat-side degrees are spelled with flats regardless of the
  // key's sharp preference — they come from the parallel minor (Bb in C, not A#)
  var MAJOR_BORROW = [
    { deg: 5, gate: ['maj'], subs: [
      { off: 5, q: 'm', roman: 'iv', why: 'borrowed iv — darkens the IV (classic IV→iv)' },
      { off: 8, q: '', roman: '♭VI', flat: true, why: 'borrowed ♭VI' }] },
    { deg: 2, gate: ['min'], subs: [
      { off: 5, q: 'm', roman: 'iv', why: 'subdominant-minor color' }] },
    { deg: 7, gate: ['maj', 'dom'], subs: [
      { off: 10, q: '', roman: '♭VII', flat: true, why: 'backdoor ♭VII — rock cadence to I' }] },
    { deg: 4, gate: ['min'], subs: [
      { off: 3, q: '', roman: '♭III', flat: true, why: 'borrowed ♭III — parallel-minor mediant' }] }
  ];

  var MINOR_BORROW = [
    { deg: 0, gate: ['min'], subs: [
      { off: 0, q: '', roman: 'I', why: 'Picardy third — major tonic ending' }] },
    { deg: 5, gate: ['min'], subs: [
      { off: 5, q: '', roman: 'IV', why: 'Dorian IV — brightened iv' }] }
  ];

  // same-root color upgrades keyed by exact parsed quality
  var COLOR = {
    '': ['maj7', 'add9', '6', 'sus4'],
    'maj': ['maj7', 'add9', '6', 'sus4'],
    'm': ['m7', 'm9'],
    'm7': ['m9', 'm11'],
    '7': ['9', '13', '7sus4'],
    'maj7': ['maj9', '69'],
    'sus4': [''],
    'sus': ['']
  };

  /* ---------- engine ---------- */

  function substitutionsFor(sym, ctx) {
    ctx = ctx || {};
    var parsed = CT.parseChord(sym);
    if (!parsed) return [];
    var cls = qClass(parsed);
    var keyPc = ctx.keyPc == null ? null : ((ctx.keyPc % 12) + 12) % 12;
    var minor = !!ctx.minor;
    var preferFlat = ctx.preferFlat !== undefined ? !!ctx.preferFlat
      : (keyPc != null ? CT.keyPrefersFlat(keyPc, minor) : false);
    var deg = keyPc == null ? null : ((parsed.rootPc - keyPc) + 12) % 12;
    var next = ctx.nextSym ? CT.parseChord(ctx.nextSym) : null;

    var origPcs = CT.chordPcs(parsed);
    var origId = pitchId(parsed);
    var seen = {};
    seen[origId] = 1;
    var out = [];

    function keyNames() {
      return { V: keyPc == null ? 'V' : CT.pcName((keyPc + 7) % 12, preferFlat) };
    }

    function push(kind, candSym, roman, why, whyIsFull) {
      var cand = CT.parseChord(candSym);
      if (!cand) return;
      var id = pitchId(cand);
      if (seen[id]) return;
      var candPcs = CT.chordPcs(cand);
      var shared = origPcs.filter(function (pc) { return candPcs.indexOf(pc) !== -1; });
      var changed = candPcs.filter(function (pc) { return origPcs.indexOf(pc) === -1; });
      var removed = origPcs.filter(function (pc) { return candPcs.indexOf(pc) === -1; });
      // kept tones belong to the ORIGINAL chord — spell them in its context
      var reason = whyIsFull ? why
        : (shared.length ? why + ' — keeps ' + names(shared, chordFlat(parsed)) : why);
      seen[id] = 1;
      out.push({ sym: candSym, kind: kind, kindLabel: KIND_LABELS[kind], reason: reason,
                 roman: roman || null, sharedPcs: shared, changedPcs: changed,
                 removedPcs: removed });
    }

    function runTable(table, kind) {
      var added = 0, items = [];
      table.forEach(function (row) {
        if (row.deg !== deg || row.gate.indexOf(cls) === -1) return;
        row.subs.forEach(function (s) {
          if (added >= KIND_CAPS[kind]) return;
          var pc = (keyPc + s.off) % 12;
          var candSym = CT.pcName(pc, s.flat ? true : preferFlat) + s.q;
          var why = s.whyFn ? s.whyFn(keyNames()) : s.why;
          var before = out.length;
          push(kind, candSym, s.roman, why, !!s.whyFn);
          if (out.length > before) { added++; items.push(out[out.length - 1]); }
        });
      });
      // most shared tones first; stable so table order breaks ties
      items.sort(function (a, b) { return b.sharedPcs.length - a.sharedPcs.length; });
      var base = out.length - items.length;
      items.forEach(function (it, i) { out[base + i] = it; });
    }

    // 1. diatonic function
    if (deg != null) runTable(minor ? MINOR_FN : MAJOR_FN, 'function');

    // 2. relative swap (key-agnostic; dedupes into function when already there)
    if (cls === 'min') {
      push('relative', CT.pcName((parsed.rootPc + 3) % 12, preferFlat), null, 'relative major');
    } else if (cls === 'maj') {
      push('relative', CT.pcName((parsed.rootPc + 9) % 12, preferFlat) + 'm', null, 'relative minor');
    }

    // 3. tritone sub — dominant function only; always flat-spelled (♭II7 convention)
    var plainTriad = parsed.quality === '' || parsed.quality === 'maj';
    var isDomFn = cls === 'dom' ||
      (deg === 7 && plainTriad) ||
      (next && plainTriad && ((parsed.rootPc - next.rootPc) + 12) % 12 === 7);
    if (isDomFn && cls !== 'min' && cls !== 'dim' && cls !== 'sus') {
      var ttSym = CT.pcName((parsed.rootPc + 6) % 12, true) + '7';
      var ttWhy = cls === 'dom'
        ? 'tritone sub — same 3rd & 7th, resolves down a half-step'
        : 'tritone sub for the implied ' + CT.pcName(parsed.rootPc, preferFlat) + '7 — chromatic bass slide';
      push('tritone', ttSym, '♭II7', ttWhy, true);
    }

    // 4. secondary dominant, replacement-only (Dm → D7 before G)
    if (next && cls !== 'dom' && cls !== '5' && cls !== 'other' &&
        ((next.rootPc + 7) % 12) === parsed.rootPc && pitchId(next) !== origId) {
      push('secondary', parsed.root + '7', null,
        'secondary dominant — V7 of ' + next.root + ', pushes into it', true);
    }

    // 5. borrowed / modal interchange
    if (deg != null) runTable(minor ? MINOR_BORROW : MAJOR_BORROW, 'borrowed');

    // 6. color upgrades on the same root
    if (cls === '5') {
      // power chord: fill the third only when the key says which one
      if (deg != null) {
        var majDegs = minor ? [3, 8, 10] : [0, 5, 7];
        var minDegs = minor ? [0, 5, 7] : [2, 4, 9];
        var q3 = majDegs.indexOf(deg) !== -1 ? '' : minDegs.indexOf(deg) !== -1 ? 'm' : null;
        if (q3 !== null) {
          push('color', parsed.root + q3, null,
            'add the 3rd — diatonic in ' +
            CT.pcName(keyPc, preferFlat) + (minor ? 'm' : ''), true);
        }
      }
    } else {
      var upgrades = COLOR[parsed.quality] || [];
      var colorAdded = 0;
      upgrades.forEach(function (suffix) {
        if (colorAdded >= KIND_CAPS.color) return;
        var candSym = parsed.root + suffix;
        var before = out.length;
        if (suffix === '') push('color', candSym, null, 'resolve the sus', true);
        else {
          var cand = CT.parseChord(candSym);
          if (!cand) return;
          var addPcs = CT.chordPcs(cand).filter(function (pc) { return origPcs.indexOf(pc) === -1; });
          // added tones belong to the CANDIDATE — spell them in its context
          // (Amaj7 adds G#, not Ab, even in a flat-side song key)
          push('color', candSym, null,
            'same root & function' + (addPcs.length ? ' — adds ' + names(addPcs, chordFlat(cand)) : ''), true);
        }
        if (out.length > before) colorAdded++;
      });
    }

    // fixed group order (array is built in that order already, but function/
    // borrowed sorting shuffles within groups only — reassert global order)
    out.sort(function (a, b) {
      return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    });
    return out;
  }

  var api = {
    substitutionsFor: substitutionsFor,
    KIND_LABELS: KIND_LABELS,
    KIND_ORDER: KIND_ORDER
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Subs = api;
})(typeof window !== 'undefined' ? window : globalThis);
