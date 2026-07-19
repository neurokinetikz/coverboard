/* fretboard.js — full-neck fretboard SVG renderer for the triads explorer.
   String-building like diagrams.js: VERTICAL neck — nut at the top, frets
   descending, strings vertical with low E leftmost (the same orientation as
   the chord/scale charts), open-string gutter above the nut, inlay markers,
   CAGED window bands, role-colored dots (classes fb-r / fb-3 / fb-5; colors
   live in CSS). Plain script; exports to window and CommonJS. */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // role -> color class — hue = function family. MUST stay content-identical
  // with diagrams.js ROLE_CLASS (cd- prefix) — pinned by tests/run.js.
  var ROLE_CLASS = {
    'R': 'fb-r',
    '3': 'fb-3', 'b3': 'fb-3', '2': 'fb-3', '4': 'fb-3',
    '5': 'fb-5', 'b5': 'fb-5', '#5': 'fb-5',
    'b7': 'fb-7', '7': 'fb-7', '6': 'fb-7', 'b6': 'fb-7'
  };
  // passing/context tones (scale 2/4/6/b6) never whisper-tint as ghosts
  var CONTEXT_ROLES = { '2': 1, '4': 1, '6': 1, 'b6': 1 };

  /* opts: { fretCount=15 (absolute LAST fret shown),
             startFret=0 (absolute top boundary — a windowed view when > 0;
                          nut/gutter/open dots render only at 0),
             dots: [{string 0..5 (0 = low E, leftmost),
                     fret 0..fretCount (0 = open),
                     role, label, title, dim,
                     ghost}],   // ghost: small, dim, never labeled
             windows: [{from, to, label, active}]  (fret-number ranges),
             width=250, height=980, markers=[3,5,7,9,12,15],
             stringNames=['E','A','D','G','B','e'], showStringNames=true,
             showFretNumbers=true (numbers stay ABSOLUTE, left gutter),
             ariaLabel } -> SVG string */
  function renderNeckSVG(opts) {
    opts = opts || {};
    var fretCount = opts.fretCount || 15;
    var startFret = opts.startFret || 0;
    var dots = opts.dots || [];
    var windows = opts.windows || [];
    var markers = opts.markers || [3, 5, 7, 9, 12, 15];
    var stringNames = opts.stringNames || ['E', 'A', 'D', 'G', 'B', 'e'];
    var showStringNames = opts.showStringNames !== false;
    var showFretNumbers = opts.showFretNumbers !== false;
    var W = opts.width || 250;
    var H = opts.height || 980;

    // top pad: string names + open gutter, or just gutter, or minimal
    var padT = showStringNames ? 48 : (startFret === 0 ? 26 : 10);
    var padB = 10;
    var padL = showFretNumbers ? 34 : 10;   // left gutter: fret numbers (clears dot radius 14 on low E)
    var padR = 26;                          // right gutter: window labels (clears dot radius on high e)
    var nutY = padT;
    var gridL = padL;
    var gridW = W - padL - padR;
    var gridH = H - padT - padB;
    var fh = gridH / (fretCount - startFret);
    var sx = gridW / 5;

    function X(s) { return gridL + s * sx; }          // low E leftmost
    function fy(f) { return nutY + (f - startFret) * fh; }
    function dotY(f) { return f === 0 ? nutY - 16 : nutY + (f - startFret - 0.5) * fh; }

    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H +
      '" class="fb-svg" role="img" aria-label="' + esc(opts.ariaLabel || 'fretboard') + '">'];

    // CAGED window bands, behind everything; the labels are emitted LAST
    // (after the dots) so a chord tone on the high string can't occlude them
    var labelOut = [];
    windows.forEach(function (w) {
      var lo = Math.max(startFret, Math.max(0, w.from));
      var hi = Math.min(fretCount, w.to);
      if (hi < lo) return;
      var y1 = lo === 0 ? nutY - 30 : Math.max(fy(lo - 1), nutY);
      var y2 = fy(hi);
      out.push('<rect x="' + (gridL - 4) + '" y="' + y1 + '" width="' + (gridW + 18) +
        '" height="' + (y2 - y1) + '" rx="6" class="fb-window' +
        (w.active ? ' active' : '') + '"/>');
      if (w.label) {
        labelOut.push('<text x="' + (gridL + gridW + 16) + '" y="' + ((y1 + y2) / 2 + 3.5) +
          '" text-anchor="start" font-size="10" class="fb-window-label">' +
          esc(w.label) + '</text>');
      }
    });

    // inlay markers down the middle of the neck; side-by-side at the octave
    var midX = gridL + gridW / 2;
    markers.forEach(function (f) {
      if (f <= startFret || f > fretCount) return;
      var y = nutY + (f - startFret - 0.5) * fh;
      if (f % 12 === 0) {
        out.push('<circle cx="' + (midX - sx) + '" cy="' + y + '" r="4" class="fb-inlay"/>');
        out.push('<circle cx="' + (midX + sx) + '" cy="' + y + '" r="4" class="fb-inlay"/>');
      } else {
        out.push('<circle cx="' + midX + '" cy="' + y + '" r="4" class="fb-inlay"/>');
      }
    });

    // nut (only at the real nut) + frets
    if (startFret === 0) {
      out.push('<rect x="' + gridL + '" y="' + (nutY - 3) + '" width="' + gridW +
        '" height="3.5" rx="1.5" class="fb-nut"/>');
    } else {
      out.push('<line x1="' + gridL + '" y1="' + nutY + '" x2="' + (gridL + gridW) +
        '" y2="' + nutY + '" class="fb-fret" stroke-width="1"/>');
    }
    for (var f = startFret + 1; f <= fretCount; f++) {
      out.push('<line x1="' + gridL + '" y1="' + fy(f) + '" x2="' + (gridL + gridW) +
        '" y2="' + fy(f) + '" class="fb-fret" stroke-width="1"/>');
    }

    // strings, thicker toward low E, with name labels above the nut
    for (var s = 0; s < 6; s++) {
      out.push('<line x1="' + X(s) + '" y1="' + nutY + '" x2="' + X(s) +
        '" y2="' + (nutY + gridH) + '" class="fb-string" stroke-width="' +
        (0.8 + (5 - s) * 0.22) + '"/>');
      if (showStringNames) {
        out.push('<text x="' + X(s) + '" y="' + (padT - 38) +
          '" text-anchor="middle" font-size="11" class="fb-stringname">' +
          esc(stringNames[s] || '') + '</text>');
      }
    }

    // fret numbers beside the marker frets — ABSOLUTE positions, in the LEFT
    // gutter; collected and emitted after the dots (low-string dots would
    // otherwise occlude them)
    if (showFretNumbers) {
      markers.forEach(function (f) {
        if (f <= startFret || f > fretCount) return;
        labelOut.push('<text x="' + (gridL - 18) + '" y="' +
          (nutY + (f - startFret - 0.5) * fh + 3.5) +
          '" text-anchor="end" font-size="10" class="fb-fretnum">' + f + '</text>');
      });
    }

    // dots (open strings sit in the gutter above the nut; excluded when the
    // view starts above the nut — an open string is not in a high window)
    var r = Math.min(14, Math.min(sx, fh) * 0.42);
    dots.forEach(function (d) {
      if (d.string < 0 || d.string > 5 || d.fret < startFret || d.fret > fretCount) return;
      var cx = X(d.string), cy = dotY(d.fret);
      var cls = 'fb-dot ' + (d.ghost && CONTEXT_ROLES[d.role]
                  ? 'fb-n' : ROLE_CLASS[d.role] || 'fb-n') +
        (d.dim ? ' fb-dim' : '') + (d.ghost ? ' fb-ghost' : '');
      var rr = d.ghost ? r * 0.62 : r;
      var label = d.ghost || d.label == null ? '' : String(d.label);
      out.push('<g class="' + cls + '">' +
        (d.title ? '<title>' + esc(d.title) + '</title>' : '') +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '"/>' +
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

  var api = { renderNeckSVG: renderNeckSVG, ROLE_CLASS: ROLE_CLASS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Fretboard = api;
})(typeof window !== 'undefined' ? window : globalThis);
