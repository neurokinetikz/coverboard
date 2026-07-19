/* follow.js — Follow mode: listen while the user sings and track the current
   lyric line. Three layers, cleanly separated:
     1. a PURE aligner (normalize / index / feed / track) — no DOM, no audio,
        fully testable in Node;
     2. an engine seam — pluggable speech recognizers that emit RAW text
        (v1: the browser's Web Speech API; alternative engines register here
        and everything above them is untouched);
     3. a controller singleton that wires engine → feeder → tracker → UI
        callbacks supplied by the app (follow.js never touches the DOM).
   Plain script; exports to window and CommonJS. */
(function (global) {
  'use strict';

  /* ---------- normalization ---------- */

  function normWord(s) {
    s = String(s).toLowerCase();
    if (s.normalize) {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    s = s.replace(/['’]/g, '');      // don't -> dont, 'cause -> cause
    s = s.replace(/[^a-z0-9]/g, '');      // punctuation, hyphens: na-na-na -> nanana
    return s;
  }

  function normWords(text) {
    var parts = String(text).split(/\s+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var w = normWord(parts[i]);
      if (w) out.push(w);
    }
    return out;
  }

  /* Character ranges of index-consuming words in a lyric string — the DOM
     word-wrapper and buildIndex MUST agree on which tokens count, so both
     use this: a token counts iff it normalizes to a non-empty word. */
  function wordRanges(lyric) {
    var out = [];
    var re = /\S+/g, m;
    while ((m = re.exec(String(lyric))) !== null) {
      if (normWord(m[0])) out.push({ s: m.index, e: m.index + m[0].length });
    }
    return out;
  }

  /* ---------- lyric index ---------- */

  /* A line qualifies iff kind is 'chordlyric' or 'lyric' — the EXACT rule
     app.js uses when emitting data-line attributes, so the DOM and this
     index stay 1:1 by construction. Wordless qualifying lines still consume
     an index (they are just unreachable as highlight targets). */
  function buildIndex(parsed) {
    var words = [];
    var lineNo = 0;
    (parsed.sections || []).forEach(function (sec) {
      (sec.lines || []).forEach(function (ln) {
        if (ln.kind !== 'chordlyric' && ln.kind !== 'lyric') return;
        var lyric = ln.lyric || '';
        var ranges = wordRanges(lyric);
        for (var i = 0; i < ranges.length; i++) {
          words.push({
            w: normWord(lyric.slice(ranges[i].s, ranges[i].e)),
            line: lineNo,
            wi: i
          });
        }
        lineNo++;
      });
    });
    return { words: words, lineCount: lineNo };
  }

  /* ---------- interim-result feeder ---------- */

  /* Chrome re-sends a growing (and sometimes rewritten) interim transcript.
     Diff each update against the last one and emit only the new tail; a
     final freezes the stream (a fresh interim starts after it). */
  function createFeeder() {
    var lastInterim = [];
    return {
      push: function (text, isFinal) {
        var cand = normWords(text);
        var p = 0;
        while (p < cand.length && p < lastInterim.length &&
               cand[p] === lastInterim[p]) p++;
        var out = cand.slice(p);
        if (isFinal) {
          // Chrome may finalize only the FIRST of several pending results;
          // the leftover interim words were already emitted, so remember
          // them. A final that diverges from the interim resets cleanly.
          lastInterim = p === cand.length ? lastInterim.slice(p) : [];
        } else {
          lastInterim = cand;
        }
        return out;
      },
      reset: function () { lastInterim = []; }
    };
  }

  /* ---------- tracker ---------- */

  var BACK = 12;          // backward search reach (words)
  var AHEAD = 30;         // forward search reach
  var JUMP_NEAR = 2;      // forward steps this close commit instantly
  var JUMP_EVIDENCE = 2;  // consecutive matches to commit a forward jump
  var BACK_EVIDENCE = 3;  // consecutive matches to commit ANY backward move
  var CONF_WINDOW = 8;    // confidence ring size

  /* one-substitution/insert/delete check without a DP table */
  function within1(a, b) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la === lb) { i++; j++; }
      else if (la > lb) i++;
      else j++;
    }
    return edits + (la - i) + (lb - j) <= 1;
  }

  function matchScore(heard, expected) {
    if (heard === expected) return 1;
    var lmin = Math.min(heard.length, expected.length);
    if (lmin >= 4 &&
        (heard.indexOf(expected) === 0 || expected.indexOf(heard) === 0)) {
      return 0.8;                        // runnin / running
    }
    if (lmin >= 5 && within1(heard, expected)) return 0.7;
    return 0;
  }

  function createTracker(index) {
    var words = index.words;
    var cursor = 0;        // index of the NEXT expected word
    // a fresh tracker anchors on the first word-bearing line so the UI can
    // pre-highlight "the line to be sung" before any audio arrives
    var curLine = words.length ? words[0].line : -1;
    var pending = null;    // candidate jump: { run, next }
    var ring = [];         // last CONF_WINDOW hit(1)/miss(0)

    function state() {
      var hits = 0;
      for (var i = 0; i < ring.length; i++) hits += ring[i];
      var last = cursor > 0 ? words[cursor - 1] : null;
      return {
        line: curLine,
        cursor: cursor,
        // the last CONSUMED word (its own line can trail `line` when the
        // teleprompter has already advanced the highlight)
        wordLine: last ? last.line : -1,
        word: last ? last.wi : -1,
        confidence: ring.length ? hits / ring.length : 0
      };
    }

    return {
      feed: function (newWords) {
        for (var n = 0; n < newWords.length; n++) {
          var w = newWords[n];
          var prevCursor = cursor;
          var lo = Math.max(0, cursor - BACK);
          var hi = Math.min(words.length - 1, cursor + AHEAD);
          var best = null;
          for (var j = lo; j <= hi; j++) {
            var m = matchScore(w, words[j].w);
            if (!m) continue;
            var d = j - cursor;
            var s = d >= 0 ? m * (1 - d / (AHEAD * 4))
                           : m * 0.5 * (1 + d / (BACK * 4));
            if (!best || s > best.s) best = { j: j, s: s };
          }
          ring.push(best ? 1 : 0);
          if (ring.length > CONF_WINDOW) ring.shift();
          if (!best) { pending = null; continue; }   // garbage: cursor waits
          var dd = best.j - cursor;
          if (dd >= 0 && dd <= JUMP_NEAR) {
            cursor = best.j + 1;                      // contiguous singing
            pending = null;
          } else {
            var need = dd < 0 ? BACK_EVIDENCE : JUMP_EVIDENCE;
            if (pending && best.j === pending.next) {
              pending.run++;
              pending.next = best.j + 1;
            } else {
              pending = { run: 1, next: best.j + 1 };
            }
            if (pending.run >= need) {                // commit the jump
              cursor = pending.next;
              pending = null;
            }
          }
          if (cursor !== prevCursor && cursor > 0) {
            // teleprompter advance: once a line's last word is consumed,
            // highlight the NEXT line the singer is about to start
            if (cursor < words.length &&
                words[cursor].line !== words[cursor - 1].line) {
              curLine = words[cursor].line;
            } else {
              curLine = words[cursor - 1].line;
            }
          }
        }
        return state();
      },
      seek: function (lineIdx) {
        for (var i = 0; i < words.length; i++) {
          if (words[i].line >= lineIdx) { cursor = i; break; }
        }
        if (!words.length || lineIdx > words[words.length - 1].line) {
          cursor = words.length;
        }
        curLine = lineIdx;
        pending = null;
        ring = [];
        return state();
      },
      reset: function () {
        cursor = 0;
        curLine = words.length ? words[0].line : -1;
        pending = null; ring = [];
        return state();
      },
      state: state
    };
  }

  /* ---------- engine seam ---------- */

  /* An engine = { id, available() -> true|reason-string,
                   start({lang, onWords(text,isFinal), onState(s), onError(c)})
                     -> bool,
                   stop() }.
     Engines emit RAW transcript text; all normalization and diffing live in
     the pure layers above, so a new engine only has to produce text. Priority order in bestEngine() — prepend new engines. */
  var engines = {};
  var ENGINE_ORDER = ['webspeech'];

  function registerEngine(e) { engines[e.id] = e; }

  function bestEngine() {
    for (var i = 0; i < ENGINE_ORDER.length; i++) {
      var e = engines[ENGINE_ORDER[i]];
      if (e && e.available() === true) return e;
    }
    return null;
  }

  /* v1: the browser's built-in recognizer (Web Speech API). The browser owns
     the microphone and streams audio to its speech service internally; we
     only consume the text events. Chrome kills sessions after ~60s or long
     silence — auto-restart while active. */
  registerEngine((function () {
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    var rec = null, active = false, restartTimer = null, cbs = null;

    function mapError(code) {
      if (code === 'not-allowed') return 'mic-denied';
      if (code === 'service-not-allowed') return 'service-denied';
      if (code === 'network') return 'network';
      if (code === 'audio-capture') return 'no-mic';
      return null;                       // no-speech / aborted: benign
    }

    return {
      id: 'webspeech',
      available: function () { return SR ? true : 'no-api'; },
      start: function (opts) {
        if (!SR) return false;
        cbs = opts;
        // capture this session's recognizer: async events from an aborted
        // instance must be ignored once a new session has replaced it
        var myRec = new SR();
        rec = myRec;
        myRec.continuous = true;
        myRec.interimResults = true;
        myRec.maxAlternatives = 1;
        myRec.lang = opts.lang ||
          (global.navigator && global.navigator.language) || 'en-US';
        myRec.onresult = function (e) {
          if (myRec !== rec) return;
          var i, interim = '';
          for (i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              cbs.onWords(e.results[i][0].transcript, true);
            }
          }
          for (i = 0; i < e.results.length; i++) {
            if (!e.results[i].isFinal) interim += e.results[i][0].transcript;
          }
          if (interim) cbs.onWords(interim, false);
        };
        myRec.onstart = function () {
          if (myRec !== rec) return;
          cbs.onState('listening');
        };
        myRec.onend = function () {
          if (myRec !== rec || !active) return;
          cbs.onState('restarting');
          restartTimer = setTimeout(function () {
            if (myRec !== rec || !active) return;
            try { myRec.start(); } catch (err) { /* already running */ }
          }, 250);
        };
        myRec.onerror = function (e) {
          if (myRec !== rec) return;
          var code = mapError(e.error);
          if (!code) return;             // benign: the onend restart handles it
          active = false;
          cbs.onError(code);
        };
        active = true;
        cbs.onState('starting');
        try { myRec.start(); } catch (err) { active = false; return false; }
        return true;
      },
      stop: function () {
        active = false;
        if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
        if (rec) { try { rec.abort(); } catch (err) { /* fine */ } }
        if (cbs) cbs.onState('stopped');
        rec = null;
      }
    };
  })());

  /* ---------- controller ---------- */

  var C = { active: false, engine: null, tracker: null, feeder: null,
            ui: null, line: -1, state: 'idle' };

  function stop() {
    if (!C.active) return;
    C.active = false;
    if (C.engine) C.engine.stop();   // emits 'stopped' — settle 'idle' after
    C.state = 'idle';
    C.engine = null; C.tracker = null; C.feeder = null;
    var ui = C.ui; C.ui = null; C.line = -1;
    if (ui && ui.onState) ui.onState('idle');
  }

  function start(parsed, ui) {
    if (C.active) stop();
    var engine = bestEngine();
    if (!engine) {
      if (ui && ui.onError) ui.onError('no-engine');
      return false;
    }
    C.tracker = createTracker(buildIndex(parsed));
    C.feeder = createFeeder();
    C.ui = ui;
    C.engine = engine;
    C.active = true;
    C.line = -1;
    var ok = engine.start({
      onWords: function (text, isFinal) {
        if (!C.active) return;
        var nw = C.feeder.push(text, isFinal);
        if (!nw.length) return;
        var before = C.tracker.state().cursor;
        var r = C.tracker.feed(nw);
        if (r.line >= 0 && r.line !== C.line) {
          C.line = r.line;
          if (C.ui && C.ui.onLine) C.ui.onLine(r.line, r);
        }
        if (r.cursor !== before && r.wordLine >= 0 &&
            C.ui && C.ui.onWord) {
          C.ui.onWord(r.wordLine, r.word, r);
        }
      },
      onState: function (s) {
        C.state = s;
        if (C.ui && C.ui.onState) C.ui.onState(s);
      },
      onError: function (code) {
        var ui2 = C.ui;
        stop();
        if (ui2 && ui2.onError) ui2.onError(code);
      }
    });
    if (!ok) { stop(); if (ui && ui.onError) ui.onError('start-failed'); return ok; }
    var st0 = C.tracker.state();
    if (st0.line >= 0) {
      C.line = st0.line;
      if (C.ui && C.ui.onLine) C.ui.onLine(st0.line, st0);
    }
    return ok;
  }

  function seek(lineIdx) {
    if (!C.active || !C.tracker) return;
    var r = C.tracker.seek(lineIdx);
    C.line = lineIdx;
    if (C.ui && C.ui.onLine) C.ui.onLine(lineIdx, r);
    if (C.ui && C.ui.onWord) C.ui.onWord(r.wordLine, r.word, r);
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;'
           : c === '"' ? '&quot;' : '&#39;';
    });
  }

  /* Wrap the index-consuming words of a lyric SLICE in <span class="w"
     data-w="K"> spans (K = word ordinal within the LINE, straight from
     wordRanges — the same contract buildIndex uses). A word split across
     two chord segments yields two spans sharing one K. Pure string builder,
     no DOM. */
  function wrapWordsHTML(text, offset, ranges) {
    if (!ranges || !ranges.length || !text) return text ? escapeHTML(text) : '';
    var end = offset + text.length;
    var html = '';
    var pos = offset;
    for (var k = 0; k < ranges.length; k++) {
      var r = ranges[k];
      if (r.e <= pos || r.s >= end) continue;
      var ws = Math.max(r.s, pos), we = Math.min(r.e, end);
      if (ws > pos) html += escapeHTML(text.slice(pos - offset, ws - offset));
      html += '<span class="w" data-w="' + k + '">' +
        escapeHTML(text.slice(ws - offset, we - offset)) + '</span>';
      pos = we;
    }
    if (pos < end) html += escapeHTML(text.slice(pos - offset));
    return html;
  }

  var api = {
    normWord: normWord,
    normWords: normWords,
    wordRanges: wordRanges,
    wrapWordsHTML: wrapWordsHTML,
    buildIndex: buildIndex,
    createFeeder: createFeeder,
    createTracker: createTracker,
    registerEngine: registerEngine,
    bestEngine: bestEngine,
    start: start,
    stop: stop,
    seek: seek,
    active: function () { return C.active; },
    state: function () { return C.state; },
    currentLine: function () { return C.line; },
    // tracker snapshot ({line, cursor, wordLine, word, confidence}) so the
    // app can repaint word marks after a full re-render; null when inactive
    trackerState: function () { return C.tracker ? C.tracker.state() : null; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Follow = api;
})(typeof window !== 'undefined' ? window : globalThis);
