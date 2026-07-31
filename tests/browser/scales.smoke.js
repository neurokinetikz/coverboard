/* Scales-column root selector: defaults to the song key, offers only the
   song's chord roots, persists per song, and rides transpose. */
'use strict';
var H = require('./helpers.js');
var t = H.harness('scales.smoke');
var check = t.check;

H.launch({ viewport: { width: 1710, height: 1112 } }).then(async function (env) {
  var page = env.page;
  await page.goto(H.APP);
  await page.waitForSelector('#app .empty-hint, #app .toolbar');
  await page.evaluate(function () {
    var s = window.SongStore.addSong({ title: 'Scale Root Test', artist: '', key: 'G',
      raw: "[Verse]\nG        C\nWalking down the road\nD        Em\nEvery little thing\nAm       D      G\nSunshine on the water" });
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

  function probe() {
    return page.evaluate(function () {
      var card = document.querySelector('#scale-col .ts-scale');
      return {
        chip: document.querySelector('.sc-key-btn').textContent,
        name: document.querySelector('.sc-name').textContent,
        root: card ? card.getAttribute('data-root') : null,
        quality: card ? card.getAttribute('data-quality') : null
      };
    });
  }

  // default: the song key
  var m = await probe();
  check(m.chip === 'G' && m.name === 'G' && m.root === '7',
    'defaults to the song key (chip ' + m.chip + ', root ' + m.root + ')');

  // menu: song key marked current; only the song's chord roots offered
  await page.click('.sc-key-btn');
  await page.waitForSelector('#scales-key-menu');
  var menu = await page.evaluate(function () {
    var cur = document.querySelector('#scales-key-menu .km-key.cur');
    var all = document.querySelectorAll('#scales-key-menu .km-key');
    return {
      curText: cur ? cur.textContent : null,
      labels: Array.prototype.map.call(all, function (b) {
        return b.textContent.replace('song key', '');
      })
    };
  });
  check(menu.curText && menu.curText.indexOf('G') === 0 &&
        menu.curText.indexOf('song key') !== -1,
    'menu: song key selected by default (' + menu.curText + ')');
  check(menu.labels.join(',') === 'G,C,D,Em,Am',
    'menu: only the song chord roots (' + menu.labels.join(',') + ')');

  // choose Em: column re-roots, chip and cards follow
  await page.evaluate(function () {
    var btns = document.querySelectorAll('#scales-key-menu .km-key');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent === 'Em') { btns[i].click(); return; }
    }
  });
  await page.waitForTimeout(400);
  m = await probe();
  check(m.chip === 'Em' && m.name === 'Em' && m.root === '4' && m.quality === 'min',
    'Em selected: column re-rooted (chip ' + m.chip + ', root ' + m.root + ')');

  // persists across reload
  await page.reload();
  await page.waitForSelector('#scale-col .chord-svg');
  await page.waitForTimeout(350);
  m = await probe();
  check(m.chip === 'Em', 'root choice persists across reload (' + m.chip + ')');

  // transpose +1: the override rides along (Em -> Fm)
  await page.click('[data-act="transpose"][data-d="1"]');
  await page.waitForTimeout(400);
  m = await probe();
  check(m.chip === 'Fm' && m.root === '5',
    'transpose +1 carries the root (chip ' + m.chip + ', root ' + m.root + ')');

  // back to song key via the menu
  await page.click('.sc-key-btn');
  await page.waitForSelector('#scales-key-menu');
  await page.evaluate(function () {
    document.querySelector('#scales-key-menu .km-key[data-clear]').click();
  });
  await page.waitForTimeout(400);
  m = await probe();
  check(m.chip === 'Ab' && m.root === '8',
    'song-key entry restores the default (chip ' + m.chip + ')');

  await t.done(env.browser);
}).catch(function (e) { console.log('FATAL: ' + e.message); process.exit(1); });
