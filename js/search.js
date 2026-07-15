/* search.js — instant library search: normalized substring + fuzzy subsequence
   ranking across title, artist, and lyrics. Plain script; window + CommonJS. */
(function (global) {
  'use strict';

  function norm(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/['’‘"“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* fuzzy subsequence score: higher is better, -1 if not a subsequence.
     Bonuses for word starts and contiguous runs. */
  function fuzzyScore(query, target) {
    var q = 0, score = 0, run = 0;
    for (var t = 0; t < target.length && q < query.length; t++) {
      if (target[t] === query[q]) {
        run++;
        score += 1 + run * 0.5;
        if (t === 0 || target[t - 1] === ' ') score += 3; // word start
        q++;
      } else {
        run = 0;
      }
    }
    return q === query.length ? score : -1;
  }

  /* Build a search index entry for a song. `plain` is lyric text. */
  function indexSong(song, plain) {
    return {
      id: song.id,
      title: norm(song.title),
      artist: norm(song.artist),
      lyrics: norm(plain),
      chords: norm((song.chords || []).join(' '))
    };
  }

  /* Search entries. Returns [{id, score, where}] sorted best-first. */
  function search(entries, query) {
    var q = norm(query);
    if (!q) return entries.map(function (e) { return { id: e.id, score: 0, where: '' }; });
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var best = -1, where = '';

      function consider(field, name, tierBase, allowFuzzy) {
        if (!field) return;
        var s = -1;
        if (field.slice(0, q.length) === q) s = tierBase + 200;
        else {
          var idx = field.indexOf(q);
          if (idx !== -1) {
            s = tierBase + 100 + (field[idx - 1] === ' ' || idx === 0 ? 40 : 0) - Math.min(idx, 30) * 0.5;
          } else if (allowFuzzy && q.length >= 2) {
            // fuzzy subsequence only for short fields; on full lyrics almost
            // any query is a subsequence, which floods results with noise
            var f = fuzzyScore(q, field);
            if (f > 0) s = tierBase + Math.min(f, 90);
          }
        }
        if (s > best) { best = s; where = name; }
      }

      consider(e.title, 'title', 3000, true);
      consider(e.artist, 'artist', 2000, true);
      consider(e.lyrics, 'lyrics', 1000, false);
      consider(e.chords, 'chords', 500, false);

      if (best > 0) out.push({ id: e.id, score: best, where: where });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  var api = { norm: norm, fuzzyScore: fuzzyScore, indexSong: indexSong, search: search };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SongSearch = api;
})(typeof window !== 'undefined' ? window : globalThis);
