/* Deep phone gig-flow suite on the primary device (iPhone 390x844):
   reading surface, toolbar, strips, fit mode, autoscroll, subs modal,
   follow mode — plus static lints for the Safari-specific classes the
   Chromium emulation can't see (dvh, pinch zoom). Checks labeled
   [target] codify the mobile fix spec and are red until the fixes land. */
'use strict';
var fs = require('fs');
var path = require('path');
var H = require('./helpers.js');
var M = require('./mobile-helpers.js');
var t = H.harness('mobile-song.e2e');
var check = t.check;

var errors = [];

H.launch().then(async function (env) {
  var browser = env.browser;
  var dp = await M.devicePage(browser, 'iphone', { fakeSpeech: true, errors: errors });
  var page = dp.page;
  var VW = M.DEVICES.iphone.viewport.width;

  await page.goto(H.APP);
  await page.waitForSelector('#app .empty-hint, #app .toolbar');
  var ids = await M.seedSongs(page);
  await page.evaluate(function (sid) { location.hash = '#song/' + sid; },
    ids.standard);
  await page.reload();
  await page.waitForSelector('.song-tb');
  await page.waitForTimeout(450);

  // --- A. reading surface ---
  var audit = await M.overflowAudit(page);
  check(!audit.pageOverflow && !audit.offenders.length,
    'song view no overflow' +
    (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));
  var appH = await page.evaluate(function () {
    return {
      app: document.querySelector('#app').getBoundingClientRect().height,
      inner: window.innerHeight
    };
  });
  check(Math.abs(appH.app - appH.inner) <= 2,
    'app shell fills the visual viewport (' + Math.round(appH.app) + ' vs ' +
    appH.inner + ')');

  // --- B. toolbar ---
  function toolbarProbe() {
    return page.evaluate(function () {
      var tb = document.querySelector('.song-tb');
      var center = document.querySelector('.song-tb .tb-center');
      var left = document.querySelector('.song-tb .tb-left');
      var btns = tb.querySelectorAll('button');
      var unreachable = [];
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (!b.getBoundingClientRect().width) continue;   // not rendered
        b.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        var r = b.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 || r.left < -1) {
          unreachable.push(b.getAttribute('data-act') || b.className);
        }
      }
      var rails = tb.querySelectorAll('.tb-left, .tb-right');
      for (var k = 0; k < rails.length; k++) rails[k].scrollLeft = 0;
      window.scrollTo(0, 0);
      return {
        h: tb.getBoundingClientRect().height,
        titleFirst: center && left &&
          center.getBoundingClientRect().top < left.getBoundingClientRect().top,
        unreachable: unreachable
      };
    });
  }
  var tb = await toolbarProbe();
  check(tb.h > 0 && tb.h <= 170,
    '[target] toolbar height ' + Math.round(tb.h) + ' <= 170');
  check(tb.titleFirst, '[target] title row sits above the controls');
  check(!tb.unreachable.length,
    'every toolbar control reachable' +
    (tb.unreachable.length ? ' — clipped: ' + tb.unreachable.join(', ') : ''));
  var taps = await M.tapAudit(page, '.song-tb', 38);
  check(!taps.length,
    '[target] toolbar tap targets >= 38px' +
    (taps.length ? ' — ' + taps.join(', ') : ''));

  // long title: cap and containment must hold
  await M.gotoSong(page, ids.longname);
  tb = await toolbarProbe();
  var titleOk = await page.evaluate(function () {
    var t2 = document.querySelector('.titleblock .t');
    return t2.getBoundingClientRect().right <= window.innerWidth + 1;
  });
  check(tb.h <= 170 && titleOk,
    '[target] long title: toolbar cap holds, title contained (' +
    Math.round(tb.h) + ')');
  await M.gotoSong(page, ids.standard);

  // --- C. strips ---
  var strip = await page.evaluate(function () {
    var s = document.querySelector('.diagram-strip');
    var r = s.getBoundingClientRect();
    return { fits: r.right <= window.innerWidth + 1 && r.left >= -1 };
  });
  check(strip.fits, 'diagram strip inside viewport');

  await M.gotoSong(page, ids.crowded);
  var crowd = await page.evaluate(function () {
    var s = document.querySelector('.diagram-strip');
    var first = s.querySelector('.dg');
    s.scrollLeft = 0;
    var sr = s.getBoundingClientRect();
    var fr = first.getBoundingClientRect();
    return {
      scrolls: s.scrollWidth > s.clientWidth + 1,
      firstVisible: fr.left >= sr.left - 1,
      cardW: fr.width
    };
  });
  check(crowd.scrolls, 'crowded strip h-scrolls');
  check(crowd.firstVisible,
    '[target] first chord card unclipped at scrollLeft=0');
  check(crowd.cardW >= 54, 'cards keep the 55px floor (' +
    Math.round(crowd.cardW) + ')');
  audit = await M.overflowAudit(page);
  check(!audit.pageOverflow && !audit.offenders.length,
    'crowded song page not widened' +
    (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));

  // triads strip: same containment
  await page.tap('[data-act="toggle-triads"]');
  await page.waitForSelector('.ts-tiles');
  await page.waitForTimeout(350);
  var triad = await page.evaluate(function () {
    var s = document.querySelector('.ts-tiles');
    var first = s.querySelector('.ts-tile');
    s.scrollLeft = 0;
    return first.getBoundingClientRect().left >=
           s.getBoundingClientRect().left - 1;
  });
  check(triad, '[target] first triad tile unclipped at scrollLeft=0');
  await page.tap('[data-act="toggle-diagrams"]');
  await page.waitForTimeout(350);
  await M.gotoSong(page, ids.standard);

  // --- D. fit mode ---
  await page.tap('[data-act="toggle-fit"]');
  await page.waitForSelector('#song-scroll.fit');
  await page.waitForTimeout(450);
  var fit = await page.evaluate(function () {
    var sc = document.querySelector('#song-scroll');
    var body = document.querySelector('.song-body');
    return {
      noOverflow: sc.scrollWidth <= sc.clientWidth + 1 &&
                  sc.scrollHeight <= sc.clientHeight + 1,
      font: parseFloat(getComputedStyle(body).fontSize)
    };
  });
  check(fit.noOverflow, 'fit mode: song fits without scrolling');
  check(fit.font >= 9, 'fit mode: font stays readable (' + fit.font + 'px)');

  // rotate to landscape (desktop layout above 760 — invariants only)
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  audit = await M.overflowAudit(page);
  check(!audit.pageOverflow && !audit.offenders.length,
    'landscape rotation keeps page inside viewport' +
    (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.tap('[data-act="toggle-fit"]');
  await page.waitForTimeout(300);

  // rotation must never lose the autoscroll control: it is CSS-hidden on
  // wide screens, not render-gated on width (fit off after the toggle above)
  var rotBtn = await page.evaluate(function () {
    var b = document.querySelector('#autoscroll-btn');
    return {
      portrait: !!b && getComputedStyle(b).display !== 'none'
    };
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  var landBtn = await page.evaluate(function () {
    var b = document.querySelector('#autoscroll-btn');
    return !!b && getComputedStyle(b).display !== 'none';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check(rotBtn.portrait && landBtn,
    'autoscroll button survives rotation (portrait + landscape phone)');

  // iOS zooms onto focused controls under 16px — phone controls match it
  var inputFont = await page.evaluate(function () {
    var q = document.querySelector('#search-input');
    return q ? parseFloat(getComputedStyle(q).fontSize) : 0;
  });
  check(inputFont >= 16,
    'form controls >= 16px on phones (no iOS focus zoom) — ' + inputFont + 'px');

  // --- E. long tab / long segment must not pan the sheet ---
  await M.gotoSong(page, ids.tabby);
  var tabby = await page.evaluate(function () {
    var sc = document.querySelector('#song-scroll');
    var tab = document.querySelector('pre.tabline');
    var ox = tab ? getComputedStyle(tab).overflowX : '';
    return {
      sheetFixed: sc.scrollWidth <= sc.clientWidth + 1,
      // scrollWidth > clientWidth alone can't tell scrolling from clipping
      tabScrolls: !!tab && tab.scrollWidth > tab.clientWidth + 1 &&
                  (ox === 'auto' || ox === 'scroll')
    };
  });
  check(tabby.sheetFixed,
    'long tab/segment does not pan the sheet');
  check(tabby.tabScrolls, 'tab line scrolls within itself, unwrapped');
  await M.gotoSong(page, ids.standard);

  // --- F. autoscroll (touch path is the [target]; Space is the guard) ---
  var hasBtn = await page.evaluate(function () {
    var b = document.querySelector('[data-act="autoscroll"]');
    return !!b && !!b.getBoundingClientRect().width;
  });
  check(hasBtn, '[target] autoscroll button visible on phones');
  var top0 = await page.evaluate(function () {
    document.querySelector('#song-scroll').scrollTop = 0;
    return document.querySelector('#song-scroll').scrollTop;
  });
  if (hasBtn) await page.tap('[data-act="autoscroll"]');
  else await page.keyboard.press(' ');
  await page.waitForTimeout(1200);
  var top1 = await page.evaluate(function () {
    return document.querySelector('#song-scroll').scrollTop;
  });
  check(top1 > top0, 'autoscroll moves the sheet (' + top0 + ' -> ' + top1 + ')');
  if (hasBtn) await page.tap('[data-act="autoscroll"]');
  else await page.keyboard.press(' ');
  await page.waitForTimeout(300);
  var top2 = await page.evaluate(function () {
    return document.querySelector('#song-scroll').scrollTop;
  });
  await page.waitForTimeout(400);
  var top3 = await page.evaluate(function () {
    return document.querySelector('#song-scroll').scrollTop;
  });
  check(top3 === top2, 'autoscroll stops on second toggle');
  await page.evaluate(function () {
    document.querySelector('#song-scroll').scrollTop = 0;
  });

  // --- G. subs modal via touch ---
  await page.tap('.diagram-strip .dg');
  await page.waitForSelector('#modal-backdrop .modal');
  var subs = await page.evaluate(function () {
    var m = document.querySelector('#modal-backdrop .modal');
    var items = document.querySelector('.sub-items');
    var cols = items ? getComputedStyle(items).gridTemplateColumns.trim() : '';
    return {
      fits: m.getBoundingClientRect().right <= window.innerWidth + 1 &&
            m.getBoundingClientRect().left >= -1,
      oneCol: !!cols && cols.split(' ').length === 1,
      cols: cols
    };
  });
  check(subs.fits, 'subs modal inside viewport');
  check(subs.oneCol,
    '[target] subs list single column on phones (' + subs.cols + ')');
  audit = await M.overflowAudit(page);
  check(!audit.pageOverflow && !audit.offenders.length,
    'subs modal no overflow' +
    (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));
  await page.mouse.click(5, 5);   // backdrop click closes
  await page.waitForTimeout(250);
  var modalGone = await page.evaluate(function () {
    return !document.querySelector('#modal-backdrop');
  });
  check(modalGone, 'backdrop tap closes the modal');

  // --- H. follow mode smoke at phone width ---
  await page.tap('#follow-btn');
  await page.waitForSelector('#follow-btn.listening');
  await page.evaluate(function () {
    __fakeEmit([{ transcript: 'walking down the road', isFinal: true }]);
  });
  await page.waitForSelector('.sung-cur');
  audit = await M.overflowAudit(page);
  check(!audit.pageOverflow && !audit.offenders.length,
    'follow mode highlight keeps layout contained' +
    (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));
  await page.tap('#follow-btn');
  await page.waitForSelector('#follow-btn:not(.listening)');
  check(true, 'follow starts and stops by touch');

  // --- I. static lints (Safari classes Chromium can't emulate) ---
  var css = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'style.css'), 'utf8');
  var appRule = (css.match(/#app\s*\{[^}]*\}/) || [''])[0];
  check(/height:\s*100vh;\s*height:\s*100dvh/.test(appRule),
    '[target] #app uses 100dvh with 100vh fallback');
  var html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  var meta = (html.match(/<meta name="viewport"[^>]*>/) || [''])[0];
  check(meta && !/maximum-scale|user-scalable/.test(meta),
    '[target] viewport meta permits pinch zoom');

  // --- J. clean console ---
  check(!errors.length,
    'no page errors during the run' +
    (errors.length ? ' — ' + errors.join(' | ') : ''));

  await dp.ctx.close();
  await t.done(browser);
}).catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
