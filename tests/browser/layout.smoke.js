/* Responsive chart sizing: scales-column hug + viewport-scaled strip cards. */
'use strict';
var H = require('./helpers.js');
var t = H.harness('layout.smoke');
var check = t.check;

H.launch({ viewport: { width: 1710, height: 1112 } }).then(async function (env) {
  var page = env.page;
  await page.goto(H.APP);
  await page.waitForSelector('#app .empty-hint, #app .toolbar');
  await page.evaluate(function () {
    var s = window.SongStore.addSong({ title: 'Resp Test', artist: '', key: 'C',
      raw: "[Verse]\nC        G\nWalking down the road\nAm       F\nEvery little thing\nF        G      C\nSunshine on the water" });
    window.SongStore.addSong({ title: 'Crowded', artist: '', key: 'C',
      raw: "[Verse]\nC G Am F Dm Em G7 C7 F7 A7 D7 E7 B7 Bm Gm Cm Fm Am7 Dm7 Em7\nx" });
    window.SongStore.setSetting('fitMode', false);
    window.SongStore.setSetting('showDiagrams', true);
    window.SongStore.setSetting('showTriads', false);
    window.SongStore.setSetting('stripCollapsed', false);
    window.SongStore.setSetting('scalesCollapsed', false);
    location.hash = '#song/' + s.id;
  });
  await page.reload();
  await page.waitForSelector('#scale-col .chord-svg');
  await page.waitForTimeout(350);

  function measure() {
    return page.evaluate(function () {
      var col = document.querySelector('#scale-col');
      var svg = document.querySelector('#scale-col .sc-flavor .ts-scale .chord-svg');
      var flavor = document.querySelector('#scale-col .sc-flavor');
      var dg = document.querySelector('.diagram-strip .dg');
      return {
        colW: col ? col.getBoundingClientRect().width : 0,
        svgW: svg ? svg.getBoundingClientRect().width : 0,
        flavorW: flavor ? flavor.getBoundingClientRect().width : 0,
        dgW: dg ? dg.getBoundingClientRect().width : 0,
        colHidden: col ? getComputedStyle(col).display === 'none' : true
      };
    });
  }

  // --- 1710x1112: hugged column, ~130px strip cards ---
  var m = await measure();
  check(Math.abs(m.colW - (2 * m.svgW + 66)) <= 8,
    '1710: column hugs charts (col ' + m.colW.toFixed(0) + ' vs 2x' + m.svgW.toFixed(0) + '+66)');
  var dead = m.flavorW - m.svgW - 10;
  check(dead < 15, '1710: flavor dead space < 15px (' + dead.toFixed(0) + ')');
  check(m.dgW >= 121 && m.dgW <= 135, '1710: strip card ~130px (' + m.dgW.toFixed(0) + ')');
  var svg1710 = m.svgW;

  // --- 2560x1440: near-original sizes ---
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.waitForTimeout(350);
  m = await measure();
  check(Math.abs(m.colW - (2 * m.svgW + 66)) <= 8 || m.colW >= 419,
    '2560: hug or cap (col ' + m.colW.toFixed(0) + ', svg ' + m.svgW.toFixed(0) + ')');
  check(m.svgW > svg1710, '2560: charts grew with viewport (' + svg1710.toFixed(0) + ' -> ' + m.svgW.toFixed(0) + ')');
  check(Math.abs(m.dgW - 170) <= 2, '2560: strip card back to 170 (' + m.dgW.toFixed(0) + ')');

  // --- narrow-tall: cap behavior preserved ---
  await page.setViewportSize({ width: 1000, height: 1200 });
  await page.waitForTimeout(350);
  m = await measure();
  check(m.colW >= 230 && m.colW <= 302, '1000x1200: column within [230,300] (' + m.colW.toFixed(0) + ')');

  // --- 1280x800 strip, 880 hides column ---
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(350);
  m = await measure();
  check(m.dgW >= 90 && m.dgW <= 102, '1280x800: strip card ~96px (' + m.dgW.toFixed(0) + ')');
  await page.setViewportSize({ width: 880, height: 900 });
  await page.waitForTimeout(350);
  m = await measure();
  check(m.colHidden, '880 wide: scales column hidden');

  // --- toggle matrix at 1710x1112 ---
  await page.setViewportSize({ width: 1710, height: 1112 });
  await page.waitForTimeout(350);
  await page.click('[data-act="toggle-scales"]');
  await page.waitForTimeout(300);
  var cw = await page.evaluate(function () {
    return document.querySelector('#scale-col').getBoundingClientRect().width;
  });
  check(cw <= 34, 'scales collapse -> rail (' + cw.toFixed(0) + ')');
  await page.click('#scale-col');
  await page.waitForTimeout(350);
  m = await measure();
  check(Math.abs(m.colW - (2 * m.svgW + 66)) <= 8, 'expand re-hugs (' + m.colW.toFixed(0) + ')');

  // strip collapse frees height -> charts grow, column re-hugs wider
  var preSvg = m.svgW;
  await page.click('.strip-collapse, [data-act="toggle-strip"]');
  await page.waitForTimeout(350);
  m = await measure();
  check(m.svgW > preSvg, 'strip collapse -> charts grow (' + preSvg.toFixed(0) + ' -> ' + m.svgW.toFixed(0) + ')');
  check(Math.abs(m.colW - (2 * m.svgW + 66)) <= 8 || m.colW >= 419,
    'column re-hugged after strip collapse (' + m.colW.toFixed(0) + ')');
  await page.click('.strip-rail');
  await page.waitForTimeout(350);

  // scales-kind change keeps the hug (updateScaleCol outerHTML path)
  await page.click('.sc-kind-btn');
  await page.waitForSelector('.km-grid button, .key-menu button');
  await page.evaluate(function () {
    var btns = Array.prototype.slice.call(
      document.querySelectorAll('#key-menu button, .key-menu button'));
    var full = btns.filter(function (b) { return /Full/i.test(b.textContent); })[0];
    if (full) full.click();
  });
  await page.waitForTimeout(400);
  m = await measure();
  check(Math.abs(m.colW - (2 * m.svgW + 66)) <= 8,
    'scale-kind change keeps hug (' + m.colW.toFixed(0) + ' vs 2x' + m.svgW.toFixed(0) + '+66)');

  // fit mode: no overflow after hug
  await page.click('[data-act="toggle-fit"]');
  await page.waitForSelector('#song-scroll.fit');
  await page.waitForTimeout(400);
  var fitOk = await page.evaluate(function () {
    var sc = document.querySelector('#song-scroll');
    return sc.scrollHeight <= sc.clientHeight + 1 && sc.scrollWidth <= sc.clientWidth + 1;
  });
  check(fitOk, 'fit mode: lyrics fit within reclaimed width');
  await page.click('[data-act="toggle-fit"]');
  await page.waitForTimeout(200);

  // crowded song still bottoms out near the 55px min with overflow scroll
  await page.evaluate(function () {
    var crowd = window.SongStore.listSongs().filter(function (s) {
      return s.title === 'Crowded';
    })[0];
    location.hash = '#song/' + crowd.id;
  });
  await page.waitForTimeout(400);
  var crowded = await page.evaluate(function () {
    var dg = document.querySelector('.diagram-strip .dg');
    return dg ? dg.getBoundingClientRect().width : 0;
  });
  check(crowded >= 54 && crowded <= 70, 'crowded song compresses cards (' + crowded.toFixed(0) + ')');

  // print emulation: strip basis restored to 170
  await page.emulateMedia({ media: 'print' });
  var printW = await page.evaluate(function () {
    return getComputedStyle(document.querySelector('.diagram-strip .dg')).flexBasis;
  });
  check(printW === '170px', 'print keeps 170px basis (' + printW + ')');
  await page.emulateMedia({ media: 'screen' });

  await t.done(env.browser);
}).catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
