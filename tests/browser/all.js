/* Browser test battery runner: node tests/browser/all.js
   Needs Chrome installed and `npm install` run once (playwright-core).
   Each file is also standalone-runnable. */
'use strict';

var spawnSync = require('child_process').spawnSync;
var path = require('path');

try { require('playwright-core'); }
catch (e) {
  console.log('playwright-core not found — run: npm install');
  process.exit(1);
}

var files = ['follow.e2e.js', 'strips.smoke.js', 'backnav.smoke.js', 'layout.smoke.js', 'fretboard.smoke.js'];
var failed = 0;

files.forEach(function (f) {
  console.log('\n=== ' + f + ' ===');
  var r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
});

console.log(failed ? '\nBATTERY: ' + failed + ' file(s) failed'
                   : '\nBATTERY: all ' + files.length + ' files pass');
process.exit(failed ? 1 : 0);
