/* filestore.js — persists the library to a real file on disk via the File
   System Access API (Chrome/Edge), so a browser-data wipe can't lose songs.
   The file handle is remembered in IndexedDB; the browser asks once per
   session to reconnect. Plain script; browser-only (no-op shell in Node). */
(function (global) {
  'use strict';

  var DB_NAME = 'songbook-fs', STORE = 'handles', KEY = 'library';

  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet() {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        q.onsuccess = function () { res(q.result || null); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }
  function idbSet(v) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, KEY);
        q.onsuccess = function () { res(); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }
  function idbDel() {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY);
        q.onsuccess = function () { res(); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }

  var FS = {
    supported: typeof window !== 'undefined' && 'showSaveFilePicker' in window,
    handle: null,
    connected: false,     // permission granted and initial sync done
    lastSaved: null,
    onStatus: null        // UI callback
  };
  function notify() { if (FS.onStatus) FS.onStatus(); }

  /* Boot-time: silent check only (permission prompts need a user gesture). */
  FS.init = function () {
    if (!FS.supported) return Promise.resolve('unsupported');
    return idbGet().then(function (h) {
      FS.handle = h;
      if (!h) { notify(); return 'unlinked'; }
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') {
          return FS.syncFromFile().then(function (r) {
            FS.connected = true; notify(); return r;
          });
        }
        notify();
        return 'needs-permission';
      });
    }).catch(function (e) {
      console.error('filestore init failed', e);
      notify();
      return 'error';
    });
  };

  /* User clicked "reconnect" — may show the permission prompt. */
  FS.reconnect = function () {
    if (!FS.handle) return Promise.resolve('unlinked');
    return FS.handle.requestPermission({ mode: 'readwrite' }).then(function (p) {
      if (p !== 'granted') return 'denied';
      return FS.syncFromFile().then(function (r) {
        FS.connected = true; notify(); return r;
      });
    });
  };

  /* Newer side wins: load the file into the app if the file is newer,
     otherwise write the app's state out to the file. */
  FS.syncFromFile = function () {
    var Store = global.SongStore;
    return FS.handle.getFile().then(function (f) { return f.text(); }).then(function (txt) {
      var fileState = null;
      try { fileState = txt.trim() ? JSON.parse(txt) : null; } catch (e) { fileState = null; }
      var local = Store.load();
      if (fileState && Array.isArray(fileState.songs) &&
          (fileState.savedAt || 0) > (local.savedAt || 0)) {
        Store.replaceState(fileState);
        return 'loaded-file';
      }
      return FS.writeNow().then(function () { return 'wrote-file'; });
    });
  };

  var writeTimer = null, pendingJson = null;

  FS.scheduleWrite = function (json) {
    if (!FS.handle || !FS.connected) return;
    pendingJson = json;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(function () { FS.flush(); }, 800);
  };

  FS.flush = function () {
    if (!FS.handle || !FS.connected) return Promise.resolve();
    clearTimeout(writeTimer);
    var json = pendingJson != null ? pendingJson : global.SongStore.serializeState();
    pendingJson = null;
    return FS.handle.createWritable().then(function (w) {
      return w.write(json).then(function () { return w.close(); });
    }).then(function () {
      FS.lastSaved = Date.now();
      notify();
    }).catch(function (e) {
      console.error('library file write failed', e);
      FS.connected = false;
      notify();
    });
  };

  FS.writeNow = function () {
    pendingJson = global.SongStore.serializeState();
    return FS.flush();
  };

  /* User gesture: create (or pick) the library file. Reads it first, so
     picking an existing library never silently overwrites newer content. */
  FS.linkNew = function () {
    return window.showSaveFilePicker({
      suggestedName: 'songbook-library.json',
      types: [{ description: 'Songbook library', accept: { 'application/json': ['.json'] } }]
    }).then(function (h) {
      FS.handle = h;
      FS.connected = true;
      return idbSet(h).then(function () { return FS.syncFromFile(); })
        .then(function (r) { notify(); return r; });
    });
  };

  FS.unlink = function () {
    FS.handle = null;
    FS.connected = false;
    return idbDel().then(notify);
  };

  FS.fileName = function () { return FS.handle ? FS.handle.name : null; };

  global.SongFileStore = FS;
})(typeof window !== 'undefined' ? window : globalThis);
