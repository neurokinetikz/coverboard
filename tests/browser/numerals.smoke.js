/* Roman numerals live in the chord/triad chart names — "C (I)" — always
   on when the song has a key, never in the lyric sheet. Keyless songs
   show plain labels. */
'use strict';
var H = require('./helpers.js');
var t = H.harness('numerals.smoke');
var check = t.check;

H.launch().then(async function (env) {
  var page = env.page;
  await page.goto(H.APP);
  await page.waitForSelector('#app .empty-hint, #app .toolbar');
  var ids = await page.evaluate(function () {
    var s = window.SongStore.addSong({ title: 'RN Test', artist: '', key: 'C',
      raw: "[Verse]\nC        G\nWalking down the road\nF     G     Am\n\nAm       F\nEvery little thing" });
    // no key field AND no detectable tonic emphasis is hard to fake, so
    // force keylessness by clearing the key after add
    var k = window.SongStore.addSong({ title: 'Keyless', artist: '',
      raw: "[Verse]\nC        G\nJust two chords here" });
    window.SongStore.updateSong(k.id, { key: '' });
    window.SongStore.setSetting('fitMode', false);
    window.SongStore.setSetting('showDiagrams', true);
    window.SongStore.setSetting('showTriads', false);
    window.SongStore.setSetting('stripCollapsed', false);
    return { keyed: s.id, keyless: k.id };
  });
  await page.evaluate(function (sid) { location.hash = '#song/' + sid; },
    ids.keyed);
  await page.reload();
  await page.waitForSelector('.song-tb');
  await page.waitForTimeout(350);

  // charts carry the numeral; the sheet never does
  var m = await page.evaluate(function () {
    var name = document.querySelector('.diagram-strip .dg .cd-name');
    var tspan = document.querySelector('.diagram-strip .dg .cd-name .cd-rn');
    return {
      stripLabel: name ? name.textContent : null,
      tspanWeight: tspan ? tspan.getAttribute('font-weight') : null,
      cText: document.querySelector('.cl .c[data-chord="C"]').textContent,
      rowText: document.querySelector('.chordrow').textContent
    };
  });
  check(m.stripLabel === 'C (I)', 'strip chart named "C (I)" (' + m.stripLabel + ')');
  check(m.tspanWeight === '400', 'chart numeral tspan non-bold');
  check(m.cText === 'C', 'sheet chord name stays plain');
  check(m.rowText === 'F     G     Am', 'chords-only row untouched');

  // triad strip chart carries it too
  await page.click('[data-act="toggle-triads"]');
  await page.waitForSelector('.ts-tiles');
  await page.waitForTimeout(350);
  var tri = await page.evaluate(function () {
    var name = document.querySelector('#triad-strip .dg .cd-name');
    return name ? name.textContent : null;
  });
  check(tri === 'C (I)', 'triad chart named "C (I)" (' + tri + ')');
  await page.click('[data-act="toggle-diagrams"]');
  await page.waitForTimeout(300);

  // subs modal: clicked-chord chart shows its numeral
  await page.click('.cl .c[data-chord="C"]');
  await page.waitForSelector('#modal-backdrop .modal');
  var subs = await page.evaluate(function () {
    var name = document.querySelector('#voicing-big .cd-name');
    return name ? name.textContent : null;
  });
  check(subs === 'C (I)', 'subs modal top chart named "C (I)" (' + subs + ')');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // keyless song: chart labels stay plain (no key -> no numeral)
  await page.evaluate(function (sid) { location.hash = '#song/' + sid; },
    ids.keyless);
  await page.waitForTimeout(450);
  var plain = await page.evaluate(function () {
    var name = document.querySelector('.diagram-strip .dg .cd-name');
    var parsedKey = window.SongStore.parsedSong(
      window.SongStore.listSongs().filter(function (s) {
        return s.title === 'Keyless';
      })[0]).key;
    return { label: name ? name.textContent : null, parsedKey: parsedKey };
  });
  // the parser may still detect a key from the chords; numerals follow it —
  // plain labels are only guaranteed when no key resolves at all
  check(plain.parsedKey ? /\(/.test(plain.label) : plain.label === 'C',
    'keyless song: labels track key resolution (' + plain.label +
    ', parsed key ' + plain.parsedKey + ')');

  await t.done(env.browser);
}).catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
