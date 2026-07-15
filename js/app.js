/* app.js — Songbook UI. Depends on chordtheory, parser, voicings, diagrams,
   search, store (loaded before this script). */
(function () {
  'use strict';

  var CT = window.ChordTheory, Parser = window.SongParser, V = window.Voicings,
      DG = window.Diagrams, Search = window.SongSearch, Store = window.SongStore,
      FS = window.SongFileStore, TR = window.Triads, FB = window.Fretboard;

  var App = {
    state: {
      view: 'song',        // song | setlists | setlist
      songId: null,
      setlistId: null,
      query: '',
      sidebarOpen: false,
      perform: null        // { setlistId, idx }
    },
    index: [],
    indexDirty: true
  };

  /* ---------- helpers ---------- */

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ---------- chord display ---------- */

  function songPreferFlat(song, parsed, tr) {
    var keyName = song && song.key || parsed && parsed.key;
    if (keyName) {
      var p = CT.parseChord(keyName);
      if (p) {
        var minor = /^m(?!aj)/.test(p.quality);
        return CT.keyPrefersFlat(p.rootPc + tr, minor);
      }
    }
    var flats = 0, sharps = 0;
    ((parsed && parsed.chords) || []).forEach(function (c) {
      if (/^[A-G]b/.test(c)) flats++;
      if (/^[A-G]#/.test(c)) sharps++;
    });
    return flats > sharps;
  }

  function dispChord(sym, tr, flat) {
    if (!tr) return sym;
    return CT.transposeChord(sym, tr, flat);
  }

  function bareChord(token) {
    var bare = token.replace(/^[({\[]+/, '').replace(/[)}\],.*]+$/, '');
    return CT.isChordSymbol(bare) ? bare : null;
  }

  /* ---------- section / line rendering (shared by song view & preview) ---------- */

  function segHTML(chordSym, text, clickable, isAnnot) {
    var c;
    if (chordSym && isAnnot) {
      c = '<span class="c ann">' + esc(chordSym) + '</span>';
    } else if (chordSym) {
      c = '<span class="c' + (clickable ? ' clickable' : '') + '" data-chord="' +
          esc(chordSym) + '">' + esc(chordSym) + '</span>';
    } else {
      c = '<span class="c">&nbsp;</span>';
    }
    return '<span class="seg">' + c + '<span class="l">' + (text ? esc(text) : '&nbsp;') + '</span></span>';
  }

  function chordLyricHTML(line, tr, flat, clickable) {
    var events = (line.chords || []).map(function (c) {
      return { sym: c.sym, pos: c.pos, annot: false };
    }).concat((line.annots || []).map(function (a) {
      return { sym: a.text, pos: a.pos, annot: true };
    })).sort(function (a, b) { return a.pos - b.pos; });
    var lyric = line.lyric || '';
    if (!events.length) {
      return '<div class="line lyric-only">' + esc(lyric) + '</div>';
    }
    var html = '<div class="line cl">';
    if (events[0].pos > 0) html += segHTML(null, lyric.slice(0, events[0].pos), false, false);
    for (var i = 0; i < events.length; i++) {
      var start = events[i].pos;
      var end = i + 1 < events.length ? events[i + 1].pos : Math.max(lyric.length, start);
      var shown = events[i].annot ? events[i].sym : dispChord(events[i].sym, tr, flat);
      html += segHTML(shown, lyric.slice(start, end), clickable, events[i].annot);
    }
    return html + '</div>';
  }

  function chordRowHTML(line, tr, flat, clickable) {
    // Rebuild from the raw chord line so fillers (x2, |, N.C.) survive.
    var raw = line.raw || '';
    var html = '<div class="line chordrow">';
    if (raw) {
      var re = /\S+/g, m, col = 0;
      while ((m = re.exec(raw)) !== null) {
        var gap = m.index - col;
        if (gap > 0) html += esc(new Array(gap + 1).join(' '));
        var bc = bareChord(m[0]);
        if (bc) {
          var shown = m[0].replace(bc, dispChord(bc, tr, flat));
          html += '<span class="c' + (clickable ? '' : ' noclick') + '" data-chord="' +
                  esc(dispChord(bc, tr, flat)) + '">' + esc(shown) + '</span>';
        } else if (/^(n\.?c\.?|\(n\.?c\.?\)|[x×]\d+|\((?:[x×])?\d+[x×]?\)|repeat|simile|%)$/i.test(m[0])) {
          html += '<span class="ann">' + esc(m[0]) + '</span>';
        } else {
          html += esc(m[0]);
        }
        col = m.index + m[0].length;
      }
    } else {
      (line.chords || []).forEach(function (c, i) {
        if (i) html += '  ';
        var d = dispChord(c.sym, tr, flat);
        html += '<span class="c" data-chord="' + esc(d) + '">' + esc(d) + '</span>';
      });
    }
    return html + '</div>';
  }

  function sectionsHTML(parsed, opts) {
    opts = opts || {};
    var tr = opts.transpose || 0;
    var flat = opts.preferFlat || false;
    var clickable = opts.clickableChords !== false;
    var out = [];
    parsed.sections.forEach(function (sec, si) {
      var type = sec.type || 'none';
      out.push('<div class="section" data-type="' + esc(type) + '" data-sec="' + si + '">');
      if (sec.label) {
        out.push('<div class="section-head" data-act="collapse-section">' +
          '<span class="section-label">' + esc(sec.label) + '</span>' +
          (sec.repeat ? '<span class="section-repeat">×' + sec.repeat + '</span>' : '') +
          '<span class="section-collapse">▾</span></div>');
      }
      out.push('<div class="section-lines">');
      sec.lines.forEach(function (line) {
        switch (line.kind) {
          case 'blank':
            out.push('<div class="line blank"></div>'); break;
          case 'tab':
            out.push('<pre class="tabline">' + esc(line.text) + '</pre>'); break;
          case 'comment':
            out.push('<div class="line comment">' + esc(line.text) + '</div>'); break;
          case 'chords':
            out.push(chordRowHTML(line, tr, flat, clickable)); break;
          case 'chordlyric':
            out.push(chordLyricHTML(line, tr, flat, clickable)); break;
          default:
            out.push('<div class="line lyric-only">' + esc(line.lyric || '') + '</div>');
        }
      });
      out.push('</div></div>');
    });
    return out.join('');
  }

  function diagramStripHTML(parsed, tr, flat) {
    if (!parsed.chords.length) return '';
    var settings = Store.getSettings();
    var seen = {}, out = ['<div class="diagram-strip">'];
    parsed.chords.forEach(function (sym) {
      var d = dispChord(sym, tr, flat);
      var p = CT.parseChord(d);
      var key = p ? p.norm : d;
      if (seen[key]) return;
      seen[key] = 1;
      var voicings = V.getVoicings(d, 1);
      if (!voicings.length) return;
      out.push('<span class="dg" data-chord="' + esc(d) + '" data-frets="' + voicings[0].frets.join(',') +
        '" title="' + esc(d) + ' — tap for substitutions">' +
        DG.renderChordSVG(voicings[0], { label: d, showFingers: settings.showFingers }) + '</span>');
    });
    out.push('</div>');
    return out.length > 2 ? out.join('') : '';
  }

  /* ---------- triad strip (song view) ---------- */

  /* The song's key after transpose, as {pc, minor, name} — or null. */
  function effectiveKey(song, parsed) {
    var keyName = song.key || parsed.key;
    if (!keyName) return null;
    var kp = CT.parseChord(keyName);
    if (!kp) return null;
    var minor = /^m(?!aj)/.test(kp.quality);
    var pc = ((kp.rootPc + (song.transpose || 0)) % 12 + 12) % 12;
    return { pc: pc, minor: minor,
             name: CT.pcName(pc, CT.keyPrefersFlat(pc, minor)) + (minor ? 'm' : '') };
  }

  function triadInvName(i) {
    return i === 0 ? 'root' : i === 1 ? '1st inv' : '2nd inv';
  }

  var TRIAD_SET_IDS = ['1-3', '2-4', '3-5', '4-6'];

  /* Per-string interval roles for a triad voicing -> diagrams.js opts.roles */
  function triadRoles(v) {
    var roles = [null, null, null, null, null, null];
    (v.notes || []).forEach(function (n) { roles[n.string] = n.role; });
    return roles;
  }

  function triadLegendHTML(extraLabel) {
    return '<span class="ts-legend">' +
      '<span><i class="lg-r"></i>root</span>' +
      '<span><i class="lg-3"></i>3rd</span>' +
      '<span><i class="lg-5"></i>5th</span>' +
      (extraLabel ? '<span><i class="lg-7"></i>' + extraLabel + '</span>' : '') + '</span>';
  }

  function triadPosLabel(p) {
    return p.shape + (p.frame === 0 ? '·Open' : '·' + p.frame + 'fr');
  }

  function triadStripHTML(parsed, tr, flat, song) {
    if (!TR || !parsed.chords.length) return '';
    var seen = {}, disp = [];
    parsed.chords.forEach(function (sym) {
      var d = dispChord(sym, tr, flat);
      var p = CT.parseChord(d);
      if (!p) return;
      // dedup by pitch content so enharmonic spellings (C# vs Db) share a tile
      var k = p.rootPc + '|' + p.quality + '|' + p.bassPc;
      if (seen[k]) return;
      seen[k] = 1;
      disp.push(d);
    });
    if (!disp.length) return '';

    var key = effectiveKey(song, parsed);
    var settings = Store.getSettings();
    var pos = String(settings.triadPos || 'any');
    // one string set per pass (triads-on-string-sets pedagogy); the engine
    // falls to adjacent sets only when the chosen set has nothing in position
    var setPref = TRIAD_SET_IDS.indexOf(settings.triadStrings) !== -1
      ? settings.triadStrings : '1-3';
    var result = TR.songTriads(disp, {
      key: key || undefined,
      position: pos === 'any' ? 'any' : parseInt(pos, 10),
      stringSetPref: setPref
    });

    var has7 = result.chords.some(function (c) {
      return c.triad.quality === '7' || c.triad.quality === 'm7' ||
             c.triad.quality === 'maj7';
    });
    var has6 = result.chords.some(function (c) {
      return c.triad.quality === '6' || c.triad.quality === 'm6';
    });
    var extraLabel = has7 && has6 ? '7th·6th' : has7 ? '7th' : has6 ? '6th' : '';
    var out = ['<div class="triad-strip" id="triad-strip">'];
    out.push('<div class="ts-head"><span class="ts-lab">Triads' +
      (result.key ? ' · key' : '') + '</span>' +
      (result.key ? '<span class="sub-key">' + esc(result.key.name) + '</span>' : '') +
      triadLegendHTML(extraLabel));
    if (result.key) {
      out.push('<span class="ts-sub">Position</span><span class="pos-seg">');
      out.push('<button class="mini' + (pos === 'any' ? ' active' : '') +
        '" data-act="triad-pos" data-v="any" title="Best voicing anywhere">Any</button>');
      result.positions.forEach(function (p) {
        out.push('<button class="mini' + (pos === String(p.index) ? ' active' : '') +
          '" data-act="triad-pos" data-v="' + p.index + '" title="' + p.shape +
          '-shape position">' + esc(triadPosLabel(p)) + '</button>');
      });
      out.push('</span>');
    } else {
      out.push('<button class="chip" data-act="key-menu">Set the song key to enable positions</button>');
    }
    out.push('<span class="ts-sub">Strings</span><span class="pos-seg">');
    TRIAD_SET_IDS.forEach(function (id) {
      out.push('<button class="mini' + (setPref === id ? ' active' : '') +
        '" data-act="triad-strings" data-v="' + id + '" title="Play triads on strings ' +
        id + '">' + id + '</button>');
    });
    out.push('</span>');
    if (result.key) {
      out.push('<button class="mini ts-explore" data-act="view-fretboard" data-root="' +
        result.key.pc + '" data-quality="' + (result.key.minor ? 'min' : 'maj') +
        '">Explore neck →</button>');
    }
    out.push('</div><div class="ts-tiles">');

    // the origin-badge row costs a line above every chart — only render it
    // when some chord in the song was actually reduced
    var anyOrig = result.chords.some(function (c) { return c.sym !== c.triad.label; });
    result.chords.forEach(function (c) {
      var pick = c.atPosition;
      out.push('<span class="ts-tile">');
      if (anyOrig) {
        out.push('<span class="ts-orig">' +
          (c.sym !== c.triad.label ? esc(c.sym) + ' →' : '&nbsp;') + '</span>');
      }
      if (!pick || !pick.best) {
        out.push('<span class="ts-missing">no ' + esc(c.triad.label) + '</span>');
      } else {
        var v = pick.best;
        out.push('<span class="dg" data-triad="' + esc(c.triad.label) +
          '" data-frets="' + v.frets.join(',') + '" title="' +
          esc(c.triad.label + ' — strings ' + v.stringSet + ', ' + triadInvName(v.inversion) +
              ' (tap for all triads)') + '">' +
          DG.renderChordSVG(v, { label: c.triad.label, showFingers: false,
                                 roles: triadRoles(v) }) + '</span>');
        var flag = pick.outOfPosition ? '<span class="ts-flag out">off-pos</span>'
                 : pick.relaxed ? '<span class="ts-flag">±' + pick.relaxed + 'fr</span>' : '';
        // the Strings selector already says which set; call it out only when
        // the engine had to fall back to a different one
        var capTxt = (v.stringSet !== setPref ? v.stringSet + ' · ' : '') +
          triadInvName(v.inversion);
        out.push('<span class="ts-cap">' + esc(capTxt) + flag + '</span>');
      }
      out.push('</span>');
    });
    out.push('</div></div>');
    return out.join('');
  }

  /* Swap just the strip (keeps the song's scroll position mid-practice). */
  function updateTriadStrip() {
    var el = $('#triad-strip');
    var song = App.state.songId ? Store.getSong(App.state.songId) : null;
    if (!el || !song) { render(); return; }
    var parsed = Store.parsedSong(song);
    var tr = song.transpose || 0;
    var flat = songPreferFlat(song, parsed, tr);
    el.outerHTML = triadStripHTML(parsed, tr, flat, song);
    scheduleFit();
  }

  /* ---------- views ---------- */

  function render() {
    var app = $('#app');
    app.innerHTML = sidebarHTML() + '<div class="main" id="main">' + mainHTML() + '</div>';
    var sb = $('#sidebar');
    if (App.state.sidebarOpen) sb.classList.add('open');
    if (Store.getSettings().sidebarCollapsed) sb.classList.add('collapsed');
    applyFontSize();
    var q = $('#search-input');
    if (q) {
      q.value = App.state.query;
      // keep focus in the search box while typing
      if (App._searchFocused) {
        q.focus();
        q.setSelectionRange(q.value.length, q.value.length);
      }
    }
    syncHash();
    scheduleFit();
  }

  function applyFontSize() {
    var body = $('.song-body');
    if (body) body.style.fontSize = Store.getSettings().fontSize + 'px';
  }

  /* ---------- fit-to-viewport (performance view) ----------
     Finds the largest font size (capped at the user's font setting) and the
     smallest column count that let the ENTIRE song fit the viewport with no
     vertical scrolling. Extra columns overflow horizontally under CSS
     column-fill:auto, so "fits" = no horizontal or vertical overflow. */
  function fitSong() {
    var scroll = $('#song-scroll');
    if (!scroll || !scroll.classList.contains('fit')) return;
    var body = $('.song-body', scroll);
    if (!body) return;
    var W = scroll.clientWidth, H = scroll.clientHeight;
    if (W < 50 || H < 50) return;

    var maxFont = Store.getSettings().fontSize || 16;
    var minFont = 9;

    function fitsAt(font, cols) {
      body.style.fontSize = font + 'px';
      body.style.columnCount = cols;
      return body.scrollWidth <= body.clientWidth + 1 &&
             body.scrollHeight <= body.clientHeight + 1;
    }
    function colsFor(font) {
      // narrower than ~15em per column and chord sheets stop being readable
      var minColW = Math.max(190, font * 14);
      var maxCols = Math.max(1, Math.min(6, Math.floor(W / minColW)));
      for (var c = 1; c <= maxCols; c++) if (fitsAt(font, c)) return c;
      return 0;
    }

    var lo = minFont, hi = maxFont, best = null;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var c = colsFor(mid);
      if (c) { best = { font: mid, cols: c }; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    if (!best) {
      // even the minimum font can't fit: use max columns and let it clip as
      // little as possible (user can toggle Fit off to scroll)
      best = { font: minFont, cols: Math.max(1, Math.min(6, Math.floor(W / 200))) };
    }
    body.style.fontSize = best.font + 'px';
    body.style.columnCount = best.cols;
  }

  function scheduleFit() { requestAnimationFrame(fitSong); }

  window.addEventListener('resize', debounce(scheduleFit, 120));

  function buildIndex() {
    if (!App.indexDirty) return;
    App.index = Store.listSongs().map(function (s) {
      var parsed = Store.parsedSong(s);
      return Search.indexSong(
        { id: s.id, title: s.title, artist: s.artist, chords: parsed.chords },
        Parser.songPlainText(parsed));
    });
    App.indexDirty = false;
  }

  function sidebarHTML() {
    buildIndex();
    var songs = Store.listSongs();
    var byId = {};
    songs.forEach(function (s) { byId[s.id] = s; });

    var sortBy = Store.getSettings().librarySort || 'title';
    var rows;
    if (App.state.query.trim()) {
      rows = Search.search(App.index, App.state.query).map(function (r) {
        return { song: byId[r.id], where: r.where };
      }).filter(function (r) { return r.song; });
    } else {
      rows = songs.slice().sort(function (a, b) {
        if (sortBy === 'artist') {
          var aa = (a.artist || '').toLowerCase(), ba = (b.artist || '').toLowerCase();
          if (aa !== ba) {
            if (!aa) return 1;             // songs with no artist sort last
            if (!ba) return -1;
            return aa.localeCompare(ba);
          }
        }
        return a.title.localeCompare(b.title);
      }).map(function (s) { return { song: s, where: '' }; });
    }

    var grouped = !App.state.query.trim() && sortBy === 'artist';
    var collapsed = Store.getSettings().collapsedArtists || {};
    var items = '';
    var lastGroup = null;
    if (grouped) {
      var groupCounts = {};
      rows.forEach(function (r) {
        var g0 = r.song.artist || 'Unknown artist';
        groupCounts[g0] = (groupCounts[g0] || 0) + 1;
      });
    }
    rows.forEach(function (r) {
      var s = r.song;
      var selCls = s.id === App.state.songId && App.state.view === 'song' ? ' sel' : '';
      if (grouped) {
        var g = s.artist || 'Unknown artist';
        var isCollapsed = !!collapsed[g];
        if (g !== lastGroup) {
          lastGroup = g;
          items += '<div class="group-head' + (isCollapsed ? ' closed' : '') +
            '" data-act="toggle-artist" data-artist="' + esc(g) + '">' +
            '<span class="chev">' + (isCollapsed ? '▸' : '▾') + '</span>' + esc(g) +
            '<span class="cnt">' + groupCounts[g] + '</span></div>';
        }
        if (isCollapsed) return;
        items += '<div class="songitem grouped' + selCls +
          '" data-act="open-song" data-id="' + esc(s.id) + '">' +
          '<div class="t">' + esc(s.title) + '</div></div>';
      } else {
        items += '<div class="songitem' + selCls +
          '" data-act="open-song" data-id="' + esc(s.id) + '">' +
          '<div class="t">' + esc(s.title) + '</div>' +
          '<div class="a">' + esc(s.artist || '') +
          (r.where && r.where !== 'title' ? ' <span class="match">· match: ' + esc(r.where) + '</span>' : '') +
          '</div></div>';
      }
    });

    if (!items) {
      items = '<div class="empty-hint">' +
        (App.state.query ? 'No matches.' :
          'No songs yet.<br>Hit <b>＋ New</b> and paste chords straight from Ultimate Guitar.') +
        '</div>';
    }

    var fsBanner = '';
    if (FS && FS.supported && FS.handle && !FS.connected) {
      fsBanner = '<div class="fs-banner" data-act="fs-reconnect" title="The browser needs one click per session to reopen your library file">' +
        '🔗 Reconnect library file</div>';
    }

    return '<div class="sidebar" id="sidebar">' +
      fsBanner +
      '<div class="sidebar-head">' +
        '<div class="brand"><span class="logo">🎸</span> Songbook <span style="margin-left:auto"></span>' +
          '<button class="icon" data-act="toggle-theme" title="Toggle light/dark">◐</button></div>' +
        '<div class="searchbox"><span class="mag">⌕</span>' +
          '<input type="text" id="search-input" placeholder="Search title, artist, lyrics, chords…"></div>' +
        '<div class="sort-row"><span class="lbl">Sort by</span>' +
          '<button class="mini' + (sortBy === 'title' ? ' active' : '') + '" data-act="sort-lib" data-v="title">Song</button>' +
          '<button class="mini' + (sortBy === 'artist' ? ' active' : '') + '" data-act="sort-lib" data-v="artist">Artist</button>' +
          (sortBy === 'artist'
            ? '<button class="mini ico" data-act="artists-collapse-all" title="Collapse all artists">⊟</button>' +
              '<button class="mini ico" data-act="artists-expand-all" title="Expand all artists">⊞</button>'
            : '') +
        '</div>' +
      '</div>' +
      '<div class="sidebar-actions">' +
        '<button class="primary" data-act="new-song">＋ New</button>' +
        '<button data-act="view-setlists">Setlists</button>' +
        '<button data-act="view-fretboard" title="Triads &amp; CAGED explorer">Fretboard</button>' +
        '<button class="icon" data-act="open-settings" title="Settings">⚙</button>' +
      '</div>' +
      '<div class="songlist">' + items + '</div></div>';
  }

  function mainHTML() {
    var st = App.state;
    if (st.view === 'setlists') return setlistsHTML();
    if (st.view === 'setlist') return setlistDetailHTML();
    if (st.view === 'fretboard') return fretboardHTML();
    return songViewHTML();
  }

  function songViewHTML() {
    var song = App.state.songId ? Store.getSong(App.state.songId) : null;
    if (!song) {
      var songs = Store.listSongs();
      if (songs.length) { App.state.songId = songs[0].id; song = songs[0]; }
    }
    if (!song) {
      return '<div class="empty-hint" style="margin-top:15vh">' +
        '<div style="font-size:40px">🎸</div><br>Paste a song from Ultimate Guitar to get started.<br><br>' +
        '<button class="primary" data-act="new-song">＋ New Song</button></div>';
    }

    var parsed = Store.parsedSong(song);
    var tr = song.transpose || 0;
    var flat = songPreferFlat(song, parsed, tr);
    var settings = Store.getSettings();

    var keyName = song.key || parsed.key;
    var keyLabel = '<span class="kx">—</span>';
    if (keyName) {
      var kp = CT.parseChord(keyName);
      if (kp && tr) {
        var minor = /^m(?!aj)/.test(kp.quality);
        var eff = CT.pcName(kp.rootPc + tr, CT.keyPrefersFlat(kp.rootPc + tr, minor)) + (minor ? 'm' : '');
        keyLabel = '<span class="was">' + esc(keyName) + ' →</span> <span class="kx">' + esc(eff) + '</span>';
      } else {
        keyLabel = '<span class="kx">' + esc(keyName) + '</span>';
      }
    }
    var capoChip = song.capo
      ? '<span class="capo-chip" title="Capo fret (edit the song to change)">Capo <b>' +
        esc(song.capo) + '</b></span>'
      : '';

    var performBar = '';
    if (App.state.perform) {
      var sl = Store.getSetlist(App.state.perform.setlistId);
      if (sl) {
        var idx = App.state.perform.idx;
        performBar = '<div class="perform-bar">' +
          '<span class="pos">' + esc(sl.name) + ' — ' + (idx + 1) + ' / ' + sl.songIds.length + '</span>' +
          '<button data-act="perform-prev"' + (idx <= 0 ? ' disabled' : '') + '>‹ Prev</button>' +
          '<button data-act="perform-next"' + (idx >= sl.songIds.length - 1 ? ' disabled' : '') + '>Next ›</button>' +
          '<button data-act="perform-exit">Exit</button></div>';
      }
    }

    var fit = !!settings.fitMode;
    return performBar +
      '<div class="toolbar song-tb">' +
      '<div class="tb-left">' +
      '<button class="icon" data-act="toggle-sidebar" title="Library">☰</button>' +
      '<div class="tgroup keygrp" title="Key — click to change">' +
        '<button data-act="transpose" data-d="-1" title="Down a semitone">−</button>' +
        '<button class="key-chip" data-act="key-menu">Key ' + keyLabel + '</button>' +
        '<button data-act="transpose" data-d="1" title="Up a semitone">＋</button>' +
        (tr ? '<button data-act="transpose" data-d="0" title="Reset to original key">⟲</button>' : '') +
      '</div>' +
      capoChip +
      '</div>' +
      '<div class="tb-center"><div class="titleblock"><div class="t">' + esc(song.title) + '</div>' +
      '<div class="a">' + esc(song.artist || '') + '</div></div></div>' +
      '<div class="tb-right">' +
      '<div class="tgroup" title="' + (fit ? 'Max font size (Fit picks the largest that fits)' : 'Font size') + '"><span class="lbl">A</span>' +
        '<button data-act="font" data-d="-1">−</button>' +
        '<button data-act="font" data-d="1">＋</button>' +
      '</div>' +
      '<button data-act="toggle-fit" class="' + (fit ? 'active' : '') + '" title="Fit the whole song on screen in columns">⛶ Fit</button>' +
      (fit ? '' :
      '<div class="tgroup" title="Autoscroll">' +
        '<button data-act="autoscroll" id="autoscroll-btn">' + (Auto.on ? '⏸' : '▶') + '</button>' +
        '<input type="range" min="8" max="120" step="2" value="' + Auto.speed + '" id="autoscroll-speed" style="width:70px">' +
      '</div>') +
      '<button data-act="toggle-diagrams" class="' + (settings.showDiagrams ? 'active' : '') + '" title="Chord diagrams">◫ Chords</button>' +
      '<button data-act="toggle-triads" class="' + (settings.showTriads ? 'active' : '') + '" title="Triad charts at CAGED positions">△ Triads</button>' +
      '<button data-act="edit-song" title="Edit">✎</button>' +
      '<button data-act="print" class="icon" title="Print">⎙</button>' +
      '<button data-act="delete-song" class="icon danger" title="Delete">🗑</button>' +
      '</div></div>' +
      '<div class="song-scroll' + (fit ? ' fit' : '') + '" id="song-scroll"><div class="song-body">' +
      (settings.showTriads ? triadStripHTML(parsed, tr, flat, song)
        : settings.showDiagrams ? diagramStripHTML(parsed, tr, flat) : '') +
      sectionsHTML(parsed, { transpose: tr, preferFlat: flat }) +
      '</div></div>';
  }

  /* ---------- setlists ---------- */

  function setlistsHTML() {
    var lists = Store.listSetlists();
    var rows = lists.map(function (sl) {
      return '<div class="setlist-row">' +
        '<span class="n" data-act="open-setlist" data-id="' + esc(sl.id) + '">' + esc(sl.name) +
        ' <span style="color:var(--text-dim);font-weight:400;font-size:12px">(' + sl.songIds.length + ' songs)</span></span>' +
        '<button data-act="perform-setlist" data-id="' + esc(sl.id) + '"' + (sl.songIds.length ? '' : ' disabled') + '>▶ Perform</button>' +
        '<button class="icon danger" data-act="delete-setlist" data-id="' + esc(sl.id) + '">🗑</button>' +
        '</div>';
    }).join('') || '<div class="empty-hint">No setlists yet.</div>';
    return '<div class="toolbar">' +
      '<button class="icon" data-act="toggle-sidebar" title="Library">☰</button>' +
      '<div class="titleblock"><div class="t">Setlists</div></div>' +
      '<button data-act="back-to-song">Close</button></div>' +
      '<div class="page-pad">' + rows +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<input type="text" id="new-setlist-name" placeholder="New setlist name…" style="flex:1">' +
      '<button class="primary" data-act="add-setlist">＋ Create</button></div></div>';
  }

  function setlistDetailHTML() {
    var sl = Store.getSetlist(App.state.setlistId);
    if (!sl) { App.state.view = 'setlists'; return setlistsHTML(); }
    var songs = Store.listSongs();
    var byId = {};
    songs.forEach(function (s) { byId[s.id] = s; });
    var rows = sl.songIds.map(function (sid, i) {
      var s = byId[sid];
      if (!s) return '';
      return '<li><span class="t" data-act="open-song" data-id="' + esc(sid) + '" style="cursor:pointer">' +
        (i + 1) + '. ' + esc(s.title) + ' <span class="a">' + esc(s.artist || '') + '</span></span>' +
        '<button class="icon" data-act="setlist-move" data-i="' + i + '" data-d="-1"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="icon" data-act="setlist-move" data-i="' + i + '" data-d="1"' + (i === sl.songIds.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="icon danger" data-act="setlist-remove" data-i="' + i + '">✕</button></li>';
    }).join('') || '<li style="color:var(--text-dim)">Empty — add songs below.</li>';

    var opts = songs.slice().sort(function (a, b) { return a.title.localeCompare(b.title); })
      .map(function (s) {
        return '<option value="' + esc(s.id) + '">' + esc(s.title) + (s.artist ? ' — ' + esc(s.artist) : '') + '</option>';
      }).join('');

    return '<div class="toolbar">' +
      '<button class="icon" data-act="toggle-sidebar" title="Library">☰</button>' +
      '<div class="titleblock"><div class="t">' + esc(sl.name) + '</div></div>' +
      '<button data-act="perform-setlist" data-id="' + esc(sl.id) + '"' + (sl.songIds.length ? '' : ' disabled') + '>▶ Perform</button>' +
      '<button data-act="view-setlists">‹ All setlists</button></div>' +
      '<div class="page-pad"><ul class="setlist-songs">' + rows + '</ul>' +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<select id="setlist-add-select" style="flex:1">' + opts + '</select>' +
      '<button class="primary" data-act="setlist-add">＋ Add song</button></div></div>';
  }

  /* ---------- fretboard explorer ---------- */

  var FB_SETS = {
    '123': { id: '1-3', low: 3 }, '234': { id: '2-4', low: 2 },
    '345': { id: '3-5', low: 1 }, '456': { id: '4-6', low: 0 }
  };
  var FB_QUALITY_NAMES = {
    maj: 'major', min: 'minor', '7': 'dominant 7th', m7: 'minor 7th',
    maj7: 'major 7th', '6': 'sixth', m6: 'minor sixth',
    dim: 'diminished', aug: 'augmented', sus2: 'sus2', sus4: 'sus4'
  };

  function getExplorer() {
    if (!App.state.explorer) {
      App.state.explorer = { rootPc: 0, quality: 'maj', stringSet: 'all',
                             inversion: 'any', labels: 'intervals', caged: false,
                             spell: 'auto' };  // 'auto' | 'sharp' | 'flat'
    }
    return App.state.explorer;
  }

  function fbSeg(act, items, cur, disabled) {
    return items.map(function (it) {
      return '<button class="mini' + (String(cur) === String(it.v) ? ' active' : '') +
        '" data-act="' + act + '" data-v="' + it.v + '"' +
        (disabled ? ' disabled' : '') + '>' + it.l + '</button>';
    }).join('');
  }

  function dispRole(role) { return role.replace('b', '♭').replace('#', '♯'); }

  function fbBodyHTML() {
    if (!TR || !FB) return '<div class="empty-hint">Fretboard modules missing.</div>';
    var ex = getExplorer();
    var maxFret = 15;
    var minorish = ex.quality === 'min' || ex.quality === 'm7' || ex.quality === 'm6';
    // spelling follows the tapped root button (F♯ vs G♭); 'auto' = key convention
    var flat = ex.spell === 'flat' ? true
             : ex.spell === 'sharp' ? false
             : CT.keyPrefersFlat(ex.rootPc, minorish);
    var title = CT.pcName(ex.rootPc, flat) + TR.TRIAD_SUFFIX[ex.quality];
    var setObj = ex.stringSet === 'all' ? null : FB_SETS[ex.stringSet];

    // dots: full tone cloud, or actual voicings when a string set is chosen
    var dots = [];
    var map = TR.fretboardMap(ex.rootPc, ex.quality, { maxFret: maxFret });
    function noteLabel(n) {
      return ex.labels === 'names' ? CT.pcName(n.pc, flat) : dispRole(n.role);
    }
    function noteTitle(n, s) {
      return CT.pcName(n.pc, flat) + ' — ' + dispRole(n.role) +
        ', string ' + (6 - s) + ' fret ' + n.fret;
    }
    var voicings = TR.triadsFor(ex.rootPc, ex.quality, { maxFret: maxFret });
    var charts = voicings;
    if (setObj) {
      charts = voicings.filter(function (v) { return v.stringSet === setObj.id; });
      if (ex.inversion !== 'any') {
        charts = charts.filter(function (v) { return String(v.inversion) === ex.inversion; });
      }
      var seen = {};
      charts.forEach(function (v) {
        v.notes.forEach(function (n) {
          var k = n.string + ':' + n.fret;
          if (seen[k]) return;
          seen[k] = 1;
          dots.push({ string: n.string, fret: n.fret, role: n.role,
                      label: noteLabel(n), title: noteTitle(n, n.string) });
        });
      });
      map.strings.forEach(function (arr, s) {
        if (s >= setObj.low && s <= setObj.low + 2) return;
        arr.forEach(function (n) {
          dots.push({ string: s, fret: n.fret, role: n.role, dim: true,
                      title: noteTitle(n, s) });
        });
      });
    } else {
      map.strings.forEach(function (arr, s) {
        arr.forEach(function (n) {
          dots.push({ string: s, fret: n.fret, role: n.role,
                      label: noteLabel(n), title: noteTitle(n, s) });
        });
      });
    }

    // CAGED region shading (meaningful for the maj/min-rooted qualities)
    var cagedOk = ex.quality === 'maj' || ex.quality === 'min' ||
                  ex.quality === '7' || ex.quality === 'm7' ||
                  ex.quality === 'maj7' || ex.quality === '6' || ex.quality === 'm6';
    var windows = [];
    if (ex.caged && cagedOk) {
      TR.positionsForKey(ex.rootPc, minorish, { maxFret: maxFret })
        .forEach(function (p) {
          p.windows.forEach(function (w) {
            windows.push({ from: w[0], to: w[1], label: p.shape });
          });
        });
    }

    // one button per SPELLING: accidentals split into F♯ and G♭ so the tap
    // itself chooses how everything downstream is spelled
    var rootBtns = '';
    for (var pc = 0; pc < 12; pc++) {
      var sharpN = CT.pcName(pc, false), flatN = CT.pcName(pc, true);
      if (sharpN === flatN) {
        rootBtns += '<button class="mini' + (ex.rootPc === pc ? ' active' : '') +
          '" data-act="fb-root" data-v="' + pc + '">' + esc(sharpN) + '</button>';
      } else {
        rootBtns += '<button class="mini' + (ex.rootPc === pc && !flat ? ' active' : '') +
          '" data-act="fb-root" data-v="' + pc + '" data-spell="sharp">' +
          esc(sharpN.replace('#', '♯')) + '</button>';
        rootBtns += '<button class="mini' + (ex.rootPc === pc && flat ? ' active' : '') +
          '" data-act="fb-root" data-v="' + pc + '" data-spell="flat">' +
          esc(flatN.replace('b', '♭')) + '</button>';
      }
    }
    var controls =
      '<div class="fb-controls">' +
      '<div class="fb-crow"><span class="lbl">Root</span>' + rootBtns + '</div>' +
      '<div class="fb-crow"><span class="lbl">Quality</span>' +
        fbSeg('fb-quality', [
          { v: 'maj', l: 'maj' }, { v: 'min', l: 'min' },
          { v: '7', l: '7' }, { v: 'm7', l: 'm7' }, { v: 'maj7', l: 'maj7' },
          { v: '6', l: '6' }, { v: 'm6', l: 'm6' },
          { v: 'dim', l: 'dim' }, { v: 'aug', l: 'aug' },
          { v: 'sus2', l: 'sus2' }, { v: 'sus4', l: 'sus4' }
        ], ex.quality) + '</div>' +
      '<div class="fb-crow"><span class="lbl">Strings</span>' +
        fbSeg('fb-strings', [
          { v: 'all', l: 'All' }, { v: '123', l: '1-3' }, { v: '234', l: '2-4' },
          { v: '345', l: '3-5' }, { v: '456', l: '4-6' }
        ], ex.stringSet) + '</div>' +
      '<div class="fb-crow"><span class="lbl">Inversion</span>' +
        fbSeg('fb-inv', [
          { v: 'any', l: 'Any' }, { v: '0', l: 'Root' }, { v: '1', l: '1st' }, { v: '2', l: '2nd' }
        ], ex.inversion, !setObj) +
        (!setObj ? '<span class="fb-hint">pick a string set to filter inversions</span>' : '') +
      '</div>' +
      '<div class="fb-crow"><span class="lbl">Show</span>' +
        fbSeg('fb-labels', [{ v: 'intervals', l: 'Intervals' }, { v: 'names', l: 'Notes' }], ex.labels) +
        '<button class="mini' + (ex.caged && cagedOk ? ' active' : '') +
          '" data-act="fb-caged"' + (cagedOk ? '' : ' disabled') +
          ' title="Shade the five CAGED position windows">CAGED overlay</button>' +
      '</div></div>';

    var ariaTitle = CT.pcName(ex.rootPc, flat) + ' ' + FB_QUALITY_NAMES[ex.quality] + ' triads';
    var neck = '<div class="fb-wrap">' + FB.renderNeckSVG({
      fretCount: maxFret, dots: dots, windows: windows, ariaLabel: ariaTitle
    }) + '</div>';

    var chartsHtml = '';
    if (!charts.length && setObj) {
      var invName = ex.inversion === 'any' ? '' :
        (ex.inversion === '0' ? 'root-position ' : ex.inversion === '1' ? '1st-inversion ' : '2nd-inversion ');
      chartsHtml = '<div class="empty-hint">No closed ' + invName + esc(title) +
        ' voicings on strings ' + setObj.id + ' within 15 frets.</div>';
    } else if (charts.length) {
      chartsHtml = '<div class="fb-voicings">' + charts.slice(0, 24).map(function (v) {
        return '<span class="fbv"><span class="dg" data-triad="' + esc(title) +
          '" data-frets="' + v.frets.join(',') + '" title="Tap to enlarge">' +
          DG.renderChordSVG(v, { label: title, showFingers: false, roles: triadRoles(v) }) + '</span>' +
          '<span class="fbv-cap">' + esc(triadInvName(v.inversion)) + '</span></span>';
      }).join('') + '</div>';
    }

    return controls + neck + chartsHtml;
  }

  function fretboardHTML() {
    return '<div class="toolbar">' +
      '<button class="icon" data-act="toggle-sidebar" title="Library">☰</button>' +
      '<div class="titleblock"><div class="t">Fretboard</div>' +
      '<div class="a">Triads &amp; CAGED positions</div></div>' +
      '<button data-act="back-to-song">‹ Back to song</button></div>' +
      '<div class="page-pad page-pad-wide"><div id="fb-body">' + fbBodyHTML() + '</div></div>';
  }

  function updateExplorer() {
    var host = $('#fb-body');
    if (host) host.innerHTML = fbBodyHTML();
    else render();
  }

  /* ---------- modals ---------- */

  function openModal(html, cls) {
    closeModal(true);
    var bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.id = 'modal-backdrop';
    bd.innerHTML = '<div class="modal ' + (cls || '') + '">' + html + '</div>';
    document.body.appendChild(bd);
    bd.addEventListener('mousedown', function (e) {
      if (e.target === bd) closeModal();
    });
    return bd;
  }
  /* App._modalGuard: optional fn returning false to veto a soft close
     (protects an unsaved paste from Esc / stray backdrop clicks). */
  function closeModal(force) {
    var bd = $('#modal-backdrop');
    if (!bd) return;
    if (!force && App._modalGuard && !App._modalGuard()) return;
    App._modalGuard = null;
    bd.remove();
  }

  var KEY_CHOICES = {
    'Major': ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    'Minor': ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']
  };

  function keyOptionsHTML(current) {
    var html = '<option value="">Auto</option>';
    var found = !current;
    for (var group in KEY_CHOICES) {
      if (!KEY_CHOICES.hasOwnProperty(group)) continue;
      html += '<optgroup label="' + group + '">';
      KEY_CHOICES[group].forEach(function (k) {
        var sel = k === current ? ' selected' : '';
        if (sel) found = true;
        html += '<option value="' + k + '"' + sel + '>' + k + '</option>';
      });
      html += '</optgroup>';
    }
    if (!found) {
      html = '<option value="' + esc(current) + '" selected>' + esc(current) + '</option>' + html;
    }
    return html;
  }

  function ugSearchLinks(title, artist) {
    var q = (title + ' ' + artist).trim();
    if (!q) return '';
    var ug = 'https://www.ultimate-guitar.com/search.php?search_type=title&value=' + encodeURIComponent(q);
    return 'Need the chords? <a href="' + esc(ug) + '" target="_blank" rel="noopener">Search Ultimate Guitar for “' +
      esc(q) + '”</a>, open the CHORDS result, tap inside the tab, select all (Ctrl/Cmd-A over the tab block) and copy — then paste here.';
  }

  function importModal(existing) {
    var isEdit = !!existing;
    var bd = openModal(
      '<div class="modal-head"><h2>' + (isEdit ? 'Edit song' : 'Import / New song') + '</h2>' +
      '<button class="icon" data-act="close-modal">✕</button></div>' +
      '<div class="modal-body"><div class="import-grid">' +
      '<div class="col">' +
        '<div class="import-fields">' +
          '<div class="f-title"><label>Title</label><input type="text" id="imp-title" value="' + esc(isEdit ? existing.title : '') + '"></div>' +
          '<div class="f-artist"><label>Artist</label><input type="text" id="imp-artist" value="' + esc(isEdit ? existing.artist : '') + '"></div>' +
          '<div class="f-key"><label>Key</label><select id="imp-key">' + keyOptionsHTML(isEdit ? existing.key : '') + '</select></div>' +
          '<div class="f-capo"><label>Capo</label><input type="number" id="imp-capo" min="0" max="12" value="' + esc(isEdit && existing.capo != null ? existing.capo : '') + '"></div>' +
        '</div>' +
        '<textarea class="paste-area" id="imp-raw" placeholder="Paste chords &amp; lyrics here — straight from Ultimate Guitar.\n\n[Intro]\nC  G  Am  F\n\n[Verse 1]\nC               G\nPaste any chords-over-lyrics text…\n\nSection headers like [Verse], [Chorus], Chorus:, VERSE 1\nare all recognized and color-highlighted." spellcheck="false">' + esc(isEdit ? existing.raw : '') + '</textarea>' +
        '<div class="ug-hint" id="ug-hint">' + ugSearchLinks(isEdit ? existing.title : '', isEdit ? existing.artist : '') + '</div>' +
      '</div>' +
      '<div class="col">' +
        '<div class="preview-meta" id="imp-meta"></div>' +
        '<div class="import-preview" id="imp-preview"></div>' +
      '</div>' +
      '</div></div>' +
      '<div class="modal-foot">' +
      '<button data-act="close-modal">Cancel</button>' +
      '<button class="primary" id="imp-save">' + (isEdit ? 'Save changes' : 'Add to library') + '</button></div>');

    var rawEl = $('#imp-raw', bd), titleEl = $('#imp-title', bd),
        artistEl = $('#imp-artist', bd), capoEl = $('#imp-capo', bd),
        keyEl = $('#imp-key', bd);
    var userTouched = { title: isEdit, artist: isEdit, capo: isEdit };
    var initialRaw = rawEl.value;
    App._modalGuard = function () {
      if (rawEl.value === initialRaw) return true;
      return confirm('Discard your changes to this song?');
    };

    function refresh() {
      var raw = rawEl.value;
      var parsed = Parser.parseSong(raw, {});
      // autofill fields the user hasn't touched
      if (!userTouched.title && parsed.title && !titleEl.value) titleEl.value = parsed.title;
      if (!userTouched.artist && parsed.artist && !artistEl.value) artistEl.value = parsed.artist;
      if (!userTouched.capo && parsed.capo != null && capoEl.value === '') capoEl.value = parsed.capo;

      // the Auto option shows what auto-detection would pick
      for (var oi = 0; oi < keyEl.options.length; oi++) {
        if (keyEl.options[oi].value === '') {
          keyEl.options[oi].textContent = 'Auto' + (parsed.key ? ' (' + parsed.key + ')' : '');
          break;
        }
      }

      var meta = [];
      if (keyEl.value) meta.push('Key: <b>' + esc(keyEl.value) + '</b>');
      else if (parsed.key) meta.push('Key: <b>' + esc(parsed.key) + '</b> (detected)');
      if (parsed.capo != null) meta.push('Capo: <b>' + parsed.capo + '</b>');
      meta.push(parsed.sections.length + ' section' + (parsed.sections.length === 1 ? '' : 's'));
      meta.push(parsed.chords.length + ' chord' + (parsed.chords.length === 1 ? '' : 's') +
        (parsed.chords.length ? ' (' + esc(parsed.chords.slice(0, 10).join(' ')) + (parsed.chords.length > 10 ? '…' : '') + ')' : ''));
      $('#imp-meta', bd).innerHTML = meta.join(' &nbsp;·&nbsp; ');
      $('#imp-preview', bd).innerHTML = raw.trim()
        ? sectionsHTML(parsed, { clickableChords: false })
        : '<div class="empty-hint">Live preview appears here as you paste.</div>';
      $('#ug-hint', bd).innerHTML = ugSearchLinks(titleEl.value, artistEl.value);
    }

    rawEl.addEventListener('input', debounce(refresh, 200));
    keyEl.addEventListener('change', refresh);
    titleEl.addEventListener('input', function () { userTouched.title = true; $('#ug-hint', bd).innerHTML = ugSearchLinks(titleEl.value, artistEl.value); });
    artistEl.addEventListener('input', function () { userTouched.artist = true; $('#ug-hint', bd).innerHTML = ugSearchLinks(titleEl.value, artistEl.value); });
    capoEl.addEventListener('input', function () { userTouched.capo = true; });

    $('#imp-save', bd).addEventListener('click', function () {
      var raw = rawEl.value;
      if (!raw.trim()) { toast('Paste some chords or lyrics first'); return; }
      var parsed = Parser.parseSong(raw, {});
      var fields = {
        title: titleEl.value.trim() || parsed.title || 'Untitled',
        artist: artistEl.value.trim() || parsed.artist || '',
        capo: capoEl.value === '' ? (parsed.capo != null ? parsed.capo : null) : parseInt(capoEl.value, 10),
        key: keyEl.value || parsed.key || '',
        raw: raw
      };
      var song;
      if (isEdit) song = Store.updateSong(existing.id, fields);
      else song = Store.addSong(fields);
      App.indexDirty = true;
      App.state.view = 'song';
      App.state.songId = song.id;
      closeModal(true);
      render();
      toast(isEdit ? 'Saved' : 'Added “' + fields.title + '”');
    });

    refresh();
    if (!isEdit) rawEl.focus();
  }

  /* ---------- substitutions modal ----------
     One modal for every chord click: the chart you clicked on top, and below
     it substitution candidates voiced near the same position ("what else
     could I play right here?"). anchor:
       { kind: 'triad'|'chord', frets: [6]|null,
         position: posObj|null, posLabel: str|null, stringSetPref: id|null } */

  function fretCentroid(frets) {
    var sum = 0, n = 0;
    for (var i = 0; i < frets.length; i++) {
      if (frets[i] >= 0) { sum += frets[i]; n++; }
    }
    return n ? sum / n : 0;
  }

  function nearestVoicingIdx(voicings, targetFrets) {
    var target = fretCentroid(targetFrets), best = 0, bd = Infinity;
    voicings.forEach(function (v, i) {
      var d = Math.abs(fretCentroid(v.frets) - target);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /* key + most-frequent-next-chord context for the subs engine */
  function chordCtx(dispSym) {
    if (App.state.view === 'fretboard') {
      var ex = getExplorer();
      return { keyPc: ex.rootPc, minor: ex.quality === 'min' || ex.quality === 'm7' };
    }
    var song = App.state.songId ? Store.getSong(App.state.songId) : null;
    if (!song) return {};
    var parsed = Store.parsedSong(song);
    var tr = song.transpose || 0;
    var flat = songPreferFlat(song, parsed, tr);
    var seq = [];
    parsed.sections.forEach(function (sec) {
      sec.lines.forEach(function (line) {
        (line.chords || []).forEach(function (c) { seq.push(dispChord(c.sym, tr, flat)); });
      });
    });
    var key = effectiveKey(song, parsed) || CT.detectKey(seq);
    var p0 = CT.parseChord(dispSym);
    var target = p0 ? p0.rootPc + '|' + p0.quality : null;
    var counts = {}, bestNext = null, bestN = 0;
    for (var i = 0; i + 1 < seq.length; i++) {
      var pi = CT.parseChord(seq[i]);
      if (!pi || (pi.rootPc + '|' + pi.quality) !== target) continue;
      var pn = CT.parseChord(seq[i + 1]);
      if (!pn || (pn.rootPc + '|' + pn.quality) === target) continue;
      var k = pn.rootPc + '|' + pn.quality;
      counts[k] = (counts[k] || 0) + 1;
      if (counts[k] > bestN) { bestN = counts[k]; bestNext = seq[i + 1]; }
    }
    return { keyPc: key ? key.pc : null, minor: key ? key.minor : false,
             nextSym: bestNext,
             preferFlat: key ? CT.keyPrefersFlat(key.pc, key.minor) : flat };
  }

  function adhocWindow(frets) {
    var f = frets.filter(function (x) { return x >= 0; });
    if (!f.length) return null;
    var lo = Math.min.apply(null, f), hi = Math.max.apply(null, f);
    var w = [Math.max(0, lo - 2), Math.min(15, hi + 2)];
    return { window: w, windows: [w] };
  }

  function stringSetOfFrets(frets) {
    for (var s = 0; s < 6; s++) {
      if (frets[s] >= 0) return { 3: '1-3', 2: '2-4', 1: '3-5', 0: '4-6' }[s] || '1-3';
    }
    return '1-3';
  }

  /* anchor for a clicked triad chart: the strip's selected position, or an
     ad-hoc window around the clicked frets in "Any" mode / the explorer */
  function triadAnchorFor(frets) {
    var settings = Store.getSettings();
    if (App.state.view === 'fretboard') {
      var ex = getExplorer();
      var setPref = ex.stringSet !== 'all' && FB_SETS[ex.stringSet]
        ? FB_SETS[ex.stringSet].id
        : (frets ? stringSetOfFrets(frets) : '1-3');
      return { position: frets ? adhocWindow(frets) : null,
               posLabel: '', stringSetPref: setPref };
    }
    var setPref2 = TRIAD_SET_IDS.indexOf(settings.triadStrings) !== -1
      ? settings.triadStrings : '1-3';
    var song = App.state.songId ? Store.getSong(App.state.songId) : null;
    var pos = String(settings.triadPos || 'any');
    if (song && pos !== 'any') {
      var parsed = Store.parsedSong(song);
      var key = effectiveKey(song, parsed);
      if (key) {
        var p = TR.positionsForKey(key.pc, key.minor)[parseInt(pos, 10) - 1];
        if (p) {
          return { position: p, posLabel: triadPosLabel(p), stringSetPref: setPref2 };
        }
      }
    }
    return { position: frets ? adhocWindow(frets) : null,
             posLabel: '', stringSetPref: setPref2 };
  }

  function subsModal(sym, anchor, opts) {
    opts = opts || {};
    anchor = anchor || { kind: 'chord', frets: null };
    var ctx = opts.ctx || {};
    var stack = opts.stack || [];
    var settings = Store.getSettings();
    var parsed = CT.parseChord(sym);

    // ---- top chart (the voicing that was clicked) ----
    var topHtml = null, topFrets = null, voicings = null, idx = 0;
    if (anchor.kind === 'triad' && TR) {
      var t = TR.reduceTriad(sym);
      var v = null;
      if (t) {
        if (anchor.frets) {
          var fkey = anchor.frets.join(',');
          v = TR.triadsFor(t.rootPc, t.quality).filter(function (x) {
            return x.frets.join(',') === fkey;
          })[0] || null;
        }
        if (!v) {
          var pk0 = anchor.position
            ? TR.voicingAtPosition(t.rootPc, t.quality, anchor.position,
                { stringSetPref: anchor.stringSetPref })
            : TR.voicingAnywhere(t.rootPc, t.quality,
                { stringSetPref: anchor.stringSetPref });
          v = pk0 && pk0.best;
        }
      }
      if (v) {
        topFrets = v.frets;
        // default viewBox scaled up by CSS, so the name/markers keep the same
        // proportions as every other chart in the app
        topHtml = DG.renderChordSVG(v, { label: sym,
            showFingers: false, roles: triadRoles(v) }) +
          '<div class="vp-cap">' + esc(triadInvName(v.inversion)) + '</div>';
      }
    } else {
      voicings = V.getVoicings(sym, 8);
      if (voicings.length) {
        idx = anchor.frets ? nearestVoicingIdx(voicings, anchor.frets) : 0;
        topFrets = voicings[idx].frets;
      }
    }
    if (!topHtml && !(voicings && voicings.length)) {
      toast('No diagram available for ' + sym);
      return;
    }

    // ---- substitution candidates, voiced near the anchor ----
    var subs = window.Subs ? window.Subs.substitutionsFor(sym, ctx) : [];
    var shown = subs.slice(0, 6);

    function subChart(item) {
      if (anchor.kind === 'triad' && TR) {
        var st = TR.reduceTriad(item.sym);
        if (!st) return null;
        var pk = anchor.position
          ? TR.voicingAtPosition(st.rootPc, st.quality, anchor.position,
              { stringSetPref: anchor.stringSetPref, bassPc: st.bassPc })
          : TR.voicingAnywhere(st.rootPc, st.quality,
              { stringSetPref: anchor.stringSetPref, bassPc: st.bassPc });
        if (!pk || !pk.best) return null;
        var flag = pk.outOfPosition ? '<span class="ts-flag out">off-pos</span>'
                 : pk.relaxed ? '<span class="ts-flag">±' + pk.relaxed + 'fr</span>' : '';
        return { html: DG.renderChordSVG(pk.best, { label: '', showFingers: false,
                   roles: triadRoles(pk.best) }), flag: flag };
      }
      var vs = V.getVoicings(item.sym, 8);
      if (!vs.length) return null;
      var j = topFrets ? nearestVoicingIdx(vs, topFrets) : 0;
      return { html: DG.renderChordSVG(vs[j], { label: '',
                 showFingers: settings.showFingers }), flag: '' };
    }

    var subsHtml;
    if (!shown.length) {
      subsHtml = '<div class="sub-empty">no substitutions for this chord</div>';
    } else {
      var parts = ['<div class="sub-head">Instead, try</div><div class="sub-items">'];
      shown.forEach(function (item) {
        var c = subChart(item);
        parts.push('<button class="sub-item" data-sub="' + esc(item.sym) + '">' +
          '<span class="sub-dg">' + (c ? c.html : '') + '</span>' +
          '<span class="sub-txt"><span class="sub-sym">' + esc(item.sym) +
          (item.roman ? ' <i class="sub-roman">' + esc(item.roman) + '</i>' : '') +
          (c ? c.flag : '') + '</span>' +
          '<span class="sub-why">' + esc(item.reason) + '</span></span></button>');
      });
      parts.push('</div>');
      if (subs.length > shown.length) {
        parts.push('<div class="sub-more">+' + (subs.length - shown.length) + ' more: ' +
          esc(subs.slice(6).map(function (s) { return s.sym; }).join(', ')) + '</div>');
      }
      subsHtml = parts.join('');
    }

    var keyHtml = ctx.keyPc != null
      ? '<span class="ts-lab">Key</span> <span class="sub-key">' +
        esc(CT.pcName(ctx.keyPc, CT.keyPrefersFlat(ctx.keyPc, ctx.minor)) + (ctx.minor ? 'm' : '')) +
        '</span>'
      : '<span class="ts-lab">Substitutions</span>';
    var bassNote = parsed && parsed.bass
      ? '<div class="sub-note">substitutions ignore the /' + esc(parsed.bass) + ' bass</div>' : '';

    var bd = openModal(
      '<div class="modal-head">' +
      (stack.length
        ? '<button class="icon" id="sub-back" title="Back to ' + esc(stack[stack.length - 1].sym) + '">‹</button>'
        : '') +
      '<h2>' + keyHtml + '</h2>' +
      '<button class="icon" data-act="close-modal">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="voicing-big" id="voicing-big"></div>' +
      (anchor.kind !== 'triad' && voicings && voicings.length > 1
        ? '<div class="voicing-pager">' +
          '<button class="icon" id="vp-prev">‹</button>' +
          '<span class="vp-num" id="vp-num"></span>' +
          '<button class="icon" id="vp-next">›</button></div>'
        : '') +
      bassNote + subsHtml + '</div>', 'subs');

    if (anchor.kind === 'triad' || !voicings || !voicings.length) {
      $('#voicing-big', bd).innerHTML = topHtml || '';
    } else {
      var drawTop = function () {
        $('#voicing-big', bd).innerHTML = DG.renderChordSVG(voicings[idx],
          { label: sym, showFingers: settings.showFingers });
        topFrets = voicings[idx].frets;
        var n = $('#vp-num', bd);
        if (n) {
          n.textContent = (idx + 1) + ' / ' + voicings.length;
          $('#vp-prev', bd).disabled = idx === 0;
          $('#vp-next', bd).disabled = idx === voicings.length - 1;
        }
      };
      var pb = $('#vp-prev', bd), nb = $('#vp-next', bd);
      if (pb) pb.addEventListener('click', function () { if (idx > 0) { idx--; drawTop(); } });
      if (nb) nb.addEventListener('click', function () { if (idx < voicings.length - 1) { idx++; drawTop(); } });
      drawTop();
    }

    bd.addEventListener('click', function (e) {
      var si = e.target.closest ? e.target.closest('.sub-item[data-sub]') : null;
      if (si) {
        subsModal(si.getAttribute('data-sub'),
          { kind: anchor.kind,
            frets: anchor.kind === 'chord' ? topFrets : null,  // triad: let the position pick
            position: anchor.position, posLabel: anchor.posLabel,
            stringSetPref: anchor.stringSetPref },
          { ctx: ctx, stack: stack.concat([{ sym: sym, frets: topFrets }]) });
        return;
      }
      if (e.target.closest && e.target.closest('#sub-back')) {
        var prev = stack[stack.length - 1];
        subsModal(prev.sym,
          { kind: anchor.kind, frets: prev.frets, position: anchor.position,
            posLabel: anchor.posLabel, stringSetPref: anchor.stringSetPref },
          { ctx: ctx, stack: stack.slice(0, -1) });
      }
    });
  }

  function settingsModal() {
    var s = Store.getSettings();
    var bd = openModal(
      '<div class="modal-head"><h2>Settings</h2><button class="icon" data-act="close-modal">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="set-row"><span class="lab">Theme</span>' +
        '<button id="set-theme-dark" class="' + (s.theme === 'dark' ? 'active' : '') + '">Dark</button>' +
        '<button id="set-theme-light" class="' + (s.theme === 'light' ? 'active' : '') + '">Light</button></div>' +
      '<div class="set-row"><span class="lab">Show chord diagrams</span>' +
        '<input type="checkbox" id="set-diagrams"' + (s.showDiagrams ? ' checked' : '') + '></div>' +
      '<div class="set-row"><span class="lab">Show finger numbers on diagrams</span>' +
        '<input type="checkbox" id="set-fingers"' + (s.showFingers ? ' checked' : '') + '></div>' +
      '<div class="set-row"><span class="lab">Library file <div class="sub" id="fs-status">' + fsStatusText() + '</div></span>' +
        (FS && FS.supported
          ? (FS.handle
              ? (FS.connected ? '' : '<button id="set-fs-reconnect">Reconnect</button>') +
                '<button id="set-fs-unlink" class="danger">Unlink</button>'
              : '<button id="set-fs-link" class="primary">Link file…</button>')
          : '') +
      '</div>' +
      '<div class="set-row"><span class="lab">Backup <div class="sub">Move to another device or browser</div></span>' +
        '<button id="set-export">Export JSON</button>' +
        '<button id="set-import">Import JSON</button>' +
        '<input type="file" id="set-import-file" accept=".json,application/json" style="display:none"></div>' +
      '<div class="set-row"><span class="lab" style="color:var(--danger)">Erase everything</span>' +
        '<button class="danger" id="set-wipe">Erase</button></div>' +
      '</div>', 'small');

    $('#set-theme-dark', bd).addEventListener('click', function () { setTheme('dark'); settingsModal(); });
    $('#set-theme-light', bd).addEventListener('click', function () { setTheme('light'); settingsModal(); });
    $('#set-diagrams', bd).addEventListener('change', function (e) {
      Store.setSetting('showDiagrams', e.target.checked); render();
    });
    $('#set-fingers', bd).addEventListener('change', function (e) {
      Store.setSetting('showFingers', e.target.checked); render();
    });
    $('#set-export', bd).addEventListener('click', function () {
      var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'songbook-export.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $('#set-import', bd).addEventListener('click', function () { $('#set-import-file', bd).click(); });
    $('#set-import-file', bd).addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var n = Store.importJSON(String(reader.result), 'merge');
          App.indexDirty = true;
          closeModal(); render();
          toast('Imported ' + n + ' songs');
        } catch (err) { toast('Import failed: ' + err.message); }
      };
      reader.readAsText(f);
    });
    var fsLinkBtn = $('#set-fs-link', bd);
    if (fsLinkBtn) fsLinkBtn.addEventListener('click', fsLink);
    var fsReBtn = $('#set-fs-reconnect', bd);
    if (fsReBtn) fsReBtn.addEventListener('click', fsReconnect);
    var fsUnBtn = $('#set-fs-unlink', bd);
    if (fsUnBtn) fsUnBtn.addEventListener('click', fsUnlink);

    $('#set-wipe', bd).addEventListener('click', function () {
      if (confirm('Erase ALL songs, setlists and settings? This cannot be undone.')) {
        localStorage.removeItem('songbook.v1');
        location.reload();
      }
    });
  }

  function setTheme(t) {
    Store.setSetting('theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }

  /* ---------- library file sync ---------- */

  function fsStatusText() {
    if (!FS || !FS.supported) {
      return 'Not available in this browser — use Export JSON for backups';
    }
    if (!FS.handle) return 'Not linked. Link a file so a browser-data wipe can never lose your songs.';
    if (!FS.connected) return 'Linked to “' + esc(FS.fileName()) + '” — click Reconnect to resume syncing';
    return 'Auto-saving to “' + esc(FS.fileName()) + '”' +
      (FS.lastSaved ? ' · last saved ' + new Date(FS.lastSaved).toLocaleTimeString() : '');
  }

  function fsAfterSync(result) {
    if (result === 'loaded-file') {
      App.indexDirty = true;
      render();
      toast('Library loaded from file');
    } else if (result === 'wrote-file') {
      render();
      toast('Library file is up to date');
    } else if (result === 'denied') {
      toast('Permission denied — library file not connected');
    }
    var st = $('#fs-status');
    if (st) st.innerHTML = fsStatusText();
  }

  function fsLink() {
    FS.linkNew().then(fsAfterSync).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      toast('Could not link file: ' + (e && e.message || e));
    });
  }
  function fsReconnect() {
    FS.reconnect().then(fsAfterSync).catch(function (e) {
      toast('Reconnect failed: ' + (e && e.message || e));
    });
  }
  function fsUnlink() {
    if (!confirm('Stop syncing to the library file? (The file itself is kept; the app falls back to browser storage only.)')) return;
    FS.unlink().then(function () { render(); settingsModal(); });
  }

  /* ---------- key picker popover ---------- */

  function closeKeyMenu() {
    var m = $('#key-menu');
    if (m) m.remove();
  }

  function openKeyMenu(anchor) {
    closeKeyMenu();
    var song = Store.getSong(App.state.songId);
    if (!song) return;
    var parsed = Store.parsedSong(song);
    var keyName = song.key || parsed.key;
    var kp = keyName ? CT.parseChord(keyName) : null;
    var tr = song.transpose || 0;

    var menu = document.createElement('div');
    menu.id = 'key-menu';
    menu.className = 'key-menu';

    if (kp) {
      /* pick a target key: sets transpose by the shortest path */
      var minor = /^m(?!aj)/.test(kp.quality);
      var curPc = ((kp.rootPc + tr) % 12 + 12) % 12;
      var html = '<div class="km-title">Play in key…</div><div class="km-grid">';
      for (var pc = 0; pc < 12; pc++) {
        var nm = CT.pcName(pc, CT.keyPrefersFlat(pc, minor)) + (minor ? 'm' : '');
        var cls = pc === curPc ? ' cur' : (pc === kp.rootPc ? ' orig' : '');
        html += '<button data-pc="' + pc + '" class="km-key' + cls + '">' + esc(nm) +
          (pc === kp.rootPc ? '<span class="km-o">original</span>' : '') + '</button>';
      }
      html += '</div>';
      menu.innerHTML = html;
      menu.addEventListener('click', function (e) {
        var b = e.target.closest('.km-key');
        if (!b) return;
        var d = ((parseInt(b.getAttribute('data-pc'), 10) - kp.rootPc) % 12 + 12) % 12;
        if (d > 6) d -= 12;
        Store.updateSong(song.id, { transpose: d });
        closeKeyMenu();
        render();
      });
    } else {
      /* no key known yet: choosing one SETS the song's key */
      var html2 = '<div class="km-title">Set song key…</div>';
      ['Major', 'Minor'].forEach(function (group) {
        html2 += '<div class="km-sub">' + group + '</div><div class="km-grid">';
        KEY_CHOICES[group].forEach(function (k) {
          html2 += '<button data-key="' + esc(k) + '" class="km-key">' + esc(k) + '</button>';
        });
        html2 += '</div>';
      });
      menu.innerHTML = html2;
      menu.addEventListener('click', function (e) {
        var b = e.target.closest('.km-key');
        if (!b) return;
        Store.updateSong(song.id, { key: b.getAttribute('data-key') });
        closeKeyMenu();
        render();
        toast('Key set to ' + b.getAttribute('data-key'));
      });
    }

    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = (r.bottom + 6) + 'px';

    setTimeout(function () {
      document.addEventListener('mousedown', function dismiss(e) {
        // let the anchor chip's own click handle the toggle
        if (e.target.closest('#key-menu') || e.target.closest('[data-act="key-menu"]')) return;
        closeKeyMenu();
        document.removeEventListener('mousedown', dismiss);
      });
    }, 0);
  }

  /* ---------- autoscroll ---------- */

  var Auto = { on: false, speed: 30, raf: null, last: 0, acc: 0 };

  function autoTick(ts) {
    if (!Auto.on) return;
    var el = $('#song-scroll');
    if (!el) { autoStop(); return; }
    if (Auto.last) {
      Auto.acc += Auto.speed * (ts - Auto.last) / 1000;
      var px = Math.floor(Auto.acc);
      if (px >= 1) { el.scrollTop += px; Auto.acc -= px; }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { autoStop(); return; }
    }
    Auto.last = ts;
    Auto.raf = requestAnimationFrame(autoTick);
  }
  function autoStart() {
    Auto.on = true; Auto.last = 0; Auto.acc = 0;
    Auto.raf = requestAnimationFrame(autoTick);
    var b = $('#autoscroll-btn');
    if (b) b.textContent = '⏸';
  }
  function autoStop() {
    Auto.on = false;
    if (Auto.raf) cancelAnimationFrame(Auto.raf);
    var b = $('#autoscroll-btn');
    if (b) b.textContent = '▶';
  }

  /* ---------- routing ---------- */

  function syncHash() {
    var st = App.state, h = '';
    if (st.view === 'song' && st.songId) h = '#song/' + st.songId;
    else if (st.view === 'setlists') h = '#setlists';
    else if (st.view === 'setlist' && st.setlistId) h = '#setlist/' + st.setlistId;
    else if (st.view === 'fretboard') h = '#fretboard';
    if (h && location.hash !== h) {
      try { history.replaceState(null, '', h); } catch (e) { /* file:// quirk */ }
    } else if (!h && location.hash) {
      // state with no hash form (e.g. empty-library song view): clear the old
      // hash so a reload doesn't resurrect the previous view
      try { history.replaceState(null, '', location.pathname + location.search); }
      catch (e) { /* file:// quirk */ }
    }
  }
  function readHash() {
    var h = location.hash.slice(1);
    if (!h) return;
    var parts = h.split('/');
    if (parts[0] === 'song' && parts[1] && Store.getSong(parts[1])) {
      App.state.view = 'song'; App.state.songId = parts[1];
    } else if (parts[0] === 'setlists') {
      App.state.view = 'setlists';
    } else if (parts[0] === 'setlist' && parts[1] && Store.getSetlist(parts[1])) {
      App.state.view = 'setlist'; App.state.setlistId = parts[1];
    } else if (parts[0] === 'fretboard') {
      App.state.view = 'fretboard';
    }
  }

  /* ---------- actions (event delegation) ---------- */

  function openSong(id) {
    autoStop();
    App.state.view = 'song';
    App.state.songId = id;
    App.state.sidebarOpen = false;
    render();
    var sc = $('#song-scroll');
    if (sc) sc.scrollTop = 0;
  }

  document.addEventListener('click', function (e) {
    var t = e.target;

    // triad chart taps (triad strip + explorer voicing charts) -> subs modal
    var triadEl = t.closest ? t.closest('[data-triad]') : null;
    if (triadEl) {
      var tsym = triadEl.getAttribute('data-triad');
      var tf = (triadEl.getAttribute('data-frets') || '').split(',').map(Number);
      if (tf.length !== 6 || tf.some(isNaN)) tf = null;
      var ta = triadAnchorFor(tf);
      subsModal(tsym,
        { kind: 'triad', frets: tf, position: ta.position,
          posLabel: ta.posLabel, stringSetPref: ta.stringSetPref },
        { ctx: chordCtx(tsym) });
      return;
    }

    // chord taps (diagram strip + inline chords) -> subs modal
    var chordEl = t.closest ? t.closest('[data-chord]') : null;
    if (chordEl && !chordEl.closest('#imp-preview')) {
      var csym = chordEl.getAttribute('data-chord');
      var cf = (chordEl.getAttribute('data-frets') || '').split(',').map(Number);
      if (cf.length !== 6 || cf.some(isNaN)) cf = null;
      subsModal(csym, { kind: 'chord', frets: cf }, { ctx: chordCtx(csym) });
      return;
    }

    var actEl = t.closest ? t.closest('[data-act]') : null;
    if (!actEl) return;
    var act = actEl.getAttribute('data-act');
    var id = actEl.getAttribute('data-id');
    var st = App.state;

    switch (act) {
      case 'open-song':
        if (st.perform) st.perform = null;
        openSong(id);
        break;
      case 'new-song': importModal(null); break;
      case 'edit-song': importModal(Store.getSong(st.songId)); break;
      case 'delete-song': {
        var song = Store.getSong(st.songId);
        if (song && confirm('Delete “' + song.title + '”?')) {
          Store.deleteSong(song.id);
          App.indexDirty = true;
          st.songId = null;
          if (st.perform) {
            var perfSl = Store.getSetlist(st.perform.setlistId);
            if (!perfSl || !perfSl.songIds.length) {
              st.perform = null;
            } else {
              st.perform.idx = Math.min(st.perform.idx, perfSl.songIds.length - 1);
              st.songId = perfSl.songIds[st.perform.idx];
            }
          }
          render();
          toast('Deleted');
        }
        break;
      }
      case 'transpose': {
        var d = parseInt(actEl.getAttribute('data-d'), 10);
        var s2 = Store.getSong(st.songId);
        if (s2) {
          Store.updateSong(s2.id, { transpose: d === 0 ? 0 : ((s2.transpose || 0) + d) });
          render();
        }
        break;
      }
      case 'font': {
        var df = parseInt(actEl.getAttribute('data-d'), 10);
        var fs = Math.min(28, Math.max(11, Store.getSettings().fontSize + df));
        Store.setSetting('fontSize', fs);
        applyFontSize();
        scheduleFit();
        break;
      }
      case 'toggle-fit':
        Store.setSetting('fitMode', !Store.getSettings().fitMode);
        autoStop();
        render();
        break;
      case 'autoscroll': Auto.on ? autoStop() : autoStart(); break;
      case 'toggle-diagrams':
        Store.setSetting('showDiagrams', !Store.getSettings().showDiagrams);
        render();
        break;
      case 'toggle-triads':
        Store.setSetting('showTriads', !Store.getSettings().showTriads);
        render();
        break;
      case 'triad-pos':
        Store.setSetting('triadPos', actEl.getAttribute('data-v'));
        updateTriadStrip();
        break;
      case 'triad-strings':
        Store.setSetting('triadStrings', actEl.getAttribute('data-v'));
        updateTriadStrip();
        break;
      case 'view-fretboard': {
        var ex0 = getExplorer();
        var fbRoot = actEl.getAttribute('data-root');
        var fbQual = actEl.getAttribute('data-quality');
        if (fbRoot) ex0.rootPc = ((parseInt(fbRoot, 10) % 12) + 12) % 12;
        if (fbQual) ex0.quality = fbQual;
        st.view = 'fretboard';
        st.perform = null;
        st.sidebarOpen = false;   // close the mobile drawer
        autoStop();
        render();
        break;
      }
      case 'fb-root': {
        var exR = getExplorer();
        exR.rootPc = parseInt(actEl.getAttribute('data-v'), 10);
        exR.spell = actEl.getAttribute('data-spell') || 'auto';
        updateExplorer();
        break;
      }
      case 'fb-quality': {
        var ex1 = getExplorer();
        ex1.quality = actEl.getAttribute('data-v');
        updateExplorer();
        break;
      }
      case 'fb-strings': {
        var ex2 = getExplorer();
        ex2.stringSet = actEl.getAttribute('data-v');
        if (ex2.stringSet === 'all') ex2.inversion = 'any';
        updateExplorer();
        break;
      }
      case 'fb-inv':
        getExplorer().inversion = actEl.getAttribute('data-v');
        updateExplorer();
        break;
      case 'fb-labels':
        getExplorer().labels = actEl.getAttribute('data-v');
        updateExplorer();
        break;
      case 'fb-caged':
        getExplorer().caged = !getExplorer().caged;
        updateExplorer();
        break;
      case 'toggle-sidebar':
        if (window.innerWidth <= 760) {
          // phone/tablet: slide-in drawer (ephemeral)
          st.sidebarOpen = !st.sidebarOpen;
          $('#sidebar').classList.toggle('open', st.sidebarOpen);
        } else {
          // desktop: collapse the panel (persisted)
          var sbCol = !Store.getSettings().sidebarCollapsed;
          Store.setSetting('sidebarCollapsed', sbCol);
          $('#sidebar').classList.toggle('collapsed', sbCol);
          scheduleFit();
        }
        break;
      case 'toggle-theme':
        setTheme(Store.getSettings().theme === 'dark' ? 'light' : 'dark');
        break;
      case 'sort-lib':
        Store.setSetting('librarySort', actEl.getAttribute('data-v'));
        render();
        break;
      case 'toggle-artist': {
        var art = actEl.getAttribute('data-artist');
        var col = Store.getSettings().collapsedArtists || {};
        if (col[art]) delete col[art]; else col[art] = 1;
        Store.setSetting('collapsedArtists', col);
        var listEl = $('.songlist');
        var keepScroll = listEl ? listEl.scrollTop : 0;
        render();
        listEl = $('.songlist');
        if (listEl) listEl.scrollTop = keepScroll;
        break;
      }
      case 'artists-collapse-all': {
        var allCol = {};
        Store.listSongs().forEach(function (s) { allCol[s.artist || 'Unknown artist'] = 1; });
        Store.setSetting('collapsedArtists', allCol);
        render();
        break;
      }
      case 'artists-expand-all':
        Store.setSetting('collapsedArtists', {});
        render();
        break;
      case 'open-settings': settingsModal(); break;
      case 'fs-reconnect': fsReconnect(); break;
      case 'key-menu':
        if ($('#key-menu')) closeKeyMenu();
        else openKeyMenu(actEl);
        break;
      case 'close-modal': closeModal(); break;
      case 'print': window.print(); break;
      case 'collapse-section':
        actEl.closest('.section').classList.toggle('collapsed');
        scheduleFit();
        break;

      case 'view-setlists': st.view = 'setlists'; st.perform = null; st.sidebarOpen = false; autoStop(); render(); break;
      case 'back-to-song': st.view = 'song'; render(); break;
      case 'open-setlist': st.view = 'setlist'; st.setlistId = id; render(); break;
      case 'add-setlist': {
        var nameEl = $('#new-setlist-name');
        var sl = Store.addSetlist(nameEl.value.trim() || 'New setlist');
        st.view = 'setlist'; st.setlistId = sl.id;
        render();
        break;
      }
      case 'delete-setlist': {
        var dl = Store.getSetlist(id);
        if (dl && confirm('Delete setlist “' + dl.name + '”?')) { Store.deleteSetlist(id); render(); }
        break;
      }
      case 'setlist-add': {
        var sel = $('#setlist-add-select');
        var cur = Store.getSetlist(st.setlistId);
        if (sel && sel.value && cur) {
          cur.songIds.push(sel.value);
          Store.updateSetlist(cur.id, { songIds: cur.songIds });
          render();
        }
        break;
      }
      case 'setlist-remove': {
        var i1 = parseInt(actEl.getAttribute('data-i'), 10);
        var c1 = Store.getSetlist(st.setlistId);
        c1.songIds.splice(i1, 1);
        Store.updateSetlist(c1.id, { songIds: c1.songIds });
        render();
        break;
      }
      case 'setlist-move': {
        var i2 = parseInt(actEl.getAttribute('data-i'), 10);
        var d2 = parseInt(actEl.getAttribute('data-d'), 10);
        var c2 = Store.getSetlist(st.setlistId);
        var j = i2 + d2;
        if (j >= 0 && j < c2.songIds.length) {
          var tmp = c2.songIds[i2]; c2.songIds[i2] = c2.songIds[j]; c2.songIds[j] = tmp;
          Store.updateSetlist(c2.id, { songIds: c2.songIds });
          render();
        }
        break;
      }
      case 'perform-setlist': {
        var pl = Store.getSetlist(id);
        if (pl && pl.songIds.length) {
          st.perform = { setlistId: pl.id, idx: 0 };
          openSong(pl.songIds[0]);
        }
        break;
      }
      case 'perform-prev':
      case 'perform-next': {
        var pf = st.perform;
        if (!pf) break;
        var psl = Store.getSetlist(pf.setlistId);
        var ni = pf.idx + (act === 'perform-next' ? 1 : -1);
        if (psl && ni >= 0 && ni < psl.songIds.length) {
          pf.idx = ni;
          openSong(psl.songIds[ni]);
        }
        break;
      }
      case 'perform-exit': st.perform = null; render(); break;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'search-input') {
      App.state.query = e.target.value;
      App._searchFocused = true;
      // re-render only the sidebar list to keep focus stable
      var listHost = $('#sidebar');
      if (listHost) {
        var scroll = $('.songlist', listHost).scrollTop;
        var tmp = document.createElement('div');
        tmp.innerHTML = sidebarHTML();
        $('.songlist', listHost).innerHTML = $('.songlist', tmp).innerHTML;
        $('.songlist', listHost).scrollTop = scroll;
      }
    } else if (e.target.id === 'autoscroll-speed') {
      Auto.speed = parseInt(e.target.value, 10);
      Store.setSetting('scrollSpeed', Auto.speed);
    }
  });

  document.addEventListener('focusout', function (e) {
    if (e.target.id === 'search-input') App._searchFocused = false;
  });

  document.addEventListener('keydown', function (e) {
    var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === 'Escape') { closeModal(); return; }
    if (inField) return;
    if (e.key === ' ' && App.state.view === 'song' && !$('#modal-backdrop')) {
      e.preventDefault();
      if (!Store.getSettings().fitMode) Auto.on ? autoStop() : autoStart();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && App.state.perform) {
      var btn = $(e.key === 'ArrowRight' ? '[data-act="perform-next"]' : '[data-act="perform-prev"]');
      if (btn && !btn.disabled) btn.click();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      App.state.sidebarOpen = true;
      $('#sidebar').classList.add('open');
      var q = $('#search-input');
      if (q) { q.focus(); q.select(); }
    }
  });

  /* ---------- boot ---------- */

  Auto.speed = Store.getSettings().scrollSpeed || 30;
  document.documentElement.setAttribute('data-theme', Store.getSettings().theme || 'dark');
  readHash();
  if (App.state.view === 'song' && !App.state.songId) {
    var bootSongs = Store.listSongs();
    if (bootSongs.length) App.state.songId = bootSongs[0].id;
  }
  render();

  // filesystem sync: every store save streams to the linked file (debounced)
  if (FS && FS.supported) {
    Store.onSave = function (json) { FS.scheduleWrite(json); };
    FS.onStatus = function () {
      var st = $('#fs-status');
      if (st) st.innerHTML = fsStatusText();
    };
    FS.init().then(function (r) {
      if (r === 'loaded-file') {
        App.indexDirty = true;
        document.documentElement.setAttribute('data-theme', Store.getSettings().theme || 'dark');
        render();
        toast('Library loaded from file');
      } else if (r === 'needs-permission') {
        render(); // show the reconnect banner
      }
    });
    window.addEventListener('beforeunload', function () { FS.flush(); });
  }
})();
