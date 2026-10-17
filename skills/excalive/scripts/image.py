#!/usr/bin/env python3
"""excalive image: put a screenshot into a scene, or swap the one there.

  excalive image scenes/app.excalidraw shots/login.png [--id shot] [--scale 2]
                [--box add=24,70,342,36 ...]

A new scene file is a diagram 1360 by 620, which fits the page's content
area at 1:1, with an invisible `frame` and the image fitted inside it,
centered; steps.json beside it gets one step showing both. In a scene that
already has the id, the new picture takes the old one's place, fitted
inside the same box and centered on it, so the annotations drawn over the
screenshot stay where they were (they stay right as long as the app's
layout has not moved). A scene without the id gets the image added, fitted
inside its frame. A thin gray outline, `<id>-edge`, goes around the
picture so a white page does not melt into the white slide; it follows
the picture on a swap, and a step can leave it out.

--scale is the screenshot's pixels per CSS pixel: 2 for a Retina or 2x
capture, 1 for a plain one, 3 for most phones. `excalive check` uses it to
estimate how tall the app's own text will look on screen.

--box name=x,y,width,height marks a part of the screenshot, in the page's
CSS pixels (what a browser's getBoundingClientRect or Playwright's
bounding_box() gives; image pixels divided by --scale). Each becomes an
invisible rectangle with that id over the picture: a target for a step's
`focus`, and the box to draw a ring or point an arrow at. A swap moves
boxes of the same name to the new picture.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import random
import struct
import sys
import time
from pathlib import Path
from typing import NoReturn

FRAME = (1360, 620)  # a diagram this size fits the content area at 1:1


def fail(msg: str) -> NoReturn:
    sys.exit(f'excalive image: {msg}')


def pixel_size(data: bytes) -> tuple[str, int, int]:
    """The mime type and pixel size of a PNG, JPEG or WebP file."""
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        w, h = struct.unpack('>II', data[16:24])
        return 'image/png', w, h
    if data[:2] == b'\xff\xd8':
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            length = struct.unpack('>H', data[i + 2:i + 4])[0]
            # Start-of-frame markers carry the size; C4, C8 and CC are not frames.
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack('>HH', data[i + 5:i + 9])
                return 'image/jpeg', w, h
            i += 2 + length
        fail('a JPEG with no frame header')
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        kind = data[12:16]
        if kind == b'VP8 ':
            w, h = struct.unpack('<HH', data[26:30])
            return 'image/webp', w & 0x3FFF, h & 0x3FFF
        if kind == b'VP8L':
            b = int.from_bytes(data[21:25], 'little')
            return 'image/webp', (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
        if kind == b'VP8X':
            return 'image/webp', int.from_bytes(data[24:27], 'little') + 1, int.from_bytes(data[27:30], 'little') + 1
    fail('not a PNG, JPEG or WebP file')


def fit(w: float, h: float, box: tuple[float, float, float, float]):
    """(x, y, width, height) of a w by h picture fitted inside box, centered."""
    bx, by, bw, bh = box
    s = min(bw / w, bh / h)
    return bx + (bw - w * s) / 2, by + (bh - h * s) / 2, w * s, h * s


def image_element(eid: str, file_id: str, place, scale: float) -> dict:
    x, y, w, h = place
    now = int(time.time() * 1000)
    return {
        'id': eid, 'type': 'image', 'x': x, 'y': y, 'width': w, 'height': h, 'angle': 0,
        'strokeColor': 'transparent', 'backgroundColor': 'transparent', 'fillStyle': 'solid',
        'strokeWidth': 1, 'strokeStyle': 'solid', 'roughness': 0, 'opacity': 100,
        'groupIds': [], 'frameId': None, 'roundness': None, 'seed': random.randint(1, 2**31 - 1),
        'version': 1, 'versionNonce': random.randint(1, 2**31 - 1), 'isDeleted': False,
        'boundElements': None, 'updated': now, 'link': None, 'locked': False,
        'status': 'saved', 'fileId': file_id, 'scale': [1, 1], 'crop': None,
        'customData': {'excalive': {'scale': scale}},
    }


def main():
    ap = argparse.ArgumentParser(prog='excalive image', description='Put a screenshot into a scene, or swap the one there.')
    ap.add_argument('scene', type=Path)
    ap.add_argument('image', type=Path)
    ap.add_argument('--id', default='shot', help='the image element\'s id (default: shot)')
    ap.add_argument('--scale', type=float, default=2, help='pixels per CSS pixel of the capture (default: 2)')
    ap.add_argument('--box', action='append', default=[], metavar='NAME=X,Y,W,H',
                    help='an invisible rectangle over part of the picture, in CSS pixels')
    args = ap.parse_args()
    if not args.image.exists():
        fail(f'no such file: {args.image}')
    data = args.image.read_bytes()
    mime, pw, ph = pixel_size(data)
    file_id = hashlib.sha1(data).hexdigest()
    now = int(time.time() * 1000)
    entry = {'mimeType': mime, 'id': file_id, 'dataURL': f'data:{mime};base64,{base64.b64encode(data).decode()}',
             'created': now, 'lastRetrieved': now}

    created = not args.scene.exists()
    if created:
        frame = {'id': 'frame', 'type': 'rectangle', 'x': 0, 'y': 0, 'width': FRAME[0], 'height': FRAME[1],
                 'strokeColor': 'transparent', 'backgroundColor': 'transparent', 'fillStyle': 'solid'}
        scene = {'type': 'excalidraw', 'version': 2, 'source': 'excalive', 'elements': [frame],
                 'appState': {'viewBackgroundColor': '#ffffff'}, 'files': {}}
    else:
        scene = json.loads(args.scene.read_text())
        scene.setdefault('files', {})
    elements = scene['elements']
    old = next((e for e in elements if e['id'] == args.id), None)
    if old:
        if old['type'] != 'image':
            fail(f'{args.id} in {args.scene} is a {old["type"]}, not an image')
        old_file = old.get('fileId')
        old.update({k: v for k, v in image_element(args.id, file_id, fit(pw, ph, (old['x'], old['y'], old['width'], old['height'])), args.scale).items()
                    if k in ('x', 'y', 'width', 'height', 'fileId', 'status', 'version', 'versionNonce', 'updated')})
        old.setdefault('customData', {}).setdefault('excalive', {})['scale'] = args.scale
        if old_file != file_id and not any(e.get('fileId') == old_file for e in elements):
            scene['files'].pop(old_file, None)
        drawn = old
    else:
        frame = next((e for e in elements if e['id'] == 'frame'), None)
        box = (frame['x'], frame['y'], frame['width'], frame['height']) if frame else (0, 0, *FRAME)
        drawn = image_element(args.id, file_id, fit(pw, ph, box), args.scale)
        elements.append(drawn)
    scene['files'][file_id] = entry
    # The outline: added with a new picture, moved with a swapped one.
    edge_id = f'{args.id}-edge'
    edge = next((e for e in elements if e['id'] == edge_id), None)
    place = {k: drawn[k] for k in ('x', 'y', 'width', 'height')}
    if edge:
        edge.update(place)
    elif not old:
        elements.append({'id': edge_id, 'type': 'rectangle', **place, 'strokeColor': '#ced4da',
                         'backgroundColor': 'transparent', 'fillStyle': 'solid', 'strokeWidth': 1,
                         'roughness': 0, 'roundness': None})
    # Boxes: CSS pixels on the page, to scene units over the drawn picture.
    per_css = drawn['width'] / pw * args.scale
    for spec in args.box:
        name, _, nums = spec.partition('=')
        try:
            bx, by, bw, bh = (float(n) for n in nums.split(','))
        except ValueError:
            fail(f'--box {spec}: write name=x,y,width,height')
        box = {'id': name, 'type': 'rectangle', 'x': drawn['x'] + bx * per_css, 'y': drawn['y'] + by * per_css,
               'width': bw * per_css, 'height': bh * per_css, 'strokeColor': 'transparent',
               'backgroundColor': 'transparent', 'fillStyle': 'solid', 'roughness': 0, 'strokeWidth': 1}
        at = next((i for i, e in enumerate(elements) if e['id'] == name), None)
        if at is None:
            elements.append(box)
        elif elements[at]['type'] == 'rectangle':
            elements[at].update({k: box[k] for k in ('x', 'y', 'width', 'height')})
        else:
            fail(f'--box {name}: {args.scene} already has a {elements[at]["type"]} with that id')
    args.scene.parent.mkdir(parents=True, exist_ok=True)
    args.scene.write_text(json.dumps(scene, indent=2))

    if created:
        # One step showing the frame and the picture, so a story can name it.
        steps_file = args.scene.parent / 'steps.json'
        steps = json.loads(steps_file.read_text()) if steps_file.exists() else {}
        name = args.scene.name.removesuffix('.excalidraw')
        if isinstance(steps, dict) and name not in steps:
            steps[name] = [['frame', args.id, f'{args.id}-edge']]
            steps_file.write_text(json.dumps(steps, indent=1) + '\n')
    css = f'{pw / args.scale:.0f} by {ph / args.scale:.0f} at {args.scale:g}x'
    print(f'{args.scene}: {args.id} is {pw} by {ph} px ({css}), drawn {drawn["width"]:.0f} by {drawn["height"]:.0f}'
          + (' in a new scene' if created else ''))


if __name__ == '__main__':
    main()
