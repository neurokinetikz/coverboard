/* triads.js — triad reduction, closed-voicing generation on adjacent string
   sets, and the CAGED position model. Pure data/math, no DOM.
   Voicings come out in the shared shape format ({frets, fingers, baseFret,
   barre}) so diagrams.js renders them unchanged, plus metadata:
   { stringSet, strings, inversion, rootString, minFret, maxFret, notes, bassPc }.
   Plain script; exports to window and CommonJS. */
(function (global) {
  'use strict';

  var CT = (typeof module !== 'undefined' && module.exports)
    ? require('./chordtheory.js')
    : global.ChordTheory;
  var V = (typeof module !== 'undefined' && module.exports)
    ? require('./voicings.js')
    : global.Voicings;

  // Absolute pitches of the open strings, low E first (E2 A2 D3 G3 B3 E4).
  // OPEN_MIDI[s] % 12 === V.TUNING[s]. The rest of the codebase is mod-12
  // only; absolute pitch is what makes closed-voicing octave placement
  // computable.
  var OPEN_MIDI = [40, 45, 50, 55, 59, 64];

  var TRIAD_INTERVALS = {
    maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
    sus2: [0, 2, 7], sus4: [0, 5, 7], '5': [0, 7],
    // 7th/6th-chord "shells": R-3-7 / R-3-6 with the 5th omitted — the
    // standard three-string voicings (a 6-shell is pitch-identical to the
    // relative m7 shell, which is half the lesson)
    '7': [0, 4, 10], m7: [0, 3, 10], maj7: [0, 4, 11],
    '6': [0, 4, 9], m6: [0, 3, 9]
  };

  var TRIAD_SUFFIX = {
    maj: '', min: 'm', dim: 'dim', aug: 'aug', sus2: 'sus2', sus4: 'sus4',
    '5': '5', '7': '7', m7: 'm7', maj7: 'maj7', '6': '6', m6: 'm6'
  };

  // String sets use guitarist numbering (1 = high e); `low` is the index of
  // the set's lowest-pitch string in the frets[] array (low E = 0).
  var STRING_SETS = [
    { id: '1-3', low: 3 },   // G B e
    { id: '2-4', low: 2 },   // D G B
    { id: '3-5', low: 1 },   // A D G
    { id: '4-6', low: 0 }    // E A D
  ];
  var SET_INDEX = { '1-3': 0, '2-4': 1, '3-5': 2, '4-6': 3 };

  var ROLE_NAMES = {
    maj: { 0: 'R', 4: '3', 7: '5' },
    min: { 0: 'R', 3: 'b3', 7: '5' },
    dim: { 0: 'R', 3: 'b3', 6: 'b5' },
    aug: { 0: 'R', 4: '3', 8: '#5' },
    sus2: { 0: 'R', 2: '2', 7: '5' },
    sus4: { 0: 'R', 5: '4', 7: '5' },
    '5': { 0: 'R', 7: '5' },
    '7': { 0: 'R', 4: '3', 10: 'b7' },
    m7: { 0: 'R', 3: 'b3', 10: 'b7' },
    maj7: { 0: 'R', 4: '3', 11: '7' },
    '6': { 0: 'R', 4: '3', 9: '6' },
    m6: { 0: 'R', 3: 'b3', 9: '6' }
  };

  /* ---------- scales (reference layer for the explorer / strip card) ---------- */

  var SCALES = {
    majPent: { intervals: [0, 2, 4, 7, 9], name: 'major pentatonic',
               roles: { 0: 'R', 2: '2', 4: '3', 7: '5', 9: '6' } },
    minPent: { intervals: [0, 3, 5, 7, 10], name: 'minor pentatonic',
               roles: { 0: 'R', 3: 'b3', 5: '4', 7: '5', 10: 'b7' } },
    major:   { intervals: [0, 2, 4, 5, 7, 9, 11], name: 'major scale',
               roles: { 0: 'R', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7' } },
    minor:   { intervals: [0, 2, 3, 5, 7, 8, 10], name: 'natural minor',
               roles: { 0: 'R', 2: '2', 3: 'b3', 5: '4', 7: '5', 8: 'b6', 10: 'b7' } },
    mixo:    { intervals: [0, 2, 4, 5, 7, 9, 10], name: 'Mixolydian',
               roles: { 0: 'R', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 10: 'b7' } },
    dorian:  { intervals: [0, 2, 3, 5, 7, 9, 10], name: 'Dorian',
               roles: { 0: 'R', 2: '2', 3: 'b3', 5: '4', 7: '5', 9: '6', 10: 'b7' } }
  };

  /* pentatonic PATTERN box per CAGED shape, relative to the shape's frame —
     patterns don't align with chord windows uniformly: A/E/D-shape boxes
     reach one fret below the frame. Each box holds exactly 2 notes per
     string (the defining property; pinned by tests). */
  var PENT_BOX_SPAN = { C: [0, 3], A: [-1, 2], G: [0, 3], E: [-1, 2], D: [-1, 3] };

  /* the pentatonic pattern box for a CAGED position: the per-shape span
     around the frame — except when that span would dip below the nut, where
     the playable equivalent is the OPEN pattern: each string's two lowest
     in-scale frets. Always yields exactly 2 notes per string. */
  function pentBoxDots(rootPc, minor, position) {
    var map = scaleMap(rootPc, minor ? 'minPent' : 'majPent', { maxFret: 17 });
    var span = PENT_BOX_SPAN[position.shape] || [0, 4];
    var lo = position.frame + span[0], hi = position.frame + span[1];
    var dots = [];
    if (lo < 0) {
      lo = 0; hi = 0;
      map.strings.forEach(function (arr, s) {
        arr.slice(0, 2).forEach(function (n) {
          dots.push({ string: s, fret: n.fret, interval: n.interval, role: n.role });
          if (n.fret > hi) hi = n.fret;
        });
      });
    } else {
      map.strings.forEach(function (arr, s) {
        arr.forEach(function (n) {
          if (n.fret >= lo && n.fret <= hi) {
            dots.push({ string: s, fret: n.fret, interval: n.interval, role: n.role });
          }
        });
      });
    }
    return { lo: lo, hi: hi, dots: dots };
  }

  /* which scale fits a chord quality — chord-correct, not key-approximate:
     dominant 7ths get Mixolydian, m6 gets Dorian */
  function scaleForQuality(quality, kind) {
    var minorish = quality === 'min' || quality === 'm7' || quality === 'm6';
    var majorish = quality === 'maj' || quality === '7' ||
                   quality === 'maj7' || quality === '6';
    if (!minorish && !majorish) return null;
    if (kind !== 'full') return minorish ? 'minPent' : 'majPent';
    if (quality === '7') return 'mixo';
    if (quality === 'm6') return 'dorian';
    return minorish ? 'minor' : 'major';
  }

  /* ---------- triad reduction ---------- */

  /* Reduce any parsed chord (or symbol) to its underlying triad.
     Membership tests use the RAW interval list — extensions stay un-modded
     in QUALITIES (15 = #9, 17 = 11...), so a 7#9's 15 can never masquerade
     as a minor third. `approx` marks qualities whose altered 5th had to be
     normalized away (7b5 family, m7#5); dropping 7ths/extensions does not. */
  function reduceTriad(parsedOrSym) {
    var p = typeof parsedOrSym === 'string' ? CT.parseChord(parsedOrSym) : parsedOrSym;
    if (!p || !p.intervals) return null;
    var iv = p.intervals;
    function has(n) { return iv.indexOf(n) !== -1; }
    // order matters: add4 [0,4,5,7] must read major, sus2sus4 [0,2,5,7] sus4
    var third = has(4) ? 'M' : has(3) ? 'm' : has(5) ? 's4' : has(2) ? 's2' : null;
    // order matters: dim7 carries both 6 and 9; '6' carries both 7 and 9
    var fifth = has(7) ? 'P' : has(6) ? 'b' : has(8) ? '#' : 'P';
    var quality, approx = false;
    var hasB7 = iv.indexOf(10) !== -1;  // 7th/6th chords get R-3-x shells
    var hasM7 = iv.indexOf(11) !== -1;
    var has6 = iv.indexOf(9) !== -1;    // raw 9 = 6th (dim7's bb7 is gated
                                        // by the fifth check before this)
    if (third === 'M') {
      if (fifth === '#') quality = 'aug';           // aug7 keeps its aug color
      else {
        quality = hasB7 ? '7' : hasM7 ? 'maj7' : has6 ? '6' : 'maj';
        if (fifth === 'b') approx = true;           // 7b5 family drops the b5
      }
    } else if (third === 'm') {
      if (fifth === 'b') quality = 'dim';           // m7b5/dim7 keep their dim core
      else {
        quality = hasB7 ? 'm7' : has6 ? 'm6' : 'min';
        if (fifth === '#') approx = true;           // m7#5
      }
    } else if (third === 's4') quality = 'sus4';
    else if (third === 's2') quality = 'sus2';
    else quality = '5'; // power chord: no third — never invent one
    return {
      rootPc: p.rootPc,
      quality: quality,
      intervals: TRIAD_INTERVALS[quality],
      bassPc: p.bassPc,
      fromQuality: p.quality,
      approx: approx
    };
  }

  /* ---------- closed-voicing generator ---------- */

  /* Rotate the sorted intervals by `inv`, then lift each note above the
     previous — closed by construction (maj: [0,4,7] / [4,7,12] / [7,12,16]). */
  function orderedOffsets(intervals, inv) {
    var r = intervals.slice(inv).concat(intervals.slice(0, inv));
    var o = [r[0]];
    for (var k = 1; k < r.length; k++) {
      var n = r[k];
      while (n <= o[k - 1]) n += 12;
      o.push(n);
    }
    return o;
  }

  function buildVoicing(rootPc, quality, set, inv, frets3) {
    var frets = [-1, -1, -1, -1, -1, -1];
    var notes = [];
    var minF = 99, maxF = 0, frettedMin = 99, frettedMax = 0;
    var rootString = -1;
    for (var k = 0; k < 3; k++) {
      var s = set.low + k, f = frets3[k];
      frets[s] = f;
      var midi = OPEN_MIDI[s] + f;
      var pc = midi % 12;
      var interval = ((pc - rootPc) % 12 + 12) % 12;
      notes.push({ string: s, fret: f, midi: midi, pc: pc, interval: interval,
                   role: ROLE_NAMES[quality][interval] || '' });
      if (interval === 0 && rootString === -1) rootString = s;
      if (f < minF) minF = f;
      if (f > maxF) maxF = f;
      if (f > 0) {
        if (f < frettedMin) frettedMin = f;
        if (f > frettedMax) frettedMax = f;
      }
    }
    return {
      frets: frets,
      fingers: null,
      baseFret: frettedMax <= 4 ? 1 : frettedMin,   // same rule as voicings.js
      barre: V.detectBarre(frets),
      stringSet: set.id,
      strings: [set.low, set.low + 1, set.low + 2],
      inversion: inv,
      rootString: rootString,
      minFret: minF,
      maxFret: maxF,
      notes: notes,
      bassPc: notes[0].pc
    };
  }

  var triadCache = {};

  /* All closed-voice triads for rootPc+quality across the four adjacent
     string sets and three inversions, frets 0..maxFret. opts.sets limits to
     specific set ids. Power chords get the single ordering root-5th-octave. */
  function triadsFor(rootPc, quality, opts) {
    opts = opts || {};
    var maxFret = opts.maxFret || 15;
    var setIds = opts.sets || null;
    rootPc = ((rootPc % 12) + 12) % 12;
    var cacheKey = rootPc + '|' + quality + '|' + maxFret;
    if (!setIds && triadCache[cacheKey]) return triadCache[cacheKey];

    var intervals = TRIAD_INTERVALS[quality];
    if (!intervals) return [];
    var orderings = quality === '5'
      ? [[0, 7, 12]]
      : [0, 1, 2].map(function (inv) { return orderedOffsets(intervals, inv); });

    var out = [];
    STRING_SETS.forEach(function (set) {
      if (setIds && setIds.indexOf(set.id) === -1) return;
      var setOut = [];
      orderings.forEach(function (off, inv) {
        var lowPc = (rootPc + off[0]) % 12;
        for (var fLow = 0; fLow <= maxFret; fLow++) {
          var pLow = OPEN_MIDI[set.low] + fLow;
          if (pLow % 12 !== lowPc) continue;
          var fMid = pLow + (off[1] - off[0]) - OPEN_MIDI[set.low + 1];
          var fHigh = pLow + (off[2] - off[0]) - OPEN_MIDI[set.low + 2];
          if (fMid < 0 || fMid > maxFret || fHigh < 0 || fHigh > maxFret) continue;
          var span = Math.max(fLow, fMid, fHigh) - Math.min(fLow, fMid, fHigh);
          // playability cap: dim root position and the 7th-shell rotations
          // legitimately span 4; the m7/maj7 7th-in-bass rotations on the low
          // sets would span 5 and are culled here (the UI explains the gap)
          if (span > 4) continue;
          setOut.push(buildVoicing(rootPc, quality, set, inv, [fLow, fMid, fHigh]));
        }
      });
      setOut.sort(function (a, b) {
        return a.minFret - b.minFret || a.inversion - b.inversion;
      });
      out = out.concat(setOut);
    });
    if (!setIds) triadCache[cacheKey] = out;
    return out;
  }

  /* ---------- CAGED position model ---------- */

  // Pitch class of each open CAGED shape's root: sliding the shape up puts
  // its "frame" (virtual nut) for root R at (R - offset) mod 12. Relative
  // frames are always R+0 (C), +3 (A), +5 (G), +8 (E), +10 (D).
  var SHAPE_OFFSET = { C: 0, A: 9, G: 7, E: 4, D: 2 };
  var SHAPE_ORDER = ['C', 'A', 'G', 'E', 'D'];

  // A position is the 5-fret window [frame, frame+4]; near the neck ends it
  // also exists an octave away, so materialize every instance in range.
  function positionInstances(frame, maxFret) {
    var inst = [];
    [frame - 12, frame, frame + 12].forEach(function (b) {
      if (b + 4 < 0 || b > maxFret) return;
      var lo = Math.max(0, b), hi = Math.min(b + 4, maxFret);
      if (lo <= hi) inst.push([lo, hi]);
    });
    return inst;
  }

  /* The five CAGED positions for a key, sorted low to high (index 1..5).
     Pattern letters are ALWAYS the major shape names (user's model, and the
     standard CAGED-for-scales convention): minor keys use the relative
     major's frames and letters — the ROOTS you track inside the pattern are
     what make it minor. An Am song's C·Open window is the C-shape pattern
     with A roots; its G·5fr window is box-1 minor pentatonic. */
  function positionsForKey(keyPc, minor, opts) {
    opts = opts || {};
    var maxFret = opts.maxFret || 15;
    var framePc = ((keyPc + (minor ? 3 : 0)) % 12 + 12) % 12;
    var list = SHAPE_ORDER.map(function (shape) {
      var frame = ((framePc - SHAPE_OFFSET[shape]) % 12 + 12) % 12;
      return {
        shape: shape,
        frame: frame,
        window: [frame, frame + 4],
        windows: positionInstances(frame, maxFret)
      };
    });
    list.sort(function (a, b) { return a.frame - b.frame; });
    list.forEach(function (p, i) { p.index = i + 1; });
    return list;
  }

  function soundingFrets(v) {
    var frets = v && v.frets ? v.frets : v;
    var out = [];
    for (var s = 0; s < 6; s++) {
      if (frets[s] >= 0) out.push(frets[s]);
    }
    return out;
  }

  function fretsWithin(v, wins) {
    var fr = soundingFrets(v);
    for (var w = 0; w < wins.length; w++) {
      var all = true;
      for (var k = 0; k < fr.length; k++) {
        if (fr[k] < wins[w][0] || fr[k] > wins[w][1]) { all = false; break; }
      }
      if (all) return true;
    }
    return false;
  }

  /* Which CAGED positions a voicing (or raw frets array) belongs to:
     member iff every sounding fret sits inside one window instance.
     Overlap is expected — windows share frets by design. */
  function assignPositions(voicing, positions) {
    return positions.filter(function (p) { return fretsWithin(voicing, p.windows); })
                    .map(function (p) { return p.shape; });
  }

  function centroid(v) {
    var fr = soundingFrets(v), sum = 0;
    for (var k = 0; k < fr.length; k++) sum += fr[k];
    return fr.length ? sum / fr.length : 0;
  }

  /* Voice-leading distance primitives ("near" mode). Total pitch of a voicing
     encodes both movements at once: one fret along the neck is one semitone
     per voice, crossing to the adjacent string set ~4.7 per voice. Integer by
     construction (sum, not mean) — real chains hit exact ties that must fall
     to the deterministic tie-breaks, not float noise. */
  function sumMidi(v) {
    var frets = v && v.frets ? v.frets : v, sum = 0;
    for (var s = 0; s < 6; s++) {
      if (frets[s] >= 0) sum += OPEN_MIDI[s] + frets[s];
    }
    return sum;
  }

  /* Held common tones: same string, same fret — the fingers that don't move. */
  function commonPairs(v, a) {
    var vf = v && v.frets ? v.frets : v;
    var af = a && a.frets ? a.frets : a;
    var n = 0;
    for (var s = 0; s < 6; s++) {
      if (vf[s] >= 0 && vf[s] === af[s]) n++;
    }
    return n;
  }

  /* Pick the best triad voicing for a chord inside a CAGED position.
     Ladder: strict in-window, then widened ±1, ±2 (preferred string set gets
     the whole ladder first), then globally nearest (outOfPosition).
     Centrality is scored against the PRIMARY window's center — wrap-around
     instances still grant membership, but a voicing an octave away from
     where the hand is playing shouldn't win on a technicality. */
  function voicingAtPosition(rootPc, quality, position, opts) {
    opts = opts || {};
    var maxFret = opts.maxFret || 15;
    var all = triadsFor(rootPc, quality, { maxFret: maxFret });
    if (!all.length) return null;
    var anchor = opts.anchor || null;
    // unknown ids (e.g. the app-level 'near' mode marker) must not reach
    // SET_INDEX — a NaN score silently scrambles the sort
    var pref = !anchor && opts.stringSetPref &&
      SET_INDEX.hasOwnProperty(opts.stringSetPref) ? opts.stringSetPref : null;

    function widen(extra) {
      return position.windows.map(function (w) {
        return [Math.max(0, w[0] - extra), Math.min(maxFret, w[1] + extra)];
      });
    }
    function ladder(pool) {
      for (var extra = 0; extra <= 2; extra++) {
        var wins = widen(extra);
        var c = pool.filter(function (v) { return fretsWithin(v, wins); });
        if (c.length) return { cands: c, relaxed: extra === 0 ? false : extra };
      }
      return null;
    }

    var found = null;
    if (pref) {
      found = ladder(all.filter(function (v) { return v.stringSet === pref; }));
    }
    if (!found) found = ladder(all);
    var outOfPosition = false;
    if (!found) {
      found = { cands: all.slice(), relaxed: false };
      outOfPosition = true;
    }

    var center = position.frame != null
      ? position.frame + 2
      : (position.window[0] + position.window[1]) / 2;
    var anchorSum = anchor ? sumMidi(anchor) : 0;
    function score(v) {
      var s = 0;
      if (opts.bassPc != null && v.bassPc === opts.bassPc) s += 30;
      if (anchor) {
        // voice-leading: closest total pitch wins, but a finger that stays
        // put is worth ~3 semitones of drift per voice
        return s + 9 * commonPairs(v, anchor) - Math.abs(sumMidi(v) - anchorSum);
      }
      if (pref) {
        s += v.stringSet === pref
          ? 200
          : -5 * Math.abs(SET_INDEX[v.stringSet] - SET_INDEX[pref]);
      }
      s -= 2 * Math.abs(centroid(v) - center);
      return s;
    }
    var cands = found.cands.slice().sort(function (a, b) {
      var d = score(b) - score(a);
      if (d) return d;
      if (a.inversion !== b.inversion) return a.inversion - b.inversion;
      return a.minFret - b.minFret;
    });
    return { best: cands[0], alternates: cands.slice(1),
             relaxed: found.relaxed, outOfPosition: outOfPosition };
  }

  /* Best voicing with no position constraint: near the nut, on the preferred
     string set (default 1-3, where the string-set pedagogy starts), honoring
     a slash bass when one is asked for. */
  function voicingAnywhere(rootPc, quality, opts) {
    opts = opts || {};
    var all = triadsFor(rootPc, quality, { maxFret: opts.maxFret || 15 });
    if (!all.length) return null;
    var anchor = opts.anchor || null;
    var near = !!opts.near || !!anchor;
    var pref = !near && opts.stringSetPref &&
      SET_INDEX.hasOwnProperty(opts.stringSetPref) ? opts.stringSetPref
      : near ? null : '1-3';
    var anchorSum = anchor ? sumMidi(anchor) : 0;
    function score(v) {
      var s = 0;
      if (opts.bassPc != null && v.bassPc === opts.bassPc) s += 30;
      if (anchor) {
        // free-float voice leading: whole neck, no window ladder
        return s + 9 * commonPairs(v, anchor) - Math.abs(sumMidi(v) - anchorSum);
      }
      if (pref) {
        // set loyalty outweighs a few frets of position (an open-string grip on
        // another set must not beat the preferred set's low voicing)
        s += v.stringSet === pref
          ? 0
          : -8 * Math.abs(SET_INDEX[v.stringSet] - SET_INDEX[pref]);
      }
      return s - 2 * v.minFret - 0.5 * v.inversion;
    }
    var cands = all.slice().sort(function (a, b) {
      var d = score(b) - score(a);
      if (d) return d;
      if (a.inversion !== b.inversion) return a.inversion - b.inversion;
      return a.minFret - b.minFret;
    });
    return { best: cands[0], alternates: cands.slice(1),
             relaxed: false, outOfPosition: false };
  }

  /* ---------- per-song API ---------- */

  function isMinorQuality(q) { return /^m(?!aj)/.test(q); }

  function keyName(pc, minor) {
    return CT.pcName(pc, CT.keyPrefersFlat(pc, minor)) + (minor ? 'm' : '');
  }

  function resolveKey(opts, chordSyms) {
    if (opts.key) {
      if (typeof opts.key === 'object' && opts.key.pc != null) {
        var minor0 = !!opts.key.minor;
        return { pc: ((opts.key.pc % 12) + 12) % 12, minor: minor0,
                 name: opts.key.name || keyName(opts.key.pc, minor0) };
      }
      var kp = CT.parseChord(String(opts.key));
      if (kp) {
        var minor1 = isMinorQuality(kp.quality);
        return { pc: kp.rootPc, minor: minor1, name: keyName(kp.rootPc, minor1) };
      }
    }
    var dk = CT.detectKey(chordSyms);
    if (dk) return dk;
    for (var i = 0; i < chordSyms.length; i++) {
      var p = CT.parseChord(chordSyms[i]);
      if (p) {
        var minor2 = isMinorQuality(p.quality);
        return { pc: p.rootPc, minor: minor2, name: keyName(p.rootPc, minor2) };
      }
    }
    return null;
  }

  /* songTriads(chordSyms, opts) — reduce a song's chords to triads and pick
     voicings. opts:
       key           'G' | 'Am' | {pc, minor}    (default: detectKey)
       position      'any' | shape letter | ordinal 1..5 | null
                     'any'  -> atPosition via voicingAnywhere
                     set    -> atPosition at that CAGED position
                     null   -> byPosition map for all five
       stringSetPref '1-3'.. | null
       maxFret       default 15
       includeAllVoicings  attach every voicing tagged with its positions */
  function songTriads(chordSyms, opts) {
    opts = opts || {};
    var maxFret = opts.maxFret || 15;
    var unparsed = [], entries = [], seen = {};
    (chordSyms || []).forEach(function (sym) {
      var p = CT.parseChord(sym);
      if (!p) { unparsed.push(sym); return; }
      // key on pitch content, not spelling — C# and Db are the same triad
      var k = p.rootPc + '|' + p.quality + '|' + p.bassPc;
      if (seen[k]) return;
      seen[k] = 1;
      entries.push({ sym: sym, parsed: p });
    });

    var key = resolveKey(opts, chordSyms || []);
    if (!key) {
      return { key: null, preferFlat: false, positions: [], chords: [], unparsed: unparsed };
    }
    var preferFlat = CT.keyPrefersFlat(key.pc, key.minor);
    var positions = positionsForKey(key.pc, key.minor, { maxFret: maxFret });

    var wanted = null;
    if (opts.position != null && opts.position !== 'any') {
      positions.forEach(function (p) {
        if (p.shape === opts.position || p.index === opts.position) wanted = p;
      });
    }

    // 'near' is a mode, not a set id: voice-leading chain — each chord picks
    // the voicing closest to the previous chord's, string set free to float
    var near = opts.stringSetPref === 'near';
    var basePref = near ? null : (opts.stringSetPref || null);
    var prevBest = null;      // chain anchor ('any' and single-position paths)
    var prevByShape = {};     // independent chain per shape (byPosition path)

    var chords = entries.map(function (e) {
      var t = reduceTriad(e.parsed);
      t.rootName = CT.pcName(t.rootPc, preferFlat);
      t.label = t.rootName + TRIAD_SUFFIX[t.quality];
      var vOpts = { stringSetPref: basePref, maxFret: maxFret, bassPc: t.bassPc };
      var entry = { sym: e.sym, triad: t };
      if (opts.position === 'any') {
        if (near) { vOpts.near = true; vOpts.anchor = prevBest; }
        entry.atPosition = voicingAnywhere(t.rootPc, t.quality, vOpts);
        if (near && entry.atPosition && entry.atPosition.best) prevBest = entry.atPosition.best;
      } else if (wanted) {
        if (near && prevBest) vOpts.anchor = prevBest;
        entry.atPosition = voicingAtPosition(t.rootPc, t.quality, wanted, vOpts);
        if (near && entry.atPosition && entry.atPosition.best) prevBest = entry.atPosition.best;
      } else {
        entry.byPosition = {};
        positions.forEach(function (p) {
          var po = { stringSetPref: basePref, maxFret: maxFret, bassPc: t.bassPc };
          if (near && prevByShape[p.shape]) po.anchor = prevByShape[p.shape];
          var pk = voicingAtPosition(t.rootPc, t.quality, p, po);
          entry.byPosition[p.shape] = pk;
          if (near && pk && pk.best) prevByShape[p.shape] = pk.best;
        });
      }
      if (opts.includeAllVoicings) {
        entry.voicings = triadsFor(t.rootPc, t.quality, { maxFret: maxFret }).map(function (v) {
          var copy = {};
          for (var k in v) if (v.hasOwnProperty(k)) copy[k] = v[k];
          copy.positions = assignPositions(v, positions);
          return copy;
        });
      }
      return entry;
    });

    return { key: key, preferFlat: preferFlat, positions: positions,
             chords: chords, unparsed: unparsed };
  }

  /* ---------- full-neck map (explorer dot cloud) ---------- */

  function mapIntervals(rootPc, intervals, roles, maxFret) {
    var strings = [];
    for (var s = 0; s < 6; s++) {
      var arr = [];
      for (var f = 0; f <= maxFret; f++) {
        var pc = (V.TUNING[s] + f) % 12;
        var iv = ((pc - rootPc) % 12 + 12) % 12;
        if (intervals.indexOf(iv) !== -1) {
          arr.push({ fret: f, pc: pc, midi: OPEN_MIDI[s] + f, interval: iv,
                     role: roles[iv] || '' });
        }
      }
      strings.push(arr);
    }
    return strings;
  }

  function fretboardMap(rootPc, quality, opts) {
    opts = opts || {};
    var maxFret = opts.maxFret || 15;
    rootPc = ((rootPc % 12) + 12) % 12;
    return { rootPc: rootPc, quality: quality, maxFret: maxFret, tuning: V.TUNING,
             strings: mapIntervals(rootPc, TRIAD_INTERVALS[quality] || [],
                                   ROLE_NAMES[quality] || {}, maxFret) };
  }

  /* scale-tone map, same shape as fretboardMap — the explorer's ghost layer
     and the strip's pentatonic card both read this */
  function scaleMap(rootPc, scaleId, opts) {
    opts = opts || {};
    var maxFret = opts.maxFret || 15;
    rootPc = ((rootPc % 12) + 12) % 12;
    var sc = SCALES[scaleId];
    return { rootPc: rootPc, scaleId: scaleId, maxFret: maxFret, tuning: V.TUNING,
             strings: mapIntervals(rootPc, sc ? sc.intervals : [],
                                   sc ? sc.roles : {}, maxFret) };
  }

  var api = {
    OPEN_MIDI: OPEN_MIDI,
    TRIAD_INTERVALS: TRIAD_INTERVALS,
    TRIAD_SUFFIX: TRIAD_SUFFIX,
    STRING_SETS: STRING_SETS,
    reduceTriad: reduceTriad,
    triadsFor: triadsFor,
    positionsForKey: positionsForKey,
    assignPositions: assignPositions,
    voicingAtPosition: voicingAtPosition,
    voicingAnywhere: voicingAnywhere,
    songTriads: songTriads,
    fretboardMap: fretboardMap,
    SCALES: SCALES,
    PENT_BOX_SPAN: PENT_BOX_SPAN,
    pentBoxDots: pentBoxDots,
    scaleMap: scaleMap,
    scaleForQuality: scaleForQuality
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Triads = api;
})(typeof window !== 'undefined' ? window : globalThis);
