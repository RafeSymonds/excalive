# Motion and effects

How excalive moves things between steps, and how to make it move them
differently. When to animate at all is in [`style.md`](style.md)
(Motion). This file is the mechanics.

## The model

1. **Steps are states.** Each build step is a scene as drawn. The video
   rests on it and the deck shows it. Between two steps every element is
   entering (a new id), changing (the same id, drawn differently) or
   leaving (gone).
2. **An effect decides how.** Entering, changing and leaving each run an
   effect. With no settings, the house defaults run:

   | Element | Enters by | Effect |
   |---|---|---|
   | Rectangle, ellipse, diamond | tracing its outline, then filling | `draw` |
   | Arrow, line, freehand | growing along its path, after the shapes it joins | `draw` |
   | Hand-drawn text (Excalifont 5, Virgil 1) | writing on, line by line, left to right | `write` |
   | Code (Cascadia 3) | typing, a character at a time | `type` |
   | Other text (Nunito 6) and images | fading in | `fade` |

   A changed element moves, resizes and recolors into place (`morph`),
   and changed text dips out and back in. A leaving element fades out.
3. **Settings choose other effects and timing**, on the element or on
   one step.

Effects shape only the motion. Every step still lands on its scene as
drawn, so the deck, the contact sheets and the checks see exactly what
the video settles on.

## Element settings

Settings live in Excalidraw's own `customData` field, which the editor
keeps and which travels with the element from step to step:

```json
{"id": "dot", "type": "ellipse", ...,
 "customData": {"excalive": {"transient": true, "enter": "travel"}}}
```

| Key | Value | Does |
|---|---|---|
| `enter` | an effect name, or `{"effect": "travel", "path": "q1", ...}` | How it enters. Extra keys are the effect's parameters |
| `exit` | the same | How it leaves (default `fade`) |
| `change` | the same | How it changes between steps (default `morph`) |
| `delay` | seconds | Wait this long: after its turn in the entrance order when it enters, after the step starts when it changes |
| `seconds` | seconds | How long its entrance or change runs. For an exit, put it inside the exit's effect object: `{"exit": {"effect": "write", "seconds": 1.2}}` |
| `easing` | `linear`, `inCubic`, `outCubic`, `inOutCubic`, `outBack` | The curve of its run |
| `transient` | `true`, or seconds to stay | It exists only in its step's transition: it enters, stays that long, then leaves. It is not in the step's resting frame or still |
| `pin` | `true` | It keeps its place on screen while the camera moves |

`delay`, `seconds` and `easing` may also go inside an effect object,
where they win. A shape's settings reach its bound label, and the
members of an Excalidraw group share theirs, so a labelled box travels
as one. A change runs with the settings of the step it changes into.

## Step options

A step in `steps.json` may be an object instead of a list of ids:

```json
{"lookup": [
  ["frame", "browser", "resolver"],
  ["frame", "browser", "resolver", "q1"],
  {"ids": ["frame", "browser", "resolver", "q1", "dot"],
   "set": {"dot": {"enter": {"effect": "travel", "path": "q1"}}}},
  {"ids": ["frame", "browser", "resolver", "q1", "cache"],
   "focus": ["resolver", "cache"]}
]}
```

| Key | Does |
|---|---|
| `ids` | The elements the step shows, as a list step does |
| `scene` | Another scene file to show instead, whose shared ids move into place |
| `focus` | Ids the camera moves in on, from anywhere in the step's scene: an invisible box the step does not show works. In a story they fill the content area, less 40 page units on every side, and the title stays put; the next step without a focus moves back out. A slide with a focus step is cut off above the content area, so nothing shows behind the title |
| `set` | `{id: settings}` for this step only, merged over the element's own. It also reaches elements that leave in this step |

`set` lets one element serve many steps: a single dot travels a
different arrow in each step. All four keys can go together:
`{"scene": "request-3", "ids": [...], "focus": ["db"], "set": {...}}`.

## Changing an element between steps

A list of ids can show or hide elements but not change one, since a
scene file holds one version of each id. Keep an element's `seed` the
same in every file, or its hand-drawn strokes are drawn afresh while it
moves. To change a number, a label or
a color, copy the scene file, change that element in the copy and keep
its id, then name the copy in the step: `{"scene": "request-3", "ids":
[...]}`. Every later step that should keep the change names the copy
too. A step that goes back to plain ids reads the original file, and
the element changes back.

## Timing within a step

A slide's title enters first. Leaving elements go over about 0.65 s
from the start of the step, and entering ones start partway through
that. The rest enter one after another in the order they were created,
about 0.2 s apart, while each one's effect runs for about a second. A
step that only moves the camera takes its whole duration (1.2 s) to
move. To make a take-back readable, slow its exit (`seconds` inside the
exit object) and give what follows a `delay`. An arrow
waits for the shapes it joins, and a travel waits for its path to draw.
Nothing waits for a travel to finish: an element created after the dot
starts entering while the dot is still moving. To hold it until the dot
arrives, give it a `delay` in the step's `set` (about 1.2 s after its
turn covers a travel of 0.9 s). The same goes for a change that should
wait for the camera: `{"change": {"effect": "count", "delay": 1.0}}`.

## Built-in effects

| Effect | Enter | Parameters |
|---|---|---|
| `draw` | Shapes trace then fill; arrows and lines grow along their path; anything else fades | |
| `write` | Text reveals left to right behind a soft edge, a line at a time, at 30 characters a second (0.4 to 1.6 s) | |
| `type` | Text appears a character at a time, at 60 a second (up to 2.5 s) | |
| `fade` | Opacity from 0 | |
| `rise` | Fades in while rising 16 units into place | |
| `pop` | Fades in while growing from 60% with a slight overshoot | |
| `travel` | Moves along an arrow or line from its start to its end, after the path has drawn. For a message over a connection already on screen | `path`: the arrow's id |
| `none` | Appears at once | |
| `morph` | (change) Position, size, color, points, opacity and font size in between | |

Any effect used as `exit` runs its entrance backwards unless it defines
its own exit.

## Recipes

- **A message over a connection already drawn.** A dot 22 across,
  `roughness: 0`, filled in the arrow's color, with `{"transient": true,
  "enter": "travel"}`. Each step that sends it names the arrow:
  `"set": {"dot": {"enter": {"effect": "travel", "path": "q-root"}}}`. One
  dot per color can serve a whole scene. A label can travel instead of a
  dot, and a labelled box travels with its label. Never send a dot along
  an arrow that draws in the same step: the arrow growing is already the
  message moving.
- **Something that flashes up and goes.** Any element with
  `"transient": 1.5`: it enters with its usual effect, stays a second and
  a half, and fades. A ring drawn around a value is the usual case.
- **Move in on part of a diagram.** `"focus": [ids]` on the step. Choose
  ids whose neighborhood still makes sense: the camera shows whatever
  sits next to them, cut at the screen's edge, and a label cut there
  reads as a fragment ("iews"). Leave a gap around the focus, or move
  the neighbors apart. Judge the framing on the step's still from
  `excalive slides`: `excalive animate --steps` frames a scene on the
  whole screen, without the title, so it cuts in different places.
- **A label that stays put while the camera moves.** `"pin": true`.
  Titles are pinned already.
- **Follow something too long to read whole.** One step per stage, each
  with `"focus": ["stage-2"]` on that stage (or an invisible rectangle
  around it), so the camera travels along; then a step with no focus
  pulls back to the whole. Drawn at reading size, the whole is too small
  to read once pulled back: it shows the shape, so this pays off only
  when the shape is the point (a loop, a fork, how far apart the ends
  are). Separate cards are better as separate slides.
- **Go inside a thing.** Draw the inside small within its box, hidden
  until the focus step: the step that focuses on the box also adds the
  inner elements, which draw in as the camera arrives. A later step
  without the focus pulls back out, and can drop the inner elements again.
- **Reorder or resize.** Elements that keep their id move between scene
  files: give a step another scene file where the bars are sorted, or
  taller, and they slide and grow into place.
- **Take something back.** `"exit": "draw"` makes a leaving arrow or shape
  undraw itself backwards; `"exit": "write"` unwrites text, right to left.
- **A pen mark.** A freehand element draws on along its stroke, like an
  underline or a circle scribbled by hand: `{"type": "freedraw", "x": 600,
  "y": 300, "points": [[0, 0], [12, -4], ...], "pressures": [],
  "simulatePressure": true, "strokeWidth": 1}`, with points relative to
  x and y and starting at `[0, 0]`. A freehand stroke is drawn much
  heavier than a shape's: `strokeWidth` 1 reads as a pen, 3 as a marker.

## Writing an effect

An effect is a small JavaScript object. A story lists modules of them in
its front matter, `effects: [effects.mjs]`, and each module's default
export names its effects. A story's effect may replace a built-in one.

```js
// effects.mjs: a number that counts from its old value to its new one,
// instead of dipping out and back in. Use as {"change": "count"}.
export default {
  count: {
    change(a, b, t, ctx) {
      const from = Number(String(a.text).replace(/,/g, ''));
      const to = Number(String(b.text).replace(/,/g, ''));
      if (!Number.isFinite(from) || !Number.isFinite(to)) return ctx.morph(a, b, t);
      const text = Math.round(ctx.lerp(from, to, ctx.ease(t))).toLocaleString('en-US');
      // Move and resize as morph does, without morph's dip for changed text,
      // so a number at the end of a growing bar travels with it.
      const m = { ...ctx.morph(a, b, t), opacity: ctx.lerp(a.opacity ?? 100, b.opacity ?? 100, ctx.ease(t)) };
      // Keep a centered or right-aligned number anchored as its width changes.
      const shift = { center: 0.5, right: 1 }[b.textAlign] ?? 0;
      const width = ctx.textWidth(text, m.fontFamily, m.fontSize);
      return { ...m, text, originalText: text, x: m.x + (m.width - width) * shift, width };
    },
  },
};
```

An effect has any of these:

| Member | Is |
|---|---|
| `enter(el, t, ctx)` | The element at progress `t` (0 to 1) of its entrance: an element, a list of elements, or `null` for nothing yet |
| `exit(el, t, ctx)` | The same as it leaves (without one, `enter` runs backwards) |
| `change(a, b, t, ctx)` | The element between its state before (`a`) and after (`b`) |
| `seconds(el, params)` | How long it runs, when the default (about 1 s) does not suit |
| `waitFor(params)` | The id of an element whose entrance it waits for |

`ctx` holds:

| Field | Is |
|---|---|
| `ease(t)` | The run's easing curve |
| `params` | The effect object from the settings (`path` and the like) |
| `seconds` | How long this run lasts |
| `element(id)` | Any element of the step, as it rests |
| `unit` | `{x, y, width, height}` around the element and what moves with it |
| `pointAt(path, f)` | `[x, y]` a fraction `f` of the way along an arrow or line |
| `textWidth(text, fontFamily, fontSize)` | The drawn width of a line of text |
| `effect(name)` | Another effect, to build on |
| `morph(a, b, t)`, `lerp`, `clamp01`, `lerpColor` | Helpers |

Rules for effects:

1. Return new objects and never change the one passed in. An effect
   that changes a text's words also keeps its anchor: `x` is where the
   final text starts, so shift a centered or right-aligned text by the
   difference in width, as `count` does.
2. Be a function of `t` alone, so a frame renders the same every time.
3. Land on the element as drawn at `t = 1`. The resting frame is the
   scene, whatever the effect returned.
4. To change how an element is drawn, not only where, return it with
   `svg: (body, element) => body`. It is drawn as a layer of its own,
   and the function rewrites that layer's SVG, in the element's own
   coordinates. `draw` and `write` work this way.

Look at an effect by rendering its scene alone, then reading the frames:

    excalive animate --steps scenes/scene.excalidraw --effects effects.mjs --out look/
