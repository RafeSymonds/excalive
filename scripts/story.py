#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = [
#   "kokoro==0.9.4",
#   "soundfile",
#   "numpy",
#   "pyyaml",
#   "pip",
#   "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
# ]
# ///
"""excalive: one source file in, a narrated video or a slide deck out.

A story is markdown. YAML front matter holds the settings, and each
`## <scene> [<step>] [| <title>]` section is a beat: the words said while
build step <step> of <scene> is on screen. Scenes are .excalidraw files,
and their build steps come from the steps.json beside them. A step is a
list of the ids it shows, or another scene file ("search-2", or {"scene":
"search-2", "ids": [...]}) whose elements that share ids with the step
before move into place: that is how something moves within one slide.

  excalive check  talk.md      scenes, steps, speech, unspoken text, overflow; no render
  excalive video  talk.md      voice every beat, then draw the video
  excalive slides talk.md      every beat as a still, plus a Slidev deck

Front matter (paths are relative to the story file):

  scenes:  [cards, ../diagrams]      searched in order for <scene>.excalidraw
  video:   out/talk.mp4
  work:    out/talk-work             voice cache, storyboards, contact sheets
  voice:   af_heart                  Kokoro voice; speed: 1.0
  lexicon: [lexicon.json]            pronunciations: {term: say} or {term: {ipa: ...}}
  audio_delay: 0.3   gap: 0.5   scene_gap: 1.0   end_hold: 4.0
  text_x:  auto                      auto, left or center, or {scene: left} (see scene_text_x)
  lint:    false                     speech lint on a story with no video
  title:   {size: 64, color: "#1B2547", font: 6}   font 6 is Nunito, 5 hand-drawn
  silent:  {scene: [ids]}            text the words need not say
  strict:  true                      video fails on unspoken text
  slides:  {file: deck/slides.md, images: deck/img, headmatter: {theme: ...}}

The stages are cached. A beat's voice is kept by the hash of what it says,
so editing one beat re-voices only that beat. The render always draws the
whole video, which takes a few minutes for fifteen.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import yaml


class FrontDumper(yaml.SafeDumper):
    """Writes multi-line strings as `|` blocks. The default quoted form puts
    blank lines inside the frontmatter, and tools that read a deck's
    frontmatter line by line stop recognizing it."""


FrontDumper.add_representer(str, lambda d, v: d.represent_scalar(
    'tag:yaml.org,2002:str', v, style='|' if '\n' in v else None))

ANIMATE = Path(__file__).resolve().parent / 'animate.mjs'
RATE = 24000
MAX_CHARS = 500             # longest text Kokoro voices in one call
WPM = 155                   # Kokoro af_heart at speed 1.0, measured

BEAT = re.compile(r'^## (\S+)(?:[ \t]+(\d+))?(?:[ \t]*\|[ \t]*(.+?))?[ \t]*$')
FRONT_MATTER = re.compile(r'\A---\n(.*?)\n---\n', re.S)
COMMENT = re.compile(r'<!--.*?-->', re.S)
SENTENCE_END = re.compile(r'(?<=[.!?])\s+(?=[A-Z"\'(\[])')

# Patterns that survive a read of the page but not a listen. "K2.5" is
# read "K two five": the point is dropped.
SPEECH_CHECKS = [
    (re.compile(r'\b[A-Z]{2,}-[A-Za-z]+'),
     'all-caps initialism + hyphen: the letters stop being read as letters'),
    (re.compile(r'\b(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun|'
                r'Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b\.?'),
     'abbreviated day or month: write it out'),
    (re.compile(r'\b\d+\s?M\b'), '"1M" is read "one em": spell out million'),
    (re.compile(r'https?://\S+'), 'bare URL: read letter by letter'),
    (re.compile(r'\b[A-Za-z]+\d+\.\d+\w*'), 'a version like K2.5 drops its point: add a lexicon entry'),
    # Kokoro reads 1638 as a year ("sixteen thirty-eight"); 1,638 reads as a count.
    (re.compile(r'(?<![\d,.])(?!19\d\d\b|20\d\d\b)[1-9]\d{3}(?![\d,]|\.\d)'),
     'a four-digit count is read like a year: write it with a comma (1,638)'),
    (re.compile(r'\b\d{1,2}:00\b'), 'a :00 time is read "nine zero zero": write "9 PM"'),
]


def fail(msg: str):
    sys.exit(f'excalive: {msg}')


# ------------------------------------------------------------------ source

class Story:
    def __init__(self, path: Path):
        self.path = path.resolve()
        self.base = self.path.parent
        raw = self.path.read_text(encoding='utf-8')
        m = FRONT_MATTER.match(raw)
        self.opts = (yaml.safe_load(m[1]) or {}) if m else {}
        body = COMMENT.sub('', raw[m.end():] if m else raw)
        self.beats = []
        for line in body.splitlines():
            b = BEAT.match(line)
            if b:
                self.beats.append({'scene': b[1], 'step': None if b[2] is None else int(b[2]),
                                   'title': b[3], 'lines': []})
            elif self.beats:
                self.beats[-1]['lines'].append(line)
        if not self.beats:
            fail(f'{path}: no "## <scene> <step>" beats')
        for b in self.beats:
            b['text'] = '\n'.join(b.pop('lines')).strip()

    def rel(self, p: str) -> Path:
        return (self.base / p).resolve()

    def opt(self, key, default=None):
        return self.opts.get(key, default)

    @property
    def work(self) -> Path:
        if self.opt('work'):
            return self.rel(self.opt('work'))
        if self.opt('video'):
            v = self.rel(self.opt('video'))
            return v.parent / f'{v.stem}-work'
        return self.base / '.story-work'


def resolve(story: Story, need_words=False):
    """Find every scene and check every step, reporting all problems at once.
    A video needs words on every beat; a slide's notes may be empty.

    Consecutive beats on one scene are a run: one title, one camera, and a
    `clear` when the run starts so the scene before it leaves whole. A scene
    with its own `title` element (a card) gets no title drawn above it; the
    `|` text then only names the slide."""
    dirs = [story.rel(d) for d in story.opt('scenes', ['.'])]
    problems, cache = [], {}
    for b in story.beats:
        name = b['scene']
        if name not in cache:
            f = next((d / f'{name}.excalidraw' for d in dirs if (d / f'{name}.excalidraw').exists()), None)
            if not f:
                problems.append(f'{name}: no {name}.excalidraw in {", ".join(map(str, dirs))}')
                cache[name] = None
                continue
            els = json.loads(f.read_text())['elements']
            steps = None
            sf = f.parent / 'steps.json'
            if sf.exists():
                data = json.loads(sf.read_text())
                steps = data if isinstance(data, list) else data.get(name)
            cache[name] = {'file': f, 'elements': els, 'steps': steps}
        s = cache[name]
        if s is None:
            continue
        b['file'] = s['file']
        if b['step'] is not None:
            if not s['steps']:
                problems.append(f'{name} {b["step"]}: no steps for {name} in {s["file"].parent}/steps.json')
            elif b['step'] >= len(s['steps']):
                problems.append(f'{name} {b["step"]}: {name} has {len(s["steps"])} steps')
            else:
                # A step may name another scene file whose shared ids move into place.
                entry = s['steps'][b['step']]
                other = entry if isinstance(entry, str) else entry.get('scene') if isinstance(entry, dict) else None
                if other is not None:
                    of = s['file'].parent / (other if other.endswith('.excalidraw') else f'{other}.excalidraw')
                    if not of.exists():
                        problems.append(f'{name} {b["step"]}: step scene {of} not found')
        if need_words and not b['text']:
            problems.append(f'{name} {b["step"]}: no words')
    if problems:
        fail('cannot build:\n  ' + '\n  '.join(problems))

    runs = []
    for i, b in enumerate(story.beats):
        if i == 0 or story.beats[i - 1]['scene'] != b['scene']:
            runs.append([])
        runs[-1].append(b)
    for run in runs:
        s = cache[run[0]['scene']]
        title = next((b['title'] for b in run if b['title']), None)
        own = next((e for e in s['elements'] if e['id'] == 'title' and e['type'] == 'text'), None)
        drawn = None if own else title
        for j, b in enumerate(run):
            b['run_title'] = drawn
            b['name'] = title or (own['text'] if own else run[0]['scene'])
            b['first'] = j == 0
            b['last'] = j == len(run) - 1
            b['text_x'] = scene_text_x(story, run[0]['scene'], s['elements'])
            b['camera'], b['title_el'] = page(story, s['elements'], drawn, own)
    return runs


def scene_text_x(story: Story, scene: str, elements) -> str:
    """Where x sits on the scene's center-aligned free text.

    Text placed by hand for the canvas's browser tab has x at its middle,
    in whole numbers. Text the canvas measured has x at its left edge, with
    fractional values. `auto` tells them apart that way, per scene. Text
    written by hand with x at its left edge and whole numbers is misread as
    centered, so `text_x` can also be set per scene: {scene: left}."""
    forced = story.opt('text_x', 'auto')
    if isinstance(forced, dict):  # per scene: {scene: center, other: left}
        forced = forced.get(scene, 'auto')
    if forced != 'auto':
        return forced
    centered = [e for e in elements if e['type'] == 'text'
                and not e.get('containerId') and e.get('textAlign') == 'center']
    return 'center' if centered and all(float(e['x']).is_integer() for e in centered) else 'left'


# Every slide, and every frame of a video, is laid out on one page, 1600 by
# 900: the title at the same place and size on every scene, and a diagram
# scaled to fit the area under it and centered there. Cards are drawn on that
# page already (their invisible `frame` is the page), so they show as drawn.
# Before this each scene's camera fit its own diagram, and the title moved
# and changed size from one slide to the next.
PAGE_W, PAGE_H = 1600, 900
TITLE_X, TITLE_Y = 120, 100
CONTENT = (120, 220, 1360, 620)  # x, y, width, height of the area under the title


def title_style(story: Story):
    t = story.opt('title', {}) or {}
    # font: an Excalidraw fontFamily number; 5 is hand-drawn Excalifont,
    # 6 is Nunito, the plainer face decks use for words on the page.
    return t.get('size', 64), t.get('color', '#1B2547'), t.get('font', 6)


def page(story: Story, elements, title, own):
    """A scene's camera, and its title element when one is drawn."""
    f = frame_of(elements)
    if own:
        return {'x': f['x'], 'y': f['y'], 'width': f['width'], 'height': f['height']}, None
    cx, cy, cw, ch = CONTENT
    s = min(cw / f['width'], ch / f['height'])
    left = cx + (cw - f['width'] * s) / 2
    top = cy + (ch - f['height'] * s) / 2
    cam = {'x': f['x'] - left / s, 'y': f['y'] - top / s, 'width': PAGE_W / s, 'height': PAGE_H / s}
    if not title:
        return cam, None
    size, color, font = title_style(story)
    # Page units divided by the scale, so the title lands the same on screen.
    return cam, {'id': 'story-title', 'type': 'text', 'x': cam['x'] + TITLE_X / s,
                 'y': cam['y'] + TITLE_Y / s, 'text': title, 'fontSize': size / s,
                 'fontFamily': font, 'strokeColor': color, 'textAlign': 'left'}


def bounds(elements):
    xs, ys = [], []
    for e in elements:
        if e.get('isDeleted'):
            continue
        if e.get('points'):
            px = [p[0] if isinstance(p, list) else p['x'] for p in e['points']]
            py = [p[1] if isinstance(p, list) else p['y'] for p in e['points']]
            xs += [e['x'] + min(px), e['x'] + max(px)]
            ys += [e['y'] + min(py), e['y'] + max(py)]
        else:
            xs += [e['x'], e['x'] + e.get('width', 0)]
            ys += [e['y'], e['y'] + e.get('height', 0)]
    return min(xs), min(ys), max(xs), max(ys)


def frame_of(elements):
    """The scene's invisible `frame` rectangle, or the box around everything."""
    f = next((e for e in elements if e['id'] == 'frame'), None)
    if f:
        return f
    x0, y0, x1, y1 = bounds(elements)
    return {'x': x0, 'y': y0, 'width': x1 - x0, 'height': y1 - y0}


def storyboard(story: Story, runs, audio=None, names=False):
    keyframes = []
    for i, b in enumerate(story.beats):
        k = {'scene': str(b['file']), 'textX': b['text_x'], 'camera': b['camera']}
        # A beat with no words (a slide without notes) has nothing to compare.
        if b['text']:
            k['narration'] = b['text']
        if b['step'] is not None:
            k['step'] = b['step']
        if b['title_el']:
            k['add'] = [b['title_el']]
        if b['first'] and i:
            k['clear'] = True
        # The video opens on its first scene already drawn, so its first frame
        # (the thumbnail, and what a viewer sees on pressing play) says which
        # video this is. `intro: draw` draws it in from white instead.
        if i == 0 and story.opt('intro', 'cut') != 'draw':
            k['duration'] = 0
        # Titles stay on screen the whole time, so the words need not read
        # them out: a card's `title` and the title drawn above a diagram.
        silent = ['title', 'story-title'] + ((story.opt('silent', {}) or {}).get(b['scene']) or [])
        k['silent'] = silent
        if names:
            k['name'] = f'{b["scene"]}-{b["step"] or 0}'
        if audio:
            end = i == len(story.beats) - 1
            k['audio'] = str(audio[i])
            k['audioDelay'] = story.opt('audio_delay', 0.3)
            k['hold'] = story.opt('end_hold', 4.0) if end else \
                story.opt('scene_gap', 1.0) if b['last'] else story.opt('gap', 0.5)
        keyframes.append(k)
    board = {'width': 1920, 'height': 1080, 'fps': 30, 'keyframes': keyframes}
    if story.opt('video'):
        board['output'] = str(story.rel(story.opt('video')))
    return board


def animate(board_file: Path, *flags):
    r = subprocess.run(['node', str(ANIMATE), str(board_file), *flags], text=True, capture_output=True)
    if r.returncode or not r.stdout.strip().startswith('{'):
        sys.stderr.write(r.stderr)
        fail(f'animate failed ({r.returncode})')
    return r, json.loads(r.stdout)


def unspoken(story: Story, runs):
    """On-screen text the words never say, checked before anything is voiced
    or drawn, so a disagreement costs seconds rather than a render."""
    _, result = animate(write_board(story, storyboard(story, runs), 'check.json'), '--check')
    return result


def write_board(story: Story, board, name):
    story.work.mkdir(parents=True, exist_ok=True)
    f = story.work / name
    f.write_text(json.dumps(board, indent=1))
    return f


# ------------------------------------------------------------------ speech

def load_lexicon(story: Story) -> dict:
    merged = {}
    for p in story.opt('lexicon', []) or []:
        f = story.rel(p)
        if not f.exists():
            fail(f'lexicon {f} not found')
        merged.update(json.loads(f.read_text(encoding='utf-8')))
    return merged


def compile_lexicon(lexicon: dict):
    """One alternation, longest term first, applied in a single pass, so no
    replacement is ever rescanned."""
    alternatives, replacements = [], {}
    for i, term in enumerate(sorted(lexicon, key=len, reverse=True)):
        spec = lexicon[term]
        if isinstance(spec, str):
            spec = {'say': spec}
        if spec.get('ipa'):
            replacement = f'[{term}](/{spec["ipa"]}/)'
        elif spec.get('say'):
            replacement = spec['say']
        else:
            continue
        left = r'(?<!\w)' if term[:1].isalnum() or term[:1] == '_' else ''
        right = r'(?!\w)' if term[-1:].isalnum() or term[-1:] == '_' else ''
        body = re.escape(term)
        if spec.get('ci'):
            body = f'(?i:{body})'
        alternatives.append(f'(?P<t{i}>{left}{body}{right})')
        replacements[f't{i}'] = replacement
    if not alternatives:
        return lambda text: text
    pattern = re.compile('|'.join(alternatives))
    return lambda text: pattern.sub(lambda m: replacements[m.lastgroup], text)


def flatten(text: str) -> list[str]:
    """Markdown to speakable paragraphs: links keep their text, emphasis and
    list markers go."""
    paras = []
    for block in re.split(r'\n\s*\n', text):
        line = ' '.join(l.strip() for l in block.splitlines() if l.strip())
        line = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', line)
        line = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', line)
        line = re.sub(r'^\s*(?:[-*+]|\d+[.)])\s+', '', line)
        line = re.sub(r'(\*\*|__|\*|`)', '', line)
        if line.strip():
            paras.append(line.strip())
    return paras


def chunk(paragraphs: list[str]) -> list[str]:
    """Long paragraphs split at sentence ends, so Kokoro stays stable."""
    chunks = []
    for para in paragraphs:
        if len(para) <= MAX_CHARS:
            chunks.append(para)
            continue
        current = ''
        for sentence in SENTENCE_END.split(para):
            if current and len(current) + len(sentence) + 1 > MAX_CHARS:
                chunks.append(current.strip())
                current = sentence
            else:
                current = f'{current} {sentence}'.strip()
        if current:
            chunks.append(current)
    return chunks


FOUR_DIGITS = SPEECH_CHECKS[-2][0]


def spoken_text(text: str) -> str:
    """A beat's words minus its "Direction:" paragraphs, which no one says."""
    return '\n\n'.join(p for p in text.split('\n\n') if not p.strip().startswith('Direction:'))


def lint(story: Story, lexicon: dict):
    """Text that reads fine and sounds wrong. Warns; a listen decides.

    Runs on a story that makes a video, or one with `lint: true`. A deck's
    notes are read by a person, and flagging every "Sep 11" in them is noise."""
    if not (story.opt('video') or story.opt('lint')):
        return []
    found = []
    for b in story.beats:
        text = spoken_text(b['text'])
        for pattern, problem in SPEECH_CHECKS:
            for m in pattern.finditer(text):
                hit = m.group(0)
                # A lexicon entry that covers this stretch of text already
                # fixes how it is said ("qwen3.5:4b" covers "qwen3.5").
                if any(o.start() < m.end() and o.end() > m.start()
                       for t in lexicon for o in re.finditer(re.escape(t), text, re.I)):
                    continue
                # After a name, four digits are a room or a code ("Room 1355"),
                # and reading them like a year is right.
                if pattern is FOUR_DIGITS and re.search(r'\b[A-Z][A-Za-z]*\s+$', text[:m.start()]):
                    continue
                found.append(f'{b["scene"]} {b["step"]}: "{hit}": {problem}')
    for f in found:
        print(f'  speech: {f}')
    return found


def voice(story: Story, voice_name: str, speed: float):
    """One wav per beat in <work>/audio, named by the hash of what it says."""
    say = compile_lexicon(load_lexicon(story))
    adir = story.work / 'audio'
    adir.mkdir(parents=True, exist_ok=True)
    files, todo = [], []
    for b in story.beats:
        chunks = chunk([say(p) for p in flatten(b['text'])])
        h = hashlib.sha1(json.dumps([chunks, voice_name, speed]).encode()).hexdigest()[:16]
        f = adir / f'{h}.wav'
        files.append(f)
        if not f.exists():
            todo.append((f, chunks))
    if todo:
        print(f'voicing {len(todo)} of {len(files)} beats with Kokoro ({voice_name})')
        import warnings
        warnings.filterwarnings('ignore')
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline
        pipe = KPipeline(lang_code=voice_name[0] if voice_name[0] in 'ab' else 'a',
                         repo_id='hexgrad/Kokoro-82M')
        for n, (f, chunks) in enumerate(todo, 1):
            audio = [r.audio.numpy() for c in chunks
                     for r in pipe(c, voice=voice_name, speed=speed, split_pattern=None)
                     if r.audio is not None]
            if not audio:
                fail(f'Kokoro produced no audio for {f.name}')
            # Written under a temporary name, so an interrupted run never
            # leaves a truncated clip in the cache.
            tmp = f.with_suffix('.part.wav')
            sf.write(str(tmp), np.concatenate(audio), RATE)
            tmp.rename(f)
            print(f'  {n}/{len(todo)}', end='\r', flush=True)
        print()
    return files


# ---------------------------------------------------------------- commands

def report_unspoken(story: Story, result):
    for u in result.get('unspoken', []):
        b = story.beats[u['keyframe']]
        print(f'  {b["scene"]} {b["step"]}: "{u["text"]}" (missing: {", ".join(u["missing"])})')
    return len(result.get('unspoken', []))


def report_overflow(story: Story, result):
    for o in result.get('overflow', []):
        b = story.beats[o['keyframe']]
        print(f'  overflow: {b["scene"]} {b["step"]}: "{o["text"]}" {o["problem"]}')


def report_titles(story: Story):
    """A title names its slide; anything that cues off slide titles needs
    each one once."""
    seen = {}
    for b in story.beats:
        if b['title']:
            seen.setdefault(b['title'], []).append(b['scene'])
    for title, scenes in seen.items():
        if len(scenes) > 1:
            print(f'  title: "{title}" is on {len(scenes)} slides ({", ".join(scenes)})')


def cmd_check(story: Story, args):
    runs = resolve(story)
    lint(story, load_lexicon(story))
    report_titles(story)
    result = unspoken(story, runs)
    report_overflow(story, result)
    n = report_unspoken(story, result)
    words = sum(len(b['text'].split()) for b in story.beats)
    print(f'{len(story.beats)} beats in {len(runs)} scenes, {words} words, '
          f'about {words / WPM:.1f} min of speech; {n} unspoken')
    sys.exit(1 if n else 0)


def cmd_video(story: Story, args):
    if not story.opt('video'):
        fail('front matter has no "video" output')
    runs = resolve(story, need_words=True)
    lint(story, load_lexicon(story))
    strict = story.opt('strict', True)
    result = unspoken(story, runs)
    report_overflow(story, result)
    if report_unspoken(story, result) and strict:
        fail('the words above are on screen but never said; say them, or list the ids under `silent`')
    v = args.voice or story.opt('voice', 'af_heart')
    files = voice(story, v, args.speed or story.opt('speed', 1.0))
    board = write_board(story, storyboard(story, runs, audio=files), 'storyboard.json')
    print('drawing')
    _, result = animate(board, '--sheet', str(story.work / 'sheet.png'))
    s = result['duration']
    print(f'{result["file"]}\n  {int(s // 60)}:{int(s % 60):02d}, rendered in '
          f'{result["renderSeconds"]:.0f} s, {result["audio"]} voice clips')
    print('  sheets: ' + ' '.join(result.get('sheets', [])))


def cmd_slides(story: Story, args):
    conf = story.opt('slides') or {}
    if not conf.get('file') or not conf.get('images'):
        fail('front matter needs slides: {file: ..., images: ...}')
    runs = resolve(story)
    deck = story.rel(conf['file'])
    images = story.rel(conf['images'])
    # Slides only warn: the notes are spoken live and can catch up later.
    report_titles(story)
    check = unspoken(story, runs)
    report_overflow(story, check)
    if check.get('unspoken'):
        print('on-screen text the notes never say:')
        report_unspoken(story, check)
    _, result = animate(write_board(story, storyboard(story, runs, names=True), 'slides.json'),
                        '--stills', str(images), '--no-video', '--sheet', str(story.work / 'slides-sheet.png'))
    stills = [Path(p) for p in result['stills']]
    # A slide that lost a click leaves its old still behind; remove every
    # PNG in the images directory this build did not write.
    keep = {q.resolve() for q in stills}
    for q in images.glob('*.png'):
        if q.resolve() not in keep:
            q.unlink()

    head = dict(conf.get('headmatter') or {})
    out = []
    style = ('<style>\n:global(.story) { background: #fff; }\n'
             ':global(.story h1) { position: absolute; width: 1px; height: 1px; overflow: hidden;'
             ' clip: rect(0 0 0 0); white-space: nowrap; margin: 0; }\n'
             ':global(.story img.story-still) { position: absolute; inset: 0; width: 100%;'
             ' height: 100%; object-fit: contain; }\n</style>\n')
    n = 0
    for r_i, run in enumerate(runs):
        # Slidev's headmatter is also the first slide's frontmatter, so the
        # first slide carries it rather than sitting empty in front.
        front = {**head, 'layout': 'none', 'class': 'story'} if r_i == 0 else {'layout': 'none', 'class': 'story'}
        imgs = []
        for b in run:
            rel = os.path.relpath(stills[n], deck.parent)
            imgs.append(f'<img class="story-still" src="./{rel}" />')
            n += 1
        title = run[0]['name']
        body = imgs[0] if len(imgs) == 1 else (
            '<v-switch>\n' + '\n'.join(f'  <template #{i}>{img}</template>' for i, img in enumerate(imgs))
            + '\n</v-switch>')
        notes = '\n\nClick. '.join(b['text'] for b in run).strip()
        out.append('---\n' + yaml.dump(front, Dumper=FrontDumper, sort_keys=False, allow_unicode=True).strip()
                   + f'\n---\n\n# {title}\n\n{body}\n\n' + (style if r_i == 0 else '')
                   + (f'\n<!--\n{notes}\n-->\n' if notes else ''))
    deck.parent.mkdir(parents=True, exist_ok=True)
    deck.write_text('\n'.join(out))
    print(f'{deck}\n  {len(runs)} slides, {len(stills)} stills in {images}')
    print('  sheets: ' + ' '.join(result.get('sheets', [])))


def main():
    ap = argparse.ArgumentParser(prog='excalive', description='One story file in, a narrated video or a slide deck out.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('check', 'video', 'slides'):
        p = sub.add_parser(name)
        p.add_argument('story', type=Path)
        if name == 'video':
            p.add_argument('--voice')
            p.add_argument('--speed', type=float)
    args = ap.parse_args()
    if not args.story.exists():
        fail(f'no such file: {args.story}')
    story = Story(args.story)
    {'check': cmd_check, 'video': cmd_video, 'slides': cmd_slides}[args.cmd](story, args)


if __name__ == '__main__':
    main()
