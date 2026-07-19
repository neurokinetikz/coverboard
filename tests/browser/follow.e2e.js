/* Follow-mode e2e with a scripted fake recognizer — line + word tracking,
   teleprompter advance, seek, mutual exclusion, teardown. */
'use strict';
var H = require('./helpers.js');
var t = H.harness('follow.e2e');
var check = t.check;

H.launch({ fakeSpeech: true }).then(async function (env) {
  var page = env.page;
  await page.goto(H.APP);
  await page.waitForSelector('#app .empty-hint, #app .toolbar');
  await page.evaluate(function () {
    var s = window.SongStore.addSong({ title: 'Follow Test', artist: '', key: 'C',
      raw: "[Verse]\nC        G\nWalking down the road, don't look back\nAm       F\nEvery lantern glowing down the street\n[Chorus]\nC        G\nHold on, hold on tonight\nAm       F\nWe are burning brighter now\n***" });
    window.SongStore.setSetting('fitMode', false);
    window.SongStore.setSetting('showTriads', false);
    window.SongStore.setSetting('showDiagrams', false);
    location.hash = '#song/' + s.id;
    return s.id;
  });
  await page.reload();
  await page.waitForSelector('#follow-btn');

  check(await page.$('#follow-btn:not([disabled])') !== null,
    'mic button enabled (fake engine detected)');
  var lineCount = await page.$$eval('#song-scroll [data-line]', function (els) { return els.length; });
  check(lineCount === 5, 'five lyric lines carry data-line incl. wordless *** (' + lineCount + ')');
  var idxCount = await page.evaluate(function () {
    var song = window.SongStore.listSongs()[0];
    return window.Follow.buildIndex(window.SongStore.parsedSong(song)).lineCount;
  });
  check(idxCount === lineCount, 'buildIndex lineCount matches DOM data-line count (' + idxCount + ')');

  await page.click('#follow-btn');
  await page.waitForSelector('#follow-btn.listening');
  check(true, 'listening state on');

  // first line pre-highlights before ANY audio arrives
  check(!!(await page.$('.sung-cur[data-line="0"]')),
    'first line highlighted immediately on mic start');

  // growing interims land on line 0
  await page.evaluate(function () { __fakeEmit([{ transcript: 'walking down', isFinal: false }]); });
  await page.evaluate(function () { __fakeEmit([{ transcript: 'walking down the road dont', isFinal: false }]); });
  await page.waitForSelector('.sung-cur[data-line="0"]');
  check(true, 'highlight lands on line 0');
  // a chord mid-word splits it into two spans sharing one data-w — count distinct words
  var sung0 = await page.$$eval('[data-line="0"] .w.sung', function (els) {
    return els.map(function (e) { return e.getAttribute('data-w'); })
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
  });
  check(sung0.length === 5, 'word tracking: first five words lit (' + sung0.length + ')');
  var unsung0 = await page.$$eval('[data-line="0"] .w:not(.sung)', function (els) {
    return els.map(function (e) { return e.getAttribute('data-w'); })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
  });
  check(unsung0 === 2, 'remaining words unlit (' + unsung0 + ')');

  // finish line 0, start line 1 — teleprompter advances
  await page.evaluate(function () {
    __fakeEmit([{ transcript: 'walking down the road dont look back', isFinal: true }]);
  });
  await page.evaluate(function () { __fakeEmit([{ transcript: 'every lantern glowing', isFinal: false }]); });
  await page.waitForSelector('.sung-cur[data-line="1"]');
  check(true, 'highlight advances to line 1');
  var sung1 = await page.$$eval('[data-line="1"] .w.sung', function (els) {
    return els.map(function (e) { return e.getAttribute('data-w'); })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
  });
  check(sung1 === 3, 'word marks track into line 1 (' + sung1 + ')');
  check(await page.$$eval('[data-line="0"] .w.sung', function (els) { return els.length; }) === 0,
    'previous line word marks cleared');

  // Chrome kills sessions — engine auto-restarts while active
  var before = await page.evaluate(function () { return __fakeSR.instances.length; });
  await page.evaluate(function () { __fakeEnd(); });
  await page.waitForTimeout(400);
  var after = await page.evaluate(function () { return __fakeSR.instances.length; });
  check(await page.$('#follow-btn.listening') !== null && after > before,
    'auto-restart keeps listening (' + before + ' -> ' + after + ')');

  // tap-to-seek: click line 3 — stale word marks from line 1 must clear
  await page.click('#song-scroll [data-line="3"]');
  await page.waitForSelector('.sung-cur[data-line="3"]');
  check(await page.$$eval('[data-line="1"] .w.sung', function (els) { return els.length; }) === 0,
    'seek clears stale word marks on other lines');
  await page.evaluate(function () { __fakeEmit([{ transcript: 'we are burning', isFinal: false }]); });
  check(true, 'tap-to-seek re-anchors to line 3');

  // mutual exclusion: starting autoscroll (spacebar — no toolbar button) stops follow
  await page.keyboard.press(' ');
  await page.waitForSelector('#follow-btn:not(.listening)');
  check(await page.$('.sung-cur') === null, 'autoscroll stops follow and clears highlight');
  check(await page.$('#autoscroll-btn') === null, 'autoscroll toolbar button removed');
  await page.keyboard.press(' ');

  // fit mode: highlight moves, word marks survive the re-render
  await page.click('#follow-btn');
  await page.waitForSelector('#follow-btn.listening');
  await page.evaluate(function () { __fakeEmit([{ transcript: 'walking down', isFinal: false }]); });
  await page.waitForSelector('[data-line="0"] .w.sung');
  await page.click('[data-act="toggle-fit"]');
  await page.waitForSelector('#song-scroll.fit');
  check(await page.$('#follow-btn.listening') !== null, 'follow survives fit toggle');
  var marks = await page.$$eval('[data-line="0"] .w.sung', function (els) {
    return els.map(function (e) { return e.getAttribute('data-w'); })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
  });
  check(marks === 2, 'word marks survive full re-render (' + marks + ')');
  await page.evaluate(function () { __fakeEmit([{ transcript: 'hold on hold on', isFinal: false }]); });
  await page.waitForSelector('.sung-cur[data-line="2"]');
  check(true, 'highlight tracks in fit mode');

  // teardown on navigation
  await page.click('[data-act="view-fretboard"], .sidebar-actions [data-act="view-fretboard"]');
  await page.waitForSelector('.fb-controls');
  check(await page.evaluate(function () { return window.Follow.active(); }) === false,
    'navigation stops follow');

  // editing the song stops follow (stale-index guard)
  await page.goBack();
  await page.waitForSelector('#follow-btn');
  await page.click('#follow-btn');
  await page.waitForSelector('#follow-btn.listening');
  await page.click('[data-act="edit-song"]');
  await page.waitForSelector('#imp-save');
  check(await page.evaluate(function () { return window.Follow.active(); }) === false,
    'edit-song stops follow');

  await t.done(env.browser);
}).catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
