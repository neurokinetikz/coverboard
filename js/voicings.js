/* voicings.js — guitar chord voicings: curated open-position shapes for the
   classics, plus a search-based generator for everything else.
   Shape format: { frets: [E,A,D,G,B,e] (-1 mute, 0 open, n fret),
                   fingers: optional [..], baseFret: 1.. , barre: {fret, from, to} | null }
   Plain script; exports to window and CommonJS. */
(function (global) {
  'use strict';

  var CT = (typeof module !== 'undefined' && module.exports)
    ? require('./chordtheory.js')
    : global.ChordTheory;

  var TUNING = [4, 9, 2, 7, 11, 4]; // E A D G B e pitch classes (low to high)

  /* ---------- curated shapes: "rootPc|quality" -> array of shapes ---------- */
  function S(frets, fingers, baseFret, barre) {
    return { frets: frets, fingers: fingers || null, baseFret: baseFret || 1, barre: barre || null };
  }

  var CURATED = {};
  function cur(sym, shapes) {
    var p = CT.parseChord(sym);
    if (!p) throw new Error('bad curated chord: ' + sym);
    CURATED[p.rootPc + '|' + p.quality] = shapes;
  }

  cur('C',    [S([-1, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0]),
               S([-1, 3, 5, 5, 5, 3], [0, 1, 3, 3, 3, 1], 3, { fret: 3, from: 1, to: 5 }),
               S([8, 10, 10, 9, 8, 8], [1, 3, 4, 2, 1, 1], 8, { fret: 8, from: 0, to: 5 })]);
  cur('Cmaj7',[S([-1, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0])]);
  cur('C7',   [S([-1, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0])]);
  cur('Cadd9',[S([-1, 3, 2, 0, 3, 0], [0, 2, 1, 0, 3, 0]),
               S([-1, 3, 2, 0, 3, 3], [0, 2, 1, 0, 3, 4])]);
  cur('Cm',   [S([-1, 3, 5, 5, 4, 3], [0, 1, 3, 4, 2, 1], 3, { fret: 3, from: 1, to: 5 })]);
  cur('Cm7',  [S([-1, 3, 5, 3, 4, 3], [0, 1, 3, 1, 2, 1], 3, { fret: 3, from: 1, to: 5 })]);
  cur('C#',   [S([-1, 4, 6, 6, 6, 4], [0, 1, 3, 3, 3, 1], 4, { fret: 4, from: 1, to: 5 })]);
  cur('C#m',  [S([-1, 4, 6, 6, 5, 4], [0, 1, 3, 4, 2, 1], 4, { fret: 4, from: 1, to: 5 })]);
  cur('C#m7', [S([-1, 4, 6, 4, 5, 4], [0, 1, 3, 1, 2, 1], 4, { fret: 4, from: 1, to: 5 })]);
  cur('D',    [S([-1, -1, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2]),
               S([-1, 5, 7, 7, 7, 5], [0, 1, 3, 3, 3, 1], 5, { fret: 5, from: 1, to: 5 })]);
  cur('Dm',   [S([-1, -1, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1])]);
  cur('D7',   [S([-1, -1, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3])]);
  cur('Dm7',  [S([-1, -1, 0, 2, 1, 1], [0, 0, 0, 2, 1, 1])]);
  cur('Dmaj7',[S([-1, -1, 0, 2, 2, 2], [0, 0, 0, 1, 1, 1])]);
  cur('Dsus2',[S([-1, -1, 0, 2, 3, 0], [0, 0, 0, 1, 2, 0])]);
  cur('Dsus4',[S([-1, -1, 0, 2, 3, 3], [0, 0, 0, 1, 2, 3])]);
  cur('Eb',   [S([-1, 6, 8, 8, 8, 6], [0, 1, 3, 3, 3, 1], 6, { fret: 6, from: 1, to: 5 }),
               S([-1, -1, 1, 3, 4, 3], [0, 0, 1, 2, 4, 3])]);
  cur('Ebm',  [S([-1, 6, 8, 8, 7, 6], [0, 1, 3, 4, 2, 1], 6, { fret: 6, from: 1, to: 5 })]);
  cur('E',    [S([0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0])]);
  cur('Em',   [S([0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0])]);
  cur('E7',   [S([0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0]),
               S([0, 2, 2, 1, 3, 0], [0, 2, 3, 1, 4, 0])]);
  cur('Em7',  [S([0, 2, 2, 0, 3, 0], [0, 1, 2, 0, 3, 0]),
               S([0, 2, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0])]);
  cur('Emaj7',[S([0, 2, 1, 1, 0, 0], [0, 3, 1, 2, 0, 0])]);
  cur('Esus4',[S([0, 2, 2, 2, 0, 0], [0, 1, 2, 3, 0, 0])]);
  cur('F',    [S([1, 3, 3, 2, 1, 1], [1, 3, 4, 2, 1, 1], 1, { fret: 1, from: 0, to: 5 }),
               S([-1, -1, 3, 2, 1, 1], [0, 0, 3, 2, 1, 1]),
               S([1, 3, 3, 2, -1, -1], [1, 3, 4, 2, 0, 0])]);
  cur('Fmaj7',[S([-1, -1, 3, 2, 1, 0], [0, 0, 3, 2, 1, 0]),
               S([1, 3, 2, 2, 1, 1], [1, 4, 2, 3, 1, 1], 1, { fret: 1, from: 0, to: 5 })]);
  cur('Fm',   [S([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 1, { fret: 1, from: 0, to: 5 })]);
  cur('Fm7',  [S([1, 3, 1, 1, 1, 1], [1, 3, 1, 1, 1, 1], 1, { fret: 1, from: 0, to: 5 })]);
  cur('F#',   [S([2, 4, 4, 3, 2, 2], [1, 3, 4, 2, 1, 1], 2, { fret: 2, from: 0, to: 5 })]);
  cur('F#m',  [S([2, 4, 4, 2, 2, 2], [1, 3, 4, 1, 1, 1], 2, { fret: 2, from: 0, to: 5 })]);
  cur('F#m7', [S([2, 4, 2, 2, 2, 2], [1, 3, 1, 1, 1, 1], 2, { fret: 2, from: 0, to: 5 })]);
  cur('G',    [S([3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3]),
               S([3, 2, 0, 0, 3, 3], [2, 1, 0, 0, 3, 4]),
               S([3, 5, 5, 4, 3, 3], [1, 3, 4, 2, 1, 1], 3, { fret: 3, from: 0, to: 5 })]);
  cur('Gm',   [S([3, 5, 5, 3, 3, 3], [1, 3, 4, 1, 1, 1], 3, { fret: 3, from: 0, to: 5 })]);
  cur('G7',   [S([3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1])]);
  cur('Gm7',  [S([3, 5, 3, 3, 3, 3], [1, 3, 1, 1, 1, 1], 3, { fret: 3, from: 0, to: 5 })]);
  cur('Gmaj7',[S([3, 2, 0, 0, 0, 2], [3, 1, 0, 0, 0, 2])]);
  cur('Ab',   [S([4, 6, 6, 5, 4, 4], [1, 3, 4, 2, 1, 1], 4, { fret: 4, from: 0, to: 5 })]);
  cur('Abm',  [S([4, 6, 6, 4, 4, 4], [1, 3, 4, 1, 1, 1], 4, { fret: 4, from: 0, to: 5 })]);
  cur('A',    [S([-1, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0]),
               S([5, 7, 7, 6, 5, 5], [1, 3, 4, 2, 1, 1], 5, { fret: 5, from: 0, to: 5 })]);
  cur('Am',   [S([-1, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0]),
               S([5, 7, 7, 5, 5, 5], [1, 3, 4, 1, 1, 1], 5, { fret: 5, from: 0, to: 5 })]);
  cur('A7',   [S([-1, 0, 2, 0, 2, 0], [0, 0, 1, 0, 2, 0]),
               S([-1, 0, 2, 2, 2, 3], [0, 0, 1, 1, 1, 2])]);
  cur('Am7',  [S([-1, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0])]);
  cur('Amaj7',[S([-1, 0, 2, 1, 2, 0], [0, 0, 2, 1, 3, 0])]);
  cur('Asus2',[S([-1, 0, 2, 2, 0, 0], [0, 0, 1, 2, 0, 0])]);
  cur('Asus4',[S([-1, 0, 2, 2, 3, 0], [0, 0, 1, 2, 3, 0])]);
  cur('Bb',   [S([-1, 1, 3, 3, 3, 1], [0, 1, 3, 3, 3, 1], 1, { fret: 1, from: 1, to: 5 }),
               S([6, 8, 8, 7, 6, 6], [1, 3, 4, 2, 1, 1], 6, { fret: 6, from: 0, to: 5 })]);
  cur('Bbm',  [S([-1, 1, 3, 3, 2, 1], [0, 1, 3, 4, 2, 1], 1, { fret: 1, from: 1, to: 5 })]);
  cur('B',    [S([-1, 2, 4, 4, 4, 2], [0, 1, 3, 3, 3, 1], 2, { fret: 2, from: 1, to: 5 })]);
  cur('Bm',   [S([-1, 2, 4, 4, 3, 2], [0, 1, 3, 4, 2, 1], 2, { fret: 2, from: 1, to: 5 })]);
  cur('B7',   [S([-1, 2, 1, 2, 0, 2], [0, 2, 1, 3, 0, 4])]);
  cur('Bm7',  [S([-1, 2, 4, 2, 3, 2], [0, 1, 3, 1, 2, 1], 2, { fret: 2, from: 1, to: 5 })]);
  cur('E7#9', [S([0, 2, 0, 1, 3, 3], [0, 2, 0, 1, 3, 4]),
               S([-1, 7, 6, 7, 8, -1], [0, 2, 1, 3, 4, 0], 6)]);

  /* slash chords live in their own map keyed rootPc|quality|bassPc */
  var CURATED_SLASH = {};
  function curSlash(sym, shapes) {
    var p = CT.parseChord(sym);
    if (!p || p.bassPc === null) throw new Error('bad curated slash chord: ' + sym);
    CURATED_SLASH[p.rootPc + '|' + p.quality + '|' + p.bassPc] = shapes;
  }
  curSlash('D/F#', [S([2, -1, 0, 2, 3, 2], [1, 0, 0, 2, 4, 3]),
                    S([2, 0, 0, 2, 3, 2], [1, 0, 0, 2, 4, 3])]);
  curSlash('G/B',  [S([-1, 2, 0, 0, 0, 3], [0, 1, 0, 0, 0, 3])]);
  curSlash('C/G',  [S([3, 3, 2, 0, 1, 0], [3, 4, 2, 0, 1, 0])]);
  curSlash('Am/G', [S([3, 0, 2, 2, 1, 0], [3, 0, 2, 2, 1, 0])]);
  curSlash('G/F#', [S([2, 2, 0, 0, 0, 3], [1, 2, 0, 0, 0, 4])]);
  curSlash('Cadd9/E', [S([0, 3, 2, 0, 3, 0], [0, 3, 2, 0, 4, 0])]);
  curSlash('E/G#', [S([4, -1, 2, 1, 0, 0], [4, 0, 2, 1, 0, 0])]);
  curSlash('A/C#', [S([-1, 4, 2, 2, 2, 0], [0, 4, 1, 1, 1, 0])]);
  curSlash('F/C',  [S([-1, 3, 3, 2, 1, 1], [0, 3, 4, 2, 1, 1])]);
  curSlash('C/E',  [S([0, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0])]);
  curSlash('D/A',  [S([-1, 0, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2])]);
  curSlash('B/D#', [S([-1, 6, 4, 4, 4, -1], [0, 4, 1, 2, 3, 0], 4)]);

  /* ---------- generator ---------- */

  function shapeSoundingPcs(frets) {
    var pcs = [];
    for (var s = 0; s < 6; s++) {
      if (frets[s] >= 0) pcs.push((TUNING[s] + frets[s]) % 12);
    }
    return pcs;
  }

  function lowestPc(frets) {
    for (var s = 0; s < 6; s++) if (frets[s] >= 0) return (TUNING[s] + frets[s]) % 12;
    return null;
  }

  function analyzeShape(frets) {
    var fretted = [], sounding = 0, minFret = 99, maxFret = 0;
    for (var s = 0; s < 6; s++) {
      var f = frets[s];
      if (f >= 0) sounding++;
      if (f > 0) { fretted.push({ string: s, fret: f }); if (f < minFret) minFret = f; if (f > maxFret) maxFret = f; }
    }
    return { fretted: fretted, sounding: sounding, minFret: fretted.length ? minFret : 0, maxFret: maxFret };
  }

  function detectBarre(frets) {
    /* Barre when 3+ strings share the minimum fret and no open strings sit
       between/above them (a first-finger barre must cover everything from its
       lowest string to the top). */
    var a = analyzeShape(frets);
    if (!a.fretted.length || a.minFret === 0) return null;
    var atMin = a.fretted.filter(function (f) { return f.fret === a.minFret; });
    if (atMin.length < 2) return null;
    var from = atMin[0].string, to = atMin[atMin.length - 1].string;
    if (to - from < 1) return null;
    // any open string at index > from breaks the barre
    for (var s = from; s < 6; s++) {
      if (frets[s] === 0) return null;
    }
    // barre extends to the highest sounding string
    var top = 5;
    while (top >= 0 && frets[top] === -1) top--;
    if (atMin[atMin.length - 1].string !== top && frets[top] !== a.minFret && atMin.length < 3) return null;
    return { fret: a.minFret, from: from, to: top };
  }

  function fingersNeeded(frets) {
    var a = analyzeShape(frets);
    if (!a.fretted.length) return 0;
    var barre = detectBarre(frets);
    if (barre) {
      var above = a.fretted.filter(function (f) { return f.fret > barre.fret; }).length;
      return 1 + above;
    }
    return a.fretted.length;
  }

  /* Score a candidate shape. Correctness gates first (wrong/missing notes),
     then physical playability gates (things no hand can do), then heuristics
     that push textbook grips above technically-valid contortions.
     requiredMask/allowedMask are pitch-class bitmasks; optWeights[i] is the
     score bonus for covering optionalPcs[i]. Returns -1 to reject. */
  function scoreShape(frets, parsed, requiredMask, allowedMask, optionalPcs, optWeights) {
    var s, i, f, pc;

    /* ---- fast single pass: pitch classes + shape stats ---- */
    var soundMask = 0, sounding = 0, frettedCount = 0, minFret = 99, maxFret = 0, low = -1;
    for (s = 0; s < 6; s++) {
      f = frets[s];
      if (f < 0) continue;
      pc = (TUNING[s] + f) % 12;
      soundMask |= 1 << pc;
      if (low < 0) low = pc;
      sounding++;
      if (f > 0) {
        frettedCount++;
        if (f < minFret) minFret = f;
        if (f > maxFret) maxFret = f;
      }
    }
    if ((soundMask & requiredMask) !== requiredMask) return -1; // missing a chord tone
    if (soundMask & ~allowedMask) return -1;                    // wrong note
    if (sounding < 3) return -1;
    if (!frettedCount) minFret = 0;
    var stretch = frettedCount ? maxFret - minFret : 0;
    if (stretch > 3) return -1;
    if (parsed.bassPc !== null && low !== parsed.bassPc) return -1; // slash chords must honor bass

    /* ---- physical playability gates ---- */
    var barre = detectBarre(frets);
    var barreOk = false, bassAbove = 0, aboveBarre = 0;
    if (barre) {
      barreOk = true;
      for (s = barre.from; s <= barre.to; s++) {
        if (frets[s] === -1) { barreOk = false; break; } // can't mute a string under a barre
      }
      if (barreOk) {
        var trebAbove = 0;
        for (s = 0; s < 6; s++) {
          if (frets[s] > barre.fret) {
            aboveBarre++;
            if (s < barre.from) bassAbove++; else trebAbove++;
          }
        }
        // fingers can't sit on both sides of the barre at once
        if (bassAbove && trebAbove) barreOk = false;
      }
    }
    if (frettedCount > 4 && !barreOk) return -1; // 5+ fretted notes need a workable barre
    var nFingers = barreOk ? 1 + aboveBarre : frettedCount;
    if (nFingers > 4) return -1;

    // 4+ notes at the lowest fret with open strings interleaved between them:
    // no barre is possible (the opens would die) and four separate fingertips
    // can't share a fret around ringing opens. THREE fingertips can — that's
    // A13 x02022 and Em6 022020 — so 3 stays legal.
    if (frettedCount) {
      var minCount = 0, firstMin = -1, lastMin = -1;
      for (s = 0; s < 6; s++) {
        if (frets[s] === minFret) { minCount++; if (firstMin < 0) firstMin = s; lastMin = s; }
      }
      if (minCount >= 4) {
        for (s = firstMin + 1; s < lastMin; s++) if (frets[s] === 0) return -1;
      }
    }

    /* ---- heuristics ---- */
    var wantBass = parsed.bassPc !== null ? parsed.bassPc : parsed.rootPc;
    var fifthPc = (parsed.rootPc + 7) % 12;
    var thirdPcA = (parsed.rootPc + 4) % 12, thirdPcB = (parsed.rootPc + 3) % 12;
    var score = 100;
    if (low !== wantBass) {
      // graded: 5th in the bass is mildly off, 3rd worse, anything else
      // (a 9th, a 7th...) sounds like a different chord entirely
      if (low === fifthPc) score -= 14;
      else if (low === thirdPcA || low === thirdPcB) score -= 28;
      else score -= 45;
    }

    // coverage of optional tones (extensions the chord name promises weigh heavily)
    for (i = 0; i < optionalPcs.length; i++) {
      if (soundMask & (1 << optionalPcs[i])) score += optWeights[i];
    }
    // more sounding strings = fuller; 3-string fragments are thin
    score += sounding * 3;
    if (sounding === 3) score -= 12;
    // prefer low positions, with a soft extra cap above the 5th fret
    score -= minFret * 2.2;
    if (minFret > 5) score -= (minFret - 5) * 2.5;
    // prefer fewer fingers, less stretch
    score -= nFingers * 2 + stretch * 3;
    // a clean barre is an idiomatic hand shape (reaching bass-side fingers
    // back over the barre, x43111-style, is real but harder), but fingers
    // stretching 3+ frets past the barre strain the hand
    if (barreOk) {
      score += 7 - bassAbove * 3;
      for (s = 0; s < 6; s++) if (frets[s] >= barre.fret + 3) score -= 3;
    }

    // muted strings between sounding strings; muting the A under a 6th-string
    // root is the classic jazz shell mute and stays free
    var firstSound = 0; while (firstSound < 6 && frets[firstSound] < 0) firstSound++;
    var lastSound = 5; while (lastSound >= 0 && frets[lastSound] < 0) lastSound--;
    for (s = firstSound; s <= lastSound; s++) {
      if (frets[s] === -1 && !(s === 1 && frets[0] > 0)) score -= 12;
    }
    // muted treble strings thin the voicing out
    if (frets[4] === -1) score -= 5;
    if (frets[5] === -1) score -= 5;

    // open strings ring nicely in open position, but an open ringing between
    // fretted strings while the hand is up the neck is a no-go hybrid, and
    // trailing opens under a high fretting hand are position-mixing oddities
    var lastFretted = -1;
    for (s = 0; s < 6; s++) if (frets[s] > 0) lastFretted = s;
    for (s = 0; s < 6; s++) {
      if (frets[s] !== 0) continue;
      score += 1.5;
      if (maxFret >= 4) {
        var frettedBelow = false, frettedAbove = false;
        for (i = 0; i < s; i++) if (frets[i] > 0) frettedBelow = true;
        for (i = s + 1; i < 6; i++) if (frets[i] > 0) frettedAbove = true;
        if (frettedBelow && frettedAbove) score -= 30;
        else if (minFret >= 4 && s > lastFretted) score -= 3;
      }
    }

    // fretting the low E and D strings around a ringing open A is a
    // thumb-fretting pattern; without the thumb it barely works
    if (frets[0] > 0 && frets[1] === 0 && frets[2] > 0) score -= 10;

    // reverse-diagonal contortions: bass-side fingers several frets above
    // treble-side fingers, scaled by the size of the drop (coming back down
    // to a barre is fine)
    var rev = 0;
    for (s = 0; s < 6; s++) {
      if (frets[s] <= 0) continue;
      for (i = s + 1; i < 6; i++) {
        if (frets[i] <= 0) continue;
        var drop = frets[s] - frets[i];
        if (drop >= 2 && !(barreOk && frets[i] === barre.fret)) {
          rev += (drop - 1) * (s <= 1 ? 5 : 3);
        }
      }
    }
    score -= rev > 18 ? 18 : rev;
    return score;
  }

  function generateVoicings(sym, maxResults) {
    var parsed = CT.parseChord(sym);
    if (!parsed) return [];
    maxResults = maxResults || 4;

    // required: root, the "color" tones (3rd/sus/6th/7th and any altered/extension notes)
    // optional: 5th (perfect only), 9/11/13 extensions, and the slash bass adds itself
    var required = [], optional = [], optWeights = [], extEntries = [];
    for (var i = 0; i < parsed.intervals.length; i++) {
      var iv = parsed.intervals[i], pc = (parsed.rootPc + iv) % 12;
      if (iv === 0) required.push(pc);
      else if (iv === 7) { optional.push(pc); optWeights.push(4); }  // perfect 5th droppable
      else if (iv >= 14) {                                           // 9ths/11ths/13ths droppable
        optional.push(pc); optWeights.push(2);
        extEntries.push({ iv: iv, idx: optional.length - 1 });
      }
      else required.push(pc);                    // 3rds, 4ths, 6ths, 7ths, b5/#5
    }
    // the largest extension is the tone the chord NAME promises (the 9 in m9,
    // the 13 in 13...): reward it hard so a voicing with it beats one without
    if (extEntries.length) {
      var topExt = extEntries[0];
      for (var e = 1; e < extEntries.length; e++) if (extEntries[e].iv > topExt.iv) topExt = extEntries[e];
      optWeights[topExt.idx] = 30;
    }
    // Cap the required set: with 6 strings you can't demand more than 4 distinct tones
    while (required.length > 4) { optional.push(required.pop()); optWeights.push(12); }
    if (parsed.bassPc !== null && required.indexOf(parsed.bassPc) === -1 &&
        optional.indexOf(parsed.bassPc) === -1) { optional.push(parsed.bassPc); optWeights.push(4); }

    var requiredMask = 0, allowedMask = 0;
    for (i = 0; i < required.length; i++) requiredMask |= 1 << required[i];
    allowedMask = requiredMask;
    for (i = 0; i < optional.length; i++) allowedMask |= 1 << optional[i];

    var results = [], seenKeys = {};
    var cur2 = [0, 0, 0, 0, 0, 0];
    var lo = 1, hi = 3;

    function search(sIdx) {
      if (sIdx === 6) {
        var sc = scoreShape(cur2, parsed, requiredMask, allowedMask, optional, optWeights);
        if (sc > 0) {
          var key = cur2.join(',');
          if (!seenKeys[key]) {
            seenKeys[key] = 1;
            results.push({ frets: cur2.slice(), score: sc });
          }
        }
        return;
      }
      cur2[sIdx] = -1; search(sIdx + 1);          // muted
      cur2[sIdx] = 0; search(sIdx + 1);           // open
      for (var f = lo; f <= hi; f++) { cur2[sIdx] = f; search(sIdx + 1); }
    }

    for (var base = 0; base <= 9; base++) {
      lo = base === 0 ? 1 : base;
      hi = base + 3;
      search(0);
    }

    results.sort(function (a, b) { return b.score - a.score; });
    var out = [], outKeys = {};
    for (var r = 0; r < results.length && out.length < maxResults; r++) {
      var fr = results[r].frets;
      // dedupe near-identical (same fretted pattern ignoring which strings muted at edges)
      var k2 = fr.join(',');
      if (outKeys[k2]) continue;
      outKeys[k2] = 1;
      var an = analyzeShape(fr);
      out.push({
        frets: fr,
        fingers: null,
        baseFret: an.maxFret <= 4 ? 1 : an.minFret,
        barre: detectBarre(fr)
      });
    }
    return out;
  }

  var genCache = {};

  /* Public: get voicings for a chord symbol. Curated first, generated fallback. */
  function getVoicings(sym, maxResults) {
    var parsed = CT.parseChord(sym);
    if (!parsed) return [];
    maxResults = maxResults || 4;
    var out = [];
    // exact curated (including slash form like D/F#)
    var slashKey = parsed.rootPc + '|' + parsed.quality + '|' + parsed.bassPc;
    var curatedSlash = null;
    if (parsed.bassPc !== null) {
      // curated slash chords are stored under their full norm via a second map
      curatedSlash = CURATED_SLASH[slashKey] || null;
    }
    if (curatedSlash) out = out.concat(curatedSlash);
    if (parsed.bassPc === null) {
      var c = CURATED[parsed.rootPc + '|' + parsed.quality];
      if (c) out = out.concat(c);
    }
    if (out.length < maxResults) {
      var key = parsed.norm;
      // cache a full-size list once; different callers slice what they need
      if (!genCache[key]) genCache[key] = generateVoicings(sym, 12);
      var gen = genCache[key];
      for (var i = 0; i < gen.length && out.length < maxResults; i++) {
        var dup = false;
        for (var j = 0; j < out.length; j++) {
          if (out[j].frets.join(',') === gen[i].frets.join(',')) { dup = true; break; }
        }
        if (!dup) out.push(gen[i]);
      }
    }
    return out.slice(0, maxResults);
  }

  var api = {
    TUNING: TUNING,
    getVoicings: getVoicings,
    generateVoicings: generateVoicings,
    detectBarre: detectBarre,
    fingersNeeded: fingersNeeded,
    shapeSoundingPcs: shapeSoundingPcs,
    _curated: CURATED,
    _curatedSlash: CURATED_SLASH
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Voicings = api;
})(typeof window !== 'undefined' ? window : globalThis);
