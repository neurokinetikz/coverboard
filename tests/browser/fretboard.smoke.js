/* Vertical fretboard: explorer + practice two-column layouts. */
'use strict';
var H = require('./helpers.js');
var t = H.harness('fretboard.smoke');
var check = t.check;

H.launch({ viewport: { width: 1710, height: 1112 } }).then(async function (env) {
  var page = env.page;
  await page.goto(H.APP);
  await page.waitForSelector('#app .empty-hint, #app .toolbar');
  var id = await page.evaluate(function () {
    var s = window.SongStore.addSong({ title: 'FB Test', artist: '', key: 'C',
      raw: "[Verse]\nC        G\nWalking down the road\nAm       F\nEvery little thing" });
    window.SongStore.setSetting('showTriads', true);
    location.hash = '#fretboard';
    return s.id;
  });
  await page.reload();
  await page.waitForSelector('.fb-controls');

  // controls bar on top (two lines), neck + charts row below
  var geo = await page.evaluate(function () {
    var svg = document.querySelector('.fb-wrap svg');
    var wrap = document.querySelector('.fb-wrap').getBoundingClientRect();
    var main = document.querySelector('.fb-main').getBoundingClientRect();
    var ctrl = document.querySelector('.fb-controls').getBoundingClientRect();
    var col = document.querySelector('.fb-poscol').getBoundingClientRect();
    return {
      viewBox: svg.getAttribute('viewBox'),
      svgW: svg.getBoundingClientRect().width,
      svgH: svg.getBoundingClientRect().height,
      ctrlOnTop: ctrl.bottom <= main.top + 2,
      crows: document.querySelectorAll('.fb-controls .fb-crow').length,
      chartsBeside: col.left > wrap.right - 2,
      fillsHeight: Math.abs(main.height - wrap.height) < 40
    };
  });
  check(geo.viewBox === '0 0 250 980', 'neck viewBox is vertical (' + geo.viewBox + ')');
  check(geo.svgH > geo.svgW * 2, 'neck renders tall (' + geo.svgW.toFixed(0) + 'x' + geo.svgH.toFixed(0) + ')');
  check(geo.ctrlOnTop && geo.crows === 2, 'controls bar on top, two lines (' + geo.crows + ')');
  check(geo.chartsBeside, 'chart groups sit beside the neck');
  check(geo.fillsHeight, 'neck fills the main row height');

  // nut at top: fb-nut is a horizontal bar near the top of the svg
  var nut = await page.evaluate(function () {
    var n = document.querySelector('.fb-svg .fb-nut');
    if (!n) return null;
    var r = n.getBoundingClientRect();
    var s = document.querySelector('.fb-wrap svg').getBoundingClientRect();
    return { wide: r.width > r.height * 10, nearTop: (r.top - s.top) < s.height * 0.1 };
  });
  check(nut && nut.wide && nut.nearTop, 'nut is a horizontal bar at the top');

  // voicing charts grouped by CAGED position beside the neck
  var groups = await page.evaluate(function () {
    var gs = Array.prototype.slice.call(document.querySelectorAll('.fb-poscol .fb-posgroup'));
    return {
      count: gs.length,
      labels: gs.map(function (g) { return g.querySelector('.fb-poslab').textContent; }),
      cards: document.querySelectorAll('.fb-poscol .fbv .dg[data-triad]').length
    };
  });
  check(groups.count === 5, 'five CAGED position groups (' + groups.count + ')');
  check(/Open/i.test(groups.labels[0]), 'groups run nut-first (' + groups.labels.join(' | ') + ')');
  check(groups.cards > 0, 'grouped cards keep tap-to-enlarge data (' + groups.cards + ')');
  var align = await page.evaluate(function () {
    var gs = Array.prototype.slice.call(document.querySelectorAll('.fb-posgroup'));
    var tops = gs.map(function (g) { return parseFloat(g.style.top) || 0; });
    var overlap = false;
    for (var i = 1; i < gs.length; i++) {
      if (tops[i] < tops[i - 1] + gs[i - 1].offsetHeight - 1) overlap = true;
    }
    // location fix: no card in the nut group may live entirely above fret 5
    var firstCards = Array.prototype.slice.call(
      gs[0].querySelectorAll('.dg[data-frets]'));
    var badWrap = firstCards.some(function (c) {
      var fr = c.getAttribute('data-frets').split(',').map(Number)
        .filter(function (f) { return f > 0; });
      return fr.length && Math.min.apply(null, fr) >= 6;
    });
    return { monotone: !overlap, badWrap: badWrap, tops: tops.map(Math.round) };
  });
  check(align.monotone, 'groups aligned without overlap (' + align.tops.join(',') + ')');
  check(!align.badWrap, 'nut group holds only nut-area voicings (12fr wraps grouped by fret)');
  var fit = await page.evaluate(function () {
    var pad = document.querySelector('.page-pad');
    return { scrolls: pad.scrollHeight > pad.clientHeight + 2,
             cardW: getComputedStyle(document.querySelector('.fb-poscol'))
               .getPropertyValue('--fbv-w').trim() };
  });
  check(!fit.scrolls, 'view fits vertically, cards auto-shrunk (' + fit.cardW + ')');

  // practice: same two-column shape
  await page.evaluate(function (sid) { location.hash = '#song/' + sid; }, id);
  await page.waitForSelector('.song-tb');
  await page.click('[data-act="view-practice"], .ts-head [data-act="view-practice"]');
  await page.waitForSelector('#practice-body');
  var pr = await page.evaluate(function () {
    var neck = document.querySelector('.pr-neck').getBoundingClientRect();
    var rest = document.querySelector('.pr-rest').getBoundingClientRect();
    var info = document.querySelector('.pr-info');
    var rail = document.querySelector('.pr-rail');
    return { sideBySide: rest.left > neck.right - 2, hasInfo: !!info, hasRail: !!rail };
  });
  check(pr.sideBySide && pr.hasInfo && pr.hasRail, 'practice: neck left, info + rail right');

  // keyboard step still works after the restructure
  var curBefore = await page.$eval('.pr-cur', function (e) { return e.textContent; });
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  var curAfter = await page.$eval('.pr-cur', function (e) { return e.textContent; });
  check(curBefore !== curAfter, 'space steps the progression (' + curBefore + ' -> ' + curAfter + ')');

  await t.done(env.browser);
}).catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
