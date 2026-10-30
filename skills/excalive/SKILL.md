---
name: excalive
description: Build hand-drawn slide decks and narrated explainer videos from Excalidraw scenes and one markdown story file, with excalive. Use when asked to (1) make a slide deck or talk in a hand-drawn Excalidraw style, (2) turn a deck, an outline or diagrams into a narrated video with a local voice (Kokoro), (3) animate Excalidraw diagrams step by step into MP4, WebM or GIF, with house motion (shapes trace, labels write on, code types), camera moves onto part of a scene, messages travelling along arrows, and effects a story writes itself, or (4) check that a deck's or video's words cover everything on screen. Covers the story format, build steps, motion and effects, the house style for slides and narration, and the checks to run before rendering.
---

# excalive

excalive turns Excalidraw scenes plus one markdown story into a Slidev
deck (one still per click, presenter notes) or a narrated video (Kokoro
reads each section while its build step draws in). Read this, then the
house style before drawing anything.

## Where things are

The command ships inside this skill, so nothing needs to be on PATH. From
this skill's base directory:

| Path | What |
|---|---|
| `bin/excalive` | The command. Wherever this file says `excalive`, run `<skill dir>/bin/excalive`. |
| `references/style.md` | House style: page, fonts, colors, slide kinds, card JSON, building the argument, writing the notes, writing for the ear, narration and voice. **Read before drawing a card or writing notes.** |
| `references/workflow.md` | The steps for a deck and its video, and how to hand the work to agents. |
| `references/effects.md` | Motion: how elements enter, change and leave, element settings, step `focus` and `set`, and writing an effect. |
| `scripts/story.py`, `scripts/animate.mjs` | Full reference in their opening comments: every front matter key and storyboard field. |

Three complete example stories (hello, dns, binary-search) are in the
repository's `examples/` folder, github.com/RafeSymonds/excalive.

Needs `node`, `ffmpeg`, `uv`, and `mcp-excalidraw-server` 2.1 or later
(`npx -y mcp-excalidraw-server status` fetches it once). The first `video`
run downloads Kokoro, about 330 MB, through uv. Installed with
`npx skills add RafeSymonds/excalive`; `npx skills update` updates it.

## Drawing scenes

Write each scene's elements as JSON and save it through the canvas server:

    npx -y mcp-excalidraw-server clear --yes
    npx -y mcp-excalidraw-server add scene.json
    npx -y mcp-excalidraw-server export --out scenes/scene.excalidraw

Judge the drawing by `excalive slides` stills, not the canvas's own
`screenshot`: the screenshot reads a centered label's x as its left edge
and draws it half its width to the right.

The canvas is shared by everyone on its port. If another session might
be drawing, prefix every command with
`EXPRESS_SERVER_URL=http://127.0.0.1:<free port>` to get a private one,
and `stop` it the same way at the end. For the full canvas toolkit (MCP
tools, arrows, layout checks) use mcp-excalidraw-server's own skill.

- A **card** is drawn on the 1600 by 900 page: an invisible rectangle with
  id `frame` at (0, 0) and a text element with id `title` at (120, 100).
- A **diagram** is drawn anywhere, about 1360 wide, with an invisible
  `frame` rectangle around the whole drawing in every step.
- Build steps go in `steps.json` beside the scenes, one list of ids per
  click: `{"scene": [["frame", "a"], ["frame", "a", "b"]]}`.
- Elements match across steps by `id`. Same id: it moves, resizes,
  recolors. New id: it draws in. Gone: it fades out. Keep ids stable for
  anything that should move, and keep its `seed` too.
- A step is a list of ids, the name of another scene file (`"search-3"`)
  to show whole, or an object (below).
- A step may be an object: `{"ids": [...], "focus": ["cache"]}` moves the
  camera in on those elements while the title stays put, and `"set":
  {"ring": {"transient": 1.5}}` changes how elements move in that step. Element settings live in
  `customData.excalive` (`enter`, `exit`, `change`, `delay`, `seconds`,
  `easing`, `transient`, `pin`). `references/effects.md` has all of it.

## Screenshots

A screenshot is an image element in a scene, so it fits under the title,
takes annotations and zooms like any drawing. Capture the real product at
2x, and print the box of everything you will point at (Playwright's
Chromium, installed once with `uv run --with playwright python -m
playwright install chromium`):

    uv run --quiet --with playwright python -I - <<'PY'
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        page = p.chromium.launch().new_page(viewport={'width': 800, 'height': 500}, device_scale_factor=2)
        page.goto('http://localhost:3000')
        page.screenshot(path='shots/app.png')
        box = lambda css: ','.join(str(round(v)) for v in page.locator(css).first.bounding_box().values())
        print('--box add=' + box('#add'))
    PY

A one-file app needs no server: `page.goto(pathlib.Path('app/index.html').resolve().as_uri())`.
Then put it in a scene, and swap the next state into a copy:

    excalive image scenes/app.excalidraw shots/app.png --box add=24,69,342,35
    cp scenes/app.excalidraw scenes/app-2.excalidraw
    excalive image scenes/app-2.excalidraw shots/app-2.png --box new=24,205,520,37

- A new scene is a diagram 1360 by 620 with the picture fitted in it and
  a thin gray outline around it (`shot-edge`), and `steps.json` gets a
  step showing all three. Run again on the same id to swap the picture:
  the outline follows, and annotations stay where they are, so capture
  the app so that the part you annotate does not move between states
  (a form above a list that grows, not below it), or pass its `--box`
  again on the swap.
- Each `--box` (CSS pixels, as the page reports them) becomes an
  invisible rectangle with that id: name it in a step's `focus`, and draw
  rings and arrows around it. Put labels on the app's empty background or
  beside the picture, never over its controls.
- A zoom keeps the content area's shape, about 2.2 wide to 1 tall. A box
  much taller or wider than that, or near the picture's edge, shows page
  beyond the picture; for a zoom, mark a box of about that shape around
  the region to show.
- A step naming the copy (`{"scene": "app-2", "ids": [...]}`) cuts to the
  new picture: a click-through.
- `--scale` is the capture's pixels per CSS pixel (default 2; 1 for a
  plain capture, 3 for most phones). `check` uses it to report a
  screenshot whose text will look smaller than 20 px of 1080; zoom in on
  that step or capture a smaller window.
- Elsewhere: `screencapture -x -R x,y,w,h out.png` on a Retina Mac (2x),
  `xcrun simctl io booted screenshot out.png` for the iOS simulator
  (`--scale 3`). Read boxes off the picture: image pixels divided by the
  scale.

## The story

    ---
    scenes: [scenes]
    video: out/talk.mp4
    work: out/work
    lexicon: [lexicon.json]
    silent: {code-card: [code]}
    slides: {file: out/slides.md, images: out/img}
    ---

    ## card-title 0 | How a browser finds a website
    One short line over the title card.

    ## lookup 0 | Asking the resolver
    The browser asks a resolver first.

    ## lookup 1
    The resolver asks a root server where com lives.

Each `## <scene> <step> | <title>` is a beat, with the title on a
scene's first beat. In a deck the text is the presenter notes, in a
video what the voice says, and the video's story is derived from the
deck's. A `Direction:` paragraph is for the presenter alone and is never
checked as said. Titles must be unique. Other front matter:
`voice`, `speed`, `audio_delay` (0.3), `gap`, `scene_gap`, `end_hold`
(4.0), `title` ({size, color, font}), `effects` (the story's own effect
modules), `text_x`, `strict`, `intro`
(`cut`, the default, opens on the first scene already drawn).

## Commands

| Command | Does |
|---|---|
| `excalive check story.md` | Scenes and steps exist, every on-screen line said in its beat, text overflow, speech lint (words Kokoro misreads, relative time like "tomorrow", pointers like "the next slide", a sentence repeating a recent one), and a number said that disagrees with the screen. Under a second. Exit 1 on unspoken text. |
| `excalive slides story.md` | A still per beat, a Slidev deck (one slide per scene, beats as clicks, notes), contact sheets in the work dir. Seconds. |
| `excalive video story.md` | The checks, then Kokoro voices each beat (cached by its words), then one render held to the voice, plus contact sheets. |
| `excalive measure --size 48 "text"` | The drawn width of a line of text (`--font 3` Cascadia, 5 Excalifont). Use it to set `width` on text written by hand, which centered text and the overflow check rely on. |
| `excalive image scene.excalidraw shot.png` | Put a screenshot in a scene or swap the one there; `--box name=x,y,w,h` marks parts of it, `--scale` is the capture's pixel ratio. |
| `excalive animate ...` | The renderer alone: a file, `--steps file`, `--frames`, `--snapshots prefix`, or a storyboard JSON. `--sheet`, `--check`, `--out x.gif`. |
| `excalive usage paths...` | Tokens, time and list-price cost of Claude Code transcripts. |

## Animating without a story

`excalive animate` is the renderer on its own, for a diagram that needs
motion but no voice. It uses mcp-excalidraw-server's headless renderer,
so frames look like canvas screenshots. MP4 and WebM default to 1920 by
1080 at 30 fps, GIF to 960 by 540 at 20 fps.

| Goal | Command |
|---|---|
| Draw the live canvas in | `excalive animate` |
| Draw a file in | `excalive animate diagram.excalidraw` |
| One keyframe per build step | `excalive animate --steps diagram.excalidraw` (reads `steps.json` beside it) |
| One step per Excalidraw frame, camera moving between them | `excalive animate --frames` |
| Change over time from canvas snapshots | `snapshot save demo-1`, edit, ..., `excalive animate --snapshots demo-` |
| Full control | `excalive animate storyboard.json` |

Flags: `--out` (`.mp4`, `.webm`, `.gif`, or a directory for PNGs),
`--duration`, `--hold`, `--boil 8` (hand-drawn wobble), `--dark`,
`--no-intro`, `--width`, `--height`, `--fps`, `--padding`, `--text-x`,
`--sheet sheet.png` (contact sheets of every keyframe), `--check`,
`--strict`, `--effects fx.mjs` (a story's own effects).

Storyboard keyframes take `scene`, `step`, `ids`, `add`, `clear`,
`audio`, `audioDelay`, `narration`, `textX`, `duration`, `hold`,
`stagger`, `enterDelay`, `easing`, `enter`, `styles`, `order`, `camera`,
`set`, `pin` and `clip`. `excalive video` writes these for you; the reference is at the
bottom of `scripts/animate.mjs`.

- New elements enter in creation order: arrows grow along their path,
  shapes draw their outline then fill, hand-drawn text writes on, code
  types, other text fades in, and an arrow waits for the shapes it
  connects. Create elements in the order they appear.
- For video, keep free text at `fontSize` 28 or more and the scene close
  to 16:9. Shape labels render at 20 on the canvas, so put larger words
  in free text elements over the shape.
- Nunito (`fontFamily: 6`) renders as itself because excalive hands the
  renderer `assets/fonts/Nunito-Regular.ttf`. Use it for words that read
  as type: titles, list items, tables. Diagrams stay in Excalifont (5).
- Use `clear` at every scene change in a storyboard, or elements that
  share an id across scenes (`frame`, `title`) morph into each other.

## Rules that catch people

1. **Words on screen are said.** Every content word of a line a click adds
   appears in that beat's words. Start a list beat with its item, word for
   word. `silent` is only for code, URLs, axis ticks, lane names and the
   like. Titles are exempt.
2. **Write for the ear.** "Sep 11", "1M", "1214" and "K2.5" read badly
   aloud; the lint says how to fix each. Pronunciations go in a lexicon:
   `{"Navier": {"ipa": "nævjˈA"}, "K2.5": "K two point five"}`.
3. **A video is the deck, narrated, slide for slide.** Its words are the
   deck's notes: derive the narration from the deck and edit only the
   deck. Drop only what works only live, and never move one slide's
   content into another's narration.
4. **Look at every contact sheet** before calling it done. The checks do
   not see a label on an arrow or text off the page.
5. **Nobody can hear the video for you.** Check suspect words with misaki,
   run a Whisper round trip to find the beats to hear first, and have a
   person listen before it ships. Never play audio aloud while working.
6. **Run `check` right before every render.** A diagram edited since the
   narration was written shows up as unspoken lines.
7. **Contact sheets show where steps land, not how they get there.** To
   see a travel or a new effect, render the scene alone (`excalive animate
   --steps scenes/x.excalidraw --out look/`) and look at the frames
   mid-transition. That render has no title and frames the scene on the
   whole screen, so judge a focus by its `excalive slides` still, and its
   move by frames pulled from the video.
8. **A long click loses the listener.** Fill the time with more build
   steps, not more words: a click past about 150 words with nothing new
   drawn needs another step. Examples use what the click shows, and
   numbers the listener must combine go on screen.
