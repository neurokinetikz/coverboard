/* Shared helpers for the browser test battery.
   Each test file is standalone-runnable: node tests/browser/<file>.js
   Requires Chrome (channel 'chrome') and the playwright-core devDependency:
   npm install. The app is loaded from the repo's index.html via file:// —
   fine for these tests because the fake recognizer never touches the mic. */
'use strict';

var path = require('path');
var playwright = require('playwright-core');

var APP = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');

function harness(name) {
  var failures = 0;
  return {
    check: function (cond, label) {
      console.log((cond ? '  ok  ' : '  FAIL ') + label);
      if (!cond) failures++;
    },
    done: function (browser) {
      var p = browser ? browser.close() : Promise.resolve();
      return p.then(function () {
        console.log(failures ? '\n' + name + ': ' + failures + ' FAILURES'
                             : '\n' + name + ': ALL PASS');
        process.exit(failures ? 1 : 0);
      });
    }
  };
}

function launch(opts) {
  opts = opts || {};
  return playwright.chromium.launch({ channel: 'chrome', headless: true })
    .then(function (browser) {
      return browser.newContext({
        viewport: opts.viewport || { width: 1400, height: 900 }
      }).then(function (ctx) {
        var init = Promise.resolve();
        if (opts.fakeSpeech) init = ctx.addInitScript(installFakeSR);
        return init.then(function () { return ctx.newPage(); })
          .then(function (page) {
            page.on('pageerror', function (e) {
              console.log('  PAGE ERROR: ' + e.message);
            });
            return { browser: browser, page: page };
          });
      });
    });
}

/* Fake webkitSpeechRecognition installed before the app loads, so the real
   webspeech engine registers against it. Drive it from tests with:
   __fakeEmit([{transcript, isFinal}], resultIndex) and __fakeEnd(). */
function installFakeSR() {
  window.__fakeSR = { instances: [] };
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = function () {
    var self = this;
    this.continuous = false; this.interimResults = false;
    this.lang = ''; this.maxAlternatives = 1;
    this.onresult = this.onend = this.onerror = this.onstart = null;
    this.start = function () {
      window.__fakeSR.instances.push(self);
      if (self.onstart) self.onstart();
    };
    this.stop = function () { if (self.onend) self.onend(); };
    this.abort = function () {};
  };
  window.__fakeEmit = function (items, resultIndex) {
    var inst = window.__fakeSR.instances[window.__fakeSR.instances.length - 1];
    var results = items.map(function (it) {
      var r = [{ transcript: it.transcript, confidence: 0.9 }];
      r.isFinal = !!it.isFinal; r.length = 1;
      return r;
    });
    if (inst && inst.onresult) {
      inst.onresult({ results: results, resultIndex: resultIndex || 0 });
    }
  };
  window.__fakeEnd = function () {
    var inst = window.__fakeSR.instances[window.__fakeSR.instances.length - 1];
    if (inst && inst.onend) inst.onend();
  };
}

module.exports = { APP: APP, harness: harness, launch: launch };
