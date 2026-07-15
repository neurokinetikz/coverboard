/* diagrams.js — renders a chord shape as an SVG diagram string.
   Vertical strings (low E left), horizontal frets, nut bar when baseFret=1,
   open/mute markers above, barre bar, optional finger numbers, "3fr" label.
   Plain script; exports to window and CommonJS. */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // interval-role color classes (shared tokens with the fretboard explorer):
  // root / third-slot (3, b3, 2, 4) / fifth-slot (5, b5, #5)
  var ROLE_CLASS = {
    'R': 'cd-r',
    '3': 'cd-3', 'b3': 'cd-3', '2': 'cd-3', '4': 'cd-3',
    '5': 'cd-5', 'b5': 'cd-5', '#5': 'cd-5',
    'b7': 'cd-7', '7': 'cd-7', '6': 'cd-7'
  };
  function dispRole(r) { return String(r).replace('b', '♭').replace('#', '♯'); }

  /* shape: { frets:[6], fingers:[6]|null, baseFret, barre:{fret,from,to}|null }
     opts: { width, height, label, showFingers,
             roles: [6]|null — per-string interval role ('R','3','b3','5',...).
             When roles are given, dots are role-colored with the interval
             written inside, and the barre is not drawn (each note must stay
             individually visible). } */
  function renderChordSVG(shape, opts) {
    opts = opts || {};
    var W = opts.width || 82;
    var H = opts.height || 102;
    var label = opts.label || '';
    var showFingers = opts.showFingers !== false;
    var roles = opts.roles || null;

    var frets = shape.frets;
    var nStrings = 6, nFrets = 4;

    // display window: base fret
    var maxFret = 0, minFret = 99;
    for (var i = 0; i < 6; i++) {
      if (frets[i] > 0) {
        if (frets[i] > maxFret) maxFret = frets[i];
        if (frets[i] < minFret) minFret = frets[i];
      }
    }
    var base = shape.baseFret && shape.baseFret > 1 ? shape.baseFret
             : (maxFret > 4 ? minFret : 1);
    if (maxFret - base + 1 > nFrets) nFrets = Math.min(5, maxFret - base + 1);

    // layout
    var padTop = label ? 15 : 4;      // room for the chord name
    var markerRow = 9;                // open/mute markers
    var gridTop = padTop + markerRow;
    var padLeft = 13, padRight = base > 1 ? 20 : 8;
    var gridW = W - padLeft - padRight;
    var gridH = H - gridTop - 8;
    var sx = gridW / (nStrings - 1);   // string spacing
    var fy = gridH / nFrets;           // fret spacing
    // dot size comes from the label-free geometry so charts with an "Nfr"
    // label don't render smaller, lighter dots than open-position charts
    var sxDot = (W - padLeft - 8) / (nStrings - 1);
    var dotR = Math.min(sxDot, fy) * 0.36;

    function X(s) { return padLeft + s * sx; }
    function fretY(f) { return gridTop + f * fy; } // f = 0..nFrets grid line
    function dotY(fretNum) { return gridTop + (fretNum - base + 0.5) * fy; }

    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H +
             '" width="' + W + '" height="' + H + '" class="chord-svg" role="img" aria-label="' +
             esc(label || 'chord') + ' chord diagram">');

    if (label) {
      out.push('<text x="' + (W / 2) + '" y="11" text-anchor="middle" class="cd-name" ' +
               'font-size="11.5" font-weight="600">' + esc(label) + '</text>');
    }

    // nut or top line
    if (base === 1) {
      out.push('<rect x="' + (padLeft - 1) + '" y="' + (gridTop - 2.4) + '" width="' + (gridW + 2) +
               '" height="2.8" rx="1" class="cd-nut"/>');
    } else {
      out.push('<text x="' + (W - padRight + 4) + '" y="' + (gridTop + fy * 0.65) +
               '" font-size="8.5" class="cd-basefret">' + base + 'fr</text>');
    }

    // frets
    for (var f = 0; f <= nFrets; f++) {
      out.push('<line x1="' + padLeft + '" y1="' + fretY(f) + '" x2="' + (padLeft + gridW) +
               '" y2="' + fretY(f) + '" class="cd-fret" stroke-width="0.8"/>');
    }
    // strings
    for (var s = 0; s < nStrings; s++) {
      out.push('<line x1="' + X(s) + '" y1="' + gridTop + '" x2="' + X(s) +
               '" y2="' + (gridTop + gridH) + '" class="cd-string" stroke-width="' +
               (0.7 + (5 - s) * 0.08) + '"/>');
    }

    // barre (clamped to the viewBox so full-width barres don't clip; when a
    // base-fret label is shown, also kept clear of its column)
    if (shape.barre && !roles && shape.barre.fret >= base) {
      var by = dotY(shape.barre.fret);
      var bx1 = Math.max(1, X(shape.barre.from) - dotR * 0.85);
      var bx2 = Math.min(base > 1 ? W - padRight + 1 : W - 1,
                         X(shape.barre.to) + dotR * 0.85);
      out.push('<rect x="' + bx1 + '" y="' + (by - dotR * 0.8) +
               '" width="' + (bx2 - bx1) + '" height="' + (dotR * 1.6) +
               '" rx="' + (dotR * 0.8) + '" class="cd-barre"/>');
    }

    // markers + dots
    for (var s2 = 0; s2 < nStrings; s2++) {
      var fr = frets[s2];
      var role = roles ? roles[s2] : null;
      var roleCls = role ? ROLE_CLASS[role] || 'cd-3' : null;
      var mx = X(s2), my = gridTop - 5;
      if (fr === -1) {
        var r = 2.6;
        out.push('<path d="M' + (mx - r) + ' ' + (my - r) + 'L' + (mx + r) + ' ' + (my + r) +
                 'M' + (mx + r) + ' ' + (my - r) + 'L' + (mx - r) + ' ' + (my + r) +
                 '" class="cd-mute" stroke-width="1.2" fill="none"/>');
      } else if (fr === 0) {
        if (roleCls) {
          // an open string that sounds a chord tone: small filled role dot
          out.push('<g class="' + roleCls + '"><circle cx="' + mx + '" cy="' + my +
                   '" r="3.1" class="cd-dot"/></g>');
        } else {
          out.push('<circle cx="' + mx + '" cy="' + my + '" r="2.6" class="cd-open" ' +
                   'fill="none" stroke-width="1.1"/>');
        }
      } else {
        var inBarre = !roles && shape.barre && fr === shape.barre.fret &&
                      s2 >= shape.barre.from && s2 <= shape.barre.to;
        if (!inBarre) {
          if (roleCls) {
            var rl = dispRole(role);
            out.push('<g class="' + roleCls + '">' +
              '<circle cx="' + mx + '" cy="' + dotY(fr) + '" r="' + dotR + '" class="cd-dot"/>' +
              '<text x="' + mx + '" y="' + (dotY(fr) + dotR * 0.48) +
              '" text-anchor="middle" font-size="' + (dotR * (rl.length > 1 ? 0.95 : 1.25)) +
              '" class="cd-role">' + esc(rl) + '</text></g>');
          } else {
            out.push('<circle cx="' + mx + '" cy="' + dotY(fr) + '" r="' + dotR + '" class="cd-dot"/>');
          }
        }
        var fingerNum = shape.fingers && shape.fingers[s2] > 0 ? shape.fingers[s2] : null;
        if (showFingers && fingerNum && !inBarre && !roles) {
          out.push('<text x="' + mx + '" y="' + (dotY(fr) + dotR * 0.55) +
                   '" text-anchor="middle" font-size="' + (dotR * 1.35) +
                   '" class="cd-finger">' + fingerNum + '</text>');
        }
      }
    }

    out.push('</svg>');
    return out.join('');
  }

  var api = { renderChordSVG: renderChordSVG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Diagrams = api;
})(typeof window !== 'undefined' ? window : globalThis);
