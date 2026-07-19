/* Chords/Triads exclusive toggles + collapse-to-rail behavior. */
'use strict';
var H = require('./helpers.js');
var t = H.harness('strips.smoke');
var check = t.check;

H.launch().then(async function (env) {
  var page = env.page;
  await page.goto(H.APP);
  await page.waitForSelector('#app .empty-hint, #app .toolbar');
  await page.evaluate(function () {
    var s = window.SongStore.addSong({ title: 'Toggle Test', artist: '', key: 'C',
      raw: "[Verse]\nC        G\nWalking down the road" });
    window.SongStore.setSetting('fitMode', false);
    window.SongStore.setSetting('showTriads', true);
    window.SongStore.setSetting('showDiagrams', false);
    window.SongStore.setSetting('stripCollapsed', false);
    location.hash = '#song/' + s.id;
  });
  await page.reload();
  await page.waitForSelector('#triad-strip');
  function sget(k) {
    return page.evaluate(function (key) { return window.SongStore.getSettings()[key]; }, k);
  }

  // triads active + expanded; click Chords -> switches mode, stays expanded
  await page.click('[data-act="toggle-diagrams"]');
  await page.waitForSelector('.diagram-strip');
  check(await sget('showDiagrams') === true && await sget('showTriads') === false,
    'Chords click turns Triads off');
  check(await page.$('#triad-strip') === null, 'triad strip gone from DOM');
  check(await sget('stripCollapsed') === false, 'strip stays expanded on switch');

  // click Chords again (active) -> collapses to rail
  await page.click('[data-act="toggle-diagrams"]');
  await page.waitForSelector('.strip-rail');
  check(await sget('stripCollapsed') === true, 'active click collapses to rail');
  check(await sget('showDiagrams') === true, 'mode selection survives collapse');

  // click Triads while collapsed -> triads mode, expanded
  await page.click('[data-act="toggle-triads"]');
  await page.waitForSelector('#triad-strip');
  check(await sget('showTriads') === true && await sget('showDiagrams') === false,
    'Triads click from collapsed expands in triads mode');
  check(await sget('stripCollapsed') === false, 'rail expanded');

  // rail itself still expands after a collapse via Triads second click
  await page.click('[data-act="toggle-triads"]');
  await page.waitForSelector('.strip-rail');
  await page.click('.strip-rail');
  await page.waitForSelector('#triad-strip');
  check(true, 'rail click still expands the strip');

  await t.done(env.browser);
}).catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
