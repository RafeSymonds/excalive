# Workflow

How to build a deck and its narrated video with excalive. What each slide
looks like is in [`style.md`](style.md). This file says what to run and in
what order.

## 1. Draw the scenes

A scene is an `.excalidraw` file plus its entry in the `steps.json` beside
it. There are two kinds.

- **A card** is a slide drawn on the page itself: a 1600 by 900 frame, an
  invisible rectangle with id `frame` at (0, 0), the title as a text
  element with id `title` at (120, 100). Lists, statements, tables, code
  and the structural slides are cards. `style.md` has the JSON for a list
  card.
- **A diagram** is drawn anywhere, with an invisible `frame` rectangle
  around the whole drawing in every step. excalive scales it into the
  content area and draws the slide title above it.

Write the elements as JSON, then put them on a canvas and save the file:

    npx -y mcp-excalidraw-server clear --yes
    npx -y mcp-excalidraw-server add card-name.json
    npx -y mcp-excalidraw-server export --out cards/card-name.excalidraw

The canvas server is shared by everything that talks to its port. When
another session might be drawing, start a private one by putting
`EXPRESS_SERVER_URL=http://127.0.0.1:3097` (any free port) in front of
every command, and `stop` it the same way when you are done.

List the build steps, one list of element ids per click:

    {"card-name": [["frame", "title"], ["frame", "title", "m0", "i0"]]}

## 2. Write the deck's story

One section per click, headed `## <scene> <step> | <slide title>`, with
the title on the scene's first section. The text under a heading is what
you say on that click. In a deck it becomes the presenter notes, and in
the video it is what the voice says, so write it once, to `style.md`
("Writing the notes"). Presenter-only lines go in `Direction:` and
`Ask:` paragraphs.

    ---
    scenes: [cards, diagrams]
    title: {font: 6}
    work: out/deck-work
    slides:
      file: slides.md
      images: slides-img
      headmatter: {title: "My talk", transition: fade}
    ---

Titles must be unique: they are the slide's hidden H1, and anything that
cues off slide titles (a delivery script, a runbook) matches on them.

## 3. Check, build, look

    excalive check story.md
    excalive slides story.md

`check` lists missing scenes and steps, speech problems, and every
on-screen line the notes never say. `slides` writes a Slidev file, one
PNG per click, and contact sheets of every click, 20 to a page, in the
work directory. Look at every sheet: titles in line, nothing off the
page, each click adding what its words say. Never edit the generated
`slides.md`. Edit the story and rebuild.

Export with Slidev as usual (`slidev export`, `--format pptx`). The PDF
has one page per slide, the PPTX one slide per click with its notes. A
PDF export of more than about 30 slides can time out in one pass; export
it in page ranges and join them with `pdfunite`.

## 4. Derive the video's story

The video is the deck, narrated, slide for slide, and its words are the
deck's notes. Derive the narration file from the deck, so the two cannot
drift apart:

1. Copy the deck's story to `narration.md` and give it the video's front
   matter (`video`, `voice`, `lexicon`).
2. Drop the scenes that work only live (audience discussion, logistics,
   sources, Questions) and their `silent` entries, and add an end card.
3. Drop every `Direction:` and `Ask:` paragraph.

Edit the deck, never the narration, and derive it again after each
change. A short script that does the three steps makes that one
command. Notes written for the ear read correctly as narration; where
one does not, fix it in the deck.

Compare the two scene lists before rendering:

    grep -o '^## [^ ]*' deck.md | uniq
    grep -o '^## [^ ]*' narration.md | uniq

Then have a fresh model hear the whole narration, once before the first
render and again after each round of edits. Give any model CLI (for
example `claude -p`) the narration and this prompt:

> You hear this once, at normal speaking pace, while watching the slides
> it describes. You can't rewind. You have never heard of the subject.
> 1. What is it about, and what does it tell you?
> 2. Where did you lose the thread, and why?
> 3. Did anything show up that was never set up, a "the X" you hadn't
>    heard of, or an answer to something you never heard asked?
> 4. Did the narration get more specific than you needed, so a detail
>    felt random rather than an example?
> 5. Where did the move from one sentence to the next feel abrupt or
>    awkward? Quote the pair.
> 6. Which sentence was hardest by ear?

Fix what a listener would trip on, in the deck's notes, and ignore
flags the screen resolves.
It always finds something, so stop when what is left is nits. It is a
comprehension check, not a score, and takes seconds.

## 5. Check, render, review

    excalive check narration.md     # must report 0 unspoken
    excalive video narration.md

Use `silent` only for text that should not be read aloud: lane names,
axis ticks, URLs, captured code, the items of a schedule summed up in one
sentence. The render prints the video's path, its length and its contact
sheets.

You cannot trust a voice you have not heard. Check suspect words with
misaki's phonemes (`style.md` has the snippet), then run a Whisper round
trip and diff it against the narration to find the sections to hear
first:

- Transcribe each beat's clip with mlx-whisper, large-v3-turbo.
  small.en invents errors of its own (it heard "Everything" as
  "Nothing").
- Diff against the narration with the lexicon applied, so respellings
  do not show up as differences.
- Most diffs are homophones and digits against number words. The ones
  that change the meaning are fused words ("a round" heard "around"):
  reword those, re-voice, and transcribe again.
- Whisper invents words over silence. It repeats a two-word clip over
  the hold after it and adds sentences after a clip ends, so check a
  suspect diff against the clip's length. Transcribe the last section
  without the end hold, or it hears "Thank you" over four quiet seconds.

Then a person listens to the whole video before it goes anywhere.

## 6. When the deck changes

The deck and the video read the scenes when they build, so a diagram
edit reaches both on the next run. A changed label usually needs a
changed sentence, and `check` finds it in a second. Run `check` right
before every render.

## Handing the work to coding agents

For a batch of decks, run one agent per deck, one at a time, each from
the written guidance alone. What makes that work:

1. **Make the guide self-contained.** An agent told to "copy what the
   last deck did" copies its accidents too. Every rule an agent needs, with the
   coordinates and the JSON for each kind of card, lives in the style
   guide, and no rule points at another deck's files.
2. **One agent at a time, and fold its findings in before the next.**
   Each agent writes a notes file listing every place the guidance was
   unclear, wrong or silent, and what it decided. Fix the guide from
   that file before starting the next agent. The count of reported gaps
   does not fall much, but new kinds of gap do: most turn up in the
   first few decks, and later reports are edge cases inside known ones.
3. **Do not change the guide under a running agent.** Two early agents
   started from one version and finished under another, and redid work.
4. **Give each agent its own canvas port.** Two sessions on one canvas
   clear each other's drawings.
5. **Keep the machine awake.** A laptop that sleeps kills a long run
   (`caffeinate -i -m -t 21600` on macOS).
6. **Commit by path.** A plain `git commit` sweeps up whatever another
   session staged. Commit with pathspecs, and review before you push.
7. **Review the sheets yourself.** The checks catch unspoken text and
   bad speech, not a label sitting on an arrow. Each agent's output got a
   look at its contact sheets before it was committed.
