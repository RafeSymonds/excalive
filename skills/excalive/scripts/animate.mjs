#!/usr/bin/env node
// Turn a sequence of Excalidraw scenes (keyframes) into an MP4 / WebM / GIF or
// a PNG frame sequence. Elements are matched across keyframes by id: shared
// elements morph (position, size, color, points, opacity), new elements enter
// (drawn on, popped or faded in, one after another), and removed elements fade
// out. Rendering reuses mcp-excalidraw-server's headless Excalidraw renderer,
// so frames look exactly like the canvas screenshots.
//
// Usage (`excalive animate` is a wrapper for `node animate.mjs`):
//   excalive animate                     draw the live canvas in -> animation.mp4
//   excalive animate scene.excalidraw    draw a file in -> scene.mp4
//   excalive animate --frames [scene]    one step per Excalidraw frame: each frame's
//                                        content draws in and the camera moves to it
//   excalive animate --snapshots demo-   every canvas snapshot named demo-*, oldest first
//   excalive animate --steps scene.excalidraw   one keyframe per build step listed in
//                                        the steps.json beside the file (a step's "focus"
//                                        moves the camera in, and the next step back out)
//   excalive animate k1 k2 k3            keyframes: files, snapshot:<name>, or canvas
//   excalive animate storyboard.json     full control (reference at the bottom of the script);
//                                        keyframes can carry a voice track (`audio`) and
//                                        the words it says (`narration`)
//   excalive animate storyboard.json --check   timing and unspoken on-screen text, no render
//
// Options: --out f.mp4|.webm|.gif|<dir for PNGs>  --duration 1.2  --hold 1.2
//          --fps 30  --width 1920 --height 1080  --boil 8  --dark  --no-intro  --padding 60
//          --text-x auto|left|center  --sheet sheet.png  --strict
//          --stills <dir> (each keyframe's finished frame as a PNG)  --no-video (stills only)
//          --effects a.mjs,b.mjs (modules of effects, as a story's `effects`)

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

// ---------------------------------------------------------------------------
// Locate mcp-excalidraw-server's renderer. Its render modules are internal
// (dist/core/render), so they are imported by file path.

function findServerDir() {
  const candidates = [];
  if (process.env.EXCALIDRAW_SERVER_DIR) candidates.push(process.env.EXCALIDRAW_SERVER_DIR);
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    candidates.push(path.join(globalRoot, 'mcp-excalidraw-server'));
  } catch {}
  const npxRoot = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npxRoot)) {
    for (const hash of fs.readdirSync(npxRoot)) {
      candidates.push(path.join(npxRoot, hash, 'node_modules', 'mcp-excalidraw-server'));
    }
  }
  const found = candidates
    .filter(dir => fs.existsSync(path.join(dir, 'dist', 'core', 'render', 'index.js')))
    .map(dir => ({ dir, version: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version }))
    .sort((a, b) => compareVersions(b.version, a.version));
  if (found.length === 0) {
    fail('mcp-excalidraw-server >= 2.1 not found. Run `npx -y mcp-excalidraw-server status` once, or set EXCALIDRAW_SERVER_DIR.');
  }
  return found[0].dir;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

function fail(message) {
  process.stderr.write(`animate: ${message}\n`);
  process.exit(1);
}

const SERVER_DIR = findServerDir();
const RENDER_DIR = path.join(SERVER_DIR, 'dist', 'core', 'render');
const { prepareScene, renderSvgWithExcalidraw } = await import(path.join(RENDER_DIR, 'excalidraw-node', 'index.js'));
const { loadExcalidrawNode } = await import(path.join(RENDER_DIR, 'excalidraw-node', 'dom.js'));
const { svgToPng } = await import(path.join(RENDER_DIR, 'png.js'));
const fonts = await import(path.join(RENDER_DIR, 'fonts.js'));
const { isObsidianExcalidrawMd, extractSceneJsonFromObsidianMd } = await import(path.join(SERVER_DIR, 'dist', 'core', 'obsidian-md.js'));
const { prepareElement } = await import(path.join(SERVER_DIR, 'dist', 'core', 'normalize.js'));
const { getCommonBounds } = await loadExcalidrawNode();

const CANVAS_URL = process.env.EXPRESS_SERVER_URL || 'http://127.0.0.1:3000';
// Nunito, from Excalidraw's own web font (SIL OFL 1.1, assets/fonts/OFL.txt).
const NUNITO_TTF = fileURLToPath(new URL('../assets/fonts/Nunito-Regular.ttf', import.meta.url));

// ---------------------------------------------------------------------------
// Real text widths, as drawn. The renderer measures Nunito with Liberation
// Sans (it ships no Nunito) and the canvas measures every font at a flat
// 0.6 em, so neither says where a line of Nunito ends on the frame. These
// are the advance widths of the font files the frames are drawn with.

const textMetrics = await import(path.join(RENDER_DIR, 'text-metrics.js'));

function ttfAdvances(file) {
  const b = fs.readFileSync(file);
  const dir = new Map();
  for (let i = 0; i < b.readUInt16BE(4); i++) {
    const rec = 12 + i * 16;
    dir.set(b.toString('latin1', rec, rec + 4), b.readUInt32BE(rec + 8));
  }
  const head = dir.get('head'), hhea = dir.get('hhea'), hmtx = dir.get('hmtx'), cmap = dir.get('cmap');
  const unitsPerEm = b.readUInt16BE(head + 18), numHMetrics = b.readUInt16BE(hhea + 34);
  let f4 = -1;
  for (let i = 0; i < b.readUInt16BE(cmap + 2) && f4 < 0; i++) {
    const rec = cmap + 4 + i * 8, off = cmap + b.readUInt32BE(rec + 4);
    if (b.readUInt16BE(off) === 4 && [0, 3].includes(b.readUInt16BE(rec))) f4 = off;
  }
  if (f4 < 0) fail(`${file}: no format 4 cmap`);
  const segX2 = b.readUInt16BE(f4 + 6), ends = f4 + 14, starts = ends + segX2 + 2;
  const deltas = starts + segX2, ranges = deltas + segX2;
  // Em advance of a code point, or undefined when the font has no glyph.
  return cp => {
    for (let s = 0; s < segX2; s += 2) {
      if (cp > b.readUInt16BE(ends + s)) continue;
      const start = b.readUInt16BE(starts + s);
      if (cp < start) return undefined;
      const delta = b.readInt16BE(deltas + s), offset = b.readUInt16BE(ranges + s);
      let glyph = (cp + delta) & 0xffff;
      if (offset) {
        const raw = b.readUInt16BE(ranges + s + offset + (cp - start) * 2);
        glyph = raw && (raw + delta) & 0xffff;
      }
      return glyph ? b.readUInt16BE(hmtx + Math.min(glyph, numHMetrics - 1) * 4) / unitsPerEm : undefined;
    }
    return undefined;
  };
}

let nunitoAdvance;
function lineWidth(line, fontFamily, fontSize) {
  line = line.replace(/\u200a/g, '');
  if (Number(fontFamily) === 6) {
    nunitoAdvance ??= ttfAdvances(NUNITO_TTF);
    let em = 0;
    for (const ch of line) em += nunitoAdvance(ch.codePointAt(0)) ?? 0.6;
    return em * fontSize;
  }
  return textMetrics.measureTextWidth(line, `${fontSize}px ${fonts.getFontEntry(fontFamily).family}`);
}

function textWidth(text, fontFamily, fontSize) {
  return Math.max(0, ...String(text).split('\n').map(line => lineWidth(line, fontFamily, fontSize)));
}

// ---------------------------------------------------------------------------
// Easing

const EASINGS = {
  linear: t => t,
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
};

function easing(name) {
  const fn = EASINGS[name ?? 'inOutCubic'];
  if (!fn) fail(`unknown easing "${name}" (use ${Object.keys(EASINGS).join(', ')})`);
  return fn;
}

const clamp01 = t => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;

// Progress of a sub-window [start, start+length] of a transition, 0..1.
function windowProgress(time, start, length) {
  if (length <= 0) return time >= start ? 1 : 0;
  return clamp01((time - start) / length);
}

// ---------------------------------------------------------------------------
// Colors: Excalidraw stores hex (#rgb, #rrggbb, #rrggbbaa) or "transparent".

function parseColor(value) {
  if (!value || value === 'transparent') return null;
  let hex = String(value).replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return undefined;
  return [0, 2, 4, 6].map(i => (i < hex.length ? parseInt(hex.slice(i, i + 2), 16) : 255));
}

function lerpColor(a, b, t) {
  if (a === b) return a;
  let ca = parseColor(a);
  let cb = parseColor(b);
  if (ca === undefined || cb === undefined) return t < 0.5 ? a : b;
  if (ca === null && cb === null) return a;
  // "transparent" interpolates as the other color at zero alpha.
  if (ca === null) ca = [...cb.slice(0, 3), 0];
  if (cb === null) cb = [...ca.slice(0, 3), 0];
  const mixed = ca.map((c, i) => Math.round(lerp(c, cb[i], t)));
  if (mixed[3] === 0) return 'transparent';
  return '#' + mixed.map(c => c.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Polylines: arrows, lines and freedraw store points relative to (x, y).

function pathLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  return lengths;
}

// The first `fraction` of the path by arc length, ending on an interpolated point.
function truncatePath(points, fraction) {
  if (fraction >= 1 || points.length < 2) return points;
  const lengths = pathLengths(points);
  const target = lengths[lengths.length - 1] * Math.max(fraction, 0.001);
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (lengths[i] < target) {
      out.push(points[i]);
      continue;
    }
    const segment = lengths[i] - lengths[i - 1] || 1;
    const u = (target - lengths[i - 1]) / segment;
    out.push([lerp(points[i - 1][0], points[i][0], u), lerp(points[i - 1][1], points[i][1], u)]);
    break;
  }
  return out;
}

// Resample a path to `count` points spaced evenly by arc length, so two paths
// with different point counts can be interpolated point by point.
function resamplePath(points, count) {
  if (points.length === count) return points;
  const lengths = pathLengths(points);
  const total = lengths[lengths.length - 1];
  const out = [];
  let segment = 1;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (segment < points.length - 1 && lengths[segment] < target) segment++;
    const span = lengths[segment] - lengths[segment - 1] || 1;
    const u = clamp01((target - lengths[segment - 1]) / span);
    out.push([lerp(points[segment - 1][0], points[segment][0], u), lerp(points[segment - 1][1], points[segment][1], u)]);
  }
  return out;
}

function lerpPoints(a, b, t) {
  const count = Math.max(a.length, b.length);
  const ra = resamplePath(a, count);
  const rb = resamplePath(b, count);
  return ra.map((p, i) => [lerp(p[0], rb[i][0], t), lerp(p[1], rb[i][1], t)]);
}

// ---------------------------------------------------------------------------
// SVG stroke draw-on: closed shapes are drawn on by revealing the real rough
// stroke path with a dash offset, so the outline is the shape's own outline.

function bezierPoint(points, t) {
  let pts = points;
  while (pts.length > 1) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      next.push([lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]);
    }
    pts = next;
  }
  return pts[0];
}

function curveLength(points) {
  let length = 0;
  let prev = points[0];
  for (let k = 1; k <= 16; k++) {
    const p = bezierPoint(points, k / 16);
    length += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return length;
}

// Length of an SVG path `d`. Excalidraw's rough strokes use M/L/C/Q; arcs and
// smooth curves are approximated by chords, which only shortens the estimate.
function svgPathLength(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0, startX = 0, startY = 0, length = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (cmd === '' || cmd === 'Z' || cmd === 'z') { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    const to = (nx, ny) => { length += Math.hypot(nx - x, ny - y); x = nx; y = ny; };
    switch (cmd.toUpperCase()) {
      case 'M': x = ox + num(); y = oy + num(); startX = x; startY = y; cmd = rel ? 'l' : 'L'; break;
      case 'L': case 'T': to(ox + num(), oy + num()); break;
      case 'H': to(ox + num(), y); break;
      case 'V': to(x, oy + num()); break;
      case 'C': {
        const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()], p = [ox + num(), oy + num()];
        length += curveLength([[x, y], p1, p2, p]); [x, y] = p; break;
      }
      case 'Q': {
        const p1 = [ox + num(), oy + num()], p = [ox + num(), oy + num()];
        length += curveLength([[x, y], p1, p]); [x, y] = p; break;
      }
      case 'S': { i += 2; to(ox + num(), oy + num()); break; }
      case 'A': { i += 5; to(ox + num(), oy + num()); break; }
      case 'Z': to(startX, startY); break;
      default: i++;
    }
  }
  return length;
}

function setAttr(attrs, name, value) {
  const pattern = new RegExp(`\\s${name}="[^"]*"`);
  return pattern.test(attrs) ? attrs.replace(pattern, ` ${name}="${value}"`) : `${attrs} ${name}="${value}"`;
}

// Reveal `stroke` (0..1) of a shape's outline paths and fade its fill paths to
// `fill`. Outline paths are the ones stroked in the shape's stroke color;
// hachure and solid fills are drawn in the background color.
function applyDrawProgress(body, { stroke, fill }, strokeColor) {
  return body.replace(/<path\b([^>]*?)(\/?)>/g, (whole, attrs, selfClose) => {
    const strokeAttr = attrs.match(/\sstroke="([^"]*)"/)?.[1];
    const isOutline = strokeAttr && strokeAttr !== 'none' && strokeAttr.toLowerCase() === String(strokeColor).toLowerCase();
    if (!isOutline) return `<path${setAttr(attrs, 'opacity', fill)}${selfClose}>`;
    // Dashed and dotted outlines already use the dash array, so they fade in.
    if (/\sstroke-dasharray="/.test(attrs)) return `<path${setAttr(attrs, 'stroke-opacity', stroke)}${selfClose}>`;
    const d = attrs.match(/\sd="([^"]*)"/)?.[1] ?? '';
    return drawSubpaths(d, stroke).map(part => {
      let out = setAttr(attrs, 'd', part.d);
      if (part.progress < 1) {
        out = setAttr(out, 'stroke-dasharray', `${part.length} ${part.length}`);
        out = setAttr(out, 'stroke-dashoffset', part.length * (1 - part.progress));
      }
      return `<path${out}/>`;
    }).join('');
  });
}

// A rough stroke is many subpaths (one per edge or corner, each drawn twice
// with a slightly different start). Dashes restart on every subpath, so give
// each its own progress: subpaths sweep around the shape in order, and the two
// passes of the same segment (starts close together) draw at the same time.
function drawSubpaths(d, progress) {
  const pieces = /m/.test(d) ? [d] : d.split(/(?=M)/).filter(s => s.trim());
  const subpaths = pieces.map(piece => {
    const [sx, sy] = (piece.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [0, 0]).map(Number);
    return { d: piece, start: [sx, sy], length: svgPathLength(piece) * 1.02 + 1 };
  });
  const groups = [];
  for (const sub of subpaths) {
    const last = groups[groups.length - 1];
    const near = last && Math.hypot(sub.start[0] - last.start[0], sub.start[1] - last.start[1]) < 16;
    if (near) {
      last.members.push(sub);
      last.length = Math.max(last.length, sub.length);
    } else {
      groups.push({ start: sub.start, members: [sub], length: sub.length });
    }
  }
  const total = groups.reduce((sum, g) => sum + g.length, 0);
  let offset = 0;
  const out = [];
  for (const group of groups) {
    const local = clamp01((progress * total - offset) / group.length);
    offset += group.length;
    // Skip undrawn subpaths: a zero-length dash with round caps still paints a dot.
    if (local <= 0) continue;
    for (const sub of group.members) out.push({ d: sub.d, length: sub.length, progress: local });
  }
  return out;
}

// Reveal a text element's lines left to right, one after another, each behind
// a soft edge: a mask whose gradient fades out just past the pen. A line's
// share of the time is its share of the characters. The mask sits in the
// text's own coordinates, where each line is a <text> starting at x (or
// centered on it) with its box from line * lineHeight down.
let maskSerial = 0;
function applyWriteProgress(body, progress, el) {
  const lines = String(el.text).split('\n');
  const size = el.fontSize;
  const lineHeight = size * (el.lineHeight ?? 1.25);
  const weights = lines.map(line => Math.max(1, line.replace(/\s/g, '').length));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const feather = size * 0.6;
  let defs = '';
  let done = 0;
  let index = 0;
  const out = body.replace(/<text\b([^>]*)>/g, (whole, attrs) => {
    const n = index++;
    const weight = weights[n] ?? 1;
    const local = clamp01((progress * total - done) / weight);
    done += weight;
    if (local >= 1) return whole;
    // Measured widths can fall a little short of the drawn glyphs.
    const width = lineWidth(lines[n] ?? '', el.fontFamily, size) * 1.1 + size * 0.2;
    const x = Number(attrs.match(/\sx="([^"]*)"/)?.[1] ?? 0);
    const anchor = attrs.match(/\stext-anchor="([^"]*)"/)?.[1] ?? 'start';
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const pen = left + local * (width + feather);
    const id = `excalive-write-${++maskSerial}`;
    const box = `x="${left - size}" y="${n * lineHeight - size}" width="${width + size * 2}" height="${lineHeight + size * 2}"`;
    defs += `<linearGradient id="${id}-edge" gradientUnits="userSpaceOnUse" x1="${pen - feather}" y1="0" x2="${pen}" y2="0">`
      + '<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
      + `<mask id="${id}" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="url(#${id}-edge)"/></mask>`;
    return `<text${attrs} mask="url(#${id})">`;
  });
  return `<defs>${defs}</defs>${out}`;
}

// A pinned element keeps its place on screen while the camera moves. Its
// coordinates are where it sits under `_pin`, the camera it was laid out for,
// so under another camera it moves and scales with that camera.
function pinToCamera(el, camera) {
  const { _pin: from, ...rest } = el;
  const k = camera.width / from.width;
  const out = { ...rest, x: camera.x + (el.x - from.x) * k, y: camera.y + (el.y - from.y) * k,
    width: el.width * k, height: el.height * k };
  if (typeof el.fontSize === 'number') out.fontSize = el.fontSize * k;
  if (typeof el.strokeWidth === 'number') out.strokeWidth = el.strokeWidth * k;
  if (Array.isArray(el.points)) out.points = el.points.map(([px, py]) => [px * k, py * k]);
  return out;
}

// ---------------------------------------------------------------------------
// Scene loading

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`GET ${url} -> ${response.status}`);
  return response.json();
}

// Returns { elements, files }; `files` holds image data for image elements.
async function loadSceneSource(source, baseDir) {
  if (Array.isArray(source)) return { elements: source, files: {} };
  if (source && typeof source === 'object') return { elements: source.elements, files: source.files ?? {} };
  if (source === 'canvas' || source.startsWith('snapshot:')) {
    const files = (await fetchJson(`${CANVAS_URL}/api/files`)).files ?? {};
    if (source === 'canvas') return { elements: (await fetchJson(`${CANVAS_URL}/api/elements`)).elements, files };
    const name = encodeURIComponent(source.slice('snapshot:'.length));
    return { elements: (await fetchJson(`${CANVAS_URL}/api/snapshots/${name}`)).snapshot.elements, files };
  }
  const file = path.resolve(baseDir, source);
  if (!fs.existsSync(file)) fail(`keyframe not found: ${file} (use a file path, "snapshot:<name>", or "canvas")`);
  let raw = fs.readFileSync(file, 'utf8');
  if (isObsidianExcalidrawMd(raw)) raw = extractSceneJsonFromObsidianMd(raw);
  const data = JSON.parse(raw);
  return Array.isArray(data) ? { elements: data, files: {} } : { elements: data.elements, files: data.files ?? {} };
}

const sceneName = file => path.basename(file).replace(/\.excalidraw(\.md)?$|\.json$/, '');

// The build steps of a scene file: steps.json beside it maps scene names to a
// list of steps, each the ids that step shows (a file for one scene may hold
// the list alone). Slide decks use the same file for their SVG builds.
function readSteps(sceneFile, stepsFile, key) {
  const file = stepsFile ?? path.join(path.dirname(sceneFile), 'steps.json');
  if (!fs.existsSync(file)) fail(`no build steps: ${file} not found`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const name = key ?? sceneName(sceneFile);
  const steps = Array.isArray(data) ? data : data[name];
  if (!Array.isArray(steps)) fail(`${file} has no steps for "${name}"`);
  return steps;
}

// A step that names another scene file: resolved beside steps.json.
function stepScenePath(stepsFile, name) {
  if (typeof name !== 'string' || !name) fail(`${stepsFile}: a step object needs "scene"`);
  const file = path.resolve(path.dirname(stepsFile), /\.excalidraw(\.md)?$/.test(name) ? name : `${name}.excalidraw`);
  if (!fs.existsSync(file)) fail(`${stepsFile}: step scene ${file} not found`);
  return file;
}

// A keyframe's elements: its scene, cut to one build step (`step`) or to
// `ids`, plus any `add` elements drawn over it. A shape's bound label comes
// with the shape.
async function loadKeyframe(spec, baseDir) {
  let scene = await loadSceneSource(spec.scene, baseDir);
  let elements = scene.elements;
  let ids = spec.ids;
  let focus, set;
  if (spec.step !== undefined) {
    if (typeof spec.scene !== 'string' || /^(canvas|snapshot:)/.test(spec.scene)) fail('"step" needs a scene file');
    const file = path.resolve(baseDir, spec.scene);
    const stepsFile = spec.steps ? path.resolve(baseDir, spec.steps) : path.join(path.dirname(file), 'steps.json');
    const steps = readSteps(file, stepsFile, spec.stepsKey);
    const entry = steps[spec.step];
    if (!entry) fail(`${sceneName(file)} has no step ${spec.step} (it has ${steps.length})`);
    // A step may show another scene file: "name" for all of it, or
    // {"scene": "name", "ids": [...]}. Elements that share an id with the
    // step before move, resize and recolor into place, which is how a step
    // moves something. An object step may also carry "focus" (ids the camera
    // fits) and "set" ({id: settings} for this step only).
    if (Array.isArray(entry)) {
      ids = entry;
    } else if (typeof entry === 'string' || entry.scene) {
      const other = stepScenePath(stepsFile, typeof entry === 'string' ? entry : entry.scene);
      scene = await loadSceneSource(other, baseDir);
      elements = scene.elements;
      ids = typeof entry === 'string' ? undefined : entry.ids;
    } else if (Array.isArray(entry.ids)) {
      ids = entry.ids;
    } else {
      fail(`${stepsFile}: step ${spec.step} of ${sceneName(file)} needs "ids" or "scene"`);
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      focus = entry.focus;
      set = entry.set;
    }
  }
  if (ids) {
    const wanted = new Set(ids);
    elements = elements.filter(el => wanted.has(el.id) || (el.containerId && wanted.has(el.containerId)));
  }
  if (Array.isArray(spec.add)) elements = [...elements, ...spec.add];
  return { elements, files: scene.files, focus, set };
}

// New ids for every element and every reference to one, so nothing matches
// across a `clear` keyframe and the old scene leaves as a whole.
function renameIds(elements, suffix) {
  const r = id => (id ? `${id}${suffix}` : id);
  return elements.map(el => {
    const out = { ...el, id: r(el.id) };
    if (el.containerId) out.containerId = r(el.containerId);
    if (el.frameId) out.frameId = r(el.frameId);
    if (Array.isArray(el.boundElements)) out.boundElements = el.boundElements.map(b => ({ ...b, id: r(b.id) }));
    for (const key of ['startBinding', 'endBinding']) {
      if (el[key]?.elementId) out[key] = { ...el[key], elementId: r(el[key].elementId) };
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Narration: a keyframe's `narration` is what its `audio` says. Viewers read
// the screen while they listen, so text the voice never says reads as the two
// disagreeing. Every content word of each line of text a keyframe adds or
// changes must be said in that keyframe's narration. Words compare by a rough
// stem ("reading" matches "reads", "dropped" matches "drop"), numbers written
// as words match digits, and small words do not count. Labels that are only
// structure (lane names, code) go in the keyframe's `silent` list.

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'as',
  'is', 'it', 'its', 'be', 'your', 'you', 'this', 'that']);

// A slide abbreviates dates ("Fri Sep 11") that the voice says in full.
const DATE_WORDS = { monday: 'mon', tuesday: 'tue', tues: 'tue', wednesday: 'wed', thursday: 'thu', thur: 'thu',
  thurs: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun', january: 'jan', february: 'feb', march: 'mar',
  april: 'apr', june: 'jun', july: 'jul', august: 'aug', september: 'sep', sept: 'sep', october: 'oct',
  november: 'nov', december: 'dec' };

function stem(word) {
  if (NUMBER_WORDS.includes(word)) return String(NUMBER_WORDS.indexOf(word));
  if (DATE_WORDS[word]) return DATE_WORDS[word];
  let w = word.replace(/'s$|'$/, '');
  if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';  // "stories" -> "story"
  if (w.length === 4 && /[^s]s$/.test(w)) return w.slice(0, -1);   // "asks" -> "ask"
  if (w.length > 4) {
    const cut = w.replace(/(ing|ed|es|s)$/, '');
    // "dropped" -> "dropp" -> "drop"
    w = cut !== w && /([^aeiou])\1$/.test(cut) ? cut.slice(0, -1) : cut;
  }
  // A final e goes too, so "assemble" meets "assembles" and "file" meets "files".
  return w.length > 3 ? w.replace(/e$/, '') : w;
}

function spokenWords(text) {
  return String(text).toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim()
    .split(/\s+/).filter(w => w && !SMALL_WORDS.has(w)).map(stem);
}

function unspokenText(keyframes) {
  const out = [];
  let shown = new Map();
  keyframes.forEach((k, i) => {
    if (k.spec.clear) shown = new Map();
    // Transient text counts in its own keyframe: it is on screen, if briefly.
    const texts = k.all.filter(el => el.type === 'text');
    if (typeof k.spec.narration === 'string') {
      const said = new Set(spokenWords(k.spec.narration));
      const silent = new Set(k.spec.silent ?? []);
      for (const el of texts) {
        if (shown.get(el.id) === el.text || silent.has(el.id) || silent.has(el.containerId)) continue;
        for (const line of String(el.originalText ?? el.text).split('\n')) {
          const missing = spokenWords(line).filter(w => !said.has(w));
          if (missing.length) out.push({ keyframe: i, id: el.id, text: line, missing });
        }
      }
    }
    shown = new Map(k.elements.filter(el => el.type === 'text').map(el => [el.id, el.text]));
  });
  return out;
}

// A count the voice says that disagrees with the same thing counted on the
// screen ("two servers" over "3 servers") reads as one of them being wrong.
// A count pairs a number with the next two words that are not small words,
// so "3 root servers" counts both roots and servers. Silent text is skipped.
function countedThings(text) {
  const words = String(text).toLowerCase().replace(/[‘’]/g, "'").match(/\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|[a-z']+/g) ?? [];
  const isNumber = w => /^\d/.test(w) || NUMBER_WORDS.includes(w);
  const pairs = [];
  words.forEach((word, i) => {
    if (!isNumber(word) || word.includes('.')) return;
    const n = /^\d/.test(word) ? word.replace(/,/g, '') : String(NUMBER_WORDS.indexOf(word));
    const things = [];
    for (const next of words.slice(i + 1)) {
      if (things.length === 2 || isNumber(next)) break;
      if (!SMALL_WORDS.has(next)) things.push(stem(next));
    }
    for (const thing of things) pairs.push([n, thing]);
  });
  return pairs;
}

function countMismatches(keyframes) {
  const out = [];
  keyframes.forEach((k, i) => {
    if (typeof k.spec.narration !== 'string') return;
    const silent = new Set(k.spec.silent ?? []);
    const tally = (map, [n, thing]) => map.set(thing, (map.get(thing) ?? new Set()).add(n));
    const shown = new Map();
    for (const el of k.all) {
      if (el.type !== 'text' || silent.has(el.id) || silent.has(el.containerId)) continue;
      countedThings(el.originalText ?? el.text).forEach(pair => tally(shown, pair));
    }
    const said = new Map();
    countedThings(k.spec.narration).forEach(pair => tally(said, pair));
    for (const [thing, numbers] of said) {
      const onScreen = shown.get(thing);
      if (!onScreen || [...numbers].some(n => onScreen.has(n))) continue;
      out.push({ keyframe: i, thing, said: [...numbers], shown: [...onScreen] });
    }
  });
  return out;
}

// How tall a screenshot's own text looks on screen. The app's text is taken
// as 13 CSS pixels, a common size for UI and body text; the capture holds
// it at `scale` image pixels per CSS pixel (customData.excalive.scale, 2 if
// not given: the house captures at 2x); and the step's camera draws each
// image pixel at some number of screen pixels. Under 20 pixels of a 1080p
// frame it is hard to read: zoom in on the part the words are about, or
// capture a smaller window. Reported where a screenshot turns small, and
// again after a step that showed it large.
const UI_TEXT = 13;
const SCREEN_TEXT_FLOOR = 20;
const imageSizes = new Map();
function imagePixels(dataURL) {
  if (imageSizes.has(dataURL)) return imageSizes.get(dataURL);
  const b = Buffer.from(String(dataURL).replace(/^data:[^,]*,/, ''), 'base64');
  let size = null;
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) size = [b.readUInt32BE(16), b.readUInt32BE(20)];
  else if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        size = [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        break;
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  } else if (b.toString('latin1', 8, 12) === 'WEBP' && b.toString('latin1', 12, 16) === 'VP8X') {
    size = [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  }
  imageSizes.set(dataURL, size);
  return size;
}

function smallScreenText(keyframes, files, options) {
  const out = [];
  const said = new Map();
  keyframes.forEach((k, i) => {
    for (const el of k.elements) {
      if (el.type !== 'image' || !files[el.fileId]) continue;
      const pixels = imagePixels(files[el.fileId].dataURL);
      if (!pixels) continue;
      const scale = Number(el.customData?.excalive?.scale ?? 2);
      const screenPerPixel = (el.width / pixels[0]) * (options.width / k.camera.width) * (1080 / options.height);
      const px = Math.round(UI_TEXT * scale * screenPerPixel);
      if (px >= SCREEN_TEXT_FLOOR) {
        said.delete(el.id);
        continue;
      }
      if (said.get(el.id) === px) continue;
      said.set(el.id, px);
      out.push({ keyframe: i, id: el.id, px });
    }
  });
  return out;
}

// Text that runs past where it should end, by real widths: on a card (a
// 1600 by 900 `frame`), a line past the right margin at x 1480 or below the
// content area at y 860; in a diagram, text outside its `frame`, which is
// what gets fitted to the page. Labels bound in a shape are not checked.
function overflowText(keyframes) {
  const out = [];
  let shown = new Map();
  keyframes.forEach((k, i) => {
    if (k.spec.clear) shown = new Map();
    const frame = k.elements.find(el => el.id === 'frame');
    const card = frame && Math.round(frame.width) === 1600 && Math.round(frame.height) === 900;
    for (const el of k.all) {
      if (el.type !== 'text' || el.isDeleted || el.containerId || !frame || el.id === 'story-title') continue;
      if (shown.get(el.id) === el.text) continue;
      const raw = String(el.originalText ?? el.text);
      const w = textWidth(raw, el.fontFamily, el.fontSize);
      const h = raw.split('\n').length * el.fontSize * (el.lineHeight ?? 1.25);
      const left = el.textAlign === 'center' ? el.x + el.width / 2 - w / 2
        : el.textAlign === 'right' ? el.x + el.width - w : el.x;
      const x1 = Math.round(left + w - frame.x), y1 = Math.round(el.y + h - frame.y);
      const problems = [];
      if (card) {
        if (x1 > 1482) problems.push(`ends at x ${x1}, past the margin at 1480`);
        if (y1 > 862) problems.push(`ends at y ${y1}, below the content area at 860`);
      } else {
        if (left < frame.x - 2 || x1 > frame.width + 2) problems.push(`runs outside its frame (x ${Math.round(left - frame.x)} to ${x1} in a frame ${Math.round(frame.width)} wide)`);
        if (el.y < frame.y - 2 || y1 > frame.height + 2) problems.push(`runs outside its frame (y ${Math.round(el.y - frame.y)} to ${y1} in a frame ${Math.round(frame.height)} tall)`);
      }
      for (const problem of problems) out.push({ keyframe: i, id: el.id, text: raw.split('\n')[0].slice(0, 60), problem });
    }
    shown = new Map(k.elements.filter(el => el.type === 'text').map(el => [el.id, el.text]));
  });
  return out;
}

function audioSeconds(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    const seconds = Number(out.trim());
    if (Number.isFinite(seconds)) return seconds;
  } catch {}
  fail(`cannot read the length of ${file} (is ffprobe installed?)`);
}

// Accept the same agent shorthand as the CLI and MCP tools (`text` on shapes,
// `startElementId` / `endElementId` on arrows); native elements pass through.
function expandShorthand(elements) {
  const expanded = elements.map(el => {
    if (!el.startElementId && !el.endElementId && !(el.text && el.type !== 'text')) return el;
    const prepared = prepareElement(el);
    // A shape's fontSize / fontFamily are meant for its label; the canvas
    // drops them (labels render at 20), so carry them into the label here.
    if (prepared.label) {
      if (el.fontSize !== undefined) prepared.label.fontSize = el.fontSize;
      if (prepared.fontFamily !== undefined) prepared.label.fontFamily = prepared.fontFamily;
    }
    return prepared;
  });
  routeBoundArrows(expanded);
  return expanded;
}

// Where a ray from a shape's center toward (tx, ty) leaves the shape.
// Same geometry as the canvas server's computeEdgePoint.
function edgePoint(el, tx, ty) {
  const hw = (el.width || 0) / 2;
  const hh = (el.height || 0) / 2;
  const cx = el.x + hw;
  const cy = el.y + hh;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy + hh };
  if (el.type === 'diamond') {
    const scale = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return { x: cx + dx * scale, y: cy + dy * scale };
  }
  const angle = Math.atan2(dy, dx);
  if (el.type === 'ellipse') return { x: cx + hw * Math.cos(angle), y: cy + hh * Math.sin(angle) };
  const tan = Math.tan(angle);
  if (Math.abs(tan * hw) <= hh) {
    const sign = dx >= 0 ? 1 : -1;
    return { x: cx + sign * hw, y: cy + sign * hw * tan };
  }
  const sign = dy >= 0 ? 1 : -1;
  return { x: cx + (sign * hh) / tan, y: cy + sign * hh };
}

// The canvas server routes shorthand arrows (start/end refs) edge to edge when
// they are created; the headless renderer does not, so do it here for scenes
// loaded from files. Mirrors the server's resolveArrowBindings, 8px gap included.
function routeBoundArrows(elements) {
  const byId = new Map(elements.map(el => [el.id, el]));
  const GAP = 8;
  for (const el of elements) {
    if ((el.type !== 'arrow' && el.type !== 'line') || (!el.start && !el.end)) continue;
    const startEl = el.start ? byId.get(el.start.id) : undefined;
    const endEl = el.end ? byId.get(el.end.id) : undefined;
    const center = s => ({ x: s.x + (s.width || 0) / 2, y: s.y + (s.height || 0) / 2 });
    const startCenter = startEl ? center(startEl) : { x: el.x, y: el.y };
    const endCenter = endEl ? center(endEl) : { x: el.x + 100, y: el.y };
    const startPt = startEl ? edgePoint(startEl, endCenter.x, endCenter.y) : startCenter;
    const endPt = endEl ? edgePoint(endEl, startCenter.x, startCenter.y) : endCenter;
    const dist = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) || 1;
    const ux = (endPt.x - startPt.x) / dist;
    const uy = (endPt.y - startPt.y) / dist;
    el.x = startPt.x + ux * GAP;
    el.y = startPt.y + uy * GAP;
    el.points = [[0, 0], [endPt.x - ux * GAP - el.x, endPt.y - uy * GAP - el.y]];
  }
}

// Prepare a keyframe the way the canvas tab would (agent shorthand like
// `text`/`label` and start/end bindings become native elements), then give
// bound labels stable ids so they match across keyframes.
//
// The renderer measures every text element again and keeps its x. Its measure
// is narrower than a browser's (195 px becomes 166 px for a 27 px label), so a
// center- or right-aligned free text measured anywhere else drifts left by the
// difference. Each one is put back on its anchor: the middle (or right edge) of
// its stored box, which is what x means to Excalidraw (`textX: "left"`), or x
// itself (`textX: "center"`), which is how the canvas's browser tab draws
// center-aligned text an agent wrote.
// The renderer collapses runs of spaces inside text, which wrecks the
// alignment of code. In code fonts (Cascadia, Comic Shanns) every run of two
// or more spaces, and a leading space, becomes non-breaking.
// Cascadia Code also draws ligatures ("<=" as one ≤ glyph, "==" as a long
// bar), but code on a slide should read as typed, so a hair space (U+200A,
// no visible gap) goes between the characters of each operator.
const CODE_FONTS = new Set([3, 8]);
const LIGATURE = /([<>=!\-+*\/:.&|~^%])(?=[<>=!\-+*\/:.&|~^%])/g;
function keepCodeSpaces(el) {
  if (el?.type !== 'text' || !CODE_FONTS.has(Number(el.fontFamily)) || typeof el.text !== 'string') return el;
  const fix = t => t.split('\n').map(line => line.replace(/^ +| {2,}/g, run => '\u00a0'.repeat(run.length))
    .replace(LIGATURE, '$1\u200a')).join('\n');
  return { ...el, text: fix(el.text), ...(typeof el.originalText === 'string' ? { originalText: fix(el.originalText) } : {}) };
}

async function normalizeKeyframe(elements, textX = 'auto') {
  // auto: x is the middle of centered free text when every such x is a whole
  // number (placed by hand, the way the canvas's browser tab draws it), and
  // the left edge otherwise (saved from the canvas, with fractional x).
  if (textX === 'auto') {
    const centered = elements.filter(el => el.type === 'text' && !el.containerId && el.textAlign === 'center');
    textX = centered.length && centered.every(el => Number.isInteger(Number(el.x))) ? 'center' : 'left';
  }
  elements = elements.map(keepCodeSpaces);
  const anchors = new Map();
  for (const el of elements) {
    if (!el || el.isDeleted || el.type !== 'text' || el.containerId) continue;
    const align = el.textAlign ?? 'left';
    if (align === 'center' && textX === 'center') anchors.set(el.id, { align, at: el.x });
    else if (align !== 'left' && el.width > 0) {
      anchors.set(el.id, { align, at: el.x + (align === 'center' ? el.width / 2 : el.width) });
    }
  }
  const live = await prepareScene(elements.filter(el => el && !el.isDeleted));
  const renamed = new Map();
  for (const el of live) {
    if (el.type === 'text' && el.containerId) renamed.set(el.id, `${el.containerId}::label`);
  }
  return live.map(el => {
    const copy = structuredClone(el);
    const anchor = anchors.get(copy.id);
    if (anchor) copy.x = anchor.at - (anchor.align === 'center' ? copy.width / 2 : copy.width);
    if (renamed.has(copy.id)) copy.id = renamed.get(copy.id);
    if (Array.isArray(copy.boundElements)) {
      copy.boundElements = copy.boundElements.map(b => (renamed.has(b.id) ? { ...b, id: renamed.get(b.id) } : b));
    }
    return copy;
  });
}

// ---------------------------------------------------------------------------
// Camera: a frame element passed to Excalidraw's exporter clips the render to
// its bounds, so moving or resizing it pans and zooms.

function boundsOf(elements) {
  const visible = elements.filter(el => !el.isDeleted);
  if (visible.length === 0) return { x: 0, y: 0, width: 100, height: 100 };
  const [x1, y1, x2, y2] = getCommonBounds(visible);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

// Grow a rectangle around its center to the output aspect ratio, with padding.
function fitAspect(rect, aspect, padding) {
  let width = rect.width + padding * 2;
  let height = rect.height + padding * 2;
  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

function resolveCamera(spec, elements, aspect, padding) {
  if (!spec) return null;
  if (Array.isArray(spec.fit)) {
    const wanted = new Set(spec.fit);
    const chosen = elements.filter(el => wanted.has(el.id) || (el.containerId && wanted.has(el.containerId)));
    if (chosen.length === 0) fail(`camera.fit matched no elements: ${spec.fit.join(', ')}`);
    return fitAspect(boundsOf(chosen), aspect, spec.padding ?? padding);
  }
  return fitAspect({ x: spec.x, y: spec.y, width: spec.width, height: spec.height }, aspect, 0);
}

function lerpRect(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), width: lerp(a.width, b.width, t), height: lerp(a.height, b.height, t) };
}

// ---------------------------------------------------------------------------
// Effects
//
// An effect is how an element enters, changes or leaves during a transition:
// an object with any of
//   enter(el, t, ctx)     the element at progress t (0 to 1) of its entrance:
//                         an element, a list of elements, or null for nothing
//   exit(el, t, ctx)      the same as it leaves; without one, enter runs backwards
//   change(a, b, t, ctx)  the element between its state before (a) and after (b)
//   seconds(el, params)   how long it runs, when the default does not suit
//   waitFor(params)       the id of an element whose entrance it waits for
// An element an effect returns may carry `svg`, a function (body, element) ->
// body that rewrites the element's own SVG, drawn as a layer of its own: that
// is how draw traces an outline and write reveals a line. Every step rests on
// its scene as drawn, so effects shape only the motion between steps.
//
// ctx holds ease (the easing function), params (the effect's settings),
// seconds (how long this run lasts), element(id) (any element of the step),
// unit (the box around the element and what moves with it: its label, its
// group), pointAt(path, f) (the point a fraction f along an arrow or line),
// textWidth(text, fontFamily, fontSize), effect(name), morph(a, b, t), lerp,
// clamp01 and lerpColor.
//
// A story adds effects with `effects: [file.mjs]`. Each module's default
// export is an object of named effects, which may replace built-in ones.

const LINEAR_TYPES = new Set(['arrow', 'line', 'freedraw']);
const OUTLINE_TYPES = new Set(['rectangle', 'ellipse', 'diamond']);
const HAND_FONTS = new Set([1, 5]);   // Virgil, Excalifont

// Hand-drawn text and code run at a steady pace, so a short label does not
// crawl and a long one speeds up to finish within the cap.
const WRITE_PACE = { perSecond: 30, min: 0.4, max: 1.6 };
const TYPE_PACE = { perSecond: 60, min: 0.3, max: 2.5 };
function paced(el, pace) {
  if (el.type !== 'text') return undefined;
  const chars = String(el.originalText ?? el.text).replace(/\s/g, '').length;
  return Math.min(pace.max, Math.max(pace.min, chars / pace.perSecond));
}

const fadeIn = (el, t, ctx) => ({ ...el, opacity: (el.opacity ?? 100) * ctx.ease(t) });

const EFFECTS = {
  none: { enter: (el, t) => (t > 0 ? el : null), exit: (el, t) => (t < 1 ? el : null) },
  fade: { enter: fadeIn },
  rise: {
    enter(el, t, ctx) {
      const e = ctx.ease(t);
      return { ...el, opacity: (el.opacity ?? 100) * e, y: el.y + (1 - e) * 16 };
    },
  },
  pop: {
    enter(el, t) {
      const s = 0.6 + 0.4 * EASINGS.outBack(t);
      const out = { ...el, opacity: (el.opacity ?? 100) * clamp01(t * 3) };
      if (el.containerId || el.type === 'text') return out;
      out.x = el.x + (el.width * (1 - s)) / 2;
      out.y = el.y + (el.height * (1 - s)) / 2;
      out.width = el.width * s;
      out.height = el.height * s;
      if (Array.isArray(el.points)) out.points = el.points.map(([px, py]) => [px * s, py * s]);
      return out;
    },
  },
  // Text appears a character at a time, as typed.
  type: {
    enter(el, t, ctx) {
      if (el.type !== 'text') return fadeIn(el, t, ctx);
      const full = el.originalText ?? el.text;
      const shown = full.slice(0, Math.round(full.length * t));
      return shown ? { ...el, text: shown, originalText: shown } : null;
    },
    seconds: el => paced(el, TYPE_PACE),
  },
  // Each line is revealed left to right behind a soft edge, one line after
  // another: hand-drawn text writing itself on.
  write: {
    enter(el, t, ctx) {
      if (el.type !== 'text') return fadeIn(el, t, ctx);
      if (t <= 0) return null;
      return t >= 1 ? el : { ...el, svg: (body, drawn) => applyWriteProgress(body, t, drawn) };
    },
    seconds: el => paced(el, WRITE_PACE),
  },
  // Arrows and lines grow along their path; shapes trace their outline, then fill.
  draw: {
    enter(el, t, ctx) {
      if (t <= 0) return null;
      if (LINEAR_TYPES.has(el.type)) {
        const drawn = { ...el, points: truncatePath(el.points, ctx.ease(t)), startBinding: null, endBinding: null };
        if (t < 1) drawn.elbowed = false;
        return drawn;
      }
      if (OUTLINE_TYPES.has(el.type)) {
        if (t >= 1) return el;
        // The outline draws on over the first 75%; the fill fades in from 45%.
        const stroke = EASINGS.inOutCubic(clamp01(t / 0.75));
        const fill = clamp01((t - 0.45) / 0.55);
        return { ...el, svg: (body, drawn) => applyDrawProgress(body, { stroke, fill }, drawn.strokeColor) };
      }
      return fadeIn(el, t, ctx);
    },
  },
  // Moves along an arrow or line (`path`, its id) and arrives at its end: a
  // message on its way. Meant for a transient element, a dot or a label, which
  // then fades where it arrived. It waits for its path to finish drawing.
  travel: {
    enter(el, t, ctx) {
      const path = ctx.element(ctx.params.path);
      if (!path || !Array.isArray(path.points)) fail(`travel on "${el.id}" needs "path": the id of an arrow or line in the same step`);
      const [px, py] = ctx.pointAt(path, ctx.ease(t));
      const u = ctx.unit;
      return {
        ...el, x: el.x + px - (u.x + u.width / 2), y: el.y + py - (u.y + u.height / 2),
        opacity: (el.opacity ?? 100) * clamp01(t * 5),
      };
    },
    seconds: () => 0.9,
    waitFor: params => params.path,
  },
  morph: { change: (a, b, t, ctx) => morphElement(a, b, ctx.ease(t)) },
};

// The house entrance by kind: shapes trace, arrows grow, hand-drawn text
// writes on, code types, and plain type (Nunito and the rest) fades in.
function defaultEnter(el) {
  if (LINEAR_TYPES.has(el.type) || OUTLINE_TYPES.has(el.type)) return 'draw';
  if (el.type === 'text' && HAND_FONTS.has(Number(el.fontFamily))) return 'write';
  if (el.type === 'text' && CODE_FONTS.has(Number(el.fontFamily))) return 'type';
  return 'fade';
}

const effectSpec = value => (typeof value === 'string' ? { effect: value } : value && typeof value === 'object' ? value : null);

function getEffect(name, hook) {
  const fx = EFFECTS[name];
  if (!fx) fail(`unknown effect "${name}" (have ${Object.keys(EFFECTS).join(', ')})`);
  if (hook === 'change' ? !fx.change : !fx.enter && !fx.exit) fail(`effect "${name}" cannot ${hook}`);
  return fx;
}

async function loadEffects(files, baseDir) {
  for (const file of files ?? []) {
    const mod = await import(pathToFileURL(path.resolve(baseDir, file)).href);
    const named = mod.default ?? mod.effects;
    if (!named || typeof named !== 'object') fail(`${file}: export default an object of named effects`);
    Object.assign(EFFECTS, named);
  }
}

// The point a fraction f of the way along an arrow's or line's path.
function pointAt(path, f) {
  const points = truncatePath(path.points, clamp01(f));
  const [px, py] = points[points.length - 1];
  return [path.x + px, path.y + py];
}

// ---------------------------------------------------------------------------
// Element settings, from Excalidraw's own customData field, which the editor
// keeps and which travels with the element from step to step:
//   "customData": {"excalive": {
//     "enter": "write",          an effect, or {"effect": "travel", "path": "q1"}
//     "exit": "fade", "change": "morph",
//     "delay": 0.2,              seconds after its turn in the entrance order
//     "seconds": 0.8,            how long its entrance or change runs
//     "easing": "outCubic",
//     "transient": true,         only in its step's transition: it enters, then
//                                leaves (a number: seconds to stay first)
//     "pin": true                keeps its place on screen while the camera moves
//   }}
// Timing keys inside an effect object override these. A keyframe's `set`
// ({id: settings}, from a step's "set" in steps.json) overrides them for that
// step. A shape's settings reach its bound label, and the members of a group
// share theirs.

function ownSettings(el) {
  const s = el.customData?.excalive;
  return s && typeof s === 'object' ? s : {};
}

function settingsFor(elements, set = {}) {
  const byId = new Map(elements.map(el => [el.id, el]));
  const own = el => ({ ...ownSettings(el), ...(set[el.id] ?? {}) });
  const keyOf = el => unitKey(el.containerId ? byId.get(el.containerId) ?? el : el);
  const shared = new Map();
  for (const el of elements) {
    if (el.containerId) continue;
    shared.set(keyOf(el), { ...(shared.get(keyOf(el)) ?? {}), ...own(el) });
  }
  return new Map(elements.map(el => [el.id, { ...(shared.get(keyOf(el)) ?? {}), ...own(el) }]));
}

const isTransient = settings => settings?.transient !== undefined && settings.transient !== false;

// A keyframe ready to plan: its settings, every element in scene order, the
// ones that rest on screen, and the transient ones that only pass through its
// transition. Pinned elements carry the camera they were laid out under.
function finishKeyframe(spec, all) {
  const settings = settingsFor(all, spec.set);
  const pinned = new Set(spec.pin?.ids ?? []);
  const marked = all.map(el => (pinned.has(el.id) || settings.get(el.id)?.pin ? { ...el, _pin: spec.pin?.camera ?? true } : el));
  return {
    spec, settings, all: marked,
    elements: marked.filter(el => !isTransient(settings.get(el.id))),
    transients: marked.filter(el => isTransient(settings.get(el.id))),
  };
}

// ---------------------------------------------------------------------------
// Transitions

// Seconds per transition when a keyframe sets no duration.
const DEFAULT_DURATION = 1.2;
// Seconds a transient element takes to leave, unless its exit says otherwise.
const TRANSIENT_EXIT = 0.4;

// Elements that enter together: a shape with its label, or one Excalidraw group.
function unitKey(el) {
  if (el.containerId) return el.containerId;
  if (Array.isArray(el.groupIds) && el.groupIds.length > 0) return `group:${el.groupIds[el.groupIds.length - 1]}`;
  return el.id;
}

// Order entering units by keyframe order (z-order, usually creation order),
// then an explicit `order` list, and keep each arrow after the shapes it joins.
function orderUnits(entering, order) {
  const units = new Map();
  for (const el of entering) {
    const key = unitKey(el);
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(el);
  }
  let keys = [...units.keys()];
  if (Array.isArray(order)) {
    const rank = id => {
      const i = order.indexOf(id);
      return i === -1 ? order.length : i;
    };
    keys = keys.map((k, i) => ({ k, i })).sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i).map(o => o.k);
  } else {
    for (const key of [...keys]) {
      const members = units.get(key);
      const arrow = members.length === 1 && members[0].type === 'arrow' ? members[0] : null;
      if (!arrow) continue;
      const endIndexes = [arrow.startBinding?.elementId, arrow.endBinding?.elementId]
        .map(id => entering.find(e => e.id === id))
        .filter(Boolean)
        .map(owner => keys.indexOf(unitKey(owner)));
      const at = keys.indexOf(key);
      const last = Math.max(-1, ...endIndexes);
      if (last > at) {
        // Removing the arrow shifts its later endpoint down by one, so
        // inserting at `last` places the arrow right after that endpoint.
        keys.splice(at, 1);
        keys.splice(last, 0, key);
      }
    }
  }
  return keys.map(k => units.get(k));
}

// Interpolate a shared element between keyframes.
function morphElement(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = { ...(t < 0.5 ? a : b) };
  for (const key of ['x', 'y', 'width', 'height', 'opacity', 'strokeWidth', 'fontSize']) {
    if (typeof a[key] === 'number' && typeof b[key] === 'number') out[key] = lerp(a[key], b[key], t);
  }
  if (typeof a.angle === 'number' && typeof b.angle === 'number') {
    let delta = (b.angle - a.angle) % (2 * Math.PI);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    out.angle = a.angle + delta * t;
  }
  out.strokeColor = lerpColor(a.strokeColor, b.strokeColor, t);
  out.backgroundColor = lerpColor(a.backgroundColor, b.backgroundColor, t);
  if (Array.isArray(a.points) && Array.isArray(b.points) && a.points.length > 1 && b.points.length > 1) {
    out.points = lerpPoints(a.points, b.points, t);
  }
  // Changed text dips out and back in around the swap.
  if (a.type === 'text' && a.text !== b.text) {
    out.opacity = (out.opacity ?? 100) * Math.abs(1 - 2 * t);
  }
  return out;
}

// Bookkeeping fields change on every save without changing the picture.
const BOOKKEEPING_KEYS = new Set(['version', 'versionNonce', 'updated', 'index']);
function visualKey(el) {
  return JSON.stringify(el, (key, value) => (BOOKKEEPING_KEYS.has(key) ? undefined : value));
}

// Plan one transition: for each element that moves, which effect runs, when
// it starts and how long it lasts. `previous` is the keyframe before, whose
// settings say how its elements leave.
function planTransition(k, previous) {
  const { spec } = k;
  const from = new Map(k.from.map(el => [el.id, el]));
  const to = new Map(k.all.map(el => [el.id, el]));
  const entering = k.all.filter(el => !from.has(el.id));
  const exiting = k.from.filter(el => !to.has(el.id));
  const changing = k.all.filter(el => from.has(el.id) && visualKey(from.get(el.id)) !== visualKey(el));
  const duration = spec.duration ?? DEFAULT_DURATION;
  // Every phase scales with `duration`, so a longer duration slows the whole
  // transition rather than only the morphs.
  const enterDuration = spec.enterDuration ?? Math.max(0.4, duration * 0.8);
  const busy = exiting.length > 0 || changing.length > 0;
  const exitDuration = busy ? duration * 0.55 : 0;
  // After a `clear` the camera cuts once the old scene is gone, so nothing new
  // may start drawing before then.
  const enterStart = spec.enterDelay ?? (spec.clear ? exitDuration : busy ? duration * 0.45 : 0);
  // Pinned elements (a slide's title) enter first: they say what the page is
  // before anything draws on it.
  const ordered = orderUnits(entering, spec.order);
  const units = [...ordered.filter(u => u.some(el => el._pin)), ...ordered.filter(u => !u.some(el => el._pin))];
  // 0.2s between units, squeezed so a big scene still enters within ~3s.
  const stagger = spec.stagger ?? (units.length > 1 ? Math.min(0.2, 3 / (units.length - 1)) : 0);

  // One effect run. Timing keys in the effect object win over the element's
  // settings, which win over the effect's own length and the default.
  const job = (el, hook, fxSpec, settings, start, fallback) => {
    const fx = getEffect(fxSpec.effect, hook);
    const easeName = fxSpec.easing ?? settings.easing;
    const length = fxSpec.seconds ?? settings.seconds ?? fx.seconds?.(el, fxSpec) ?? fallback;
    return {
      hook, fx, params: fxSpec, ease: easeName ? easing(easeName) : null,
      start: start + (fxSpec.delay ?? settings.delay ?? 0), length,
    };
  };

  const runs = new Map();
  units.forEach((members, i) => {
    const slot = enterStart + i * stagger;
    for (const el of members) {
      const settings = k.settings.get(el.id) ?? {};
      const asked = effectSpec(spec.styles?.[el.id]) ?? effectSpec(settings.enter)
        ?? (spec.enter && spec.enter !== 'auto' ? effectSpec(spec.enter) : null);
      // A shape's label appears as its outline finishes, unless told otherwise.
      const waits = Boolean(el.containerId) && !asked;
      const fxSpec = { effect: defaultEnter(el), ...(asked ?? {}) };
      const run = job(el, 'enter', fxSpec, settings, waits ? slot + enterDuration * 0.5 : slot, waits ? enterDuration * 0.5 : enterDuration);
      if (isTransient(settings)) run.transient = settings;
      runs.set(el.id, run);
    }
  });
  // Runs that wait for another element's entrance (travel waits for its path).
  for (const run of runs.values()) {
    const before = runs.get(run.fx.waitFor?.(run.params));
    if (before && before !== run) run.start = Math.max(run.start, before.start + before.length);
  }
  for (const [id, run] of runs) {
    if (!run.transient) continue;
    const stay = typeof run.transient.transient === 'number' ? run.transient.transient : 0;
    run.then = job(to.get(id), 'exit', { effect: 'fade', ...(effectSpec(run.transient.exit) ?? {}) }, {}, run.start + run.length + stay, TRANSIENT_EXIT);
  }
  for (const el of changing) {
    const settings = k.settings.get(el.id) ?? {};
    runs.set(el.id, job(el, 'change', { effect: 'morph', ...(effectSpec(settings.change) ?? {}) }, settings, 0, duration));
  }
  for (const el of exiting) {
    // How an element leaves is its own business, from the step it was in.
    const settings = { ...(previous?.settings?.get(el.id.replace(/::was$/, '')) ?? {}), ...(spec.set?.[el.id] ?? {}) };
    runs.set(el.id, job(el, 'exit', { effect: 'fade', ...(effectSpec(settings.exit) ?? {}) }, {}, 0, exitDuration));
  }

  let total = busy ? duration : 0;
  for (const run of runs.values()) {
    total = Math.max(total, run.start + run.length, run.then ? run.then.start + run.then.length : 0);
  }
  const unitBoxes = new Map(units.map(members => [unitKey(members[0]), boundsOf(members)]));
  return { from, to, runs, exitDuration, total, unitBoxes };
}

const asList = value => (value == null ? [] : Array.isArray(value) ? value : [value]);

function effectContext(run, plan, ease, el) {
  return {
    ease: run.ease ?? ease,
    params: run.params,
    seconds: run.length,
    element: id => plan.to.get(id) ?? plan.from.get(id),
    unit: plan.unitBoxes.get(unitKey(el)) ?? boundsOf([el]),
    pointAt,
    textWidth,
    effect: name => getEffect(name, 'enter'),
    morph: morphElement,
    lerp, clamp01, lerpColor,
  };
}

function leave(run, el, t, ctx) {
  return asList(run.fx.exit ? run.fx.exit(el, t, ctx) : run.fx.enter(el, 1 - t, ctx));
}

// Elements on screen at time `time` (seconds) into a planned transition.
function sampleTransition(plan, k, time, ease) {
  const out = [];
  // Leaving elements are drawn first, so what enters covers them.
  for (const el of k.from) {
    if (plan.to.has(el.id)) continue;
    const run = plan.runs.get(el.id);
    const p = windowProgress(time, run.start, run.length);
    if (p < 1) out.push(...leave(run, el, p, effectContext(run, plan, ease, el)));
  }
  for (const el of k.all) {
    const run = plan.runs.get(el.id);
    if (!run) {
      out.push(el);
      continue;
    }
    const p = windowProgress(time, run.start, run.length);
    if (run.hook === 'change') {
      const before = plan.from.get(el.id);
      out.push(...asList(p <= 0 ? before : p >= 1 ? el : run.fx.change(before, el, p, effectContext(run, plan, ease, el))));
      continue;
    }
    if (p <= 0) continue;
    if (run.then && time >= run.then.start) {
      // A transient element leaves from where its entrance left it.
      const q = windowProgress(time, run.then.start, run.then.length);
      if (q >= 1) continue;
      for (const arrived of asList(run.fx.enter(el, 1, effectContext(run, plan, ease, el)))) {
        out.push(...leave(run.then, arrived, q, effectContext(run.then, plan, ease, arrived)));
      }
      continue;
    }
    out.push(...asList(run.fx.enter(el, p, effectContext(run, plan, ease, el))));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rendering

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2147483646) + 1;
}

// `clip` ({x, y, width, height} as fractions of the screen) hides what lies
// outside it, except pinned elements: a scene moving in on part of itself
// keeps clear of the title above it.
async function renderFrame(elements, camera, options, boilTick, clip = null) {
  const pins = new Set(elements.filter(el => el._pin).map(el => el.id));
  const placed = elements.map(el => (el._pin ? pinToCamera(el, camera) : el));
  const seeded = boilTick === null ? placed : placed.map(el => ({ ...el, seed: hashSeed(`${el.id}:${boilTick}`) }));
  // An element an effect gave an `svg` rewrite is drawn as a layer of its own.
  const rewrites = new Map();
  const plain = seeded.map(el => {
    if (typeof el.svg !== 'function') return el;
    const { svg, ...rest } = el;
    rewrites.set(el.id, svg);
    return rest;
  });
  const live = await prepareScene(plain);
  const [frame] = await prepareScene([{ id: '__camera', type: 'frame', name: '', ...camera }]);
  const exportOptions = background => ({
    background,
    viewBackgroundColor: options.background,
    dark: options.dark,
    padding: 0,
    exportingFrame: frame,
  });

  // Elements with a rewrite render as their own layer so their SVG can be
  // edited. Layers keep scene order, and the same camera frame gives every
  // layer the same coordinate system, so the bodies stack into one SVG.
  const layers = [];
  for (const el of live) {
    const rewrite = rewrites.get(el.id);
    const pinned = pins.has(el.id);
    const last = layers[layers.length - 1];
    if (rewrite || (clip && pinned)) layers.push({ elements: [el], rewrite, pinned });
    else if (last && !last.rewrite && !last.pinned) last.elements.push(el);
    else layers.push({ elements: [el], rewrite: null, pinned: false });
  }
  if (layers.length === 0) layers.push({ elements: [], rewrite: null, pinned: false });
  let head = '';
  const bodies = [];
  for (const [i, layer] of layers.entries()) {
    const layerSvg = await renderSvgWithExcalidraw(layer.elements, options.files, exportOptions(i === 0));
    const open = layerSvg.match(/^<svg[^>]*>/)[0];
    if (i === 0) head = open;
    const body = layerSvg.slice(open.length, layerSvg.lastIndexOf('</svg>'));
    const drawn = layer.rewrite ? layer.rewrite(body, layer.elements[0]) : body;
    bodies.push(clip && !layer.pinned ? `<g clip-path="url(#excalive-clip)">${drawn}</g>` : drawn);
  }
  // The clip is in the SVG's own units: scene units from the camera's corner.
  // The background goes under everything, since the first layer's is clipped.
  const under = clip ? `<rect x="0" y="0" width="${camera.width}" height="${camera.height}" fill="${options.background}"/>`
    + `<clipPath id="excalive-clip"><rect x="${clip.x * camera.width}" y="${clip.y * camera.height}" `
    + `width="${clip.width * camera.width}" height="${clip.height * camera.height}"/></clipPath>` : '';
  let svg = `${head}${under}${bodies.join('')}</svg>`;
  const entries = fonts.collectFontEntriesFromSvg(svg);
  // The renderer has no Nunito (Excalidraw's "Normal" font) and draws it as
  // Liberation Sans. This skill carries a Nunito TTF, so keep the family
  // name through the renderer's rewrite and hand it the file.
  const nunito = /font-family=["']Nunito/.test(svg) && fs.existsSync(NUNITO_TTF);
  if (nunito) svg = svg.replace(/(font-family=["'])Nunito(?=[,"'])/g, '$1Nunito-Bundled');
  svg = fonts.rewriteFontFamilies(svg, entries);
  if (nunito) svg = svg.replace(/(font-family=["'])Nunito-Bundled/g, '$1Nunito');
  return svgToPng(svg, {
    scale: options.width / camera.width,
    fontFiles: nunito ? [...fonts.fontFilesFor(entries), NUNITO_TTF] : fonts.fontFilesFor(entries),
    loadSystemFonts: fonts.needsSystemFonts(live),
    defaultFontFamily: 'Excalifont',
  }).data;
}

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.error) fail(`ffmpeg not runnable: ${result.error.message}`);
  if (result.status !== 0) fail(`ffmpeg exited with ${result.status}`);
}

// Every keyframe's voice laid at its own start time on one track. Inputs
// begin at `first`; the clips never overlap, so mixing without
// normalization keeps each at its own level.
function voiceGraph(audio, first) {
  const parts = audio.map((a, i) =>
    `[${first + i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(a.at * 1000)}:all=1[v${i}]`);
  const mix = audio.map((_, i) => `[v${i}]`).join('');
  return `${parts.join(';')};${mix}amix=inputs=${audio.length}:normalize=0:dropout_transition=0,apad[voice]`;
}

// The frames as an ffconcat list: each distinct picture with how long it
// shows. The last entry is listed twice because the concat demuxer drops the
// final entry's duration otherwise.
function writeFrameList(segments, fps, file) {
  const lines = ['ffconcat version 1.0'];
  for (const s of segments) lines.push(`file '${s.file}'`, `duration ${(s.frames / fps).toFixed(6)}`);
  lines.push(`file '${segments[segments.length - 1].file}'`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

function encode(framesDir, segments, options, audio) {
  const { out, fps, width, height } = options;
  const list = path.join(framesDir, 'frames.ffconcat');
  writeFrameList(segments, fps, list);
  const total = segments.reduce((sum, s) => sum + s.frames, 0);
  const input = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  // Output options: a constant frame rate, and the planned frame count, so
  // rounding in the durations can never add or drop a frame at the end.
  const timing = ['-fps_mode', 'cfr', '-r', String(fps), '-frames:v', String(total)];
  const voices = audio.flatMap(a => ['-i', a.file]);
  const fit = `scale=${width}:${height}:flags=lanczos`;
  const ext = path.extname(out).toLowerCase();
  if (ext === '.gif') {
    if (audio.length) process.stderr.write('animate: a GIF has no sound; the audio is left out\n');
    const graph = `${fit},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
    return runFfmpeg([...input, '-filter_complex', graph, ...timing, '-loop', '0', out]);
  }
  let video, sound;
  if (ext === '.mp4' || ext === '.mov') {
    // stillimage suits drawings that hold still for seconds at a time.
    video = ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
    sound = ['-c:a', 'aac', '-b:a', '160k'];
  } else if (ext === '.webm') {
    video = ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-pix_fmt', 'yuv420p'];
    sound = ['-c:a', 'libopus', '-b:a', '128k'];
  } else {
    fail(`unsupported output "${out}" (use .mp4, .mov, .webm, .gif, or a directory for PNG frames)`);
  }
  if (!audio.length) return runFfmpeg([...input, '-vf', fit, ...timing, ...video, out]);
  // The voice track is padded with silence, so -shortest ends on the last frame.
  runFfmpeg([...input, ...voices, '-filter_complex', `[0:v]${fit}[video];${voiceGraph(audio, 1)}`,
    '-map', '[video]', '-map', '[voice]', ...timing, ...video, ...sound, '-shortest', out]);
}

// A PNG frame directory gets its voice as audio.wav beside the frames.
function writeVoice(audio, seconds, out) {
  runFfmpeg(['-y', '-loglevel', 'error', ...audio.flatMap(a => ['-i', a.file]),
    '-filter_complex', voiceGraph(audio, 0), '-map', '[voice]', '-t', seconds.toFixed(3), out]);
}

// Contact sheets of each keyframe's settled frame, 20 to a page (4 across),
// for checking a long video without watching it.
function writeSheets(frames, blank, sheet) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'excalidraw-sheet-'));
  const pages = Math.ceil(frames.length / 20);
  const written = [];
  for (let p = 0; p < pages; p++) {
    const page = frames.slice(p * 20, p * 20 + 20);
    while (page.length % 4) page.push(blank);
    page.forEach((file, i) => fs.copyFileSync(file, path.join(work, `${String(i + 1).padStart(5, '0')}.png`)));
    const ext = path.extname(sheet);
    const file = pages === 1 ? sheet : `${sheet.slice(0, sheet.length - ext.length)}-${p + 1}${ext}`;
    runFfmpeg(['-y', '-loglevel', 'error', '-i', path.join(work, '%05d.png'), '-frames:v', '1',
      '-vf', `scale=480:-2,tile=4x${page.length / 4}:padding=4:color=gray`, file]);
    for (const f of fs.readdirSync(work)) fs.rmSync(path.join(work, f));
    written.push(file);
  }
  fs.rmSync(work, { recursive: true, force: true });
  return written;
}

// ---------------------------------------------------------------------------
// CLI

const BOOLEAN_FLAGS = new Set(['measure', 'intro', 'no-intro', 'dark', 'frames', 'help', 'steps', 'check', 'strict', 'no-video']);

function parseCli(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') flags.help = true;
    else if (arg.startsWith('--') && BOOLEAN_FLAGS.has(arg.slice(2))) flags[arg.slice(2)] = true;
    else if (arg.startsWith('--')) flags[arg.slice(2)] = argv[++i];
    else positionals.push(arg);
  }
  return { flags, positionals };
}

function printUsage() {
  const lines = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1);
  const header = lines.slice(0, lines.findIndex(l => !l.startsWith('//')));
  process.stdout.write(header.map(l => l.replace(/^\/\/ ?/, '')).join('\n') + '\n');
}

// Names of canvas snapshots that start with `prefix`, oldest first.
async function snapshotSources(prefix) {
  const { snapshots } = await fetchJson(`${CANVAS_URL}/api/snapshots`);
  const chosen = snapshots
    .filter(s => s.name.startsWith(prefix))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(s => `snapshot:${s.name}`);
  if (chosen.length === 0) {
    fail(`no snapshots start with "${prefix}" (have: ${snapshots.map(s => s.name).join(', ') || 'none'})`);
  }
  return chosen;
}

// Quick mode: a list of keyframe sources, the first drawn in from empty.
async function buildStoryboard(positionals, flags) {
  if (positionals.length === 1 && positionals[0].endsWith('.json') && !flags.frames) {
    const file = path.resolve(positionals[0]);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.keyframes) return { board: data, baseDir: path.dirname(file) };
  }
  let sources = positionals;
  if (flags.snapshots) sources = await snapshotSources(flags.snapshots);
  if (sources.length === 0) sources = ['canvas'];
  const duration = flags.duration ? Number(flags.duration) : DEFAULT_DURATION;
  const hold = flags.hold ? Number(flags.hold) : 1.2;
  const firstFile = sources.find(s => typeof s === 'string' && /\.(excalidraw|json|md)$/.test(s));
  let keyframes = sources.map(scene => ({ scene }));
  if (flags.steps) {
    if (!firstFile || sources.length !== 1) fail('--steps takes one scene file');
    keyframes = readSteps(path.resolve(firstFile)).map((_, step) => ({ scene: firstFile, step }));
  }
  return {
    board: {
      effects: flags.effects ? flags.effects.split(',') : undefined,
      output: firstFile ? `${sceneName(firstFile)}.mp4` : undefined,
      keyframes: keyframes.map((k, i) => ({ ...k, duration: i === 0 && flags['no-intro'] ? 0 : duration, hold })),
    },
    baseDir: process.cwd(),
  };
}

// Center of an element in scene coordinates, for frame membership.
function centerOf(el) {
  if (Array.isArray(el.points) && el.points.length > 0) {
    const xs = el.points.map(p => p[0]);
    const ys = el.points.map(p => p[1]);
    return [el.x + (Math.min(...xs) + Math.max(...xs)) / 2, el.y + (Math.min(...ys) + Math.max(...ys)) / 2];
  }
  return [el.x + (el.width || 0) / 2, el.y + (el.height || 0) / 2];
}

// Frames mode: Excalidraw frames are the steps. Step i shows everything
// outside frames plus the content of frames 1..i, with the camera on frame i.
// Frames are ordered by name (numeric-aware), then top-to-bottom, left-to-right;
// frame outlines are not rendered.
function frameKeyframes(elements, flags) {
  const frames = elements.filter(el => el.type === 'frame' || el.type === 'magicframe');
  if (frames.length === 0) fail('--frames: the scene has no frames');
  const rowOf = f => Math.round(f.y / Math.max(1, f.height / 2));
  frames.sort((a, b) => {
    const byName = (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true });
    return byName || rowOf(a) - rowOf(b) || a.x - b.x;
  });
  const inside = (f, [cx, cy]) => cx >= f.x && cx <= f.x + f.width && cy >= f.y && cy <= f.y + f.height;
  const byId = new Map(elements.map(el => [el.id, el]));
  const stepOf = el => {
    const owner = el.containerId ? byId.get(el.containerId) ?? el : el;
    const explicit = owner.frameId ? frames.findIndex(f => f.id === owner.frameId) : -1;
    if (explicit !== -1) return explicit;
    return frames.findIndex(f => inside(f, centerOf(owner)));
  };
  const content = elements.filter(el => el.type !== 'frame' && el.type !== 'magicframe').map(el => ({ el, step: stepOf(el) }));
  const duration = flags.duration ? Number(flags.duration) : DEFAULT_DURATION;
  const hold = flags.hold ? Number(flags.hold) : 1.5;
  return frames.map((frame, i) => ({
    spec: {
      duration: i === 0 && flags['no-intro'] ? 0 : duration,
      hold,
      enterDelay: i === 0 ? 0 : duration * 0.75,
      camera: { x: frame.x - 20, y: frame.y - 20, width: frame.width + 40, height: frame.height + 40 },
    },
    elements: content.filter(c => c.step <= i).map(c => ({ ...c.el, frameId: null })),
  }));
}

async function main() {
  const { flags, positionals } = parseCli(process.argv.slice(2));
  if (flags.help) {
    printUsage();
    process.exit(0);
  }
  if (flags.measure) {
    // excalive measure: the drawn width of each text, one per line of output.
    const size = Number(flags.size ?? 48), font = Number(flags.font ?? 6);
    for (const text of positionals) process.stdout.write(`${textWidth(text, font, size).toFixed(1)}\t${text}\n`);
    process.exit(0);
  }
  // Frames mode reads its steps from the scene; the quick-mode board still
  // supplies the default output name from the scene file.
  const { board, baseDir } = await buildStoryboard(positionals, flags);
  const out = flags.out ?? board.output ?? 'animation.mp4';
  // GIFs default to a smaller size and frame rate so files stay shareable.
  const isGif = path.extname(out).toLowerCase() === '.gif';
  const options = {
    out: flags.out ? path.resolve(flags.out) : path.resolve(baseDir, out),
    fps: Number(flags.fps ?? board.fps ?? (isGif ? 20 : 30)),
    width: Number(flags.width ?? board.width ?? (isGif ? 960 : 1920)),
    height: Number(flags.height ?? board.height ?? (isGif ? 540 : 1080)),
    background: board.background ?? '#ffffff',
    dark: Boolean(flags.dark ?? board.dark),
    boil: Number(flags.boil ?? board.boil ?? 0),
    padding: Number(flags.padding ?? board.padding ?? 60),
    files: {},
  };
  options.width -= options.width % 2;
  options.height -= options.height % 2;
  const aspect = options.width / options.height;
  const ease = easing(board.easing);

  const textX = flags['text-x'] ?? board.textX ?? 'auto';
  await loadEffects(board.effects, baseDir);
  let keyframes = [];
  if (flags.frames) {
    const scene = await loadSceneSource(positionals[0] ?? 'canvas', baseDir);
    Object.assign(options.files, scene.files);
    keyframes = frameKeyframes(await normalizeKeyframe(expandShorthand(scene.elements), textX), flags)
      .map(k => finishKeyframe(k.spec, k.elements));
  } else {
    for (const spec of board.keyframes) {
      const scene = await loadKeyframe(spec, baseDir);
      Object.assign(options.files, scene.files);
      const elements = await normalizeKeyframe(expandShorthand(scene.elements), spec.textX ?? textX);
      // A step's "focus" becomes the camera, unless the keyframe brings its own
      // (excalive video and slides fit the focus into the page themselves).
      const camera = spec.camera ?? (scene.focus ? { fit: scene.focus } : undefined);
      const k = finishKeyframe({ ...spec, camera, set: { ...(scene.set ?? {}), ...(spec.set ?? {}) } }, elements);
      k.focused = !spec.camera && Boolean(scene.focus);
      keyframes.push(k);
    }
  }

  // Default camera frames everything any keyframe shows; keyframes may
  // override it and later keyframes inherit the last camera, except that a
  // step's focus ends with its step: the camera goes back to the default.
  // Pinned elements sit in screen terms and do not count toward a fit.
  const framed = els => els.filter(el => !el._pin);
  const everything = fitAspect(boundsOf(framed(keyframes.flatMap(k => k.all))), aspect, options.padding);
  const base = board.camera ? resolveCamera(board.camera, framed(keyframes.flatMap(k => k.all)), aspect, options.padding) : everything;
  let camera = base;
  let focused = false;
  for (const k of keyframes) {
    // A cleared keyframe is a new scene, so it frames itself rather than
    // keep the camera of the scene it replaced.
    const own = k.spec.clear ? fitAspect(boundsOf(framed(k.all)), aspect, options.padding) : focused ? base : camera;
    k.camera = resolveCamera(k.spec.camera, framed(k.all), aspect, options.padding) ?? own;
    camera = k.camera;
    focused = Boolean(k.focused);
  }
  // An element pinned without a camera of its own keeps its place under the
  // first keyframe's camera.
  for (const k of keyframes) for (const el of k.all) if (el._pin === true) el._pin = keyframes[0].camera;

  // Plan the whole timeline before drawing anything, so --check can report
  // its length and unspoken text without rendering a frame. A keyframe with
  // `audio` holds until its voice ends, then `hold` seconds more.
  let previous = { elements: [], camera: keyframes[0].camera, settings: new Map() };
  let startFrame = 0;
  const audio = [];
  for (const k of keyframes) {
    k.from = k.spec.clear ? renameIds(previous.elements, '::was') : previous.elements;
    k.fromCamera = previous.camera;
    k.plan = planTransition(k, previous);
    // A step whose only change is the camera (a focus, or the pull back
    // from one) still takes its duration to move; it would cut otherwise.
    const duration = k.spec.duration ?? DEFAULT_DURATION;
    const moves = !k.spec.clear && ['x', 'y', 'width', 'height'].some(key => Math.abs(k.fromCamera[key] - k.camera[key]) > 0.5);
    k.total = duration === 0 ? 0 : Math.max(k.plan.total, moves ? duration : 0);
    k.transitionFrames = Math.round(k.total * options.fps);
    let hold = k.spec.hold ?? 1.2;
    if (k.spec.audio) {
      const file = path.resolve(baseDir, k.spec.audio);
      const delay = k.spec.audioDelay ?? 0;
      const voice = audioSeconds(file);
      hold = Math.max(0, delay + voice + (k.spec.hold ?? 0.5) - k.total);
      audio.push({ file, at: startFrame / options.fps + delay });
    }
    k.holdFrames = Math.max(Math.round(hold * options.fps), k.transitionFrames === 0 ? 1 : 0);
    startFrame += k.transitionFrames + k.holdFrames;
    previous = k;
  }
  const totalSeconds = startFrame / options.fps;
  const unspoken = unspokenText(keyframes);
  for (const u of unspoken) {
    process.stderr.write(`animate: keyframe ${u.keyframe} shows "${u.text}" but its narration never says "${u.missing.join('", "')}"\n`);
  }
  const overflow = overflowText(keyframes);
  for (const o of overflow) process.stderr.write(`animate: keyframe ${o.keyframe} "${o.text}" ${o.problem}\n`);
  const small = smallScreenText(keyframes, options.files, options);
  for (const m of small) process.stderr.write(`animate: keyframe ${m.keyframe} shows screenshot "${m.id}" with its text about ${m.px} px tall\n`);
  const counts = countMismatches(keyframes);
  for (const c of counts) process.stderr.write(`animate: keyframe ${c.keyframe} says ${c.said.join(' or ')} "${c.thing}" but shows ${c.shown.join(' or ')}\n`);
  if (flags.check) {
    process.stdout.write(JSON.stringify({ keyframes: keyframes.length, duration: Number(totalSeconds.toFixed(2)), audio: audio.length, unspoken, overflow, counts, small }, null, 1) + '\n');
    process.exit(flags.strict && unspoken.length ? 1 : 0);
  }
  if (flags.strict && unspoken.length) fail(`${unspoken.length} on-screen text(s) the narration never says (--strict)`);

  // Stills: each keyframe's finished frame as a PNG, named by its `name` or
  // its number, for slides or a thumbnail. With --no-video nothing else is
  // drawn, so a deck of stills takes seconds.
  const stillsDir = flags.stills ? path.resolve(flags.stills) : null;
  const stillName = (k, i) => `${k.spec.name ?? String(i + 1).padStart(3, '0')}.png`;
  if (stillsDir) fs.mkdirSync(stillsDir, { recursive: true });
  if (flags['no-video']) {
    if (!stillsDir) fail('--no-video needs --stills <dir>');
    const stills = [];
    for (const [i, k] of keyframes.entries()) {
      const file = path.join(stillsDir, stillName(k, i));
      fs.writeFileSync(file, await renderFrame(k.elements, k.camera, options, null, k.spec.clip));
      stills.push(file);
    }
    let sheets;
    if (flags.sheet) {
      const blank = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'excalidraw-blank-')), 'blank.png');
      fs.writeFileSync(blank, await renderFrame([], keyframes[0].camera, options, null));
      sheets = writeSheets(stills, blank, path.resolve(flags.sheet));
      fs.rmSync(path.dirname(blank), { recursive: true, force: true });
    }
    process.stdout.write(JSON.stringify({ success: true, stills, unspoken: unspoken.length, ...(sheets ? { sheets } : {}) }) + '\n');
    return;
  }

  const outIsDir = path.extname(options.out) === '';
  const framesDir = outIsDir ? options.out : fs.mkdtempSync(path.join(os.tmpdir(), 'excalive-'));
  fs.mkdirSync(framesDir, { recursive: true });
  let frameIndex = 0;
  let lastFrame = null;
  // Each distinct picture is written once and counted for as many frames as
  // it shows. A narrated video is mostly holds: as one file per frame it ran
  // to gigabytes, and as hard links ffmpeg still decoded every one (9 of a
  // 16-minute video's 11 minutes). The encoder reads the counts instead.
  const segments = [];
  const framePath = () => path.join(framesDir, `${String(++frameIndex).padStart(5, '0')}.png`);
  const writeFrame = png => {
    lastFrame = framePath();
    fs.writeFileSync(lastFrame, png);
    segments.push({ file: lastFrame, frames: 1 });
  };
  // A PNG directory still gets one file per frame, as hard links.
  const repeatFrame = () => {
    segments[segments.length - 1].frames++;
    if (!outIsDir) return;
    const file = framePath();
    try { fs.linkSync(lastFrame, file); } catch { fs.copyFileSync(lastFrame, file); }
  };
  const boilTick = seconds => (options.boil > 0 ? Math.floor(seconds * options.boil) : null);
  let clock = 0;
  const settled = [];
  const started = performance.now();

  for (const k of keyframes) {
    const { plan, total, transitionFrames, holdFrames } = k;
    const keyEase = k.spec.easing ? easing(k.spec.easing) : ease;
    for (let f = 1; f <= transitionFrames; f++) {
      const time = (f / transitionFrames) * total;
      const elements = sampleTransition(plan, k, time, keyEase);
      // The camera moves over the keyframe's duration, not the whole enter
      // sequence. After a clear it cuts as the old scene finishes leaving.
      const cameraTime = Math.min(total, k.spec.duration ?? DEFAULT_DURATION);
      const cam = k.spec.clear
        ? (time < plan.exitDuration ? k.fromCamera : k.camera)
        : lerpRect(k.fromCamera, k.camera, keyEase(windowProgress(time, 0, cameraTime)));
      writeFrame(await renderFrame(elements, cam, options, boilTick(clock + time), k.spec.clip));
    }
    clock += total;
    let tick = undefined;
    for (let f = 0; f < holdFrames; f++) {
      const nextTick = boilTick(clock + f / options.fps);
      // Static holds reuse one render; boiling re-renders when the seed changes.
      if (lastFrame && nextTick === tick && f > 0) repeatFrame();
      else writeFrame(await renderFrame(k.elements, k.camera, options, nextTick, k.spec.clip));
      tick = nextTick;
    }
    clock += holdFrames / options.fps;
    settled.push(lastFrame);
    if (stillsDir) fs.copyFileSync(lastFrame, path.join(stillsDir, stillName(k, settled.length - 1)));
  }

  let sheets;
  if (flags.sheet) {
    const blank = path.join(framesDir, 'blank.png');
    fs.writeFileSync(blank, await renderFrame([], keyframes[0].camera, options, null));
    sheets = writeSheets(settled, blank, path.resolve(flags.sheet));
    fs.rmSync(blank);
  }
  if (outIsDir) {
    if (audio.length) writeVoice(audio, totalSeconds, path.join(framesDir, 'audio.wav'));
  } else {
    encode(framesDir, segments, options, audio);
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
  const seconds = (performance.now() - started) / 1000;
  process.stdout.write(JSON.stringify({
    success: true, file: options.out, frames: startFrame, duration: Number(totalSeconds.toFixed(2)),
    width: options.width, height: options.height, fps: options.fps, renderSeconds: Number(seconds.toFixed(1)),
    audio: audio.length, unspoken: unspoken.length, ...(sheets ? { sheets } : {}),
  }) + '\n');
}

await main();

// ---------------------------------------------------------------------------
// Storyboard reference
//
// {
//   "output": "explainer.mp4",   // .mp4 .mov .webm .gif, or a directory for PNG frames
//   "width": 1920, "height": 1080, "fps": 30,
//   "background": "#ffffff", "dark": false,
//   "padding": 60,               // camera padding around content (scene units)
//   "boil": 0,                   // hand-drawn wobble: re-seed strokes N times per second
//   "easing": "inOutCubic",      // linear inCubic outCubic inOutCubic outBack
//   "camera": {...},             // optional global camera (see keyframe camera)
//   "effects": ["fx.mjs"],       // modules of named effects (see Effects above)
//   "textX": "auto",             // where x sits on center-aligned free text: "left" (its box's
//                                // left edge, Excalidraw's meaning), "center" (its middle,
//                                // how the canvas's browser tab draws agent-written text), or
//                                // "auto": center when every such x is a whole number
//   "keyframes": [
//     {
//       "scene": "step1.excalidraw",   // file (.excalidraw/.json/.excalidraw.md), "snapshot:<name>",
//                                      // "canvas" (live), or an inline element array
//       "step": 2,           // only build step 2 of a scene file, from the steps.json beside it;
//                            // a step there may instead name another scene file, "k2" or
//                            // {"scene": "k2", "ids": [...]}, whose shared ids move into place
//                            // ({"<scene name>": [[ids of step 0], [ids of step 1], ...]});
//                            // or {"ids": [...], "focus": [ids], "set": {id: settings}}: the
//                            // camera fits the focus (unless the keyframe has a camera), and
//                            // set overrides those elements' settings for this step;
//                            // "steps": "other.json" and "stepsKey": "name" to look elsewhere
//       "ids": ["a", "b"],   // or show only these elements (a shape brings its bound label)
//       "add": [...],        // extra elements drawn over the scene, e.g. a title
//       "set": {"dot": {"enter": {"effect": "travel", "path": "q1"}}},  // element settings
//                            // for this keyframe (see Element settings above)
//       "pin": {"ids": ["title"], "camera": {...}},  // these keep the place on screen they
//                            // have under `camera` while the keyframe's camera moves
//       "clip": {"x": 0, "y": 0.2, "width": 1, "height": 0.8},  // show only this part of
//                            // the screen (fractions), pinned elements excepted
//       "textX": "center",   // per keyframe, overriding the board's
//       "clear": true,       // a new scene: everything on screen fades out, the camera cuts,
//                            // then this keyframe draws in, even where ids repeat
//       "duration": 1.2,     // transition into this keyframe; 0 = cut. First keyframe
//                            // animates in from empty unless duration is 0.
//       "hold": 1.5,         // seconds to rest on the finished keyframe; with audio, seconds
//                            // after the voice ends (default 0.5)
//       "audio": "beat.wav", // voice for this keyframe, starting as its transition starts;
//                            // the keyframe lasts until the voice ends
//       "audioDelay": 0,     // seconds from the keyframe's start to the voice
//       "narration": "...",  // what the audio says; every content word of the text this
//                            // keyframe adds must be said in it (reported, fatal with --strict)
//       "silent": ["lane-a"],  // ids of text the narration need not say (structure, code)
//       "name": "convo-2",   // file name of this keyframe's still (--stills)
//       "stagger": 0.2,      // delay between successive entering elements (auto-shrinks for big scenes)
//       "enterDelay": 0,     // seconds before the first element enters
//       "enterDuration": 0.6,
//       "enter": "auto",     // auto, or an effect for everything entering: draw write type
//                            // fade rise pop travel none, or a story's own
//       "styles": {"title": "type"},   // per-element enter effects
//       "order": ["db", "api"],        // explicit enter order (unit = element, label's
//                                      // container, or "group:<groupId>")
//       "camera": {"fit": ["api", "db"], "padding": 40}  // or {"x","y","width","height"}
//     }
//   ]
// }
//
// auto enter effects: arrows/lines/freedraw grow along their path, rectangles,
// ellipses and diamonds are traced then filled, hand-drawn text (Excalifont,
// Virgil) writes on, code (Cascadia) types, and other text fades in.
