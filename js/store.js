/* store.js — localStorage persistence for songs, setlists, and settings.
   Plain script; window + CommonJS (in Node, uses an in-memory stub). */
(function (global) {
  'use strict';

  var Parser = (typeof module !== 'undefined' && module.exports)
    ? require('./parser.js')
    : global.SongParser;

  var LS_KEY = 'songbook.v1';

  var memoryStore = {};
  var storage = (function () {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('__sbtest', '1');
        localStorage.removeItem('__sbtest');
        return localStorage;
      }
    } catch (e) { /* private mode or Node */ }
    return {
      getItem: function (k) { return memoryStore.hasOwnProperty(k) ? memoryStore[k] : null; },
      setItem: function (k, v) { memoryStore[k] = String(v); },
      removeItem: function (k) { delete memoryStore[k]; }
    };
  })();

  var state = null;

  function defaults() {
    return {
      songs: [],        // {id, title, artist, key, capo, raw, transpose, createdAt, updatedAt}
      setlists: [],     // {id, name, songIds: []}
      savedAt: 0,
      settings: {
        theme: 'dark',
        fontSize: 16,
        chordColor: 'default',
        showDiagrams: true,
        showFingers: true,
        scrollSpeed: 30,
        librarySort: 'title',  // 'title' | 'artist'
        collapsedArtists: {},  // artist name -> 1 when its group is collapsed
        fitMode: true,         // fit whole song to the viewport in columns
        showTriads: false,     // song view: triad strip instead of voicing strip
        triadPos: 'any',       // triad strip CAGED position ('any' | '1'..'5')
        triadStrings: '1-3',   // triad strip string set ('1-3'|'2-4'|'3-5'|'4-6'|'near', or open ids '1-3-4'|'2-4-5'|'3-5-6')
        triadVoicing: 'close', // triad voicing family: 'close' (adjacent strings) | 'open' (spread, skipped string)
        sidebarCollapsed: false, // desktop: hide the library panel
        scalesCollapsed: false   // collapse the pentatonics column to a slim rail
      }
    };
  }

  function load() {
    if (state) return state;
    try {
      var rawJson = storage.getItem(LS_KEY);
      state = rawJson ? JSON.parse(rawJson) : defaults();
      // migrate missing keys
      var d = defaults();
      for (var k in d) if (d.hasOwnProperty(k) && !state.hasOwnProperty(k)) state[k] = d[k];
      // same guard replaceState has: a corrupted settings value must not
      // throw here — the catch below would discard the user's songs
      if (!state.settings || typeof state.settings !== 'object') state.settings = d.settings;
      for (var sk in d.settings) {
        if (d.settings.hasOwnProperty(sk) && !state.settings.hasOwnProperty(sk)) {
          state.settings[sk] = d.settings[sk];
        }
      }
    } catch (e) {
      state = defaults();
    }
    return state;
  }

  function save() {
    state.savedAt = Date.now();
    var json;
    try {
      json = JSON.stringify(state);
      storage.setItem(LS_KEY, json);
    } catch (e) { console.error('songbook: could not save', e); return; }
    if (api.onSave) {
      try { api.onSave(json); } catch (e2) { console.error(e2); }
    }
  }

  /* full state as JSON (for the filesystem sync layer) */
  function serializeState() {
    load();
    return JSON.stringify(state);
  }

  /* Replace in-memory + localStorage state wholesale (loading a library
     file). Does NOT bump savedAt or fire onSave — the caller just read this
     exact content from disk. */
  function replaceState(newState) {
    if (!newState || !Array.isArray(newState.songs)) throw new Error('Not a songbook library');
    state = newState;
    var d = defaults();
    for (var k in d) if (d.hasOwnProperty(k) && !state.hasOwnProperty(k)) state[k] = d[k];
    if (!state.settings) state.settings = d.settings;
    for (var sk in d.settings) {
      if (d.settings.hasOwnProperty(sk) && !state.settings.hasOwnProperty(sk)) {
        state.settings[sk] = d.settings[sk];
      }
    }
    parseCache = {};
    try { storage.setItem(LS_KEY, JSON.stringify(state)); }
    catch (e) { console.error('songbook: could not save', e); }
  }

  function uid() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- songs ---------- */

  function listSongs() { return load().songs.slice(); }

  function getSong(id) {
    var s = load().songs;
    for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i];
    return null;
  }

  function addSong(fields) {
    load();
    var parsed = Parser.parseSong(fields.raw || '', {
      title: fields.title, artist: fields.artist, capo: fields.capo, key: fields.key
    });
    var now = Date.now();
    var song = {
      id: uid(),
      title: fields.title || parsed.title || 'Untitled',
      artist: fields.artist || parsed.artist || '',
      key: fields.key || parsed.key || '',
      capo: fields.capo != null ? fields.capo : parsed.capo,
      raw: fields.raw || '',
      transpose: 0,
      createdAt: now,
      updatedAt: now
    };
    state.songs.push(song);
    save();
    return song;
  }

  function updateSong(id, fields) {
    var song = getSong(id);
    if (!song) return null;
    for (var k in fields) if (fields.hasOwnProperty(k) && k !== 'id') song[k] = fields[k];
    song.updatedAt = Date.now();
    save();
    return song;
  }

  function deleteSong(id) {
    load();
    state.songs = state.songs.filter(function (s) { return s.id !== id; });
    state.setlists.forEach(function (sl) {
      sl.songIds = sl.songIds.filter(function (sid) { return sid !== id; });
    });
    save();
  }

  /* parse cache: id+updatedAt+transpose -> parsed song */
  var parseCache = {};
  function parsedSong(song) {
    var key = song.id + ':' + song.updatedAt;
    if (!parseCache[key]) {
      parseCache[key] = Parser.parseSong(song.raw, {
        title: song.title, artist: song.artist, capo: song.capo, key: song.key
      });
      // keep the cache small
      var keys = Object.keys(parseCache);
      if (keys.length > 60) delete parseCache[keys[0]];
    }
    return parseCache[key];
  }

  /* ---------- setlists ---------- */

  function listSetlists() { return load().setlists.slice(); }
  function getSetlist(id) {
    var l = load().setlists;
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function addSetlist(name) {
    load();
    var sl = { id: uid(), name: name || 'New setlist', songIds: [] };
    state.setlists.push(sl);
    save();
    return sl;
  }
  function updateSetlist(id, fields) {
    var sl = getSetlist(id);
    if (!sl) return null;
    for (var k in fields) if (fields.hasOwnProperty(k) && k !== 'id') sl[k] = fields[k];
    save();
    return sl;
  }
  function deleteSetlist(id) {
    load();
    state.setlists = state.setlists.filter(function (s) { return s.id !== id; });
    save();
  }

  /* ---------- settings ---------- */

  function getSettings() { return load().settings; }
  function setSetting(key, value) {
    load().settings[key] = value;
    save();
  }

  /* ---------- import / export ---------- */

  function exportJSON() {
    var s = load();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(),
                            songs: s.songs, setlists: s.setlists }, null, 2);
  }

  function importJSON(json, mode) {
    // mode: 'merge' (default) or 'replace'
    var data = JSON.parse(json);
    if (!data || !Array.isArray(data.songs)) throw new Error('Not a songbook export file');
    load();
    if (mode === 'replace') { state.songs = []; state.setlists = []; }
    var existingIds = {};
    state.songs.forEach(function (s) { existingIds[s.id] = 1; });
    var added = 0, now = Date.now(), idMap = {};
    function str(v) { return typeof v === 'string' ? v : ''; }
    function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
    data.songs.forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      var raw = str(s.raw), title = str(s.title);
      if (!raw && !title) return;
      var capo = num(s.capo);
      var song = {
        id: str(s.id) || uid(),
        title: title || 'Untitled',
        artist: str(s.artist),
        key: str(s.key),
        capo: capo == null ? null : Math.max(0, Math.min(24, Math.round(capo))),
        raw: raw,
        transpose: num(s.transpose) == null ? 0 : Math.round(num(s.transpose)),
        createdAt: num(s.createdAt) || now,
        updatedAt: num(s.updatedAt) || now
      };
      if (existingIds[song.id]) {
        var nid = uid();
        idMap[song.id] = nid;
        song.id = nid;
      }
      existingIds[song.id] = 1;
      state.songs.push(song);
      added++;
    });
    var existingSl = {};
    state.setlists.forEach(function (sl) { existingSl[sl.id] = 1; });
    (data.setlists || []).forEach(function (sl) {
      if (!sl || typeof sl !== 'object') return;
      var slid = str(sl.id) || uid();
      if (existingSl[slid]) slid = uid();
      existingSl[slid] = 1;
      state.setlists.push({
        id: slid,
        name: str(sl.name) || 'Imported setlist',
        songIds: Array.isArray(sl.songIds)
          ? sl.songIds.filter(function (x) { return typeof x === 'string'; })
              .map(function (x) { return idMap[x] || x; })
          : []
      });
    });
    save();
    return added;
  }

  var api = {
    load: load,
    listSongs: listSongs, getSong: getSong, addSong: addSong,
    updateSong: updateSong, deleteSong: deleteSong, parsedSong: parsedSong,
    listSetlists: listSetlists, getSetlist: getSetlist, addSetlist: addSetlist,
    updateSetlist: updateSetlist, deleteSetlist: deleteSetlist,
    getSettings: getSettings, setSetting: setSetting,
    exportJSON: exportJSON, importJSON: importJSON,
    serializeState: serializeState, replaceState: replaceState,
    onSave: null,
    _resetForTests: function () { state = null; memoryStore = {}; parseCache = {}; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SongStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
