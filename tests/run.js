/* tests/run.js — node test harness for the songbook engines. Run: node tests/run.js */
'use strict';

var CT = require('../js/chordtheory.js');
var Parser = require('../js/parser.js');
var V = require('../js/voicings.js');
var DG = require('../js/diagrams.js');
var Search = require('../js/search.js');
var Store = require('../js/store.js');
var T = require('../js/triads.js');
var FB = require('../js/fretboard.js');
var SB = require('../js/subs.js');
var FL = require('../js/follow.js');

var passed = 0, failed = 0, failures = [];
function ok(cond, name, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' — ' + detail : '')); }
}
function eq(a, b, name) {
  ok(a === b, name, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}
function deepEq(a, b, name) {
  ok(JSON.stringify(a) === JSON.stringify(b), name,
     'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

/* ============ chord theory ============ */

(function () {
  var p = CT.parseChord('C');
  eq(p.rootPc, 0, 'C root pc');
  deepEq(p.intervals, [0, 4, 7], 'C intervals');

  p = CT.parseChord('F#m7b5');
  eq(p.rootPc, 6, 'F#m7b5 root');
  eq(p.quality, 'm7b5', 'F#m7b5 quality');

  p = CT.parseChord('D/F#');
  eq(p.bassPc, 6, 'D/F# bass pc');

  p = CT.parseChord('Bbmaj7');
  eq(p.rootPc, 10, 'Bbmaj7 root');
  eq(p.quality, 'maj7', 'Bbmaj7 quality');

  ok(CT.parseChord('Cadd9') !== null, 'Cadd9 parses');
  ok(CT.parseChord('Asus') !== null, 'Asus parses');
  ok(CT.parseChord('E7#9') !== null, 'E7#9 parses');
  ok(CT.parseChord('Gm/Bb') !== null, 'Gm/Bb parses');
  ok(CT.parseChord('C#dim7') !== null, 'C#dim7 parses');
  ok(CT.parseChord('Dmin7') !== null, 'Dmin7 alias parses');
  ok(CT.parseChord('AbMaj7') !== null, 'AbMaj7 alias parses');
  ok(CT.parseChord('F♯m') !== null, 'unicode sharp parses');
  ok(CT.parseChord('B♭') !== null, 'unicode flat parses');
  ok(CT.parseChord('C7(b9)') !== null, 'C7(b9) parses');
  ok(CT.parseChord('Am(maj7)') !== null, 'Am(maj7) parses');

  // things that must NOT parse as chords
  ok(CT.parseChord('Hello') === null, 'Hello rejected');
  ok(CT.parseChord('And') === null, 'And rejected');
  ok(CT.parseChord('Big') === null, 'Big rejected');
  ok(CT.parseChord('Day') === null, 'Day rejected');
  ok(CT.parseChord('A big day') === null, 'phrase rejected');
  ok(CT.parseChord('Chorus') === null, 'Chorus rejected');
  ok(CT.parseChord('Amazing') === null, 'Amazing rejected');
  ok(CT.parseChord('Emily') === null, 'Emily rejected');
  ok(CT.parseChord('Care') === null, 'Care rejected');
  ok(CT.parseChord('Ends') === null, 'Ends rejected');

  // transpose
  eq(CT.transposeChord('C', 2, false), 'D', 'C +2 = D');
  eq(CT.transposeChord('Am', -2, false), 'Gm', 'Am -2 = Gm');
  eq(CT.transposeChord('D/F#', 1, true), 'Eb/G', 'D/F# +1 flat = Eb/G');
  eq(CT.transposeChord('Bbmaj7', 2, false), 'Cmaj7', 'Bbmaj7 +2 = Cmaj7');
  eq(CT.transposeChord('E7#9', 1, false), 'F7#9', 'E7#9 +1 keeps suffix');
  eq(CT.transposeChord('C', 12, false), 'C', 'C +12 = C');
  eq(CT.transposeChord('C', -12, false), 'C', 'C -12 = C');
  eq(CT.transposeChord('Gsus4', 5, false), 'Csus4', 'Gsus4 +5');

  // key detection
  var k = CT.detectKey(['G', 'C', 'D', 'Em', 'G', 'C', 'G']);
  eq(k.name, 'G', 'key of G detected');
  k = CT.detectKey(['Am', 'F', 'C', 'G', 'Am']);
  eq(k.name, 'Am', 'key of Am detected');
  k = CT.detectKey(['F', 'Bb', 'C', 'Dm', 'F']);
  eq(k.name, 'F', 'key of F detected');

  eq(CT.keyPrefersFlat(5, false), true, 'F major prefers flats');
  eq(CT.keyPrefersFlat(7, false), false, 'G major prefers sharps');
  eq(CT.keyPrefersFlat(2, true), true, 'D minor prefers flats');
})();

/* ============ parser: UG chords-over-lyrics ============ */

(function () {
  var ug = [
    'Wonderwall chords by Oasis',
    '',
    'Capo: 2nd fret',
    '',
    '[Intro]',
    'Em7  G  Dsus4  A7sus4  (x2)',
    '',
    '[Verse 1]',
    'Em7           G',
    'Today is gonna be the day',
    '            Dsus4                A7sus4',
    "That they're gonna throw it back to you",
    '',
    '[Pre-Chorus]',
    'D                Em7      G',
    'And all the roads we have to walk are winding',
    '',
    '[Chorus]',
    'C     D     Em7',
    "Because maybe",
    '',
    '[Solo]',
    'e|-----3-----3-----|',
    'B|---3-----3-------|',
    'G|-0-----0---------|'
  ].join('\n');

  var song = Parser.parseSong(ug, {});
  eq(song.title, 'Wonderwall', 'UG title from "chords by" line');
  eq(song.artist, 'Oasis', 'UG artist from "chords by" line');
  eq(song.capo, 2, 'capo detected from "Capo: 2nd fret"');
  eq(song.sections.length, 5, '5 sections');
  eq(song.sections[0].type, 'intro', 'intro type');
  eq(song.sections[1].type, 'verse', 'verse type');
  eq(song.sections[2].type, 'prechorus', 'prechorus type');
  eq(song.sections[3].type, 'chorus', 'chorus type');
  eq(song.sections[4].type, 'solo', 'solo type');

  var intro = song.sections[0].lines[0];
  eq(intro.kind, 'chords', 'intro line is chords-only');
  deepEq(intro.chords.map(function (c) { return c.sym; }),
    ['Em7', 'G', 'Dsus4', 'A7sus4'], 'intro chords (x2 filler skipped)');

  var v1 = song.sections[1].lines[0];
  eq(v1.kind, 'chordlyric', 'verse line paired');
  eq(v1.lyric, 'Today is gonna be the day', 'verse lyric');
  eq(v1.chords[0].sym, 'Em7', 'verse chord 1');
  eq(v1.chords[0].pos, 0, 'Em7 at col 0');
  eq(v1.chords[1].sym, 'G', 'verse chord 2');
  eq(v1.chords[1].pos, 14, 'G at col 14');

  var solo = song.sections[4];
  eq(solo.lines[0].kind, 'tab', 'tab line detected');
  ok(solo.lines[0].text.indexOf('e|-----3') === 0, 'tab text preserved');

  ok(song.chords.indexOf('Em7') !== -1, 'chords list has Em7');
  ok(song.key === 'G' || song.key === 'Em', 'key detected as G-ish, got ' + song.key);
})();

/* ============ parser: header style variants ============ */

(function () {
  var text = [
    'Verse 1:',
    'C       G',
    'Hello world',
    '',
    'CHORUS',
    'F      C',
    'Sing along',
    '',
    '(Bridge)',
    'Am     F',
    'Middle bit',
    '',
    'Outro:',
    'C'
  ].join('\n');
  var song = Parser.parseSong(text, {});
  eq(song.sections.length, 4, 'colon/caps/paren headers: 4 sections');
  eq(song.sections[0].type, 'verse', 'Verse 1: type');
  eq(song.sections[1].type, 'chorus', 'CHORUS type');
  eq(song.sections[2].type, 'bridge', '(Bridge) type');
  eq(song.sections[3].type, 'outro', 'Outro: type');

  // header lookalikes that must NOT be headers
  var s2 = Parser.parseSong('C\nHello darkness my old friend\nAnother lyric line here', {});
  eq(s2.sections.length, 1, 'plain lyrics stay in one section');
  var kinds = s2.sections[0].lines.map(function (l) { return l.kind; });
  deepEq(kinds, ['chordlyric', 'lyric'], 'C paired with first lyric, second stays lyric');

  // [Am] alone is a chord line, not a section header
  var s3 = Parser.parseSong('[Am]\nsome lyric', {});
  eq(s3.sections.length, 1, '[Am] not treated as header');
})();

/* ============ parser: UG raw markup ([ch]/[tab]) ============ */

(function () {
  var text = [
    '[Verse]',
    '[tab][ch]C[/ch]        [ch]G[/ch]',
    'Hello    world[/tab]'
  ].join('\n');
  var song = Parser.parseSong(text, {});
  var line = song.sections[0].lines[0];
  eq(line.kind, 'chordlyric', '[ch] markup line paired');
  deepEq(line.chords.map(function (c) { return c.sym; }), ['C', 'G'], '[ch] chords extracted');
})();

/* ============ parser: ChordPro ============ */

(function () {
  var text = [
    '{title: My Song}',
    '{artist: Somebody}',
    '{capo: 3}',
    '',
    '{start_of_verse}',
    '[C]Hello [G]world, [Am]sing it [F]loud',
    '{end_of_verse}',
    '',
    '{start_of_chorus}',
    '[F]Here we [C]go',
    '{end_of_chorus}'
  ].join('\n');
  var song = Parser.parseSong(text, {});
  eq(song.title, 'My Song', 'chordpro title');
  eq(song.artist, 'Somebody', 'chordpro artist');
  eq(song.capo, 3, 'chordpro capo');
  eq(song.sections.length, 2, 'chordpro 2 sections');
  eq(song.sections[0].type, 'verse', 'chordpro verse');
  eq(song.sections[1].type, 'chorus', 'chordpro chorus');
  var l = song.sections[0].lines[0];
  eq(l.lyric, 'Hello world, sing it loud', 'chordpro lyric joined');
  eq(l.chords[0].pos, 0, 'chordpro C at 0');
  eq(l.chords[1].sym, 'G', 'chordpro G');
  eq(l.chords[1].pos, 6, 'chordpro G at 6 (start of "world")');
})();

/* ============ parser: metadata & edge cases ============ */

(function () {
  var song = Parser.parseSong('Title: Foo\nArtist: Bar\nKey: Bb\nCapo 4\n\n[Verse]\nC\nla la', {});
  eq(song.title, 'Foo', 'Title: line');
  eq(song.artist, 'Bar', 'Artist: line');
  eq(song.key, 'Bb', 'Key: line');
  eq(song.capo, 4, 'Capo 4 line');

  // chords past end of lyric
  var s = Parser.parseSong('[Verse]\nC        G     Am\nShort', {});
  var l = s.sections[0].lines[0];
  eq(l.chords.length, 3, 'three chords kept');
  ok(l.chords[2].pos >= l.lyric.length, 'Am pos beyond lyric end');

  // empty input
  var e = Parser.parseSong('', {});
  eq(e.sections.length, 0, 'empty input -> 0 sections');

  // lyrics-only (no chords at all)
  var lo = Parser.parseSong('Just some words\nAnd some more words', {});
  eq(lo.sections.length, 1, 'lyrics-only 1 section');
  eq(lo.chords.length, 0, 'lyrics-only no chords');

  // chord line at end of input with no lyric after
  var ce = Parser.parseSong('[Outro]\nC  G  Am  F', {});
  eq(ce.sections[0].lines[0].kind, 'chords', 'trailing chord line kept as chords row');

  // N.C. and bar lines in chord rows
  var nc = Parser.parseSong('[Verse]\n| C | G | N.C. | Am |\nwords here', {});
  var ncl = nc.sections[0].lines[0];
  eq(ncl.kind, 'chordlyric', 'barline chord row paired');
  deepEq(ncl.chords.map(function (c) { return c.sym; }), ['C', 'G', 'Am'], 'N.C. and bars skipped');

  // section repeat markers
  var rep = Parser.parseSong('[Chorus] x2\nC  G\nla la', {});
  eq(rep.sections[0].repeat, 2, '[Chorus] x2 repeat');
})();

/* ============ regressions from adversarial verification ============ */

(function () {
  // lyric lines starting with a section keyword are NOT headers
  ok(Parser.parseSectionHeader('Bridge over the canyon light') === null, 'lyric starting with Bridge not header');
  ok(Parser.parseSectionHeader('Hook of the moon keeps glowing') === null, 'lyric starting with Hook not header');
  ok(Parser.parseSectionHeader('End of the road') === null, 'End of the road not header');
  // but real headers still work
  ok(Parser.parseSectionHeader('Guitar Solo') !== null, 'Guitar Solo header');
  ok(Parser.parseSectionHeader('Middle 8') !== null, 'Middle 8 header');
  eq(Parser.sectionTypeFor('Middle 8'), 'bridge', 'Middle 8 -> bridge');
  var h = Parser.parseSectionHeader('Intro (x2)');
  ok(h && h.repeat === 2, 'Intro (x2) header with repeat');
  h = Parser.parseSectionHeader('[Chorus] x2');
  ok(h && h.repeat === 2, '[Chorus] x2 repeat');
  ok(Parser.parseSectionHeader('Outro/End') !== null, 'Outro/End header');
  ok(Parser.parseSectionHeader('PRE-CHORUS 2') !== null, 'PRE-CHORUS 2 header');
  eq(Parser.sectionTypeFor('PRE-CHORUS 2'), 'prechorus', 'PRE-CHORUS 2 type');

  // headers with inline chords keep the chords
  var s = Parser.parseSong('[Intro] G D Em C\n\n[Verse 1]\nG        D\nPaper boats on a silver sea', {});
  eq(s.sections[0].type, 'intro', '[Intro] G D Em C -> intro section');
  eq(s.sections[0].lines[0].kind, 'chords', 'inline header chords kept');
  deepEq(s.sections[0].lines[0].chords.map(function (c) { return c.sym; }), ['G', 'D', 'Em', 'C'], 'inline header chord syms');
  ok(s.chords.indexOf('Em') !== -1, 'Em reaches song.chords');
  s = Parser.parseSong('Intro: Am F C G\nla la la', {});
  eq(s.sections[0].type, 'intro', 'Intro: Am F C G -> intro');
  eq(s.sections[0].lines[0].kind, 'chords', 'colon header chords kept');

  // full parse: keyword-led lyrics survive inside their section
  s = Parser.parseSong('[Verse]\nC          G\nBridge over the canyon light\nAm         F\nSolo in the fading glow', {});
  eq(s.sections.length, 1, 'keyword-led lyrics stay in one section');
  eq(s.sections[0].lines[0].kind, 'chordlyric', 'first pairing kept');
  eq(s.sections[0].lines[0].lyric, 'Bridge over the canyon light', 'Bridge lyric kept');
  eq(s.sections[0].lines[1].lyric, 'Solo in the fading glow', 'Solo lyric kept');

  // UG [ch] markup no longer triggers ChordPro mode
  ok(!Parser.looksLikeChordPro('[tab][ch]C[/ch]  [ch]G[/ch]\nHello world[/tab]\n[ch]Am[/ch]  [ch]F[/ch]\nMore words'), '[ch] does not trigger chordpro');
  s = Parser.parseSong('[Verse]\n[tab][ch]C[/ch]        [ch]G[/ch]\nHello    world[/tab]\nTurn it up [x2] and let it ring', {});
  eq(s.sections[0].lines[0].kind, 'chordlyric', '[ch] chord line pairs');
  deepEq(s.sections[0].lines[0].chords.map(function (c) { return c.sym; }), ['C', 'G'], '[ch] chords extracted');
  ok(JSON.stringify(s.sections).indexOf('[ch]') === -1 && JSON.stringify(s.sections).indexOf('[tab]') === -1, 'no markup leaks');
  // mixed chords+lyrics on one line convert to inline pairing
  s = Parser.parseSong('[Verse]\n[ch]Am[/ch] under the [ch]F[/ch] willow\nplain next line', {});
  var ml = s.sections[0].lines[0];
  eq(ml.kind, 'chordlyric', 'mixed [ch] line becomes chordlyric');
  deepEq(ml.chords.map(function (c) { return c.sym; }), ['Am', 'F'], 'mixed [ch] chords kept');
  ok(ml.lyric.indexOf('under the') !== -1 && ml.lyric.indexOf('willow') !== -1, 'mixed [ch] lyric text kept');
  // orphan tags stripped
  s = Parser.parseSong('[Verse]\nC  G[/ch]\nwords', {});
  ok(JSON.stringify(s.sections).indexOf('[/ch]') === -1, 'orphan [/ch] stripped');

  // tab lines: uppercase prefixes, colon notation, not artist metadata
  ok(Parser.isTabLine('C|---0---2---|'), 'drop-C tab line');
  ok(Parser.isTabLine('F#|--2--4--|'), 'F# tab line');
  ok(Parser.isTabLine('A:--0--3--5--|'), 'A: colon tab line');
  ok(!Parser.isTabLine('Ah---'), 'Ah--- is not tab');
  ok(!Parser.isTabLine('Ahhh------'), 'Ahhh--- is not tab');
  ok(!Parser.isTabLine('---'), 'bare --- is not tab');
  s = Parser.parseSong('A:--0--3--5--|\nD:--0--2--3--|\n\n[Verse]\nC\nhello', {});
  eq(s.artist, '', 'colon tab line not eaten as artist');
  eq(s.sections[0].lines[0].kind, 'tab', 'colon tab preserved');
  // held-vowel lyric under a chord line pairs correctly
  s = Parser.parseSong('[Outro]\nC        G\nAhhh---  ohhh---', {});
  eq(s.sections[0].lines[0].kind, 'chordlyric', 'Ahhh--- pairs with chords');

  // chord-lookalike lyrics stay lyrics
  s = Parser.parseSong('[Verse]\nC       G\nreal lyric here\nDo Do Do\nGO GO GO\nA B C D E F G', {});
  var kinds = s.sections[0].lines.map(function (l) { return l.kind; });
  deepEq(kinds, ['chordlyric', 'lyric', 'lyric', 'lyric'], 'Do/GO/alphabet lines stay lyric');
  deepEq(s.chords, ['C', 'G'], 'no phantom dim chords');
  ok(CT.parseChord('Do') === null, 'Do no longer parses');
  ok(CT.parseChord('Go') === null, 'Go no longer parses');
  ok(CT.parseChord('C°') !== null, 'C-ring still parses as dim');
  ok(CT.parseChord('Bo7') !== null, 'Bo7 still parses as dim7');
  var m11 = CT.parseChord('Amadd11');
  ok(m11 && m11.quality === 'madd11' && m11.intervals.indexOf(3) !== -1, 'Amadd11 keeps minor third');

  // metadata: junk lines no longer end the scan; Key with mode word
  s = Parser.parseSong([
    'Fading Highways chords by The Placeholder Band',
    '1,234,567 views',
    'Difficulty: intermediate',
    'Tuning: E A D G B E',
    'Key: A minor',
    'Capo: 3',
    '',
    '[Verse]',
    'Am    G',
    'invented words here'
  ].join('\n'), {});
  eq(s.title, 'Fading Highways', 'chords-by title after junk');
  eq(s.artist, 'The Placeholder Band', 'chords-by artist after junk');
  eq(s.key, 'Am', 'Key: A minor -> Am');
  eq(s.capo, 3, 'capo survives junk lines');
  eq(s.tuning, 'E A D G B E', 'tuning extracted');
  var junkAsChords = s.chords.filter(function (c) { return c !== 'Am' && c !== 'G'; });
  deepEq(junkAsChords, [], 'no junk chords');

  // plain lyrics paste: " by "/" - " lines stay lyrics
  s = Parser.parseSong('Standing by the river today\nWatching it all - flow away', {});
  eq(s.title, '', 'plain lyrics: no bogus title');
  eq(s.sections[0].lines[0].kind, 'lyric', 'plain lyrics stay lyric');
  // but "Song - Artist" over a real chord sheet still works
  s = Parser.parseSong('My Great Song - Some Band\n\n[Verse]\nC  G\nwords', {});
  eq(s.title, 'My Great Song', 'dash title with music');
  eq(s.artist, 'Some Band', 'dash artist with music');

  // bare tuning line in preamble
  s = Parser.parseSong('E A D G B E\n\n[Verse]\nC  G\nwords', {});
  eq(s.tuning, 'E A D G B E', 'bare tuning line captured');
  deepEq(s.chords, ['C', 'G'], 'tuning line not in chords');

  // strumming pattern D D D D in preamble is junk, not chords
  s = Parser.parseSong('D D D D\n\n[Verse]\nC  G\nwords', {});
  deepEq(s.chords, ['C', 'G'], 'D D D D not parsed as chords in preamble');

  // N.C. and repeat annotations
  s = Parser.parseSong('[Verse]\nN.C.      C     G\nShout it out across the town', {});
  var vl = s.sections[0].lines[0];
  eq(vl.kind, 'chordlyric', 'N.C. line still pairs');
  deepEq(vl.annots.map(function (a) { return a.text; }), ['N.C.'], 'N.C. kept as annotation');
  eq(vl.annots[0].pos, 0, 'N.C. position kept');
  ok(s.chords.indexOf('N.C.') === -1, 'N.C. not in chord list');
  s = Parser.parseSong('[Verse]\nC  G  Am\nx2\nreal lyric', {});
  eq(s.sections[0].lines[0].kind, 'chords', 'chord row flushed before x2');
  eq(s.sections[0].lines[1].kind, 'comment', 'x2 becomes comment');
  eq(s.sections[0].lines[2].kind, 'lyric', 'lyric after x2 not stolen');
  // standalone N.C. line
  s = Parser.parseSong('[Bridge]\nAm   F\nN.C.\nShout the seconds out', {});
  eq(s.sections[0].lines[0].kind, 'chords', 'chords flushed before standalone N.C.');
  eq(s.sections[0].lines[1].kind, 'comment', 'standalone N.C. is a comment');

  // repeat suffixes on chords
  s = Parser.parseSong('[Chorus]\nC  G  Am  Gx3\nwords below here', {});
  deepEq(s.sections[0].lines[0].chords.map(function (c) { return c.sym; }), ['C', 'G', 'Am', 'G'], 'Gx3 keeps chord G');
  s = Parser.parseSong('[Chorus]\nC  G(x3)\nwords below here', {});
  deepEq(s.sections[0].lines[0].chords.map(function (c) { return c.sym; }), ['C', 'G'], 'G(x3) keeps chord G');
  // parenthesized chord position + symbol integrity
  var cls = Parser.classifyChordLine('(C)    C7(b9)');
  eq(cls.chords[0].pos, 1, '(C) position points at the letter');
  eq(cls.chords[1].sym, 'C7(b9)', 'C7(b9) symbol intact');

  // tab characters expand at 8-column stops
  eq(Parser.expandTabs('G\tD7'), 'G       D7', 'tab expands to stop 8');
  s = Parser.parseSong('[Verse]\nG\tD7\nSunrise\tclimbs the hill', {});
  var tl = s.sections[0].lines[0];
  eq(tl.chords[1].pos, 8, 'D7 lands on column 8');
  eq(tl.lyric.indexOf('climbs'), 8, 'lyric tab-aligned at column 8');

  // zero-width space and unicode separators
  s = Parser.parseSong('[Verse]\nC​  G\nRiver bends away', {});
  deepEq(s.sections[0].lines[0].chords.map(function (c) { return c.sym; }), ['C', 'G'], 'zero-width space stripped');
  s = Parser.parseSong('line one line two', {});
  eq(s.sections[0].lines.length, 2, 'U+2028 splits lines');

  // ChordPro upgrades
  ok(Parser.looksLikeChordPro('[G] Hello there my friend\n[C] Another line of song'), 'spaced inline chords detected');
  s = Parser.parseSong('{capo: nope}\n{capo: 3}\n[C]Hello [G]world\n[Am]Sing it [F]loud', {});
  eq(s.capo, 3, 'NaN capo ignored, later capo kept');
  s = Parser.parseSong('{sob}\n[C]Bridge line here\n{eob}\n{comment-italic: softly now}\n{chorus}', {});
  eq(s.sections[0].type, 'bridge', '{sob} makes bridge');
  var cmts = [];
  s.sections.forEach(function (sec) { sec.lines.forEach(function (l) { if (l.kind === 'comment') cmts.push(l.text); }); });
  ok(cmts.indexOf('softly now') !== -1, 'comment-italic parsed');
  ok(cmts.some(function (c) { return /chorus/i.test(c); }), '{chorus} recall visible');
  s = Parser.parseSong('# just a source comment\n{t: Named}\n[C]Hello [G]world\n[Am]More [F]lines', {});
  eq(s.title, 'Named', 'chordpro title');
  ok(Parser.songPlainText(s).indexOf('source comment') === -1, '# lines skipped');
  s = Parser.parseSong('{soc: Chorus 2}\n[C]Loud [G]now\n{eoc}', {});
  eq(s.sections[0].label, 'Chorus 2', '{soc: label} kept');
  // chordpro without title: dash lyric is not eaten
  s = Parser.parseSong('[C]Walking down - the [G]old dirt road\n[Am]Second line [F]here', {});
  eq(s.title, '', 'chordpro dash lyric not eaten as title');
  ok(Parser.songPlainText(s).indexOf('Walking down - the old dirt road') !== -1, 'dash lyric intact');
  // long inline chord
  var cpl = Parser.parseChordProLine('he[Ebsus2sus4/Bb]llo');
  eq(cpl.chords.length, 1, 'long bracket chord parsed');
  eq(cpl.lyric, 'hello', 'long bracket removed from lyric');

  // divider lines become comments
  s = Parser.parseSong('[Verse]\nC  G\nwords\n----------\nmore words', {});
  var kinds2 = s.sections[0].lines.map(function (l) { return l.kind; });
  ok(kinds2.indexOf('comment') !== -1, 'divider line is comment');
})();

/* ============ round-2 regressions ============ */

(function () {
  // bracket headers with rider text
  var h = Parser.parseSectionHeader('[Chorus] (repeat and fade)');
  ok(h && h.label === 'Chorus' && h.note === '(repeat and fade)', '[Chorus] rider note');
  h = Parser.parseSectionHeader('[Outro] repeat till fade');
  ok(h && h.label === 'Outro', '[Outro] rider note');
  ok(Parser.parseSectionHeader('[x2]') === null, '[x2] is not a header');
  var s = Parser.parseSong('[Verse]\nC  G\nwords here\n[x2]\nmore words', {});
  var kinds = s.sections[0].lines.map(function (l) { return l.kind; });
  ok(kinds.indexOf('comment') !== -1 && s.sections.length === 1, '[x2] line stays a comment in-section');
  // pending chord row protects "Keyword: text" lyrics
  s = Parser.parseSong('[Verse]\nC        G\nTag: you are it now friend', {});
  eq(s.sections.length, 1, 'Tag: lyric under chords not a header');
  eq(s.sections[0].lines[0].kind, 'chordlyric', 'Tag: lyric pairs with chords');
  // qualifiers
  ok(Parser.parseSectionHeader('Verse 1 (Acoustic)') !== null, 'Verse 1 (Acoustic) header');
  ok(Parser.parseSectionHeader('Verse 3 & 4') !== null, 'Verse 3 & 4 header');

  // [ch] chord rows with filler/untagged chords take the pairing path
  s = Parser.parseSong('[Verse]\n| [ch]C[/ch] | [ch]G[/ch] | [ch]Am[/ch] | [ch]F[/ch] |\nCounting stars until the dawn', {});
  var l0 = s.sections[0].lines[0];
  eq(l0.kind, 'chordlyric', 'barline [ch] row pairs with lyric');
  deepEq(l0.chords.map(function (c) { return c.sym; }), ['C', 'G', 'Am', 'F'], 'barline [ch] chords');
  s = Parser.parseSong('[Verse]\n[ch]G[/ch]  Cadd9  [ch]D[/ch]\nEvery window keeps its own routines', {});
  deepEq(s.sections[0].lines[0].chords.map(function (c) { return c.sym; }), ['G', 'Cadd9', 'D'], 'untagged chord kept in [ch] row');
  s = Parser.parseSong('[Verse]\n[ch]C[/ch]        [ch]G\nEvery window keeps its own routines', {});
  deepEq(s.sections[0].lines[0].chords.map(function (c) { return c.sym; }), ['C', 'G'], 'unclosed [ch] tag still yields both chords');
  s = Parser.parseSong('[Verse]\n[ch]Am[/ch][ch]G[/ch]\nwords below here now', {});
  deepEq(s.sections[0].lines[0].chords.map(function (c) { return c.sym; }), ['Am', 'G'], 'adjacent [ch] chords split');
  // fused [tab] blocks on one physical line
  s = Parser.parseSong('[Verse]\n[tab]G       C[/tab][tab]Hello out there my friend[/tab]', {});
  eq(s.sections[0].lines[0].kind, 'chordlyric', 'fused [tab] blocks split into lines');
  eq(s.sections[0].lines[0].lyric, 'Hello out there my friend', 'fused [tab] lyric intact');

  // metadata round 2
  s = Parser.parseSong('I woke up early\nI played those chords by heart\nNothing else mattered', {});
  eq(s.title, '', 'plain lyrics: chords-by line not eaten');
  ok(Parser.songPlainText(s).indexOf('chords by heart') !== -1, 'chords-by lyric survives');
  s = Parser.parseSong('Standing by the Window - The Larks\n\n[Verse]\nC  G\nla la', {});
  eq(s.title, 'Standing by the Window', 'dash split beats by split');
  eq(s.artist, 'The Larks', 'dash artist correct');
  s = Parser.parseSong('Silver Crossing Chords (ver 2) by Night Ferry Quartet\n\n[Verse]\nC  G\nla', {});
  eq(s.title, 'Silver Crossing', '(ver 2) stripped from title');
  s = Parser.parseSong('Capo\n4th fret\n\n[Verse]\nC  G\nla', {});
  eq(s.capo, 4, 'table-layout capo recovered');

  // tabs round 2
  ok(!Parser.isTabLine('Ahh--- x4'), 'Ahh--- x4 not tab');
  ok(Parser.isTabLine('A|000000000000|'), 'dashless chug line is tab');
  ok(Parser.isTabLine('e│---0---2---│'), 'box-drawing pipe tab');
  s = Parser.parseSong('[Verse]\ne│---0---2---│\nB│---1---3---│', {});
  eq(s.sections[0].lines[0].kind, 'tab', 'box-pipe lines parse as tab');

  // alphabet & repeats round 2
  s = Parser.parseSong('[Verse]\nA B C\nSing them once again with me', {});
  eq(s.sections[0].lines[0].kind, 'lyric', 'A B C stays lyric');
  var cls = Parser.classifyChordLine('F G A');
  ok(cls.isChordLine, 'F G A is still a chord line');
  cls = Parser.classifyChordLine('C  G  Am  Gx3');
  deepEq(cls.annots.map(function (a) { return a.text; }), ['x3'], 'Gx3 repeat kept as annot');

  // chordpro lyric before first inline chord survives
  s = Parser.parseSong('{key: C}\nA quiet line before the chords\n[C]Hello [G]world\n[Am]Second [F]line', {});
  ok(Parser.songPlainText(s).indexOf('A quiet line before the chords') !== -1, 'chordpro pre-chord lyric kept');

  // graded bass + reachable open grips
  var CTh = CT;
  var a13 = V.generateVoicings('A13', 20).map(function (v) { return v.frets.join(','); });
  ok(a13.indexOf('-1,0,2,0,2,2') !== -1, 'A13 x02022 reachable');
  var em6 = V.generateVoicings('Em6', 20).map(function (v) { return v.frets.join(','); });
  ok(em6.indexOf('0,2,2,0,2,0') !== -1, 'Em6 022020 reachable');
  var d69 = V.getVoicings('D69', 1)[0];
  var low = null;
  for (var st = 0; st < 6; st++) if (d69.frets[st] >= 0) { low = (V.TUNING[st] + d69.frets[st]) % 12; break; }
  // root or 5th in the bass is idiomatic; the original bug was the 9th (E) down there
  ok(low === 2 || low === 9, 'D69 top voicing bass is root or 5th, got pc ' + low);
  // genCache returns full lists regardless of first-call size
  V.getVoicings('G#m11', 1);
  ok(V.getVoicings('G#m11', 6).length >= 4, 'chord modal gets more voicings after strip cached 1');
})();

/* ============ voicings ============ */

(function () {
  function checkChord(sym, expectShape) {
    var vs = V.getVoicings(sym, 4);
    ok(vs.length > 0, sym + ' has voicings');
    if (!vs.length) return;
    var parsed = CT.parseChord(sym);
    var want = {};
    CT.chordPcs(parsed).forEach(function (pc) { want[pc] = 1; });
    // every sounding note must belong to the chord
    vs.forEach(function (v, i) {
      var pcs = V.shapeSoundingPcs(v.frets);
      var extra = pcs.filter(function (pc) { return !want[pc]; });
      // allow slash bass
      if (parsed.bassPc !== null) extra = extra.filter(function (pc) { return pc !== parsed.bassPc; });
      deepEq(extra, [], sym + ' voicing ' + i + ' has no wrong notes (frets ' + v.frets.join(',') + ')');
      ok(pcs.indexOf(parsed.rootPc) !== -1, sym + ' voicing ' + i + ' contains root');
    });
    if (expectShape) {
      deepEq(vs[0].frets, expectShape, sym + ' primary shape');
    }
  }

  checkChord('C', [-1, 3, 2, 0, 1, 0]);
  checkChord('G', [3, 2, 0, 0, 0, 3]);
  checkChord('D', [-1, -1, 0, 2, 3, 2]);
  checkChord('A', [-1, 0, 2, 2, 2, 0]);
  checkChord('E', [0, 2, 2, 1, 0, 0]);
  checkChord('Am', [-1, 0, 2, 2, 1, 0]);
  checkChord('Em', [0, 2, 2, 0, 0, 0]);
  checkChord('Dm', [-1, -1, 0, 2, 3, 1]);
  checkChord('F', [1, 3, 3, 2, 1, 1]);
  checkChord('B7', [-1, 2, 1, 2, 0, 2]);
  checkChord('Bm', [-1, 2, 4, 4, 3, 2]);
  checkChord('Cadd9', [-1, 3, 2, 0, 3, 0]);
  checkChord('Em7');
  checkChord('A7sus4');
  checkChord('Dsus4');
  checkChord('F#m');
  checkChord('Bb');
  checkChord('C#m7');
  checkChord('Ebmaj7');   // generated
  checkChord('G#m');      // generated
  checkChord('Baug');     // generated
  checkChord('Ddim7');    // generated
  checkChord('F9');       // generated
  checkChord('Am9');      // generated
  checkChord('D/F#', [2, -1, 0, 2, 3, 2]);
  checkChord('G/B', [-1, 2, 0, 0, 0, 3]);

  // slash chords must put the bass note lowest
  var dfs = V.getVoicings('D/F#', 3);
  dfs.forEach(function (v, i) {
    var low = null;
    for (var s = 0; s < 6; s++) if (v.frets[s] >= 0) { low = (V.TUNING[s] + v.frets[s]) % 12; break; }
    eq(low, 6, 'D/F# voicing ' + i + ' bass is F#');
  });

  // barre detection on F
  var f = V.getVoicings('F', 1)[0];
  ok(f.barre && f.barre.fret === 1, 'F barre at fret 1');

  // diagram renders valid SVG
  var svg = DG.renderChordSVG(f, { label: 'F' });
  ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') !== -1, 'F diagram SVG renders');
  var svgHigh = DG.renderChordSVG(V.getVoicings('Cm', 1)[0], { label: 'Cm' });
  ok(svgHigh.indexOf('fr</text>') !== -1 || svgHigh.indexOf('3fr') !== -1, 'Cm shows base fret label');
})();

/* ============ search ============ */

(function () {
  var entries = [
    Search.indexSong({ id: '1', title: 'Wonderwall', artist: 'Oasis', chords: ['Em7', 'G'] }, 'today is gonna be the day'),
    Search.indexSong({ id: '2', title: 'Wish You Were Here', artist: 'Pink Floyd', chords: ['C', 'D', 'Am', 'G'] }, 'so you think you can tell'),
    Search.indexSong({ id: '3', title: 'Hotel California', artist: 'Eagles', chords: ['Bm', 'F#'] }, 'on a dark desert highway')
  ];
  var r = Search.search(entries, 'wonder');
  eq(r[0].id, '1', 'title prefix match first');
  r = Search.search(entries, 'pink');
  eq(r[0].id, '2', 'artist match');
  r = Search.search(entries, 'desert highway');
  eq(r[0].id, '3', 'lyrics match');
  eq(r[0].where, 'lyrics', 'lyrics match labeled');
  r = Search.search(entries, 'wywh');
  ok(r.length && r[0].id === '2', 'fuzzy initials match');
  r = Search.search(entries, '');
  eq(r.length, 3, 'empty query returns all');
})();

/* ============ store ============ */

(function () {
  Store._resetForTests();
  var s = Store.addSong({ title: 'Test', artist: 'Me', raw: '[Verse]\nC  G\nhello' });
  ok(!!s.id, 'song id assigned');
  eq(Store.listSongs().length, 1, 'song listed');
  var parsed = Store.parsedSong(s);
  eq(parsed.sections.length, 1, 'parsed cached song');
  Store.updateSong(s.id, { transpose: 2 });
  eq(Store.getSong(s.id).transpose, 2, 'transpose saved');
  var sl = Store.addSetlist('Gig');
  Store.updateSetlist(sl.id, { songIds: [s.id] });
  eq(Store.getSetlist(sl.id).songIds.length, 1, 'setlist song added');
  var json = Store.exportJSON();
  Store.deleteSong(s.id);
  eq(Store.listSongs().length, 0, 'song deleted');
  eq(Store.getSetlist(sl.id).songIds.length, 0, 'deleted song removed from setlist');
  var n = Store.importJSON(json, 'merge');
  eq(n, 1, 'import restored 1 song');
})();

/* ============ subs engine ============ */

(function () {
  function kinds(res) {
    var out = [];
    res.forEach(function (x) { if (out.indexOf(x.kind) === -1) out.push(x.kind); });
    return out;
  }
  function symsOf(res, kind) {
    return res.filter(function (x) { return x.kind === kind; })
              .map(function (x) { return x.sym; });
  }

  // -- major-key function table (C major) --
  var r1 = SB.substitutionsFor('C', { keyPc: 0, minor: false });
  deepEq(symsOf(r1, 'function'), ['Em', 'Am'], 'I -> iii, vi in C');
  var am = r1.filter(function (x) { return x.sym === 'Am'; })[0];
  deepEq(am.sharedPcs, [0, 4], 'C ∩ Am keeps C·E');
  deepEq(am.changedPcs, [9], 'Am adds A');
  eq(r1.filter(function (x) { return x.sym === 'Am'; }).length, 1,
     'relative deduped into function');
  deepEq(symsOf(r1, 'color'), ['Cmaj7', 'Cadd9', 'C6', 'Csus4'], 'maj color table');

  var r2 = SB.substitutionsFor('Dm', { keyPc: 0, minor: false, nextSym: 'G' });
  deepEq(symsOf(r2, 'function'), ['F'], 'ii -> IV');
  deepEq(symsOf(r2, 'secondary'), ['D7'], 'Dm before G offers V7/V');
  eq(symsOf(r2, 'tritone').length, 0, 'no tritone sub for a minor chord');
  deepEq(symsOf(r2, 'borrowed'), ['Fm'], 'ii also borrows subdominant-minor iv');

  // -- tritone detection: positive, spelling, shared-pc math --
  var r3 = SB.substitutionsFor('G7', { keyPc: 0, minor: false, nextSym: 'C' });
  deepEq(symsOf(r3, 'tritone'), ['Db7'], 'tritone sub flat-spelled');
  var tt = r3.filter(function (x) { return x.kind === 'tritone'; })[0];
  deepEq(tt.sharedPcs, [11, 5], 'G7 ∩ Db7 keeps B·F (the 3&7 tritone)');
  deepEq(symsOf(r3, 'function'), ['Bm7b5'], 'V7 -> viio-half-dim');
  eq(symsOf(r3, 'secondary').length, 0, 'already-dominant chord gets no secondary');
  deepEq(symsOf(r3, 'color'), ['G9', 'G13', 'G7sus4'], 'dom color table');
  deepEq(symsOf(r3, 'borrowed'), ['Bb'], 'V also offers backdoor bVII, flat-spelled');
  deepEq(kinds(r3), ['function', 'tritone', 'borrowed', 'color'], 'group order for G7 in C');

  // -- tritone negative: maj7 resolving down a P5 must NOT fire --
  var r4 = SB.substitutionsFor('Cmaj7', { keyPc: 0, minor: false, nextSym: 'F' });
  eq(symsOf(r4, 'tritone').length, 0, 'Cmaj7 -> F is not dominant function');
  deepEq(symsOf(r4, 'secondary'), ['C7'], 'Imaj7 before IV offers I7 (V7/IV)');

  // -- plain V triad DOES get the tritone sub via key/resolution --
  var r4b = SB.substitutionsFor('G', { keyPc: 0, minor: false, nextSym: 'C' });
  deepEq(symsOf(r4b, 'tritone'), ['Db7'], 'plain V triad -> implied-G7 tritone sub');

  // -- minor-key tables (A minor) --
  var r5 = SB.substitutionsFor('Am', { keyPc: 9, minor: true });
  deepEq(symsOf(r5, 'function'), ['C', 'F'], 'i -> III, VI in Am');
  deepEq(symsOf(r5, 'borrowed'), ['A'], 'Picardy third');
  var r6 = SB.substitutionsFor('Dm', { keyPc: 9, minor: true });
  deepEq(symsOf(r6, 'function'), ['Bm7b5'], 'iv -> ii-half-dim in Am');
  eq(r6.filter(function (x) { return x.sym === 'Bm7b5'; })[0].sharedPcs.length, 3,
     'ii-half-dim contains all of iv');
  deepEq(symsOf(r6, 'borrowed'), ['D'], 'Dorian IV');
  deepEq(symsOf(SB.substitutionsFor('Em', { keyPc: 9, minor: true }), 'function'),
         ['E7'], 'v -> harmonic-minor V7');

  // -- edge cases --
  var r7 = SB.substitutionsFor('Am', {});
  deepEq(kinds(r7), ['relative', 'color'], 'no key: relative + color only');
  deepEq(symsOf(r7, 'relative'), ['C'], 'keyless relative swap');
  deepEq(SB.substitutionsFor('C5', { keyPc: 0, minor: false })
           .map(function (x) { return x.sym; }), ['C'],
         'power chord: diatonic third-fill only');
  eq(SB.substitutionsFor('C5', {}).length, 0, 'power chord without key: nothing');
  ok(SB.substitutionsFor('D/F#', { keyPc: 7, minor: false }).every(
       function (x) { return x.sym.indexOf('/') === -1; }),
     'slash bass dropped from candidates');
  eq(SB.substitutionsFor('notachord', {}).length, 0, 'garbage in, empty out');
  // caption spelling is chord-relative, not key-relative:
  // Amaj7's added tone is G# even in flat-side Dm; F's sus tone stays Bb
  var rA = SB.substitutionsFor('A', { keyPc: 2, minor: true });
  var amaj7 = rA.filter(function (x) { return x.sym === 'Amaj7'; })[0];
  ok(amaj7 && amaj7.reason.indexOf('G#') !== -1, 'Amaj7 adds G#, not Ab: ' + (amaj7 && amaj7.reason));
  var rF = SB.substitutionsFor('F', { keyPc: 0, minor: false });
  var fsus = rF.filter(function (x) { return x.sym === 'Fsus4'; })[0];
  ok(fsus && fsus.reason.indexOf('Bb') !== -1, 'Fsus4 adds Bb, not A#: ' + (fsus && fsus.reason));
  // every emitted candidate must itself parse (charts depend on it)
  ['C', 'Dm', 'G7', 'Am', 'F#m7b5', 'Bb', 'Esus4', 'A7'].forEach(function (s) {
    SB.substitutionsFor(s, { keyPc: 0, minor: false, nextSym: 'C' }).forEach(function (x) {
      ok(CT.parseChord(x.sym) !== null, 'candidate parses: ' + s + ' -> ' + x.sym);
    });
  });
})();

/* ============ store: corrupted-settings guard ============ */

(function () {
  // A blob with settings:null used to throw in load()'s migration loop, and
  // the catch replaced the WHOLE state with defaults — songs included.
  var storePath = require.resolve('../js/store.js');
  var cachedModule = require.cache[storePath];
  var prevDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  var stub = {
    _v: JSON.stringify({ songs: [{ id: 'x1', title: 'Keep Me', artist: '', raw: 'C G Am F',
                                   transpose: 0, createdAt: 1, updatedAt: 1 }],
                         setlists: [], savedAt: 5, settings: null, seeded: true }),
    getItem: function (k) {
      if (k === 'songbook.v1') return this._v;
      return this.hasOwnProperty('_' + k) ? this['_' + k] : null;
    },
    setItem: function (k, v) { if (k === 'songbook.v1') this._v = String(v); else this['_' + k] = String(v); },
    removeItem: function (k) { delete this['_' + k]; }
  };
  var installed = false;
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
    installed = true;
  } catch (e) { /* environment refuses; skip rather than fail */ }
  if (installed) {
    delete require.cache[storePath];
    var S2 = require(storePath);
    eq(S2.listSongs().length, 1, 'settings:null blob keeps the songs');
    eq(S2.listSongs()[0].title, 'Keep Me', 'song content intact');
    eq(S2.getSettings().showTriads, false, 'settings fell back to defaults');
    delete require.cache[storePath];
    if (cachedModule) require.cache[storePath] = cachedModule;
    if (prevDesc) Object.defineProperty(globalThis, 'localStorage', prevDesc);
    else delete globalThis.localStorage;
  } else {
    ok(true, 'corrupted-settings guard test skipped (localStorage not stubbable)');
  }
})();

/* ============ triads engine ============ */

(function () {
  // --- reduction ---
  eq(T.reduceTriad('Cmaj7').quality, 'maj7', 'Cmaj7 keeps its natural-7 shell');
  eq(T.reduceTriad('Cmaj9').quality, 'maj7', 'Cmaj9 reduces to maj7');
  eq(T.reduceTriad('C6').quality, '6', 'C6 keeps its 6th shell');
  eq(T.reduceTriad('C69').quality, '6', 'C69 reduces to 6');
  eq(T.reduceTriad('Cm6').quality, 'm6', 'Cm6 keeps its 6th shell');
  eq(T.reduceTriad('Cm69').quality, 'm6', 'Cm69 reduces to m6');
  eq(T.reduceTriad('Cadd9').quality, 'maj', 'Cadd9 stays a plain major triad (R-3-9 is a cluster)');
  eq(T.reduceTriad('Cdim7').quality, 'dim', 'dim7 bb7 is not a 6th');
  eq(T.reduceTriad('Cmaj7').rootPc, 0, 'Cmaj7 root pc');
  eq(T.reduceTriad('C7').quality, '7', 'C7 keeps its b7 shell');
  eq(T.reduceTriad('C9').quality, '7', 'C9 reduces to 7');
  eq(T.reduceTriad('Am7').quality, 'm7', 'Am7 keeps its b7 shell');
  eq(T.reduceTriad('Am9').quality, 'm7', 'Am9 reduces to m7');
  eq(T.reduceTriad('Am').quality, 'min', 'Am stays a plain minor triad');
  eq(T.reduceTriad('F#m7b5').quality, 'dim', 'F#m7b5 reduces to dim');
  eq(T.reduceTriad('F#m7b5').rootPc, 6, 'F#m7b5 root pc');
  eq(T.reduceTriad('G7sus4').quality, 'sus4', 'G7sus4 reduces to sus4');
  eq(T.reduceTriad('Dsus2').quality, 'sus2', 'Dsus2 reduces to sus2');
  eq(T.reduceTriad('C7#9').quality, '7', 'C7#9 reduces to 7 (raw #9 is not a b3)');
  eq(T.reduceTriad('C7#5').quality, 'aug', 'C7#5 keeps its aug color');
  eq(T.reduceTriad('Bdim7').quality, 'dim', 'Bdim7 reduces to dim');
  eq(T.reduceTriad('D/F#').quality, 'maj', 'D/F# reduces to maj');
  eq(T.reduceTriad('D/F#').rootPc, 2, 'D/F# root pc');
  eq(T.reduceTriad('D/F#').bassPc, 6, 'D/F# keeps bass pc');
  eq(T.reduceTriad('C5').quality, '5', 'C5 stays a power chord');
  eq(T.reduceTriad('C7b5').quality, '7', 'C7b5 approximates to 7');
  ok(T.reduceTriad('C7b5').approx, 'C7b5 flagged approx');
  ok(!T.reduceTriad('Cmaj7').approx, 'Cmaj7 not approx');
  eq(T.reduceTriad('Am(maj7)').quality, 'min', 'Am(maj7) reduces to min (natural 7 is not a b7)');
  eq(T.reduceTriad('C13').quality, '7', 'C13 reduces to 7');
  eq(T.reduceTriad('Caug').quality, 'aug', 'Caug stays aug');
  eq(T.reduceTriad('Csus2sus4').quality, 'sus4', 'sus2sus4 prefers sus4');
  eq(T.reduceTriad('Cadd4').quality, 'maj', 'add4 keeps the major third');

  // --- closed-voicing generator ---
  function grab(rootPc, q, setId, inv) {
    return T.triadsFor(rootPc, q).filter(function (v) {
      return v.stringSet === setId && v.inversion === inv;
    });
  }
  var X = -1;
  deepEq(grab(0, 'maj', '1-3', 0)[0].frets, [X, X, X, 5, 5, 3], 'C 1-3 root position');
  deepEq(grab(0, 'maj', '1-3', 1)[0].frets, [X, X, X, 9, 8, 8], 'C 1-3 1st inversion');
  var cInv2 = grab(0, 'maj', '1-3', 2);
  eq(cInv2.length, 2, 'C 1-3 2nd inversion occurs twice (octave apart)');
  deepEq(cInv2[0].frets, [X, X, X, 0, 1, 0], 'C 1-3 2nd inversion low');
  deepEq(cInv2[1].frets, [X, X, X, 12, 13, 12], 'C 1-3 2nd inversion high');
  deepEq(grab(0, 'maj', '2-4', 2)[0].frets, [X, X, 5, 5, 5, X], 'C 2-4 2nd inversion');
  deepEq(grab(0, 'maj', '2-4', 0)[0].frets, [X, X, 10, 9, 8, X], 'C 2-4 root position');
  deepEq(grab(0, 'maj', '4-6', 2)[0].frets, [3, 3, 2, X, X, X], 'C 4-6 2nd inversion');
  var cInv1_46 = grab(0, 'maj', '4-6', 1);
  eq(cInv1_46.length, 1, 'C 4-6 1st inversion: negative-fret candidate rejected');
  deepEq(cInv1_46[0].frets, [12, 10, 10, X, X, X], 'C 4-6 1st inversion');
  deepEq(grab(7, 'maj', '4-6', 0)[0].frets, [3, 2, 0, X, X, X], 'G 4-6 root position');
  deepEq(grab(7, 'maj', '4-6', 1)[0].frets, [7, 5, 5, X, X, X], 'G 4-6 1st inversion');
  deepEq(grab(7, 'maj', '4-6', 2)[0].frets, [10, 10, 9, X, X, X], 'G 4-6 2nd inversion');
  deepEq(grab(9, 'min', '1-3', 0)[0].frets, [X, X, X, 2, 1, 0], 'Am 1-3 root position');
  deepEq(grab(9, 'min', '1-3', 1)[0].frets, [X, X, X, 5, 5, 5], 'Am 1-3 1st inversion');
  deepEq(grab(9, 'min', '1-3', 2)[0].frets, [X, X, X, 9, 10, 8], 'Am 1-3 2nd inversion');
  deepEq(grab(11, 'dim', '1-3', 0)[0].frets, [X, X, X, 4, 3, 1], 'Bdim 1-3 root position');
  deepEq(grab(0, '5', '4-6', 0)[0].frets, [8, 10, 10, X, X, X], 'C5 power grip on 4-6');
  // dim root position spans 4 frets on the low sets — must not be culled
  deepEq(grab(0, 'dim', '4-6', 0)[0].frets, [8, 6, 4, X, X, X], 'Cdim 4-6 root position (span 4)');
  deepEq(grab(0, 'dim', '3-5', 0)[0].frets, [X, 15, 13, 11, X, X], 'Cdim 3-5 root position (span 4)');
  // 7th shells (R-3-b7 / R-b3-b7, 5th omitted)
  deepEq(grab(0, '7', '1-3', 0)[0].frets, [X, X, X, 5, 5, 6], 'C7 1-3 root position');
  deepEq(grab(0, '7', '1-3', 2)[0].frets, [X, X, X, 3, 1, 0], 'C7 1-3 b7-bass rotation (top of open C7)');
  deepEq(grab(9, 'm7', '1-3', 0)[0].frets, [X, X, X, 2, 1, 3], 'Am7 1-3 root position');
  deepEq(grab(0, 'maj7', '1-3', 0)[0].frets, [X, X, X, 5, 5, 7], 'Cmaj7 1-3 root position (C-E-B)');
  deepEq(grab(0, '6', '1-3', 0)[0].frets, [X, X, X, 5, 5, 5], 'C6 1-3 root position (C-E-A)');
  // the identity lesson: C6 shell frets === Am 1st-inversion frets
  deepEq(grab(0, '6', '1-3', 0)[0].frets, grab(9, 'min', '1-3', 1)[0].frets,
         'C6 shell is pitch-identical to Am 1st inversion');
  // every quality has all 3 inversions on all 4 sets (the pedagogical grid)…
  ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '7', '6', 'm6'].forEach(function (q) {
    ['1-3', '2-4', '3-5', '4-6'].forEach(function (setId) {
      for (var inv = 0; inv < 3; inv++) {
        ok(grab(0, q, setId, inv).length > 0, 'C' + q + ' ' + setId + ' inv' + inv + ' exists');
      }
    });
  });
  // …except the m7/maj7 7th-in-bass rotations on the low sets (span 5 — culled)
  ['m7', 'maj7'].forEach(function (q) {
    ['1-3', '2-4', '3-5', '4-6'].forEach(function (setId) {
      ok(grab(0, q, setId, 0).length > 0, 'C' + q + ' ' + setId + ' inv0 exists');
      ok(grab(0, q, setId, 1).length > 0, 'C' + q + ' ' + setId + ' inv1 exists');
    });
    ok(grab(0, q, '1-3', 2).length > 0, 'C' + q + ' 1-3 inv2 exists');
    ok(grab(0, q, '2-4', 2).length > 0, 'C' + q + ' 2-4 inv2 exists');
    eq(grab(0, q, '3-5', 2).length, 0, 'C' + q + ' 3-5 inv2 culled (span 5)');
    eq(grab(0, q, '4-6', 2).length, 0, 'C' + q + ' 4-6 inv2 culled (span 5)');
  });

  // metadata
  var cInv1 = grab(0, 'maj', '1-3', 1)[0];
  eq(cInv1.rootString, 5, 'C 1-3 1st inversion: root on high e');
  eq(cInv1.baseFret, 8, 'C 1-3 1st inversion baseFret');
  var cInv0 = grab(0, 'maj', '1-3', 0)[0];
  eq(cInv0.rootString, 3, 'C 1-3 root position: root on G string');
  eq(cInv0.baseFret, 3, 'C 1-3 root position baseFret');
  eq(cInv0.bassPc, 0, 'C 1-3 root position bass pc');

  // property: every C major voicing sounds exactly {0,4,7}, span <= 3,
  // and renders through the existing diagram renderer
  T.triadsFor(0, 'maj').forEach(function (v) {
    var pcs = {};
    for (var s = 0; s < 6; s++) {
      if (v.frets[s] >= 0) pcs[(V.TUNING[s] + v.frets[s]) % 12] = 1;
    }
    deepEq(Object.keys(pcs).sort().join(','), '0,4,7', 'C voicing pcs ' + v.frets.join(','));
    var fr = v.frets.filter(function (f) { return f >= 0; });
    ok(Math.max.apply(null, fr) - Math.min.apply(null, fr) <= 3,
       'C voicing span ' + v.frets.join(','));
    ok(DG.renderChordSVG(v, { label: 'C' }).indexOf('<svg') === 0,
       'C voicing renders ' + v.frets.join(','));
  });

  // --- CAGED model ---
  var posC = T.positionsForKey(0, false);
  deepEq(posC.map(function (p) { return [p.shape, p.frame]; }),
         [['C', 0], ['A', 3], ['G', 5], ['E', 8], ['D', 10]], 'key C frames');
  var posG = T.positionsForKey(7, false);
  deepEq(posG.map(function (p) { return [p.shape, p.frame]; }),
         [['G', 0], ['E', 3], ['D', 5], ['C', 7], ['A', 10]], 'key G frames');
  eq(posG[1].index, 2, 'positions carry 1-based ordinals');
  deepEq(posC[4].windows, [[0, 2], [10, 14]], 'key C D-shape wraps below the nut');
  // pattern letters are always major shape names; minor keys use relative-
  // major frames (Am's G·5fr window = box-1 minor pentatonic)
  deepEq(T.positionsForKey(9, true).map(function (p) { return [p.shape, p.frame]; }),
         posC.map(function (p) { return [p.shape, p.frame]; }),
         'Am uses the relative major (C) patterns');
  deepEq(T.positionsForKey(2, true).map(function (p) { return [p.shape, p.frame]; }),
         [['E', 1], ['D', 3], ['C', 5], ['A', 8], ['G', 10]],
         'Dm patterns = F major patterns');
  deepEq(T.assignPositions([X, X, 2, 0, 1, X], posC), ['C', 'D'],
         'assignment includes wrap-around membership');
  deepEq(T.assignPositions([X, X, X, 5, 5, 3], posG), ['E'], 'C@5fr sits in E position of G');

  // --- position picking ---
  var st1 = T.songTriads(['G', 'C', 'D'], { key: 'G', position: 'E', stringSetPref: '1-3' });
  eq(st1.key.name, 'G', 'songTriads keeps the given key');
  deepEq(st1.chords[0].atPosition.best.frets, [X, X, X, 4, 3, 3], 'G @ E position');
  deepEq(st1.chords[1].atPosition.best.frets, [X, X, X, 5, 5, 3], 'C @ E position');
  deepEq(st1.chords[2].atPosition.best.frets, [X, X, X, 7, 7, 5], 'D @ E position');
  eq(st1.chords[0].atPosition.relaxed, false, 'G @ E strict');
  eq(st1.chords[2].atPosition.relaxed, false, 'D @ E strict');

  var st2 = T.songTriads(['C', 'Em'], { key: 'C', position: 'D', stringSetPref: '4-6' });
  deepEq(st2.chords[0].atPosition.best.frets, [12, 10, 10, X, X, X], 'C @ D position on 4-6');
  eq(st2.chords[0].atPosition.relaxed, false, 'C @ D strict');
  deepEq(st2.chords[1].atPosition.best.frets, [12, 10, 9, X, X, X], 'Em @ D relaxes one fret');
  eq(st2.chords[1].atPosition.relaxed, 1, 'Em @ D relaxed = 1');

  // ordinal position selector matches shape letters
  var st1b = T.songTriads(['G', 'C', 'D'], { key: 'G', position: 2, stringSetPref: '1-3' });
  deepEq(st1b.chords[0].atPosition.best.frets, [X, X, X, 4, 3, 3], 'position ordinal 2 = E shape in G');

  // slash bass steers the inversion inside a position
  var posD = T.positionsForKey(2, false);
  var withBass = T.voicingAtPosition(2, 'maj', posD[4], { bassPc: 6 });
  eq(withBass.best.bassPc, 6, 'D/F# puts F# in the bass');
  eq(withBass.relaxed, false, 'D/F# found strictly in position');
  var noBass = T.voicingAtPosition(2, 'maj', posD[4], {});
  ok(noBass.best.bassPc !== 6, 'plain D does not force the 3rd into the bass');
  var pinned = T.voicingAtPosition(2, 'maj', posD[4], { bassPc: 6, stringSetPref: '1-3' });
  deepEq(pinned.best.frets, [X, X, X, 11, 10, 10], 'D/F# on 1-3 = 1st-inversion grip at 10fr');

  // 'any' mode: sensible near-the-nut defaults on strings 1-3
  var stAny = T.songTriads(['C', 'G', 'D', 'Am'], { key: 'C', position: 'any' });
  deepEq(stAny.chords[0].atPosition.best.frets, [X, X, X, 0, 1, 0], 'C any = open-C top');
  deepEq(stAny.chords[1].atPosition.best.frets, [X, X, X, 4, 3, 3], 'G any');
  deepEq(stAny.chords[2].atPosition.best.frets, [X, X, X, 2, 3, 2], 'D any = open-D top');
  deepEq(stAny.chords[3].atPosition.best.frets, [X, X, X, 2, 1, 0], 'Am any = open-Am top');

  // --- near mode (voice-leading chain) ---
  // Anchored score: 30*bassMatch + 9*commonPairs - |sumMidi(v) - sumMidi(anchor)|.
  // All literals hand-derived from the E-shape-of-G pool (frame 3, window [3,7]).
  var stN = T.songTriads(['G', 'C', 'D', 'Em'], { key: 'G', position: 'E', stringSetPref: 'near' });
  deepEq(stN.chords[0].atPosition.best.frets, [X, 5, 5, 4, X, X],
         'near: anchorless start = most central, set floats');
  deepEq(stN.chords[1].atPosition.best.frets, [X, 7, 5, 5, X, X],
         'near: C holds G3 on the same string/fret (D→E, B→C)');
  deepEq(stN.chords[2].atPosition.best.frets, [5, 5, 4, X, X, X],
         'near: D exact tie (dist 18 both ways) broken by minFret');
  deepEq(stN.chords[3].atPosition.best.frets, [7, 7, 5, X, X, X],
         'near: Em pure stepwise ascent above D');
  eq(stN.chords[3].atPosition.relaxed, false, 'near: chain stays strict in window');
  deepEq(T.voicingAtPosition(7, 'maj', posG[1], {}).best.frets, [X, 5, 5, 4, X, X],
         'no pref + no anchor = pure centrality (near first-chord rule)');
  // common tone outranks raw proximity: anchor C on 2-4 (sum 179); G candidates:
  // [x,x,5,4,3] d3 c1 → +6; [x,5,5,4] d15 c1 → -6; [x,x,x,4,3,3] d9 c0 → -9
  var nG = T.voicingAtPosition(7, 'maj', posG[1], { anchor: { frets: [X, X, 5, 5, 5, X] } });
  deepEq(nG.best.frets, [X, X, 5, 4, 3, X], 'near: G after C-on-2-4 holds G3');
  deepEq(nG.alternates[0].frets, [X, 5, 5, 4, X, X],
         'near: 1 common tone outranks 6 semitones of extra drift');
  deepEq(T.voicingAtPosition(7, 'maj', posG[1], { stringSetPref: 'near' }).best.frets,
         [X, 5, 5, 4, X, X], 'unknown stringSetPref sanitized to centrality (no NaN)');
  // E-shape of D (frame 10): [x,12,12,11] re-voices the open-D top's exact
  // pitches (A3 D4 F#4) an octave position up → distance 0 wins outright
  var aD = { frets: [X, X, X, 2, 3, 2] };
  deepEq(T.voicingAtPosition(2, 'maj', posD[4], { anchor: aD }).best.frets,
         [X, 12, 12, 11, X, X], 'near: identical pitches at the new position win (dist 0)');
  deepEq(T.voicingAtPosition(2, 'maj', posD[4], { anchor: aD, bassPc: 6 }).best.frets,
         [14, 12, 12, X, X, X], 'near: slash bass (+30) steers the anchored pick');
  // 'any' + near: whole neck, no ladder — start near the nut with the set free
  var stAnyN = T.songTriads(['C', 'G'], { key: 'C', position: 'any', stringSetPref: 'near' });
  deepEq(stAnyN.chords[0].atPosition.best.frets, [X, 3, 2, 0, X, X],
         'near any: start near the nut, set free');
  deepEq(stAnyN.chords[1].atPosition.best.frets, [X, 2, 0, 0, X, X],
         'near any: G/B — C→B, E→D, G held');
  var stMap = T.songTriads(['G', 'C'], { key: 'G', stringSetPref: 'near' });
  deepEq(stMap.chords[1].byPosition.E.best.frets, [X, 7, 5, 5, X, X],
         'near byPosition: per-shape chain threads');

  // --- open (spread) voicing family ---
  // openOffsets = closed rotation with the middle voice raised an octave
  // (R-5-3 / 3-R-5 / 5-3-R) on the three skip-string sets. All literals
  // hand-derived from OPEN_MIDI arithmetic and verified against the engine.
  function grabO(rootPc, q, setId, inv) {
    return T.triadsFor(rootPc, q, { family: 'open' }).filter(function (v) {
      return v.stringSet === setId && v.inversion === inv;
    });
  }
  var closedRef = T.triadsFor(0, 'maj');
  eq(closedRef.length, 16, 'closed default pool size unchanged');
  var openPool = T.triadsFor(0, 'maj', { family: 'open' });
  ok(T.triadsFor(0, 'maj') === closedRef, 'open generation does not touch the closed cache');
  eq(openPool.length, 10, 'C maj open pool size');
  deepEq(grabO(0, 'maj', '2-4-5', 0)[0].frets, [X, 3, 5, X, 5, X],
         'canonical C spread: root position on A D B');
  deepEq(grabO(0, 'maj', '2-4-5', 1)[0].frets, [X, 7, 10, X, 8, X], 'C spread 1st inv 2-4-5');
  deepEq(grabO(0, 'maj', '2-4-5', 2)[0].frets, [X, 10, 14, X, 13, X], 'C spread 2nd inv 2-4-5');
  deepEq(grabO(0, 'maj', '1-3-4', 0)[0].frets, [X, X, 10, 12, X, 12], 'C spread root 1-3-4');
  deepEq(grabO(0, 'maj', '1-3-4', 1)[0].frets, [X, X, 2, 5, X, 3], 'C spread 1st inv 1-3-4');
  deepEq(grabO(0, 'maj', '1-3-4', 2)[0].frets, [X, X, 5, 9, X, 8], 'C spread 2nd inv 1-3-4');
  deepEq(grabO(0, 'maj', '3-5-6', 0)[0].frets, [8, 10, X, 9, X, X], 'C spread root 3-5-6');
  eq(grabO(0, 'maj', '3-5-6', 1).length, 2, 'octave twins for the open-string grip');
  deepEq(grabO(0, 'maj', '3-5-6', 1)[0].frets, [0, 3, X, 0, X, X], 'C spread 1st inv twin low');
  deepEq(grabO(0, 'maj', '3-5-6', 1)[1].frets, [12, 15, X, 12, X, X], 'C spread 1st inv twin 12fr');
  // family property test: right pcs, playable span, a genuine skipped string
  openPool.forEach(function (v) {
    var pcs = {};
    for (var s = 0; s < 6; s++) {
      if (v.frets[s] >= 0) pcs[(V.TUNING[s] + v.frets[s]) % 12] = 1;
    }
    deepEq(Object.keys(pcs).sort().join(','), '0,4,7', 'open C pcs ' + v.frets.join(','));
    var fr = v.frets.filter(function (f) { return f >= 0; });
    ok(Math.max.apply(null, fr) - Math.min.apply(null, fr) <= 4,
       'open span ' + v.frets.join(','));
    var idx = [];
    for (var s2 = 0; s2 < 6; s2++) if (v.frets[s2] >= 0) idx.push(s2);
    deepEq(idx, v.strings, 'sounding strings match the set triple');
    ok(idx[2] - idx[0] === 3, 'spread grip skips a string');
    eq(v.family, 'open', 'tagged open');
    eq(v.barre, null, 'no phantom barre across the muted string');
    ok(DG.renderChordSVG(v, { label: 'C', roles: null, showFingers: false })
       .indexOf('<svg') === 0, 'open voicing renders ' + v.frets.join(','));
  });
  // span-guard culls (the honest gaps, mirroring the closed m7/maj7 culls)
  eq(grabO(0, '7', '2-4-5', 0).length, 0, 'C7 spread R-b7-3 culled (span 5)');
  ok(grabO(0, '7', '2-4-5', 1).length > 0, 'C7 spread 3-R-b7 survives');
  eq(grabO(0, 'm7', '2-4-5', 1).length, 0, 'Cm7 spread 1st inv culled on 2-4-5');
  ok(grabO(0, 'm7', '3-5-6', 1).length > 0, 'Cm7 spread 1st inv survives on 3-5-6');
  eq(grabO(0, 'sus2', '2-4-5', 1).length, 0, 'sus2 spread 1st inv culled');
  eq(T.triadsFor(0, '5', { family: 'open' }).length, 0,
     'power chords have no spread form (no middle voice)');
  // family-scoped pickers
  deepEq(T.voicingAtPosition(0, 'maj', posC[3], { family: 'open' }).best.frets,
         [8, 10, X, 9, X, X], 'open pick at E-shape of C = most central spread');
  deepEq(T.voicingAtPosition(0, 'maj', posC[3],
         { family: 'open', stringSetPref: '1-3-4' }).best.frets,
         [X, X, 10, 12, X, 12], 'open set pref honored');
  deepEq(T.voicingAtPosition(0, 'maj', posC[3],
         { family: 'open', stringSetPref: '1-3' }).best.frets,
         [8, 10, X, 9, X, X], 'closed id under open family sanitized (no NaN)');
  deepEq(T.voicingAtPosition(7, 'maj', posG[1], { stringSetPref: '1-3-4' }).best.frets,
         [X, 5, 5, 4, X, X], 'open id under closed family sanitized (no NaN)');
  deepEq(T.voicingAnywhere(0, 'maj', { family: 'open' }).best.frets,
         [X, X, 2, 5, X, 3], 'anywhere open defaults to the 1-3-4 low grip');
  // near chain stays within the open family
  var stO = T.songTriads(['C', 'G'],
    { key: 'C', position: 'any', stringSetPref: 'near', family: 'open' });
  deepEq(stO.chords[0].atPosition.best.frets, [0, 3, X, 0, X, X],
         'open near: anchorless start near the nut');
  deepEq(stO.chords[1].atPosition.best.frets, [3, 5, X, 4, X, X],
         'open near: G nearest spread (dist 9)');
  ok(stO.chords.every(function (c) { return c.atPosition.best.family === 'open'; }),
     'near chain stays within the open family');
  deepEq(T.songTriads(['C'], { key: 'C', position: 'any', family: 'open' })
         .chords[0].atPosition.best.frets, [X, X, 2, 5, X, 3],
         'songTriads threads the family');

  // --- scale-kind boxes (full scales windowed to the pentatonic spans) ---
  var dotKey = function (d) { return d.string + ':' + d.fret; };
  for (var bk = 0; bk < 12; bk++) {
    T.positionsForKey(bk, true).forEach(function (p) {
      var pent = T.pentBoxDots(bk, true, p);
      if (p.frame + (T.PENT_BOX_SPAN[p.shape] || [0])[0] < 0) return; // open fallback differs by design
      var sb = T.scaleBoxDots(bk, 'minPent', p);
      deepEq(sb.dots.map(dotKey).sort(), pent.dots.map(dotKey).sort(),
             'scaleBoxDots(minPent) == pentBoxDots, key ' + bk + ' ' + p.shape);
      var fl = T.scaleBoxDots(bk, 'minor', p);
      ok(pent.dots.every(function (d) {
        return fl.dots.some(function (f) { return dotKey(f) === dotKey(d); });
      }), 'full-scale box contains the pentatonic box, key ' + bk + ' ' + p.shape);
      ok(fl.dots.length > pent.dots.length, 'full box adds scale tones ' + bk + ' ' + p.shape);
      eq(fl.lo, pent.lo, 'full box shares the pent span lo');
      eq(fl.hi, pent.hi, 'full box shares the pent span hi');
      // Dorian = minor pent + 2 and 6 — the box must contain the pent skeleton
      var dor = T.scaleBoxDots(bk, 'dorian', p);
      ok(pent.dots.every(function (d) {
        return dor.dots.some(function (f) { return dotKey(f) === dotKey(d); });
      }), 'dorian box contains the minor-pent box, key ' + bk + ' ' + p.shape);
      ok(dor.dots.every(function (d) { return [0,2,3,5,7,9,10].indexOf(d.interval) !== -1; }),
         'dorian box has only dorian tones, key ' + bk + ' ' + p.shape);
    });
  }

  // --- per-song plumbing ---
  var st3 = T.songTriads(['G', 'C', 'D', 'Em']);
  eq(st3.key.name, 'G', 'key detected from chords');
  deepEq(st3.chords.map(function (c) { return c.triad.label; }),
         ['G', 'C', 'D', 'Em'], 'triad labels');
  ok(st3.chords[0].byPosition && st3.chords[0].byPosition.E, 'byPosition map when no position given');
  var st4 = T.songTriads(['Cmaj7', 'Cmaj7', 'noise', 'Am7']);
  eq(st4.chords.length, 2, 'dedup + skip unparsed');
  deepEq(st4.unparsed, ['noise'], 'unparsed reported');
  eq(st4.chords[0].triad.label, 'Cmaj7', 'Cmaj7 labeled Cmaj7 (natural-7 shell)');
  eq(st4.chords[0].triad.fromQuality, 'maj7', 'origin quality kept');
  eq(st4.chords[1].triad.label, 'Am7', 'Am7 labeled Am7 (shell kept)');
  eq(T.songTriads(['C#', 'Db', 'F#'], { key: 'C#', position: 'any' }).chords.length, 2,
     'enharmonic spellings dedup to one tile');

  // --- fretboard map ---
  var fm = T.fretboardMap(0, 'maj', { maxFret: 5 });
  deepEq(fm.strings[5].map(function (n) { return [n.fret, n.role]; }),
         [[0, '3'], [3, '5']], 'high-e map to fret 5');
  deepEq(fm.strings[0].map(function (n) { return [n.fret, n.role]; }),
         [[0, '3'], [3, '5']], 'low-E map to fret 5');
  var fmFull = T.fretboardMap(0, 'maj');
  deepEq(fmFull.strings[1].filter(function (n) { return n.role === 'R'; })
           .map(function (n) { return n.fret; }), [3, 15], 'roots on A string');

  // --- scales ---
  deepEq(T.SCALES.majPent.intervals, [0, 2, 4, 7, 9], 'major pentatonic intervals');
  deepEq(T.SCALES.minPent.intervals, [0, 3, 5, 7, 10], 'minor pentatonic intervals');
  deepEq(T.SCALES.major.intervals, [0, 2, 4, 5, 7, 9, 11], 'major scale intervals');
  deepEq(T.SCALES.minor.intervals, [0, 2, 3, 5, 7, 8, 10], 'natural minor intervals');
  deepEq(T.SCALES.mixo.intervals, [0, 2, 4, 5, 7, 9, 10], 'Mixolydian intervals');
  deepEq(T.SCALES.dorian.intervals, [0, 2, 3, 5, 7, 9, 10], 'Dorian intervals');

  var amp = T.scaleMap(9, 'minPent');
  deepEq(amp.strings[5].map(function (n) { return n.fret; }),
         [0, 3, 5, 8, 10, 12, 15], 'Am pent on high e');
  deepEq(amp.strings[5].map(function (n) { return n.role; }),
         ['5', 'b7', 'R', 'b3', '4', '5', 'b7'], 'Am pent roles on high e');
  deepEq(amp.strings[1].map(function (n) { return [n.fret, n.role]; }),
         [[0, 'R'], [3, 'b3'], [5, '4'], [7, '5'], [10, 'b7'], [12, 'R'], [15, 'b3']],
         'Am pent box-1 string (A)');
  eq(amp.strings[1][0].midi, 45, 'scaleMap midi coherence');

  // relative identity: A minor pent === C major pent, note for note
  function pcSet(map) {
    var s = {};
    map.strings.forEach(function (arr) { arr.forEach(function (n) { s[n.pc] = 1; }); });
    return Object.keys(s).sort().join(',');
  }
  eq(pcSet(amp), pcSet(T.scaleMap(0, 'majPent')), 'Am pent pcs === C maj pent pcs');

  deepEq(T.scaleMap(0, 'major', { maxFret: 5 }).strings[5]
           .map(function (n) { return [n.fret, n.role]; }),
         [[0, '3'], [1, '4'], [3, '5'], [5, '6']], 'C major scale to fret 5 on high e');
  eq(T.scaleMap(0, 'nope').strings.filter(function (a) { return a.length === 0; }).length, 6,
     'unknown scale id -> empty strings');

  eq(T.scaleForQuality('m7', 'pent'), 'minPent', 'm7 -> minor pent');
  eq(T.scaleForQuality('maj', 'full'), 'major', 'maj -> major scale');
  eq(T.scaleForQuality('7', 'full'), 'mixo', 'dominant 7 -> Mixolydian');
  eq(T.scaleForQuality('m6', 'full'), 'dorian', 'm6 -> Dorian');
  eq(T.scaleForQuality('min', 'full'), 'minor', 'min -> natural minor');
  eq(T.scaleForQuality('dim', 'pent'), null, 'dim gated off');
  eq(T.scaleForQuality('sus4', 'full'), null, 'sus gated off');

  // pentatonic PATTERN boxes: every shape's box holds exactly 2 notes per
  // string, in every key (the defining property of a box)
  deepEq(T.PENT_BOX_SPAN, { C: [0, 3], A: [-1, 2], G: [0, 3], E: [-1, 2], D: [-1, 3] },
         'pattern-box spans');
  var boxFail = null;
  for (var kpc = 0; kpc < 12; kpc++) {
    var pmap = T.scaleMap(kpc, 'majPent', { maxFret: 22 });
    T.positionsForKey(kpc, false, { maxFret: 22 }).forEach(function (p) {
      var span = T.PENT_BOX_SPAN[p.shape];
      var lo = p.frame + span[0], hi = p.frame + span[1];
      if (lo < 0) return; // open-wrap edge; clamped in the UI
      pmap.strings.forEach(function (arr, s) {
        var n = arr.filter(function (x) { return x.fret >= lo && x.fret <= hi; }).length;
        if (n !== 2 && !boxFail) {
          boxFail = 'key ' + kpc + ' ' + p.shape + '-shape [' + lo + ',' + hi + '] string ' + s + ' has ' + n;
        }
      });
    });
  }
  ok(boxFail === null, 'every box has exactly 2 pent notes per string' + (boxFail ? ' — ' + boxFail : ''));
  // the reported case: E major, A-shape at 7fr -> box is frets 6-9
  var eA = T.positionsForKey(4, false).filter(function (p) { return p.shape === 'A'; })[0];
  eq(eA.frame, 7, 'E major A-shape frame');
  var boxA = T.pentBoxDots(4, false, eA);
  deepEq([boxA.lo, boxA.hi], [6, 9], 'E maj A-shape pent box = frets 6-9');
  eq(boxA.dots.length, 12, 'A-shape box: 2 notes per string');
  // nut-straddling shapes fall back to the open pattern (2 per string, from 0)
  var eE = T.positionsForKey(4, false).filter(function (p) { return p.shape === 'E'; })[0];
  eq(eE.frame, 0, 'E major E-shape frame');
  var boxE = T.pentBoxDots(4, false, eE);
  deepEq([boxE.lo, boxE.hi], [0, 4], 'E-shape at nut -> open pattern box 0-4');
  eq(boxE.dots.length, 12, 'open pattern: 2 notes per string');
  [0, 1, 2, 3, 4, 5].forEach(function (s) {
    eq(boxE.dots.filter(function (d) { return d.string === s; }).length, 2,
       'open pattern string ' + s + ' has 2 notes');
  });
  deepEq(boxE.dots.filter(function (d) { return d.string === 1; })
           .map(function (d) { return d.fret; }), [2, 4], 'A string open pattern = frets 2,4');
})();

/* ============ diagrams: interval-role coloring ============ */

(function () {
  // C major 1st inversion on 1-3: [x,x,x,9,8,8], roles per string
  var v = T.triadsFor(0, 'maj').filter(function (x) {
    return x.stringSet === '1-3' && x.inversion === 1;
  })[0];
  var roles = [null, null, null, null, null, null];
  v.notes.forEach(function (n) { roles[n.string] = n.role; });
  var svg = DG.renderChordSVG(v, { label: 'C', roles: roles, showFingers: false });
  ok(svg.indexOf('cd-r') !== -1, 'role chart marks the root');
  ok(svg.indexOf('cd-3') !== -1, 'role chart marks the third');
  ok(svg.indexOf('cd-5') !== -1, 'role chart marks the fifth');
  ok(svg.indexOf('cd-role') !== -1, 'role labels inside dots');
  ok(svg.indexOf('cd-barre') === -1, 'no barre bar when roles shown (notes stay visible)');
  // open-string chord tone gets a filled role dot, not the hollow ring
  var open = T.triadsFor(0, 'maj').filter(function (x) {
    return x.stringSet === '1-3' && x.inversion === 2 && x.minFret === 0;
  })[0];
  var roles2 = [null, null, null, null, null, null];
  open.notes.forEach(function (n) { roles2[n.string] = n.role; });
  var svg2 = DG.renderChordSVG(open, { roles: roles2 });
  ok(svg2.indexOf('class="cd-open"') === -1, 'open chord tones drawn as role dots (no hollow ring)');
  // minor third label uses the flat glyph
  var em = T.triadsFor(4, 'min').filter(function (x) {
    return x.stringSet === '4-6' && x.inversion === 0;
  })[0];
  var roles3 = [null, null, null, null, null, null];
  em.notes.forEach(function (n) { roles3[n.string] = n.role; });
  ok(DG.renderChordSVG(em, { roles: roles3 }).indexOf('♭3') !== -1, 'b3 rendered as ♭3');
  // classic path untouched: no role classes without opts.roles
  var plain = DG.renderChordSVG(V.getVoicings('F', 1)[0], { label: 'F' });
  ok(plain.indexOf('cd-r') === -1 && plain.indexOf('cd-barre') !== -1,
     'plain charts unchanged (barre + no role classes)');
  ok(plain.indexOf('cd-n"') === -1 && plain.indexOf('cd-n ') === -1 &&
     plain.indexOf('cd-finger') !== -1,
     'classic charts stay ink-and-fingers (no palette classes)');

  // --- color-system family map ---
  // the two renderers' maps must be content-identical (b6 divergence fix)
  var dgMap = {}, fbMap = {};
  Object.keys(DG.ROLE_CLASS).forEach(function (k) {
    dgMap[k] = DG.ROLE_CLASS[k].replace('cd-', '');
  });
  Object.keys(FB.ROLE_CLASS).forEach(function (k) {
    fbMap[k] = FB.ROLE_CLASS[k].replace('fb-', '');
  });
  deepEq(dgMap, fbMap, 'diagrams and fretboard role maps identical');
  eq(dgMap.b6, '7', 'b6 belongs to the extension family');
  eq(dgMap.b5, '5', 'b5 shares the 5th family (label carries the alteration)');
  eq(dgMap['#5'], '5', '#5 shares the 5th family');
  eq(dgMap['5'], '5', 'perfect 5th keeps its own class');
  // altered fifths render the 5th class with the altered label
  var dimV = T.triadsFor(0, 'dim')[0];
  var rolesD = [null, null, null, null, null, null];
  dimV.notes.forEach(function (n) { rolesD[n.string] = n.role; });
  var dimSvg = DG.renderChordSVG(dimV, { roles: rolesD });
  ok(dimSvg.indexOf('cd-5') !== -1 && dimSvg.indexOf('♭5') !== -1 &&
     dimSvg.indexOf('cd-alt') === -1, 'dim: b5 renders the 5th class + ♭5 label');
  var augV = T.triadsFor(0, 'aug')[0];
  var rolesA = [null, null, null, null, null, null];
  augV.notes.forEach(function (n) { rolesA[n.string] = n.role; });
  var augSvg = DG.renderChordSVG(augV, { roles: rolesA });
  ok(augSvg.indexOf('cd-5') !== -1 && augSvg.indexOf('♯5') !== -1,
     'aug: #5 renders the 5th class + ♯5 label');
  ok(FB.renderNeckSVG({ dots: [{ string: 2, fret: 4, role: 'b5', label: '♭5' }] })
     .indexOf('fb-5') !== -1, 'fretboard b5 -> fb-5');
  // unknown roles fall to neutral, never amber
  var unk = DG.renderScaleSVG({ startFret: 0, endFret: 4,
    dots: [{ string: 2, fret: 2, role: '9' }] });
  ok(unk.indexOf('cd-n') !== -1 && unk.indexOf('cd-3') === -1,
     'unknown role -> neutral, not identity-amber');
  ok(FB.renderNeckSVG({ dots: [{ string: 2, fret: 2, role: '9' }] })
     .indexOf('fb-n') !== -1, 'fretboard unknown role -> fb-n');
  // ghost whisper tint: family classes survive on ghosts; passing tones don't
  var g3 = DG.renderScaleSVG({ startFret: 0, endFret: 4,
    dots: [{ string: 2, fret: 2, role: '3', ghost: true }] });
  ok(g3.indexOf('cd-3 cd-ghost') !== -1, 'ghost 3rd whispers its family tint');
  var g2 = DG.renderScaleSVG({ startFret: 0, endFret: 4,
    dots: [{ string: 2, fret: 2, role: '2', ghost: true }] });
  ok(g2.indexOf('cd-n cd-ghost') !== -1 && g2.indexOf('cd-3') === -1,
     'ghost passing tone stays neutral gray');
  var s2 = DG.renderScaleSVG({ startFret: 0, endFret: 4,
    dots: [{ string: 2, fret: 2, role: '2' }] });
  ok(s2.indexOf('cd-3') !== -1, 'non-ghost 2 keeps sus identity amber');
  ok(FB.renderNeckSVG({ dots: [{ string: 2, fret: 2, role: '4', ghost: true }] })
     .indexOf('fb-n fb-ghost') !== -1, 'fretboard ghost passing tone neutral');
  ok(FB.renderNeckSVG({ dots: [{ string: 2, fret: 2, role: '5', ghost: true }] })
     .indexOf('fb-5 fb-ghost') !== -1, 'fretboard ghost 5th whispers green');
  var g6 = DG.renderScaleSVG({ startFret: 0, endFret: 4,
    dots: [{ string: 2, fret: 2, role: '6', ghost: true }] });
  ok(g6.indexOf('cd-n cd-ghost') !== -1, 'ghost 6th is context gray');
  var c6v = T.triadsFor(0, '6')[0];
  var roles6 = [null, null, null, null, null, null];
  c6v.notes.forEach(function (n) { roles6[n.string] = n.role; });
  ok(DG.renderChordSVG(c6v, { roles: roles6 }).indexOf('cd-7') !== -1,
     'C6 shell keeps the purple 6 as a chord tone');

  // vertical scale-box chart (multi-dot-per-string, chord-diagram idiom)
  var box = DG.renderScaleSVG({
    startFret: 5, endFret: 9,
    dots: [
      { string: 1, fret: 5, role: 'R' },
      { string: 1, fret: 7, role: '5', ghost: true },
      { string: 1, fret: 12, role: 'R' },      // outside window — dropped
      { string: 2, fret: 0, role: '4', ghost: true }  // open — dropped when startFret>0
    ]
  });
  ok(box.indexOf('<svg') === 0 && box.indexOf('chord-svg') !== -1, 'scale box renders in chart idiom');
  ok(box.indexOf('5fr') !== -1, 'scale box shows base fret');
  ok(box.indexOf('cd-nut') === -1, 'no nut above the nut');
  eq((box.match(/cd-dot/g) || []).length, 2, 'window + open filtering');
  ok(box.indexOf('cd-ghost') !== -1, 'ghost dots in scale box');
  ok(box.indexOf('NaN') === -1, 'no NaN in scale box');
  var openBox = DG.renderScaleSVG({ startFret: 0,
    dots: [{ string: 5, fret: 0, role: 'R' }, { string: 5, fret: 3, role: '5', ghost: true }] });
  ok(openBox.indexOf('cd-nut') !== -1, 'open-position scale box has the nut');
  eq((openBox.match(/cd-dot/g) || []).length, 2, 'open dot kept at start 0');
})();

/* ============ fretboard renderer ============ */

(function () {
  var svg = FB.renderNeckSVG({
    dots: [
      { string: 0, fret: 3, role: 'R', label: 'G', title: 'G — root' },
      { string: 5, fret: 0, role: '5', label: 'D' },
      { string: 3, fret: 4, role: 'b3', label: '♭3', dim: true }
    ],
    windows: [{ from: 3, to: 7, label: 'E' }],
    ariaLabel: 'test neck'
  });
  ok(svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') !== -1, 'neck SVG renders');
  eq((svg.match(/fb-dot /g) || []).length, 3, 'all dots drawn');
  ok(svg.indexOf('fb-r') !== -1, 'root dot class');
  ok(svg.indexOf('fb-dim') !== -1, 'dimmed dot class');
  ok(svg.indexOf('fb-window') !== -1, 'CAGED window rect');
  ok(svg.indexOf('fb-window-label') !== -1, 'window label');
  ok(svg.indexOf('test neck') !== -1, 'aria label');
  ok(svg.indexOf('fb-fretnum') !== -1, 'fret numbers');
  ok(svg.indexOf('fb-inlay') !== -1, 'inlay markers');
  ok(svg.indexOf('fb-nut') !== -1, 'nut');
  ok(svg.indexOf('NaN') === -1, 'no NaN in output');
  ok(svg.indexOf('<title>G — root</title>') !== -1, 'hover title');

  // open-position window reaches the gutter, octave marker doubles
  var svg2 = FB.renderNeckSVG({ dots: [], windows: [{ from: 0, to: 4 }], fretCount: 12 });
  ok((svg2.match(/fb-inlay/g) || []).length === 6, '12-fret neck: 4 singles + double at 12');
  ok(svg2.indexOf('NaN') === -1, 'no NaN with empty dots');

  // --- windowed view (startFret) ---
  var svg3 = FB.renderNeckSVG({
    startFret: 5, fretCount: 10, width: 500, height: 110, showStringNames: false,
    dots: [
      { string: 2, fret: 6, role: 'R' },     // in window
      { string: 2, fret: 4, role: '3' },     // below window — dropped
      { string: 2, fret: 0, role: '5' }      // open — dropped in high windows
    ],
    windows: [{ from: 3, to: 9 }]
  });
  // padL=10, gridW=480, fw=96 -> fret 6 dot centered at 10 + 0.5*96 = 58
  ok(svg3.indexOf('cx="58"') !== -1, 'windowed dot positioned relative to startFret');
  eq((svg3.match(/fb-dot /g) || []).length, 1, 'out-of-window and open dots dropped');
  ok(svg3.indexOf('fb-nut') === -1, 'no nut above the nut');
  ok(svg3.indexOf('>7<') !== -1 && svg3.indexOf('>9<') !== -1, 'absolute fret numbers kept');
  ok(svg3.indexOf('>3<') === -1 && svg3.indexOf('>12<') === -1, 'out-of-window numbers dropped');
  ok(svg3.indexOf('x="-') === -1, 'window rect clamped to grid (no negative x)');
  ok(svg3.indexOf('NaN') === -1, 'no NaN in windowed view');
  ok(svg3.indexOf('fb-stringname') === -1, 'string names suppressed');

  // ghosts: small, never labeled
  var svg4 = FB.renderNeckSVG({
    dots: [
      { string: 1, fret: 5, role: '2', ghost: true, label: 'SHOULDNOTRENDER' },
      { string: 1, fret: 7, role: 'R', label: 'A' }
    ], fretCount: 12
  });
  ok(svg4.indexOf('fb-ghost') !== -1, 'ghost class emitted');
  ok(svg4.indexOf('SHOULDNOTRENDER') === -1, 'ghost labels suppressed');
  var radii = (svg4.match(/r="([\d.]+)"/g) || []).map(function (m) {
    return parseFloat(m.slice(3, -1));
  }).filter(function (x) { return x > 4; });  // ignore inlay r=4
  ok(radii.length === 2 && Math.min.apply(null, radii) < Math.max.apply(null, radii),
     'ghost radius smaller than normal dot');
})();

/* ============ follow (lyric aligner) ============ */

(function () {
  // 9 lyric-index lines: v1 (0,1), chorus1 (2,3), coffee (4), '# lead
  // break' parses as a lyric line (5), singing (6), chorus2 (7,8) — the
  // tab line is skipped. Choruses are verbatim repeats.
  var raw = "[Verse 1]\nC        G\nWalking down the road, don't look back\nAm       F\nEvery little thing gonna be alright\n[Chorus]\nC        G\nHold on, hold on tonight\nAm       F\nWe are burning brighter now\n[Verse 2]\nC        G\nCoffee in the morning, 22 miles to go\n# lead break\ne|--0--2--3--|\nAm       F\nSinging to the radio all night long\n[Chorus]\nC        G\nHold on, hold on tonight\nAm       F\nWe are burning brighter now";
  var parsed = Parser.parseSong(raw, {});
  var idx = FL.buildIndex(parsed);

  // normalization
  eq(FL.normWord("Don't!"), 'dont', 'normWord folds apostrophes+punctuation');
  eq(FL.normWord('café'), 'cafe', 'normWord strips diacritics');
  eq(FL.normWord('...'), '', 'pure punctuation normalizes to empty');
  eq(FL.normWord('Na-na-na'), 'nanana', 'hyphens collapse');
  eq(FL.normWord('22'), '22', 'digits kept');

  // index shape
  eq(idx.lineCount, 9, 'lyric-line count (tab skipped, # comment-as-lyric kept)');
  deepEq(idx.words[0], { w: 'walking', line: 0, wi: 0 }, 'first indexed word');
  eq(idx.words[6].wi, 6, 'word ordinals count within the line');
  eq(idx.words[7].wi, 0, 'ordinals restart on each line');
  deepEq(FL.wordRanges("Hold on, hold on tonight"),
         [{ s: 0, e: 4 }, { s: 5, e: 8 }, { s: 9, e: 13 }, { s: 14, e: 16 },
          { s: 17, e: 24 }], 'wordRanges gives char offsets per counted token');
  deepEq(FL.wordRanges('... -- !'), [], 'pure-punctuation tokens consume no range');
  ok(idx.words.some(function (w) { return w.w === 'dont'; }), 'dont indexed');
  eq(idx.words.filter(function (w) { return w.w === 'alright'; })[0].line, 1,
     'alright maps to line 1');
  eq(idx.words.filter(function (w) { return w.w === 'coffee'; })[0].line, 4,
     'coffee maps to line 4 (indices survive tab/comment interleave)');
  eq(idx.words.filter(function (w) { return w.w === 'singing'; })[0].line, 6,
     'singing maps past the lead-break line');

  // feeder: interim growth, final reset, rewrite divergence
  var f = FL.createFeeder();
  deepEq(f.push('hold on', false), ['hold', 'on'], 'interim feeds new words');
  deepEq(f.push('hold on tonight', false), ['tonight'], 'growth feeds only the tail');
  deepEq(f.push('hold on tonight', true), [], 'final after interim adds nothing');
  deepEq(f.push('we are', false), ['we', 'are'], 'post-final stream is fresh');
  var f2 = FL.createFeeder();
  f2.push('walking down the wrote', false);
  deepEq(f2.push('walking down the road dont', false), ['road', 'dont'],
         'interim rewrite re-feeds from the divergence point');

  // tracker: clean advance + teleprompter look-ahead
  var t = FL.createTracker(idx);
  var r = t.feed(FL.normWords('walking down the road'));
  eq(r.line, 0, 'mid-line singing holds the current line');
  ok(r.confidence > 0.8, 'high confidence on clean input');
  eq(r.word, 3, 'word ordinal tracks within the line');
  eq(r.wordLine, 0, 'wordLine matches the sung line mid-line');
  r = t.feed(FL.normWords("don't look back"));
  eq(r.line, 1, 'completing a line advances the highlight to the next');
  eq(r.wordLine, 0, 'wordLine trails on the completed line');
  eq(r.word, 6, 'last consumed word is the line-final word');
  r = t.feed(FL.normWords('every little thing gonna be alright'));
  eq(r.line, 2, 'completing line 1 advances to the chorus');
  t.seek(8);
  r = t.feed(FL.normWords('we are burning brighter now'));
  eq(r.line, 8, 'the final line never advances past the song');

  // noisy input still tracks
  t = FL.createTracker(idx);
  r = t.feed(FL.normWords('walking um the yeah road baby look whoa back every uh thing'));
  eq(r.line, 1, 'noisy transcript still reaches line 1');

  // fresh tracker pre-anchors on the first word-bearing line
  t = FL.createTracker(idx);
  eq(t.state().line, 0, 'fresh tracker starts on first line');
  eq(t.state().cursor, 0, 'fresh tracker cursor at 0');

  // garbage moves nothing
  t = FL.createTracker(idx);
  r = t.feed(FL.normWords('zebra quantum flapjack xylophone'));
  eq(r.line, 0, 'garbage: holds at first line');
  eq(r.cursor, 0, 'garbage: cursor holds');

  // repeated chorus resolves forward-nearest
  t = FL.createTracker(idx);
  t.feed(FL.normWords('coffee in the morning 22 miles to go'));
  t.feed(FL.normWords('singing to the radio all night long'));
  r = t.feed(FL.normWords('hold on hold on tonight'));
  eq(r.line, 8, 'second chorus resolves to the SECOND copy (completes 7, shows 8)');

  // forward skip needs (and gets) a 2-word run
  t = FL.createTracker(idx);
  r = t.feed(FL.normWords('hold on hold on tonight'));
  eq(r.line, 3, 'jump into chorus 1 commits (completes line 2, shows 3)');

  // backward correction needs 3 consecutive matches (unique text)
  t = FL.createTracker(idx);
  t.feed(FL.normWords("walking down the road don't look back"));
  t.feed(FL.normWords('every little thing gonna be alright'));
  t.feed(FL.normWords('hold on hold'));
  r = t.feed(FL.normWords('every little'));
  eq(r.line, 2, 'two backward matches do not move yet');
  r = t.feed(FL.normWords('thing'));
  eq(r.line, 1, 'third consecutive backward match commits');

  // seek + silence hold + rejoin
  t = FL.createTracker(idx);
  t.seek(4);
  r = t.feed(FL.normWords('coffee in the morning'));
  eq(r.line, 4, 'seek re-anchors the tracker');
  r = t.reset();
  eq(r.line, 0, 'reset returns to the first line');
  t = FL.createTracker(idx);
  t.feed(FL.normWords('walking down the'));
  eq(t.state().line, 0, 'silence holds the line');
  r = t.feed(FL.normWords('road dont look'));
  eq(r.line, 0, 'rejoin after silence continues the line');
})();

/* ============ report ============ */

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) { console.log('  FAIL: ' + f); });
  process.exit(1);
}
