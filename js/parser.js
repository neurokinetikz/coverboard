/* parser.js — converts pasted Ultimate-Guitar-style text (chords-over-lyrics),
   ChordPro text, or plain lyrics into a structured song with typed sections.
   Plain script (no modules); exports to window and CommonJS. */
(function (global) {
  'use strict';

  var CT = (typeof module !== 'undefined' && module.exports)
    ? require('./chordtheory.js')
    : global.ChordTheory;

  /* ---------- section types ---------- */

  var SECTION_TYPES = [
    { type: 'prechorus',  re: /^(pre[\s\-]?chorus|pre[\s\-]?coro|build|climb|channel|lift)\b/i },
    { type: 'postchorus', re: /^(post[\s\-]?chorus)\b/i },
    { type: 'intro',      re: /^(intro|opening)\b/i },
    { type: 'verse',      re: /^(verse|vs\.?|couplet|verso|v\d+)\b/i },
    { type: 'chorus',     re: /^(chorus|coro|refrain|hook)\b/i },
    { type: 'bridge',     re: /^(bridge|middle\s*(8|eight)|puente)\b/i },
    { type: 'solo',       re: /^((guitar|lead)\s+solo|solo)\b/i },
    { type: 'instrumental', re: /^(instrumental|inst\.?|riff|interlude|break(down)?|vamp|turnaround)\b/i },
    { type: 'outro',      re: /^(outro|ending|end|coda|tag|fin)\b/i },
    { type: 'chorus',     re: /^(c\d*)$/i }
  ];

  function sectionTypeFor(label) {
    var l = label.trim();
    for (var i = 0; i < SECTION_TYPES.length; i++) {
      if (SECTION_TYPES[i].re.test(l)) return SECTION_TYPES[i].type;
    }
    return 'other';
  }

  /* ---------- text normalization ---------- */

  function normalizeText(text) {
    return (text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u2028\u2029]/g, '\n')
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      .replace(/[\u2502\u2503]/g, '|')            // box-drawing pipes in tabs
      .replace(/\[\/tab\]\s*\[tab\]/gi, '\n')     // fused [tab] blocks = separate lines
      .replace(/\u00A0/g, ' ');
  }

  function expandTabs(line, width) {
    if (line.indexOf('\t') === -1) return line;
    width = width || 8;
    var out = '';
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '\t') {
        var n = width - (out.length % width);
        out += '        '.slice(0, n);
      } else {
        out += line[i];
      }
    }
    return out;
  }

  /* ---------- UG raw markup ([tab]/[ch]) ---------- */

  var UG_TAG_RE = /\[\/?(?:tab|ch)\]/i;

  function stripUgMarkup(line) {
    return line
      .replace(/\[\/?tab\]/gi, '')
      .replace(/\[\/ch\](?=\s*\[ch\])/gi, '[/ch] ') // keep adjacent chords apart
      .replace(/\[ch\]([^\[]*?)\[\/ch\]/gi, '$1')
      .replace(/\[\/?ch\]/gi, '');
  }

  /* Per-line UG handling. If [ch] chords are mixed with real lyric text on the
     same line, convert to ChordPro-style inline brackets so pairing survives.
     If the untagged remainder is just chord/filler material, the stripped line
     is a normal chord row and must take the chords-over-lyrics path. */
  function processUgLine(line) {
    if (!UG_TAG_RE.test(line)) return { line: line, forceInline: false };
    var s = line.replace(/\[\/?tab\]/gi, '');
    if (!/\[\/?ch\]/i.test(s)) return { line: s, forceInline: false };
    var stripped = stripUgMarkup(s);
    if (classifyChordLine(stripped).isChordLine || isAnnotationLine(stripped)) {
      return { line: stripped, forceInline: false };
    }
    var remainder = s.replace(/\[ch\]([^\[]*?)\[\/ch\]/gi, '').replace(/\[\/?ch\]/gi, '');
    if (remainder.trim()) {
      var conv = s.replace(/\[ch\]([^\[]*?)\[\/ch\]/gi, '[$1]').replace(/\[\/?ch\]/gi, '');
      return { line: conv, forceInline: true };
    }
    return { line: stripped, forceInline: false };
  }

  /* ---------- low-level line classification ---------- */

  // non-chord tokens tolerated on a chord line
  var CHORD_LINE_FILLER = /^(\||\|\||-|–|—|%|\/|\/\/|\*|\.|,|\(|\)|riff|\d+|↓|↑|D\.?S\.?|D\.?C\.?|al|fine|repeat|simile)$/i;
  // fillers worth keeping as visible annotations
  var ANNOT_TOKEN = /^(n\.?c\.?|\(n\.?c\.?\)|[x×]\d{1,2}|\((?:[x×])?\d{1,2}[x×]?\)|\d{1,2}[x×]|%|D\.?S\.?|D\.?C\.?|repeat|simile)$/i;

  function isTabLine(line) {
    var t = line.replace(/[│┃]/g, '|').trim();
    if (!t) return false;
    // a trailing repeat marker ("Ahh--- x4") is not tab evidence
    t = t.replace(/\s*\(?[x×]\d{1,2}\)?\s*$/i, '');
    if (!t) return false;
    var evidence = /[|]/.test(t) || /\d/.test(t);
    if (!evidence) return false;
    if (/^[A-Ga-g](#|b)?\s{0,2}[|:‖]/.test(t) && (/[-–—]/.test(t) || /\d{2,}/.test(t))) return true;
    if (/^\|/.test(t) && /[-–—]{2,}/.test(t) && /[-0-9hpbrxX/\\~^*()|.\s]{4,}/.test(t)) return true;
    if (/[-–—]{3,}/.test(t) && /^[A-Ga-g]?(#|b)?[|: \-–—0-9hpbrxX/\\~^*().,sv]+$/.test(t)) return true;
    return false;
  }

  function tokenizeChordLine(line) {
    var out = [], re = /\S+/g, m;
    while ((m = re.exec(line)) !== null) out.push({ text: m[0], pos: m.index });
    return out;
  }

  /* Token -> chord / annotation / null. Strips repeat suffixes (Gx3, G(x3)),
     leading brackets and balanced-aware trailing punctuation. Reports the
     offset of the symbol inside the token so positions stay exact. */
  function chordTokenInfo(text) {
    var repeatTxt = null;
    var t = text.replace(/(?:\((?:[x×])?\d{1,2}[x×]?\)|[x×]\d{1,2})$/i, function (m0) {
      repeatTxt = m0.replace(/[()]/g, '');
      return '';
    });
    if (!t) return { annot: repeatTxt, offset: 0 };  // token was a pure repeat
    var lead = 0;
    var m = /^[({\[]+/.exec(t);
    if (m) { lead = m[0].length; t = t.slice(lead); }
    while (t.length) {
      var last = t[t.length - 1];
      if (last === ',' || last === '.' || last === '*' || last === ']' || last === '}') {
        t = t.slice(0, -1);
        continue;
      }
      if (last === ')') {
        var opens = (t.match(/\(/g) || []).length;
        var closes = (t.match(/\)/g) || []).length;
        if (closes > opens) { t = t.slice(0, -1); continue; }
      }
      break;
    }
    if (!t) return null;
    if (/^n\.?c\.?$/i.test(t)) return { annot: 'N.C.', offset: lead };
    if (PURE_REPEAT.test(t)) return { annot: t, offset: lead };
    if (CT.isChordSymbol(t)) return { sym: t, offset: lead, repeat: repeatTxt };
    return null;
  }

  /* Returns { isChordLine, chords:[{sym,pos}], annots:[{text,pos}] }.
     A chord line = every token is a chord/annotation/filler, with >=1 chord. */
  function classifyChordLine(line) {
    var none = { isChordLine: false, chords: [], annots: [] };
    var toks = tokenizeChordLine(line);
    if (!toks.length) return none;
    var chords = [], annots = [];
    for (var i = 0; i < toks.length; i++) {
      var info = chordTokenInfo(toks[i].text);
      if (info && info.sym) {
        chords.push({ sym: info.sym, pos: toks[i].pos + info.offset });
        if (info.repeat) {
          annots.push({ text: info.repeat, pos: toks[i].pos + info.offset + info.sym.length });
        }
      } else if (info && info.annot) {
        annots.push({ text: info.annot, pos: toks[i].pos });
      } else if (ANNOT_TOKEN.test(toks[i].text)) {
        annots.push({ text: toks[i].text, pos: toks[i].pos });
      } else if (CHORD_LINE_FILLER.test(toks[i].text)) {
        // structural filler; not displayed
      } else {
        return none;
      }
    }
    if (!chords.length) return none;
    return { isChordLine: true, chords: chords, annots: annots };
  }

  /* Annotation-only line: "x2", "(x2)", "N.C.", "| repeat |" — no chords. */
  function isAnnotationLine(line) {
    var toks = tokenizeChordLine(line);
    if (!toks.length) return false;
    var sawAnnot = false;
    for (var i = 0; i < toks.length; i++) {
      var info = chordTokenInfo(toks[i].text);
      if (info && info.sym) return false;
      if ((info && info.annot) || ANNOT_TOKEN.test(toks[i].text)) { sawAnnot = true; continue; }
      if (CHORD_LINE_FILLER.test(toks[i].text)) continue;
      return false;
    }
    return sawAnnot;
  }

  function isDividerLine(line) {
    return /^[\s\-–—=_~]{3,}$/.test(line) && /[-–—=_~]{3,}/.test(line.trim());
  }

  /* Guards against lyric lines that happen to tokenize as chords. */
  function isChordLookalikeJunk(cls) {
    if (!cls.isChordLine) return false;
    var syms = cls.chords.map(function (c) { return c.sym; });
    var allBareNaturals = syms.every(function (s) { return /^[A-G]$/.test(s); });
    if (!allBareNaturals) return false;
    // strumming pattern: 3+ identical letters ("D D D D")
    if (syms.length >= 3 && syms.every(function (s) { return s === syms[0]; })) return true;
    // alphabet run: consecutive ascending letters. "A B C" is the alphabet
    // song from the top; mid-alphabet 3-runs like "F G A" are real
    // progressions, so those need 5+ to count as junk.
    if (syms.length >= 3) {
      var asc = true;
      for (var i = 1; i < syms.length; i++) {
        if (syms[i].charCodeAt(0) !== syms[i - 1].charCodeAt(0) + 1) { asc = false; break; }
      }
      if (asc && (syms.length >= 5 || syms[0] === 'A')) return true;
    }
    return false;
  }

  /* ---------- section headers ---------- */

  var KNOWN_SECTION = /^(?:(?:intro|outro|verse|chorus|pre[\s\-]?chorus|post[\s\-]?chorus|bridge|middle\s*(?:8|eight)|(?:guitar\s+|lead\s+)?solo|instrumental(?:\s+break)?|interlude|break(?:down)?|refrain|hook|coda|tag|ending|end|vamp|turnaround|channel|lift|riff|couplet|coro|puente|verso|strumming(?:\s+pattern)?|v\d+)(?:\s*[\/&+]\s*(?:end|outro|chorus|intro|solo|verse))?)(?:\s*\d{1,2}(?:\s*[&+,\/]\s*\d{1,2})*)?\s*$/i;

  function matchKnownSection(s) {
    var t = s.replace(/\s+/g, ' ').trim()
      .replace(/\s*\([^()]{1,24}\)\s*$/, '');   // "Verse 1 (Acoustic)"
    return KNOWN_SECTION.test(t);
  }

  // pure repeat token: "x2", "(x2)", "(2x)", "2x", "X3"
  var PURE_REPEAT = /^(?:[x×](\d{1,2})|\((?:[x×])?(\d{1,2})[x×]?\)|(\d{1,2})[x×])$/i;

  function stripRepeat(t) {
    var m = /^(.*?)\s*(?:[x×](\d{1,2})|\((?:[x×])?(\d{1,2})[x×]?\)|(\d{1,2})[x×])$/i.exec(t);
    if (m && m[1].trim()) {
      return { t: m[1].trim(), repeat: parseInt(m[2] || m[3] || m[4], 10) };
    }
    return { t: t.trim(), repeat: null };
  }

  /* Recognizes:
       [Verse 1]      [Chorus] x2      [Intro] G D Em C     [Intro (x2)]
       Verse 1:       CHORUS           Guitar Solo          Middle 8
       (Bridge)       Intro (x2)       Chorus: C G Am F     Outro/End
     Returns { label, repeat, trailing (chord text), note (comment text) } or null.
     Multi-word lines that merely START with a keyword ("Bridge over troubled
     dreams") are NOT headers. */
  function parseSectionHeader(line) {
    var t = line.trim();
    if (!t || t.length > 70) return null;

    // [Bracketed] + optional trailing repeat / chords / rider note
    var m = /^\[([^\[\]]{1,48})\]\s*(.*)$/.exec(t);
    if (m) {
      var inner = m[1].trim(), rest = m[2].trim();
      if (!inner || CT.isChordSymbol(inner) || /^\/?(tab|ch)$/i.test(inner)) return null;
      if (PURE_REPEAT.test(inner)) return null;  // "[x2]" is an annotation, not a section
      var sr = stripRepeat(inner);
      var repeat = sr.repeat, trailing = null, note = null;
      if (rest) {
        var pr = PURE_REPEAT.exec(rest);
        if (pr) {
          repeat = repeat || parseInt(pr[1] || pr[2] || pr[3], 10);
        } else if (classifyChordLine(rest).isChordLine) {
          trailing = rest;
        } else if (matchKnownSection(sr.t)) {
          // "[Chorus] (repeat and fade)" — unambiguous header with a rider
          note = rest;
        } else {
          return null;
        }
      }
      return { label: sr.t, repeat: repeat, trailing: trailing, note: note };
    }

    // (Parenthesized known section word)
    m = /^\(([^()]{1,48})\)$/.exec(t);
    if (m) {
      var sp = stripRepeat(m[1].trim());
      if (matchKnownSection(sp.t)) return { label: sp.t, repeat: sp.repeat, trailing: null, note: null };
      return null;
    }

    // Plain style
    var sr3 = stripRepeat(t);
    var t3 = sr3.t;
    var ci = t3.search(/[:：]/);
    if (ci !== -1) {
      var head = t3.slice(0, ci).trim();
      var after = t3.slice(ci + 1).trim();
      if (!matchKnownSection(head)) return null;
      if (!after) return { label: head, repeat: sr3.repeat, trailing: null, note: null };
      if (classifyChordLine(after).isChordLine) {
        return { label: head, repeat: sr3.repeat, trailing: after, note: null };
      }
      return { label: head, repeat: sr3.repeat, trailing: null, note: after };
    }
    // no colon: the whole line must be exactly a known keyword (+ number)
    if (matchKnownSection(t3)) return { label: t3, repeat: sr3.repeat, trailing: null, note: null };
    return null;
  }

  /* ---------- metadata ---------- */

  var META_RES = {
    title:  /^\s*(?:title|song|song\s*name|t)\s*[:：]\s*(.+)$/i,
    artist: /^\s*(?:artist|band|by)\s*[:：]\s*(.+)$/i,
    album:  /^\s*album\s*[:：]\s*(.+)$/i,
    tuning: /^\s*tuning\s*[:：]\s*(\S.*)$/i,
    tempo:  /^\s*(?:tempo|bpm)\s*[:：]?\s*(\d{2,3})\s*(?:bpm)?\s*$/i
  };
  var KEY_RE  = /^\s*(?:key|tonalidad)\s*(?:of)?\s*[:：]?\s*([A-G](?:#|b|♯|♭)?)\s*(minor|major|min|maj|m)?\s*$/i;
  var CAPO_RE = /^\s*capo\s*[:：]?\s*(?:on\s*)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:fret)?\s*$/i;
  var NO_CAPO_RE = /^\s*no\s+capo\s*[.!]?\s*$/i;
  var CHORDS_BY_RE = /^\s*(.{2,60}?)\s+(?:chords|tab|tabs|chords\s+&\s+lyrics)\s*(?:\((?:ver|version)[^)]{0,20}\))?\s+by\s+(.{2,60}?)\s*$/i;
  var TUNING_LINE_RE = /^\s*[A-G](?:#|b)?(?:\s+[A-G](?:#|b)?){5}\s*$/;

  function normKeyName(root, mode) {
    root = root.replace(/♯/g, '#').replace(/♭/g, 'b');
    var minor = mode && /^m(in(or)?)?$/i.test(mode);
    return root + (minor ? 'm' : '');
  }

  /* ---------- ChordPro ---------- */

  var CP_DIRECTIVE_RE = /^\s*\{\s*([a-z_][a-z_\-]*)\s*:?\s*([^}]*)\}\s*$/i;
  var CP_INLINE_RE = /\[([^\[\]]{1,15})\]/g;

  function lineHasInlineChord(line) {
    // a bracketed chord PLUS other text on the same line
    var m, re = /\[([^\[\]\s]{1,15})\]/g, sawChord = false;
    while ((m = re.exec(line)) !== null) {
      if (CT.isChordSymbol(m[1])) { sawChord = true; break; }
    }
    if (!sawChord) return false;
    var remainder = line.replace(/\[[^\[\]]{1,15}\]/g, '').trim();
    return remainder.length > 0;
  }

  function looksLikeChordPro(text) {
    if (/\{\s*(?:title|t|artist|subtitle|st|key|capo|comment|c|chorus|start_of_\w+|soc|sov|sob)\b[^}]*\}/i.test(text)) return true;
    var lines = text.split('\n'), hits = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lineHasInlineChord(lines[i])) {
        hits++;
        if (hits >= 2) return true;
      }
    }
    return false;
  }

  function parseChordProLine(line) {
    var chords = [], lyric = '', last = 0, m;
    CP_INLINE_RE.lastIndex = 0;
    while ((m = CP_INLINE_RE.exec(line)) !== null) {
      lyric += line.slice(last, m.index);
      if (CT.isChordSymbol(m[1])) chords.push({ sym: m[1], pos: lyric.length });
      else lyric += m[0];
      last = CP_INLINE_RE.lastIndex;
    }
    lyric += line.slice(last);
    return { lyric: lyric, chords: chords };
  }

  /* ---------- main parse ---------- */

  function newSection(label, type, repeat) {
    return { label: label, type: type, repeat: repeat || null, lines: [] };
  }

  function parseSong(rawText, hints) {
    hints = hints || {};
    var meta = { title: hints.title || '', artist: hints.artist || '',
                 key: hints.key || '', capo: hints.capo != null ? hints.capo : null,
                 tempo: null, tuning: '', album: '' };

    var text = normalizeText(rawText);
    var isChordPro = looksLikeChordPro(stripUgMarkup(text));
    var rawLines = text.split('\n');

    // preprocess every line once: UG markup + tab expansion
    var lines = [];
    var hasMusic = false;
    for (var pi = 0; pi < rawLines.length; pi++) {
      var pu = processUgLine(rawLines[pi].replace(/\s+$/, ''));
      var L = expandTabs(pu.line);
      var entry = { text: L, forceInline: pu.forceInline };
      lines.push(entry);
      if (!hasMusic && L.trim()) {
        if (entry.forceInline || (isChordPro && lineHasInlineChord(L))) hasMusic = true;
        else if (isTabLine(L)) hasMusic = true;
        else if (parseSectionHeader(L)) hasMusic = true;
        else {
          var pcls = classifyChordLine(L);
          if (pcls.isChordLine && !isChordLookalikeJunk(pcls)) hasMusic = true;
        }
      }
    }

    var sections = [];
    var cur = null;
    var pendingChordLine = null;   // {chords, annots, raw}
    var inPreamble = true;
    var preamble = [];             // buffered non-metadata preamble lines
    var preambleContent = 0;
    var pendingMetaLabel = null;   // "Capo" on one line, "4th fret" on the next

    function ensureSection() {
      if (!cur) { cur = newSection('', 'none', null); sections.push(cur); }
      return cur;
    }
    function flushPending() {
      if (pendingChordLine) {
        ensureSection().lines.push({
          kind: 'chords',
          chords: pendingChordLine.chords,
          annots: pendingChordLine.annots,
          raw: pendingChordLine.raw
        });
        pendingChordLine = null;
      }
    }
    function endPreamble() {
      if (!inPreamble) return;
      inPreamble = false;
      var kept = preamble.filter(function (b) { return b !== null; });
      if (kept.length) {
        var sec = ensureSection();
        kept.forEach(function (b) { sec.lines.push({ kind: 'comment', text: b }); });
      }
      preamble = [];
    }

    function handleBodyLine(line, forceInline) {
      /* section header. A colon-style header carrying free text ("Tag: you're
         it") directly under a chord row is almost always the sung lyric —
         let it pair instead. Bracketed headers stay headers. */
      var hdr = parseSectionHeader(line);
      if (hdr && hdr.note && pendingChordLine && !/^\s*\[/.test(line)) hdr = null;
      if (hdr) {
        flushPending();
        cur = newSection(hdr.label, sectionTypeFor(hdr.label), hdr.repeat);
        sections.push(cur);
        if (hdr.trailing) {
          // unwrap converted [ch] brackets so the row renders as plain chords
          var trailTxt = hdr.trailing.replace(/\[([^\[\]]{1,15})\]/g, '$1');
          var tc = classifyChordLine(trailTxt);
          cur.lines.push({ kind: 'chords', chords: tc.chords, annots: tc.annots, raw: trailTxt });
        }
        if (hdr.note) cur.lines.push({ kind: 'comment', text: hdr.note });
        return;
      }

      /* tab line */
      if (isTabLine(line)) {
        flushPending();
        ensureSection().lines.push({ kind: 'tab', text: line });
        return;
      }

      /* ChordPro inline line */
      if ((forceInline || isChordPro) && /\[[^\[\]]{1,15}\]/.test(line)) {
        flushPending();
        var cp = parseChordProLine(line);
        if (!cp.lyric.trim() && cp.chords.length) {
          ensureSection().lines.push({ kind: 'chords', chords: cp.chords, annots: [], raw: '' });
        } else {
          ensureSection().lines.push({ kind: 'chordlyric', lyric: cp.lyric, chords: cp.chords, annots: [] });
        }
        return;
      }

      /* divider */
      if (isDividerLine(line)) {
        flushPending();
        ensureSection().lines.push({ kind: 'comment', text: line.trim() });
        return;
      }

      /* annotation-only line (x2, N.C., | repeat |) */
      if (isAnnotationLine(line)) {
        flushPending();
        ensureSection().lines.push({ kind: 'comment', text: line.trim() });
        return;
      }

      /* chord line */
      var cls = classifyChordLine(line);
      if (cls.isChordLine && !isChordLookalikeJunk(cls)) {
        flushPending();
        pendingChordLine = { chords: cls.chords, annots: cls.annots, raw: line };
        return;
      }

      /* lyric line */
      if (pendingChordLine) {
        ensureSection().lines.push({
          kind: 'chordlyric',
          lyric: line,
          chords: pendingChordLine.chords,
          annots: pendingChordLine.annots
        });
        pendingChordLine = null;
      } else {
        ensureSection().lines.push({ kind: 'lyric', lyric: line });
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].text;
      var forceInline = lines[i].forceInline;

      /* ChordPro directives & comments (any position) */
      if (isChordPro) {
        if (/^\s*#/.test(line)) continue;
        var d = CP_DIRECTIVE_RE.exec(line);
        if (d) {
          var dk = d[1].toLowerCase(), dv = d[2].trim();
          if (dk === 'title' || dk === 't') { if (!meta.title) meta.title = dv; }
          else if (dk === 'artist' || dk === 'subtitle' || dk === 'st') { if (!meta.artist) meta.artist = dv; }
          else if (dk === 'album') { if (!meta.album) meta.album = dv; }
          else if (dk === 'key') { if (!meta.key) meta.key = dv; }
          else if (dk === 'capo') {
            var cpn = parseInt(dv, 10);
            if (!isNaN(cpn) && meta.capo == null) meta.capo = cpn;
          }
          else if (dk === 'c' || dk === 'ci' || dk === 'cb' || dk.indexOf('comment') === 0) {
            endPreamble(); flushPending();
            ensureSection().lines.push({ kind: 'comment', text: dv });
          }
          else if (dk === 'chorus') {
            endPreamble(); flushPending();
            ensureSection().lines.push({ kind: 'comment', text: '(Repeat chorus' + (dv ? ': ' + dv : '') + ')' });
          }
          else if (dk === 'soc' || dk === 'start_of_chorus') {
            endPreamble(); flushPending();
            cur = newSection(dv || 'Chorus', 'chorus', null); sections.push(cur);
          }
          else if (dk === 'sov' || dk === 'start_of_verse') {
            endPreamble(); flushPending();
            cur = newSection(dv || 'Verse', 'verse', null); sections.push(cur);
          }
          else if (dk === 'sob' || dk === 'start_of_bridge') {
            endPreamble(); flushPending();
            cur = newSection(dv || 'Bridge', 'bridge', null); sections.push(cur);
          }
          else if (/^start_of_(\w+)$/.test(dk)) {
            endPreamble(); flushPending();
            var sw = /^start_of_(\w+)$/.exec(dk)[1];
            var lbl2 = dv || (sw.charAt(0).toUpperCase() + sw.slice(1));
            cur = newSection(lbl2, sectionTypeFor(sw), null); sections.push(cur);
          }
          else if (dk === 'eoc' || dk === 'eov' || dk === 'eob' || /^end_of_\w+$/.test(dk)) {
            flushPending(); cur = null;
          }
          /* unknown directives are ignored */
          continue;
        }
      }

      /* blank line */
      if (!line.trim()) {
        if (inPreamble) {
          if (preamble.length) preamble.push(null); // preserve inner blanks
          continue;
        }
        flushPending();
        if (cur && cur.lines.length && cur.lines[cur.lines.length - 1].kind !== 'blank') {
          cur.lines.push({ kind: 'blank' });
        }
        continue;
      }

      if (inPreamble) {
        /* metadata extraction — always consumed, fills only empty fields */
        var consumed = false;

        /* value line following a bare "Capo"/"Key"/"Tuning" label (UG table copies) */
        if (pendingMetaLabel) {
          var pml = pendingMetaLabel;
          pendingMetaLabel = null;
          if (pml === 'capo') {
            var pcv = /^\s*(?:on\s*)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:fret)?\s*$/i.exec(line);
            if (pcv) { if (meta.capo == null) meta.capo = parseInt(pcv[1], 10); continue; }
          } else if (pml === 'key') {
            var pkv = /^\s*([A-G](?:#|b|♯|♭)?)\s*(minor|major|min|maj|m)?\s*$/i.exec(line);
            if (pkv && !TUNING_LINE_RE.test(line)) { if (!meta.key) meta.key = normKeyName(pkv[1], pkv[2]); continue; }
          } else if (pml === 'tuning') {
            if (TUNING_LINE_RE.test(line) || /^\s*(standard|drop\s+\w|open\s+\w|half.step|eb|dadgad)/i.test(line)) {
              if (!meta.tuning) meta.tuning = line.trim();
              continue;
            }
          }
        }
        var bareLabel = /^\s*(capo|key|tuning)\s*[:：]?\s*$/i.exec(line);
        if (bareLabel) { pendingMetaLabel = bareLabel[1].toLowerCase(); continue; }

        var km = KEY_RE.exec(line);
        if (km) { if (!meta.key) meta.key = normKeyName(km[1], km[2]); consumed = true; }
        if (!consumed) {
          var cm = CAPO_RE.exec(line);
          if (cm) { if (meta.capo == null) meta.capo = parseInt(cm[1], 10); consumed = true; }
        }
        if (!consumed && NO_CAPO_RE.test(line)) { if (meta.capo == null) meta.capo = 0; consumed = true; }
        if (!consumed) {
          for (var mk in META_RES) {
            if (!META_RES.hasOwnProperty(mk)) continue;
            var mm = META_RES[mk].exec(line);
            if (mm) {
              if (mk === 'tempo') { if (meta.tempo == null) meta.tempo = parseInt(mm[1], 10); }
              else if (!meta[mk]) meta[mk] = mm[1].trim();
              consumed = true;
              break;
            }
          }
        }
        if (!consumed && hasMusic) {
          /* "SongName chords by ArtistName" — only in pastes with real music,
             so lyric lines like "I played those chords by heart" survive */
          var cb = CHORDS_BY_RE.exec(line);
          if (cb) {
            if (!meta.title) meta.title = cb[1].trim();
            if (!meta.artist) meta.artist = cb[2].trim();
            consumed = true;
          }
        }
        if (!consumed && !meta.tuning && TUNING_LINE_RE.test(line)) {
          meta.tuning = line.trim();
          consumed = true;
        }
        if (!consumed && hasMusic && !isChordPro && preambleContent === 0) {
          /* "Song Title - Artist" (preferred: explicit separator) or
             "Song Title by Artist" as the first preamble content line */
          var dashM = /^\s*(.{2,60}?)\s+[-–—]\s+(.{2,60}?)\s*$/.exec(line);
          var byM = dashM || /^\s*(.{2,60}?)\s+by\s+(.{2,60}?)\s*$/i.exec(line);
          if (byM) {
            var parts = line.split(/\s+[-–—]\s+/);
            var allChordish = parts.length > 1 && parts.every(function (p) {
              var up = p.trim();
              up = up.charAt(0).toUpperCase() + up.slice(1);
              return CT.isChordSymbol(up);
            });
            if (!allChordish) {
              if (!meta.title) meta.title = byM[1].trim();
              if (!meta.artist) meta.artist = byM[2].trim();
              consumed = true;
            }
          }
        }
        if (consumed) continue;

        /* does this line start the music? In ChordPro files every
           non-directive content line is body (lyrics included) — there is no
           web-page junk to buffer. */
        var musical = false;
        if (isChordPro || forceInline) musical = true;
        else if (isTabLine(line)) musical = true;
        else if (parseSectionHeader(line)) musical = true;
        else {
          var bcls = classifyChordLine(line);
          if (bcls.isChordLine && !isChordLookalikeJunk(bcls)) musical = true;
        }
        if (musical) {
          endPreamble();
          handleBodyLine(line, forceInline);
        } else {
          preamble.push(line.trim());
          preambleContent++;
        }
        continue;
      }

      handleBodyLine(line, forceInline);
    }
    flushPending();

    /* EOF still in preamble => the paste was plain lyrics; keep them as lyrics */
    if (inPreamble && preamble.length) {
      var sec0 = ensureSection();
      preamble.forEach(function (b) {
        if (b === null) {
          if (sec0.lines.length && sec0.lines[sec0.lines.length - 1].kind !== 'blank') {
            sec0.lines.push({ kind: 'blank' });
          }
        } else {
          sec0.lines.push({ kind: 'lyric', lyric: b });
        }
      });
    }

    /* trim blanks; drop empty sections */
    var cleaned = [];
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      while (sec.lines.length && sec.lines[sec.lines.length - 1].kind === 'blank') sec.lines.pop();
      while (sec.lines.length && sec.lines[0].kind === 'blank') sec.lines.shift();
      if (sec.lines.length || sec.label) cleaned.push(sec);
    }

    /* collect unique chords in order of appearance */
    var allChords = [], seen = {};
    for (var s2 = 0; s2 < cleaned.length; s2++) {
      for (var l2 = 0; l2 < cleaned[s2].lines.length; l2++) {
        var ln = cleaned[s2].lines[l2];
        if (ln.chords) {
          for (var c2 = 0; c2 < ln.chords.length; c2++) {
            var p = CT.parseChord(ln.chords[c2].sym);
            if (!p) continue;
            if (!seen[p.norm]) { seen[p.norm] = 1; allChords.push(ln.chords[c2].sym); }
          }
        }
      }
    }

    if (!meta.key && allChords.length) {
      var dk2 = CT.detectKey(allChords);
      if (dk2) meta.key = dk2.name;
    }

    return {
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      key: meta.key,
      capo: meta.capo,
      tempo: meta.tempo,
      tuning: meta.tuning,
      sections: cleaned,
      chords: allChords,
      raw: rawText
    };
  }

  /* Plain-text lyrics of a parsed song (for search indexing) */
  function songPlainText(song) {
    var parts = [];
    for (var s = 0; s < song.sections.length; s++) {
      for (var l = 0; l < song.sections[s].lines.length; l++) {
        var ln = song.sections[s].lines[l];
        if (ln.lyric) parts.push(ln.lyric);
      }
    }
    return parts.join('\n');
  }

  var api = {
    parseSong: parseSong,
    parseSectionHeader: parseSectionHeader,
    sectionTypeFor: sectionTypeFor,
    classifyChordLine: classifyChordLine,
    isTabLine: isTabLine,
    isAnnotationLine: isAnnotationLine,
    stripUgMarkup: stripUgMarkup,
    looksLikeChordPro: looksLikeChordPro,
    parseChordProLine: parseChordProLine,
    songPlainText: songPlainText,
    expandTabs: expandTabs
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SongParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
