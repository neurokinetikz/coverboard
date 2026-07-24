/* Shared utilities for the phone/tablet viewport battery.
   Device descriptors are explicit (viewport/dsf/isMobile/hasTouch) so the
   matrix is pinned to our CSS breakpoints; only UA strings come from the
   playwright presets. Chromium emulation only — Safari-specific classes
   (dvh, pinch zoom) are guarded by static lints in mobile-song.e2e.js. */
'use strict';

var playwright = require('playwright-core');
var H = require('./helpers.js');

function ua(name, fallback) {
  var d = playwright.devices && playwright.devices[name];
  return (d && d.userAgent) || fallback;
}
var UA_ANDROID = ua('Pixel 7',
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36');
var UA_IPHONE = ua('iPhone 13',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
var UA_IPAD = ua('iPad Mini', UA_IPHONE);

/* phoneLandscape and tabletPortrait sit ABOVE the 760px drawer breakpoint —
   they get desktop layout today. Their checks are invariants that must hold
   in either layout mode; don't hard-code which layout appears. */
var DEVICES = {
  androidSmall:   { viewport: { width: 360, height: 800 },  deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_ANDROID },
  iphone:         { viewport: { width: 390, height: 844 },  deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE },
  iphoneMax:      { viewport: { width: 430, height: 932 },  deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE },
  phoneLandscape: { viewport: { width: 844, height: 390 },  deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE },
  tabletPortrait: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD }
};

/* New context+page on an existing browser, emulating DEVICES[key].
   opts.fakeSpeech installs the fake recognizer before app load;
   opts.errors (array) collects pageerror messages. */
function devicePage(browser, key, opts) {
  opts = opts || {};
  var d = DEVICES[key];
  if (!d) throw new Error('unknown device: ' + key);
  return browser.newContext({
    viewport: d.viewport,
    deviceScaleFactor: d.deviceScaleFactor,
    isMobile: d.isMobile,
    hasTouch: d.hasTouch,
    userAgent: d.userAgent
  }).then(function (ctx) {
    var init = opts.fakeSpeech ? ctx.addInitScript(H.installFakeSR)
                               : Promise.resolve();
    return init.then(function () { return ctx.newPage(); }).then(function (page) {
      page.on('pageerror', function (e) {
        console.log('  PAGE ERROR: ' + e.message);
        if (opts.errors) opts.errors.push(e.message);
      });
      return { ctx: ctx, page: page };
    });
  });
}

/* Seed the four battery songs; returns {standard, crowded, tabby, longname}.
   Caller sets location.hash and reloads (store persists to localStorage). */
function seedSongs(page) {
  return page.evaluate(function () {
    var verse = "C        G\nWalking down the road\nAm       F\nEvery little thing\nF        G      C\nSunshine on the water";
    var std = window.SongStore.addSong({ title: 'Resp Test', artist: '', key: 'C',
      raw: "[Verse 1]\n" + verse + "\n\n[Chorus]\n" + verse +
           "\n\n[Verse 2]\n" + verse + "\n\n[Verse 3]\n" + verse });
    var crowd = window.SongStore.addSong({ title: 'Crowded', artist: '', key: 'C',
      raw: "[Verse]\nC G Am F Dm Em G7 C7 F7 A7 D7 E7 B7 Bm Gm Cm Fm Am7 Dm7 Em7\nx" });
    var tabRun = '';
    for (var i = 0; i < 25; i++) tabRun += '--1--2--';
    var word = '';
    for (var j = 0; j < 120; j++) word += 'a';
    var tabby = window.SongStore.addSong({ title: 'Tabby', artist: '', key: 'C',
      raw: '[Intro]\ne|' + tabRun + '|\n[Verse]\nC\n' + word + '\nG\nAnd a normal line after it' });
    var longname = window.SongStore.addSong({
      title: 'A Terribly Overlong Song Title That Should Ellipsize Nicely',
      artist: 'The Band With The Really Long Name', key: 'C',
      raw: '[Verse]\nC        G\nShort and sweet' });
    window.SongStore.setSetting('fitMode', false);
    window.SongStore.setSetting('showDiagrams', true);
    window.SongStore.setSetting('showTriads', false);
    window.SongStore.setSetting('stripCollapsed', false);
    window.SongStore.setSetting('scalesCollapsed', false);
    return { standard: std.id, crowded: crowd.id,
             tabby: tabby.id, longname: longname.id };
  });
}

/* Walk visible elements; flag any box poking past the viewport's sides.
   Skips content inside designed horizontal scrollers — but only while the
   scroller's own box fits (a scroller that widens the page is an offender).
   Fully offscreen boxes (off-canvas drawer) are transforms, not overflow. */
function overflowAudit(page) {
  return page.evaluate(function () {
    var vw = window.innerWidth;
    var SCROLLERS = ['diagram-strip', 'ts-tiles', 'chordrow', 'tabline',
                     'tb-left', 'tb-right', 'cl'];
    function scrollerAncestor(el) {
      var n = el.parentElement;
      while (n && n !== document.body) {
        for (var i = 0; i < SCROLLERS.length; i++) {
          if (n.classList.contains(SCROLLERS[i])) {
            // trust the class only if the element really scrolls — an
            // overflow regression (e.g. hidden) must not stay allowlisted
            var ox = getComputedStyle(n).overflowX;
            if (ox === 'auto' || ox === 'scroll') return n;
          }
        }
        n = n.parentElement;
      }
      return null;
    }
    function name(el) {
      var s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      var cls = String(el.className.baseVal !== undefined
        ? el.className.baseVal : el.className);
      if (cls) s += '.' + cls.trim().split(/\s+/).slice(0, 3).join('.');
      return s;
    }
    var offenders = [];
    var all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length && offenders.length < 10; i++) {
      var el = all[i], r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right <= 0 || r.left >= vw) continue;      // fully offscreen
      if (r.right <= vw + 1 && r.left >= -1) continue; // fits
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var sc = scrollerAncestor(el);
      if (sc) {
        var sr = sc.getBoundingClientRect();
        if (sr.right <= vw + 1 && sr.left >= -1) continue;
      }
      offenders.push(name(el) + ' [' + Math.round(r.left) + '..' +
        Math.round(r.right) + ']');
    }
    return {
      pageOverflow: document.documentElement.scrollWidth > vw + 1,
      offenders: offenders
    };
  });
}

/* Visible tap targets inside scopeSel shorter than minH px. */
function tapAudit(page, scopeSel, minH) {
  return page.evaluate(function (args) {
    var scope = document.querySelector(args.scope);
    if (!scope) return ['scope not found: ' + args.scope];
    var els = scope.querySelectorAll('button, [role="button"]');
    var bad = [];
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.height < args.minH) {
        bad.push((els[i].getAttribute('data-act') || els[i].className || els[i].tagName) +
          ' h=' + Math.round(r.height));
      }
    }
    return bad;
  }, { scope: scopeSel, minH: minH });
}

function gotoSong(page, id) {
  return page.evaluate(function (sid) {
    location.hash = '#song/' + sid;
  }, id).then(function () { return page.waitForTimeout(450); });
}

module.exports = {
  DEVICES: DEVICES, devicePage: devicePage, seedSongs: seedSongs,
  overflowAudit: overflowAudit, tapAudit: tapAudit, gotoSong: gotoSong
};
