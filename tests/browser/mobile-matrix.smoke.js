/* Phone/tablet matrix: every device gets the core song-view invariants;
   phones get drawer behavior; one device each for key-menu, fretboard,
   setlist-perform and edit-modal smokes. Checks labeled [target] codify
   the mobile fix spec and are red until the fixes land. */
'use strict';
var H = require('./helpers.js');
var M = require('./mobile-helpers.js');
var t = H.harness('mobile-matrix.smoke');
var check = t.check;

H.launch().then(async function (env) {
  var browser = env.browser;

  var keys = Object.keys(M.DEVICES);
  var saved = null;   // song ids from the iphone context, reused below

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var vw = M.DEVICES[key].viewport.width;
    var phone = vw <= 760;
    var errors = [];
    var dp = await M.devicePage(browser, key, { errors: errors });
    var page = dp.page;

    await page.goto(H.APP);
    await page.waitForSelector('#app .empty-hint, #app .toolbar');
    var ids = await M.seedSongs(page);
    await page.evaluate(function (sid) { location.hash = '#song/' + sid; },
      ids.standard);
    await page.reload();
    await page.waitForSelector('.song-tb');
    await page.waitForTimeout(450);

    // 1. song view: nothing pokes past the viewport
    var audit = await M.overflowAudit(page);
    check(!audit.pageOverflow && !audit.offenders.length,
      key + ': song view no overflow' +
      (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));

    // 2. toolbar height cap (2-3 compact rows on phones, 1 row wider)
    var tbH = await page.evaluate(function () {
      var tb = document.querySelector('.song-tb');
      return tb ? tb.getBoundingClientRect().height : 0;
    });
    var cap = phone ? 170 : 96;
    check(tbH > 0 && tbH <= cap,
      '[target] ' + key + ': toolbar height ' + Math.round(tbH) + ' <= ' + cap);

    // 3. strip stays inside the viewport
    var stripOk = await page.evaluate(function () {
      var s = document.querySelector('.diagram-strip');
      if (!s) return false;
      var r = s.getBoundingClientRect();
      return r.right <= window.innerWidth + 1 && r.left >= -1;
    });
    check(stripOk, key + ': diagram strip inside viewport');

    // 4. crowded song must not widen the page
    await M.gotoSong(page, ids.crowded);
    audit = await M.overflowAudit(page);
    check(!audit.pageOverflow && !audit.offenders.length,
      key + ': crowded song no overflow' +
      (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));
    await M.gotoSong(page, ids.standard);

    if (phone) {
      // 5. drawer: hamburger opens the overlay without shifting content
      var mainLeft = await page.evaluate(function () {
        return document.querySelector('#main').getBoundingClientRect().left;
      });
      await page.tap('button[data-act="toggle-sidebar"]');
      await page.waitForTimeout(300);
      var drawer = await page.evaluate(function () {
        var sb = document.querySelector('#sidebar');
        var main = document.querySelector('#main');
        var scrim = document.querySelector('.scrim');
        var probe = document.elementFromPoint(window.innerWidth - 20,
          Math.floor(window.innerHeight / 2));
        return {
          open: sb.classList.contains('open'),
          left: sb.getBoundingClientRect().left,
          mainLeft: main.getBoundingClientRect().left,
          scrimShown: !!scrim && getComputedStyle(scrim).display !== 'none',
          probeShielded: !!probe && !!scrim && (probe === scrim ||
            scrim.contains(probe) || probe.closest('.sidebar') !== null)
        };
      }, mainLeft);
      check(drawer.open && drawer.left === 0 && drawer.mainLeft === mainLeft,
        key + ': drawer overlays without shifting content');
      check(drawer.scrimShown && drawer.probeShielded,
        '[target] ' + key + ': scrim shields content behind the drawer');
      if (drawer.scrimShown) {
        // tap the scrim where the drawer doesn't cover it (right edge)
        await page.touchscreen.tap(vw - 20,
          Math.floor(M.DEVICES[key].viewport.height / 2));
        await page.waitForTimeout(250);
        var closed = await page.evaluate(function () {
          return !document.querySelector('#sidebar').classList.contains('open');
        });
        check(closed, '[target] ' + key + ': tapping the scrim closes the drawer');
        // reopen for the song-tap check below
        await page.tap('button[data-act="toggle-sidebar"]');
        await page.waitForTimeout(250);
      } else {
        check(false, '[target] ' + key + ': tapping the scrim closes the drawer (no scrim)');
        // drawer is still open — the song tap below also closes it
      }

      // tapping a song closes the drawer (works today — regression guard)
      await page.tap('.songlist .songitem');
      await page.waitForTimeout(350);
      var afterTap = await page.evaluate(function () {
        return {
          open: document.querySelector('#sidebar').classList.contains('open'),
          view: !!document.querySelector('.song-tb')
        };
      });
      check(!afterTap.open && afterTap.view,
        key + ': tapping a song closes the drawer');
    } else {
      // landscape / tablet run desktop layout: toggling the sidebar must
      // not create overflow, whatever layout mode the fix settles on
      await page.click('button[data-act="toggle-sidebar"]');
      await page.waitForTimeout(350);
      audit = await M.overflowAudit(page);
      check(!audit.pageOverflow && !audit.offenders.length,
        key + ': sidebar toggle keeps page inside viewport' +
        (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));
      await page.click('button[data-act="toggle-sidebar"]');
      await page.waitForTimeout(250);
    }

    // 6. narrowest device: key menu opens fully on-screen
    if (key === 'androidSmall') {
      await page.tap('.key-chip');
      await page.waitForSelector('.key-menu');
      var km = await page.evaluate(function () {
        var r = document.querySelector('.key-menu').getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      check(km.left >= 0 && km.right <= 360 + 1 &&
            km.top >= 0 && km.bottom <= 800 + 1,
        key + ': key menu fully inside viewport [' + Math.round(km.left) +
        '..' + Math.round(km.right) + ', ' + Math.round(km.top) + '..' +
        Math.round(km.bottom) + ']');
      await page.mouse.click(180, 780);   // dismiss (mousedown-outside)
      await page.waitForTimeout(200);
    }

    // 7. primary device: fretboard, setlist perform, edit modal
    if (key === 'iphone') {
      // fretboard stacks: charts/controls above, neck fits width
      await page.evaluate(function () { location.hash = '#fretboard'; });
      await page.waitForSelector('.fb-controls');
      await page.waitForTimeout(500);
      var fb = await page.evaluate(function () {
        var ctrl = document.querySelector('.fb-controls');
        var svg = document.querySelector('.fb-wrap svg');
        if (!ctrl || !svg) return null;
        return {
          stacked: ctrl.getBoundingClientRect().bottom <=
                   svg.getBoundingClientRect().top + 2,
          svgFits: svg.getBoundingClientRect().right <= window.innerWidth + 1
        };
      });
      check(!!fb && fb.stacked && fb.svgFits,
        key + ': fretboard stacks vertically, neck fits width');
      audit = await M.overflowAudit(page);
      check(!audit.pageOverflow && !audit.offenders.length,
        '[target] ' + key + ': fretboard view no overflow' +
        (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));

      // setlist + perform bar
      var slId = await page.evaluate(function (sids) {
        var sl = window.SongStore.addSetlist(
          'Friday Night At The Blue Note And Beyond');
        window.SongStore.updateSetlist(sl.id, { songIds: sids });
        location.hash = '#setlist/' + sl.id;
        return sl.id;
      }, [ids.standard, ids.crowded]);
      await page.waitForTimeout(450);
      audit = await M.overflowAudit(page);
      check(!audit.pageOverflow && !audit.offenders.length,
        key + ': setlist view no overflow' +
        (audit.offenders.length ? ' — ' + audit.offenders.join(', ') : ''));
      await page.tap('[data-act="perform-setlist"]');
      await page.waitForSelector('.perform-bar');
      var pb = await page.evaluate(function () {
        var bar = document.querySelector('.perform-bar');
        var r = bar.getBoundingClientRect();
        var btns = bar.querySelectorAll('button');
        var minH = 1e9;
        for (var i = 0; i < btns.length; i++) {
          var h = btns[i].getBoundingClientRect().height;
          if (h < minH) minH = h;
        }
        return {
          fits: bar.scrollWidth <= bar.clientWidth + 1 &&
                r.right <= window.innerWidth + 1,
          minBtnH: minH
        };
      });
      check(pb.fits, key + ': perform bar fits the viewport');
      check(pb.minBtnH >= 38,
        '[target] ' + key + ': perform buttons >= 38px tall (' +
        Math.round(pb.minBtnH) + ')');
      await page.tap('[data-act="perform-exit"]');
      await page.waitForTimeout(250);

      // edit-song modal fits
      await M.gotoSong(page, ids.standard);
      await page.tap('[data-act="edit-song"]');
      await page.waitForSelector('#modal-backdrop .modal');
      var em = await page.evaluate(function () {
        var r = document.querySelector('#modal-backdrop .modal')
          .getBoundingClientRect();
        return r.right <= window.innerWidth + 1 && r.left >= -1;
      });
      check(em, key + ': edit modal inside viewport');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      saved = ids;
    }

    check(!errors.length, key + ': no page errors' +
      (errors.length ? ' — ' + errors.join(' | ') : ''));
    await dp.ctx.close();
  }

  check(!!saved, 'iphone pass completed');
  await t.done(browser);
}).catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
