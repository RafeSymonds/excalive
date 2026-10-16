---
name: excalive
description: Build hand-drawn slide decks and narrated explainer videos from Excalidraw scenes and one markdown story file, with excalive. Use when asked to (1) make a slide deck or talk in a hand-drawn Excalidraw style, (2) turn a deck, an outline or diagrams into a narrated video with a local voice (Kokoro), (3) animate Excalidraw diagrams step by step into MP4, WebM or GIF, or (4) check that a deck's or video's words cover everything on screen. Covers the story format, build steps, the house style for slides and narration, and the checks to run before rendering.
---

# excalive

excalive turns Excalidraw scenes plus one markdown story into a Slidev
deck (one still per click, presenter notes) or a narrated video (Kokoro
reads each section while its build step draws in). Read this, then the
house style before drawing anything.

## Where things are

This skill's base directory is `skills/excalive/` inside the excalive
checkout or plugin install. From there:

| Path | What |
|---|---|
| `../../bin/excalive` | The command. Call it by this path, or put `bin/` on PATH. |
| `../../docs/style.md` | House style: page, fonts, colors, slide kinds, card JSON, writing and narration rules. **Read before drawing a card or writing narration.** |
| `../../docs/workflow.md` | The steps for a deck and its video, and how to hand the work to agents. |
| `../../examples/` | Three complete stories (hello, dns, binary-search) to start from. |
| `../../scripts/story.py`, `../../scripts/animate.mjs` | Full reference in their opening comments: every front matter key and storyboard field. |

Needs `node`, `ffmpeg`, `uv`, and `mcp-excalidraw-server` 2.1 or later
(`npx -y mcp-excalidraw-server status` fetches it once). The first `video`
run downloads Kokoro, about 330 MB, through uv.

## Drawing scenes

Write each scene's elements as JSON and save it through the canvas server:

    npx -y mcp-excalidraw-server clear --yes
    npx -y mcp-excalidraw-server add scene.json
    npx -y mcp-excalidraw-server export --out scenes/scene.excalidraw
    npx -y mcp-excalidraw-server screenshot --out /tmp/look.png

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
  anything that should move.

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
video what the voice says. Titles must be unique. Other front matter:
`voice`, `speed`, `audio_delay` (0.3), `gap`, `scene_gap`, `end_hold`
(4.0), `title` ({size, color, font}), `text_x`, `strict`, `intro`
(`cut`, the default, opens on the first scene already drawn).

## Commands

| Command | Does |
|---|---|
| `excalive check story.md` | Scenes and steps exist, speech lint, every on-screen line said in its beat. Under a second. Exit 1 on unspoken text. |
| `excalive slides story.md` | A still per beat, a Slidev deck (one slide per scene, beats as clicks, notes), contact sheets in the work dir. Seconds. |
| `excalive video story.md` | The checks, then Kokoro voices each beat (cached by its words), then one render held to the voice, plus contact sheets. |
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
`--strict`.

Storyboard keyframes take `scene`, `step`, `ids`, `add`, `clear`,
`audio`, `audioDelay`, `narration`, `textX`, `duration`, `hold`,
`stagger`, `enterDelay`, `easing`, `enter`, `styles`, `order` and
`camera`. `excalive video` writes these for you; the reference is at the
bottom of `scripts/animate.mjs`.

- New elements enter in creation order: arrows grow along their path,
  shapes draw their outline then fill, text fades in, and an arrow waits
  for the shapes it connects. Create elements in the order they appear.
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
3. **A video is the deck, narrated, slide for slide.** Drop only what works
   only live, and never move one slide's content into another's narration.
4. **Look at every contact sheet** before calling it done. The checks do
   not see a label on an arrow or text off the page.
5. **Nobody can hear the video for you.** Check suspect words with misaki,
   run a Whisper round trip to find the beats to hear first, and have a
   person listen before it ships. Never play audio aloud while working.
6. **Run `check` right before every render.** A diagram edited since the
   narration was written shows up as unspoken lines.
