/* build.js — inlines css + js into a single self-contained dist/coverboard.html.
   Run: node build.js */
'use strict';
var fs = require('fs');
var path = require('path');

var root = __dirname;
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

var html = read('index.html');
var css = read('css/style.css');

var scripts = ['js/chordtheory.js', 'js/parser.js', 'js/voicings.js',
               'js/diagrams.js', 'js/triads.js', 'js/subs.js', 'js/fretboard.js',
               'js/search.js', 'js/store.js',
               'js/filestore.js', 'js/follow.js', 'js/app.js'];

html = html.replace('<link rel="stylesheet" href="css/style.css">',
  '<style>\n' + css + '\n</style>');

var inlined = scripts.map(function (p) {
  // </script> inside JS strings would terminate the tag; escape defensively
  return '<script>\n' + read(p).replace(/<\/script>/gi, '<\\/script>') + '\n</script>';
}).join('\n');

html = html.replace(
  scripts.map(function (p) { return '<script src="' + p + '"></script>'; }).join('\n'),
  inlined);

if (html.indexOf('src="js/') !== -1) {
  console.error('build failed: script tags not fully replaced');
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'coverboard.html'), html);
console.log('dist/coverboard.html written (' + (html.length / 1024).toFixed(0) + ' KB)');
