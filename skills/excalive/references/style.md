# Slides and narrated videos: house style

A format that works for talks and explainer videos built with
excalive: every slide is an Excalidraw page, the diagrams are
hand-drawn, and the words are plain type. It came out of building
talks and their narrated videos, and each rule below fixed something
that read or sounded badly the first time.

## The page

Every slide and every video frame is one page, 1600 by 900 units.

| Part | Where | Size |
|---|---|---|
| Title | x 120, y 100, left-aligned | 64 |
| Content area | x 120 to 1480, y 220 to 840 | |
| Margins | 120 left and right | |
| Background | white | |

- A **card** (a slide that is not a diagram) is drawn on the page itself:
  an invisible rectangle with id `frame` at (0, 0), 1600 by 900, and the
  title as a text element with id `title`.
- A **diagram** is drawn on any canvas, with an invisible `frame` rectangle
  around the whole drawing in every build step. excalive scales
  it into the content area, centers it, and draws the slide title above
  it, so titles land in the same place and size on every slide. Before
  that, each slide's camera fit its own diagram and the title moved and
  changed size from slide to slide.

## Type

The drawings are hand-drawn; the words are not. Hand-drawn text for
titles and bullets looked odd in a deck.

| Use | Font | Size (page units) |
|---|---|---|
| Slide title | Nunito (`fontFamily: 6`) | 64 |
| Title slide / section card title | Nunito | 120 / 80 |
| List item, closing line | Nunito | 48 |
| Group label, note on code | Nunito | 40 / 36 |
| Tables, field lists, sources | Nunito | 32 to 40 |
| Code | Cascadia (`fontFamily: 3`) | 26 to 30 |
| Diagram labels, after the fit | Excalifont (`fontFamily: 5`) | 24 or more |

- The headless renderer has no Nunito and would draw Liberation Sans;
  `assets/fonts/Nunito-Regular.ttf` is handed to it by `excalive animate`.
  The canvas's browser tab draws Nunito natively.
- Comic Shanns (`fontFamily: 8`) is not available headless; write code in
  Cascadia.
- `title: {font: 6}` in a story file's front matter sets the font of the
  titles the pipeline draws.
- A list item or table cell that is an identifier (a file name, a
  function, a command) is set in Cascadia. One that only mentions an
  identifier stays in Nunito.
- Left-align text. Labels centered in a diagram's boxes are the exception.

## Color

| Color | Value | Use |
|---|---|---|
| Ink | `#1B2547` | Titles, list items, body |
| Muted | `#7A776E` | Kickers, group labels, row labels, step numbers |
| Blue | `#1864ab` | Questions to the audience, notes on code, table headers |
| Amber | `#a35200` | The one line a slide lands on; at most one per slide |

Diagram fills and strokes, from Excalidraw's palette: blue
`#d0ebff`/`#1864ab`, amber `#fff3bf`/`#a35200`, green `#d3f9d8`/`#2b8a3e`,
rose `#ffe3e3`/`#c92a2a`, gray `#f1f3f5`/`#343a40`; a dashed gray outline
with no fill for neutral structure (phases, spans of time, groupings).
Give each color one meaning for a whole deck (which actor, which kind of
thing) and keep it, so no diagram needs a legend.

Something that is none of the deck's actors (a piece of data, a target, a
concept) is gray: filled gray for something that holds data, dashed gray
for structure. Never borrow an actor's color for it, and never color a
diagram element amber for emphasis, since that color already means
something on every other slide.

## Kinds of slide

A teaching slide is a title plus one of these.

1. **A diagram**, built one step per click from its `steps.json`. To move
   something within a slide, give the step another scene file instead of
   a list of ids (`"search-2"`): elements that share an id with the step
   before slide, resize and recolor into place.
2. **A list that builds**, two to four items, one per click. Each item is a
   blue square marker (18 by 18 at x 130, `roughness: 0`) and its text at
   x 180, rows 115 apart from y 290. Nothing between the title and the
   list: no subtitle, no lead line. A claim worth keeping is an item; the
   rest is said.
   - **Two groups** get muted labels: the first label at (120, 260, 40),
     its items at 46 from y 330, 90 apart; the second label 110 below the
     first group's last item, its items 70 below that label.
   - **A closing line** may follow as the last click: the line the list
     lands on, at (120, last row + 145, 48), amber, no marker. It is blue
     when it is a question. A list made only of questions is blue.
   - **Step 0** is the title alone. A story usually starts the list's
     beats at step 1, so the slide opens on its first item. A beat on
     step 0 is right only when it says something the items do not, in one
     short sentence ("Four things go wrong."), never the title read out.
3. **Numbered steps**: a list with the number in place of the marker
   ("1." at x 130, muted, 44) and the step at x 180. The numbers go in
   `silent`, and the words say the step, not "one".
4. **Code with notes**: the real capture in Cascadia in a gray box,
   trimmed to the lines the slide is about, at most 14. Box at (100, 220),
   code at (130, 240), 26 to 30, line height 1.25 times the size. Each
   note is blue, 36, at x box right + 85, centered on its line, with a
   60-long arrow from x box right + 70 pointing left at the line's center.
   Show the code first, then one note per click, so viewers read the code
   before a note points into it. Notes go on lines at least two apart;
   notes on neighboring lines overlap. When notes do not fit beside the
   code, the code's own comments carry them, revealed one per click in
   blue Cascadia. When even that does not fit, the code runs the full
   width and what the notes would say is said instead.
5. **A statement**: one or two plain sentences at 72 under the title,
   with the line the slide lands on in amber (blue when it is a question
   to the audience), for a rule or takeaway; a few per talk. A line at 72
   holds about 40 characters of Nunito; a longer one wraps with `\n` in
   the same color. The second sentence starts 130 below the first, since
   sentences set closer read as one block. State the fact, no teaser and
   reveal.
6. **A screenshot**: the real product, captured at 2x and fitted into the
   content area with `excalive image`. Never paint in UI that is not
   there. Capture a window no larger than the point needs: an 800 by 500
   page at 2x already draws its text at about 19 px of 1080, and a whole
   desktop is unreadable without a zoom. Marks drawn over it carry the
   slide's words: a ring around the control, an arrow and a short
   hand-drawn label for what the words point at. Those are said like any
   other text; the app's own text is not checked. `excalive image` draws
   a thin gray outline around the picture so a white page does not melt
   into the slide; leave it out of the steps when the app has a frame of
   its own. The next state of the app is a copy of
   the scene with the next capture swapped in: the picture cuts, and a
   ring on what changed draws in.
7. **A table**: Nunito, header row in blue, cells in ink, one straight
   rule (`#ced4da`, `roughness: 0`) between rows, spanning x 120 to 1480
   with even gaps of at most 160. Two to four columns, five rows at most.
   The first column is muted only when it holds row labels. Build it one
   row per click. A table that reads by column is turned so that each
   click adds a row. A closing line may sit under it at (120, last row +
   120, 40), amber, or blue for a question.

A slide that fits none of these becomes one of them. Two columns or a
grid of cards becomes a diagram when its items connect (a loop, a flow,
who talks to whom), and otherwise a table, a list in two groups, or two
stacked code boxes. More than four items never goes on one slide: split
it, group it into two labeled groups, make it a table, or draw it if it
has a shape. Six labels are usually three groups that have not been
grouped yet.

No paragraphs in boxes: a definition or a summary is a list of its parts.
No captions under a figure: what a caption would say is a list item, a
note on code, a closing line, or the words of the click before.

Code is trimmed, never paraphrased, with cut lines marked `…`, on a
card or inside a diagram. Cascadia
draws ligatures (`<=` as one glyph); excalive breaks them when it
renders, so write code as typed. Indent with non-breaking spaces: the
canvas strips leading spaces. A line too long for its box is reflowed
where the code stays valid, and otherwise cut inside the line with `…`.

## Measuring

The canvas measures every font at a flat 0.6 em, which overstates Nunito
by about 27%, and the headless renderer measures Nunito as Liberation
Sans. Neither tells you where a line really ends. Lay out by real widths:

- `excalive measure --size 48 "The context window fills up"` prints the
  drawn width (`--font 3` for Cascadia, 5 for Excalifont).
- `excalive check` reports card text that ends past x 1480 or below y
  860, and diagram text outside its `frame`.
- A title that runs past x 1480 breaks into two lines with `\n`; if a
  line still runs past, the size drops until it fits.

Structural slides, with their positions (x, y, size) on the page:

| Slide | Elements |
|---|---|
| Title | `title` at (120, 320, 120); one muted line saying what it belongs to or what it is ("Lecture 4 of 12", "A motion example") at (124, 500, 44). Nothing else. A two-line title starts at y 230, its muted line at 560 |
| Schedule | the parts as a list, all at once |
| Section | muted "Part N" kicker (120, 330, 48), the part's name (120, 410, 80) |
| Interlude | the same, with the activity as the kicker ("Live demo") |
| Questions | "Questions" (120, 300, 110), last in a live talk |
| End card (video) | `title` (120, 320, 120), "Thanks for watching" muted (124, 500, 44) |

A list card, as elements for the canvas's `add` (then `export` the
`.excalidraw` and list its steps in `steps.json`):

```json
[{"id": "frame", "type": "rectangle", "x": 0, "y": 0, "width": 1600, "height": 900,
  "strokeColor": "transparent", "backgroundColor": "transparent", "fillStyle": "solid"},
 {"id": "title", "type": "text", "x": 120, "y": 100, "text": "What a long conversation costs",
  "fontSize": 64, "fontFamily": 6, "strokeColor": "#1B2547", "textAlign": "left"},
 {"id": "m0", "type": "rectangle", "x": 130, "y": 310, "width": 18, "height": 18, "roughness": 0,
  "strokeColor": "#1864ab", "backgroundColor": "#d0ebff", "fillStyle": "solid", "strokeWidth": 2},
 {"id": "i0", "type": "text", "x": 180, "y": 290, "text": "The context window fills up",
  "fontSize": 48, "fontFamily": 6, "strokeColor": "#1B2547", "textAlign": "left"}]
```

with steps `[["frame", "title"], ["frame", "title", "m0", "i0"], ...]`.

## Diagrams

- **Draw about 1360 wide**, close to the content area. A diagram drawn
  much wider is shrunk to fit and its labels with it; keep labels at 24
  or more after the fit. A `frame` of 1360 by 620 fits at exactly 1:1.
- **Name every actor by its role**, and keep its color for the whole deck.
- **Line things up.** Things that do the same job share a line: the same
  y, height and width. When one panel needs fewer rows, leave that gap
  empty rather than move a box up to fill it.
- **Regions, not floating boxes,** for where things run. A region's label
  is muted, at its top left.
- **Labels are free text**, not a shape's own label, which the canvas
  renders at 20 whatever its size. Write a centered label's x at its
  middle, in whole numbers. Text saved back from the canvas has
  fractional x at its left edge, and `text_x: auto` tells the two apart
  per scene. A scene written by hand with whole-number x at the left edge
  needs `text_x: {scene: left}`.
- **No caption box at the end.** Its words go in the click before.
- **Timelines on a grid.**
  1. One lane per actor, in the order messages travel, each a header box
     with a dashed lifeline down from its center, lanes evenly spaced.
  2. Time runs down in rows of one fixed height (60 to 80), one arrow per
     row. Two things at once still take two rows.
  3. Arrows are horizontal and touch a lifeline or a bar at both ends. An
     arrow may cross a lifeline, never a bar.
  4. A bar is one request and its reply, square-cornered. When the request
     or the reply is not drawn, the call gets an arrow and a label, not a
     bar. A long run of repeated rounds may be one bar with the count in a
     label beside it, since drawing every round fills the slide with
     arrows that say nothing new.
  5. A label sits on one line just above its arrow. What an actor says
     goes on its reply arrow, not in a box on its lane. A wait is a muted
     label on the waiting lane between two rows, not an arrow.
  6. Place everything from the lane positions and the row height, not by
     eye.

## Writing on the slide

- **Titles** name what the slide is about: a noun phrase of two to six
  words, about 40 characters and 55 at most, that covers the whole slide.
  Someone scrolling the exported PDF later reads the titles and little
  else, so the list of titles should read as an outline. A title is not
  a sentence you would say as the slide comes up: no second person, no
  imperative, no question mark unless asking is the slide's whole job.
  The specific subject beats a generic container ("Diagnosing a wrong
  answer", not "Diagnostics"). Every title in a deck is different.
- **List items** are short sentences that name their subject. No "it" or
  "this" pointing off the slide ("It fills up"), no fragment without a
  subject ("Keeps your conversation small"), no label joined to a claim
  with a colon ("Claude Code: the model decides"). A list of instructions
  to the viewer may use imperatives ("Read the diff first"). About seven
  words, one line, four items at most, all starting the same way
  grammatically. An entry that needs a bold lead and a second clause is
  two parts, and two parts make a table. Read only the items, in order:
  they should give the slide's point.
- **No headlinese.** No noun phrase with a second phrase tacked on after a
  comma and no verb between them ("One conversation, an hour in", "Same
  harness, new ways in"). Write one plain phrase ("Your conversation after
  an hour"). This covers titles, list items, table cells and diagram
  labels.
- **One phrase per diagram label.** No comma tail adding a second fact.
- **Text that is more than a label** (a statement, a closing line) says
  its point once, in one plain sentence: not two clipped ones, no
  punchline that takes a second read, no colon joining two claims.
- **Words on screen are said.** Viewers read along while they listen, so
  a line the voice never says reads as the two disagreeing, and a bullet
  they must read word by word competes with the voice for their
  attention. Every content word of a line a click adds appears in that
  click's notes or narration, and the click's words start with the list
  item word for word. A word counts as said in any of its forms ("reads"
  covers "read"). Titles are exempt: they stay on screen, and reading
  them out ("What the model sees. Picture...") sounds stilted. `excalive
  check` reports every line that is not said. A video refuses to render
  until none is left. A deck only reports them, because live notes read
  code, tables and sources selectively. The speech lint runs only on
  stories that make a video (or set `lint: true`).

## Writing for the ear

A viewer hears each sentence once, at speaking pace, and cannot rewind.
The test for every beat: read it aloud once. If a listener would need to
hear it twice, rewrite it.

- **Explain, do not describe.** A beat adds what the picture cannot: why
  it matters, what follows, what it replaces. It never describes what the
  viewer already sees. This sits with words on screen being said: say the
  item, then explain it.
- **Sentences hand off.** Each sentence picks up something the last one
  left (a word, its subject, the result it named) and puts its new part
  at the end. A change of topic gets a bridge.
- **Set up every "the X".** A thing is named before it is "the cache".
  After cutting or moving a beat, read the beats around it again: a later
  "the X" may now point at nothing.
- **What makes a line hard to follow**: a double negative or a long setup
  before the point, two claims in one sentence, "it" or "this" after a
  change of subject, a jump with no bridge, a term used before the screen
  shows it, and more ideas than about 150 words a minute can carry.
- **Say each thing once.** A question asked on one slide is not asked
  again on another. No teaser and reveal in the voice either ("Two rows
  you never touched. One of them passed for intelligence."): say what the
  thing is when it comes up. `excalive check` reports a sentence that
  mostly repeats one said in the last 25 seconds or so.
- **No tells.** No "not just X, it's Y", no sentence after sentence
  listing three things, no run of clipped fragments ("The model call. It
  sends back the tool request. Then approval."). Vary sentence length.
- **No relative time.** "Tonight", "tomorrow", "this week", "next time"
  and "Thursday we'll" are wrong once the video outlives the day it was
  made for, and it always does. Write the date, or leave it out. The
  check reports these.
- **No pointers to other slides.** "The next slide", "two slides back"
  and "in two slides" break when slides move or a live-only slide drops
  out of the video; one such pointer was nine slides off. Name the thing.
  The check reports these too.
- **Numbers.** Digits are fine. There is no need to write numbers out in
  words. Write a count of four digits with a comma (1,638), or Kokoro
  reads it as a year ("sixteen thirty-eight"). A time on the hour is
  "9 PM", not "9:00 PM", which is read "nine colon zero zero". "1M" is
  read "one em": write "1 million". A version is said with "point", which
  takes a lexicon entry (below). A number said must agree with the
  screen: the check reports "two servers" said over "3 servers".
- **Dates** are abbreviated on screen and written out in the words
  ("Friday, September 11"); the check matches the two.
- **Symbols.** Formatting punctuation is never said: say the word inside
  the backticks. "y/n" is "yes or no". A slash command keeps its slash
  ("slash add"). A URL is said as what it is ("the project's site") and
  spelled out only when the address is the point. A lone letter as a
  sentence ("Type y.") loses its sentence break: end the phrase on a
  comma instead.
- **Words that blur aloud.** Reword what a listener mishears; voicing the
  same words again gives the same audio. A possessive on a name
  ("example.com's server" is heard as "example.com server").
  Near-homophones ("halving" sounds like "having"). A short word fused
  with a vowel-initial one: "three reviewers a round" was heard "around",
  "text to weigh" "text away", "a write to a tracked file" "attract
  file", and "and should it?" "and shoot it".

## Motion

A video draws each step in, and a deck shows where it lands. Every step
rests on its scene as drawn, so motion only decides how things get
there. The mechanics, every setting and how to write an effect are in
[`effects.md`](effects.md).

- **Animate only when it teaches.** The house entrances need no
  settings: shapes trace their outline and fill, arrows grow along their
  path after the shapes they join, hand-drawn labels write themselves on,
  code types, and plain type fades in. Something that changes between
  steps (the same id) moves, resizes or recolors into place. No motion
  for emphasis: a ring drawn around the thing points at it better than a
  pop or a bounce. No wobble either (`animate --boil`): strokes that
  shimmer on a held slide read as shaking and put viewers off.
- **An arrow drawing in is the message moving.** It grows from sender to
  receiver, so a dot sent along it in the same step says the same thing
  twice and looks fussy. A travelling dot is for a message over a
  connection already on screen: a second request over a line drawn
  earlier, or traffic over links drawn as structure. Then it is 22
  across, `roughness: 0`, filled in the arrow's color.
- **Zoom only to show what cannot be read or seen at full size.** A
  step's `focus` earns its place in three cases. The detail is too small
  to read: a screenshot's text, small print (`check` reports small
  screenshot text). Going inside a thing: a box holds its own small
  diagram, which plays out once the camera is in, and a later step pulls
  back out. Following something too long to read whole: a pipeline or a
  timeline, one focus per stage, then a step without one to show it
  whole, which shows its shape even where the labels are too small to
  read, so use it only when the shape is the point. Never zoom to point
  at something already readable; a ring does that. A zoom into the cache of a readable diagram repeated what the
  words said and was cut. Pick a focus whose surroundings still make
  sense, since the camera shows whatever sits next to it.

## A narrated video

- **The video is the deck, narrated, slide for slide.** Keep every slide
  that orients or teaches, in the deck's order. Drop only what works only
  live: an audience discussion or poll, logistics, sources, Questions.
  Logistics means what is tied to the day the talk was given: what is due
  this week, a room change, a reminder, a bridge to the next session. How
  the subject works is content and stays. A first attempt planned as a
  short summary folded the schedule and the problem statement into the
  title card's narration: a minute of talk with nothing on screen to
  follow.
- **Never move a slide's content into another slide's narration.** Check
  what a dropped slide said: a lasting fact said only there is lost with
  it, so put it on a teaching slide in the deck.
- **A kept slide stands without the dropped ones.** When it answers a
  discussion the video drops, its words state the question themselves.
- **The narrator is not the presenter.** No "I" or "my machine": "we" for
  the talk, or the presenter by role. A live demo's slides stay; the
  words say what the demo shows and that it runs live, and never ask the
  viewer to watch something the video does not show.
- **Open on the title card already drawn** (`intro: cut`, the default), so
  the first frame and the thumbnail say what this is; speak one short line
  over it. End on an end card held for four seconds (`end_hold`), with
  one short line in the same form in every video of a series.
- **Section cards are announced** ("Part two. How the cache works.").
  Other titles are not read out.
- **Sum up the schedule in one flowing sentence**, with its items in
  `silent`. Reading each item aloud sounds like a machine reading a list.
  Other fair `silent` text: lane names, axis ticks, step numbers, a
  chart's names and values, URLs, emails, code.
- **Compare scene lists before rendering**: the video's `##` scenes in
  order should be the deck's minus the live-only slides.
- **A scene shown again is said again.** The check compares each beat
  with what it shows, so a slide that returns needs its lines in the
  words again.
- **Pacing.** Kokoro reads at one even pace and pitch, which tires a
  listener over a long video, and no voice setting fixes it: `speed`
  changes the rate, not the intonation. The levers are the words
  (sentence length) and the pauses, `gap` after each beat (0.5 s) and
  `scene_gap` after each slide (1.0 s).

## Voice: Kokoro

`excalive video` voices each beat with Kokoro in-process (uv
installs it and its weights, about 330 MB, on the first run).

- **Voices**: `af_heart` (default), `am_liam` and `bf_isabella` were
  picked over finished videos; `af_bella`, `am_fenrir`, `bf_emma` and
  `bm_george` also work. `am_michael` was rejected as slow, pausy and
  flat. The first letter is the accent (American, British), the second
  the gender. A short sample does not predict how a voice wears over a
  whole video: choose on a finished one.
- **Pronunciation** goes in a lexicon: `{"Navier": {"ipa": "nævjˈA"},
  "K2.5": "K two point five"}`. Kokoro gets IPA inline when an entry has
  it, otherwise the `say` respelling. Prefer IPA: respellings are guesses
  (`ay` comes out as the vowel in "eye"). When a respelling is needed,
  letters separated by hyphens are the most reliable form, and a
  spelling with a second possible reading is rejected. A letter-digit-
  decimal token like `K2.5` reads as "K two five" without an entry.
- **Leave initialisms bare** unless misaki gets one wrong: it gives them
  natural stress, and spelling them out puts stress on every letter.
  Phonemize the word in its sentence, not alone: misaki reads "GET" as
  the word on its own but spells it out in "sends a GET request". Add an
  entry only if it improves on the bare reading. Known misses: misaki
  spells out "README", reads "URLs" as "U R L S" and "VS Code" as "vees
  code", reads JSON and YAML as letters, spells "GET" mid-sentence (fix:
  `{"GET": {"ipa": "ɡˈɛt"}}`), and says "id" as the word (write "ID").
- **Heteronyms.** misaki guesses a word's part of speech and sometimes
  guesses wrong: it voiced the verb "Use" as the noun, "read" in the
  wrong tense, and "red" as "read". Phonemize every word with two
  readings (read, live, use and the like) in its sentence, and fix a miss
  with IPA or a reword.
- **How an entry matches**: exactly and case-sensitively (add `"ci":
  true` to ignore case), as a whole word where the term starts or ends
  with a letter or digit (so `F4` never matches inside `F45`), longest
  entry first, in one pass. A replacement is never matched again, so
  write it already respelled: a term inside another entry's replacement
  is not replaced.
- **An entry replaces its term wherever it appears.** With `F4` set to
  "feature four", "Feature F4" is read "feature feature four", and "F4 is
  two characters" no longer makes sense. Write the term alone, or add a
  longer entry ("Feature F4") that wins.
- **Check a sentence before trusting it** with misaki, the phonemizer
  Kokoro uses, run through uv in the same packages excalive voices with
  (a few seconds once uv has them cached):

      uv run --quiet --python 3.12 --with kokoro==0.9.4 \
        --with "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl" \
        python -I -c "import sys; from misaki import en, espeak
      g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
      [print(g2p(s)[0]) for s in sys.argv[1:]]" "Opening the page sends a GET request."

  `A` is the vowel in "day", `I` in "eye", `W` in "now", `O` in "go".
- **You cannot hear it.** Phonemes catch wrong pronunciations, and a
  Whisper round trip points at the beats worth hearing first
  (`workflow.md` has the steps). A person listens to the whole video
  before it goes anywhere. Never play audio aloud while working.
- **Dots.** misaki drops a leading dot (".com" is read "com") and
  pauses inside a file name ("story.md"). Write "dot com" in the words
  (the check still matches ".com" on screen) and give file names a
  lexicon entry.
- Kokoro starts every clip with about 0.3 s of silence, so the voice lands
  `audioDelay` plus 0.3 s after its step starts drawing.
- In a separate venv, misaki's automatic spaCy model download fails under
  uv; install `en_core_web_sm` explicitly (story.py's header does).
