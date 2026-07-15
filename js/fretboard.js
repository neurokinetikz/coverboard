/* fretboard.js — full-neck fretboard SVG renderer for the triads explorer.
   String-building like diagrams.js: horizontal neck, low E at the bottom,
   nut + open-string gutter, inlay markers, CAGED window shading, role-colored
   dots (classes fb-r / fb-3 / fb-5; colors live in CSS).
   Plain script; exports to window and CommonJS. */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // role -> color class: the "third slot" tones (3/b3/2/4) share a class,
  // as do the fifths (5/b5/#5)
  var ROLE_CLASS = {
    'R': 'fb-r',
    '3': 'fb-3', 'b3': 'fb-3', '2': 'fb-3', '4': 'fb-3',
    '5': 'fb-5', 'b5': 'fb-5', '#5': 'fb-5',
    'b7': 'fb-7', '7': 'fb-7', '6': 'fb-7'
  };

  /* opts: { fretCount=15,
             dots: [{string 0..5 (0 = low E), fret 0..fretCount (0 = open),
                     role, label, title, dim}],
             windows: [{from, to, label, active}]  (fret-number ranges),
             width=980, height=230, markers=[3,5,7,9,12,15],
             stringNames=['E','A','D','G','B','e'], showFretNumbers=true,
             ariaLabel } -> SVG string */
  function renderNeckSVG(opts) {
    opts = opts || {};
    var fretCount = opts.fretCount || 15;
    var dots = opts.dots || [];
    var windows = opts.windows || [];
    var markers = opts.markers || [3, 5, 7, 9, 12, 15];
    var stringNames = opts.stringNames || ['E', 'A', 'D', 'G', 'B', 'e'];
    var showFretNumbers = opts.showFretNumbers !== false;
    var W = opts.width || 980;
    var H = opts.height || 230;

    var padL = 48;   // string names + open-string gutter
    var padR = 10;
    var padT = 20;   // room for window labels
    var padB = showFretNumbers ? 22 : 8;
    var nutX = padL;
    var gridW = W - padL - padR;
    var gridT = padT;
    var gridH = H - padT - padB;
    var fw = gridW / fretCount;
    var sg = gridH / 5;

    function sy(s) { return gridT + (5 - s) * sg; }   // low E at the bottom
    function fx(f) { return nutX + f * fw; }
    function dotX(f) { return f === 0 ? nutX - 16 : nutX + (f - 0.5) * fw; }

    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H +
      '" class="fb-svg" role="img" aria-label="' + esc(opts.ariaLabel || 'fretboard') + '">'];

    // CAGED window shading, behind everything; the labels are emitted LAST
    // (after the dots) so a chord tone on the top string can't occlude them
    var labelOut = [];
    windows.forEach(function (w) {
      var lo = Math.max(0, w.from), hi = Math.min(fretCount, w.to);
      if (hi < lo) return;
      var x1 = lo === 0 ? nutX - 30 : fx(lo - 1);
      var x2 = fx(hi);
      out.push('<rect x="' + x1 + '" y="' + (gridT - 14) + '" width="' + (x2 - x1) +
        '" height="' + (gridH + 18) + '" rx="6" class="fb-window' +
        (w.active ? ' active' : '') + '"/>');
      if (w.label) {
        labelOut.push('<text x="' + ((x1 + x2) / 2) + '" y="' + (gridT - 4) +
          '" text-anchor="middle" font-size="10" class="fb-window-label">' +
          esc(w.label) + '</text>');
      }
    });

    // inlay markers in the middle of the neck; double dots at the octave
    var midY = gridT + gridH / 2;
    markers.forEach(function (f) {
      if (f < 1 || f > fretCount) return;
      var x = nutX + (f - 0.5) * fw;
      if (f % 12 === 0) {
        out.push('<circle cx="' + x + '" cy="' + (midY - sg) + '" r="4" class="fb-inlay"/>');
        out.push('<circle cx="' + x + '" cy="' + (midY + sg) + '" r="4" class="fb-inlay"/>');
      } else {
        out.push('<circle cx="' + x + '" cy="' + midY + '" r="4" class="fb-inlay"/>');
      }
    });

    // nut + frets
    out.push('<rect x="' + (nutX - 3) + '" y="' + gridT + '" width="3.5" height="' +
      gridH + '" rx="1.5" class="fb-nut"/>');
    for (var f = 1; f <= fretCount; f++) {
      out.push('<line x1="' + fx(f) + '" y1="' + gridT + '" x2="' + fx(f) +
        '" y2="' + (gridT + gridH) + '" class="fb-fret" stroke-width="1"/>');
    }

    // strings, thicker toward low E, with name labels in the left margin
    for (var s = 0; s < 6; s++) {
      out.push('<line x1="' + nutX + '" y1="' + sy(s) + '" x2="' + (nutX + gridW) +
        '" y2="' + sy(s) + '" class="fb-string" stroke-width="' +
        (0.8 + (5 - s) * 0.22) + '"/>');
      out.push('<text x="' + (padL - 40) + '" y="' + (sy(s) + 3.5) +
        '" font-size="11" class="fb-stringname">' + esc(stringNames[s] || '') + '</text>');
    }

    // fret numbers under the marker frets — collected and emitted after the
    // dots (low-string dots overhang the grid and would occlude them)
    if (showFretNumbers) {
      markers.forEach(function (f) {
        if (f < 1 || f > fretCount) return;
        labelOut.push('<text x="' + (nutX + (f - 0.5) * fw) + '" y="' + (H - 6) +
          '" text-anchor="middle" font-size="10" class="fb-fretnum">' + f + '</text>');
      });
    }

    // dots (open strings sit in the gutter left of the nut)
    var r = Math.min(14, Math.min(sg, fw) * 0.42);
    dots.forEach(function (d) {
      if (d.string < 0 || d.string > 5 || d.fret < 0 || d.fret > fretCount) return;
      var cx = dotX(d.fret), cy = sy(d.string);
      var cls = 'fb-dot ' + (ROLE_CLASS[d.role] || 'fb-3') + (d.dim ? ' fb-dim' : '');
      var label = d.label == null ? '' : String(d.label);
      out.push('<g class="' + cls + '">' +
        (d.title ? '<title>' + esc(d.title) + '</title>' : '') +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' +
        (label ? '<text x="' + cx + '" y="' + (cy + r * 0.38) +
          '" text-anchor="middle" font-size="' + (r * (label.length > 2 ? 0.78 : 1)) +
          '" class="fb-dot-label">' + esc(label) + '</text>' : '') +
        '</g>');
    });

    // window labels + fret numbers on top of everything (CSS gives them halos)
    labelOut.forEach(function (l) { out.push(l); });

    out.push('</svg>');
    return out.join('');
  }

  var api = { renderNeckSVG: renderNeckSVG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Fretboard = api;
})(typeof window !== 'undefined' ? window : globalThis);
