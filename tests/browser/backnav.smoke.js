/* Browser back/forward navigates between app views (pushState + popstate). */
'use strict';
var H = require('./helpers.js');
var t = H.harness('backnav.smoke');
var check = t.check;

H.launch().then(async function (env) {
  var page = env.page;
  await page.goto(H.APP);
  await page.waitForSelector('#app .empty-hint, #app .toolbar');
  var id = await page.evaluate(function () {
    var s = window.SongStore.addSong({ title: 'Nav Test', artist: '', key: 'C',
      raw: "[Verse]\nC        G\nWalking down the road" });
    window.SongStore.setSetting('fitMode', false);
    location.hash = '#song/' + s.id;
    return s.id;
  });
  await page.reload();
  await page.waitForSelector('.song-tb');
  check(true, 'song view opens from hash');

  // song -> fretboard pushes a history entry
  await page.click('[data-act="view-fretboard"]');
  await page.waitForSelector('.fb-controls');
  check((await page.evaluate(function () { return location.hash; })) === '#fretboard',
    'fretboard view sets #fretboard');

  // browser back returns to the song, not away from the app
  await page.goBack();
  await page.waitForSelector('.song-tb');
  check((await page.evaluate(function () { return location.hash; })) === '#song/' + id,
    'back returns to the song view');

  // forward goes to fretboard again
  await page.goForward();
  await page.waitForSelector('.fb-controls');
  check(true, 'forward returns to fretboard');

  // setlists round-trip
  await page.goBack();
  await page.waitForSelector('.song-tb');
  await page.click('[data-act="view-setlists"]');
  await page.waitForSelector('#new-setlist-name');
  check((await page.evaluate(function () { return location.hash; })) === '#setlists',
    'setlists view sets #setlists');
  await page.goBack();
  await page.waitForSelector('.song-tb');
  check(true, 'back from setlists returns to the song');

  await t.done(env.browser);
}).catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
