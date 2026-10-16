# Examples

Three small projects. Each is one `story.md` that builds both a slide deck
and a narrated video, and a `scenes` folder with the Excalidraw files and
the `steps.json` that lists their build steps. Each folder also has the finished
video. Run the commands from the repository root, where `excalive` is
`skills/excalive/bin/excalive` (or the installed skill's `bin/excalive`). Everything they write
goes to the example's `out/` folder, which git ignores.

    excalive check  examples/hello/story.md    # unspoken text and speech problems, no render
    excalive slides examples/hello/story.md    # out/slides.md, one still per click, contact sheets
    excalive video  examples/hello/story.md    # out/hello.mp4

The first `video` run downloads Kokoro and its weights, about 330 MB. To
change a drawing, open its `.excalidraw` file in Excalidraw, save it, and
build again.

## hello

The smallest complete story, and the one to copy when you start your own.
It has a title card, a list that adds one item per click, a diagram in
three steps (the story and scenes go in, a deck and a video come out) and
an end card. That makes 4 slides, 8 stills and a 45 second video. [Watch it](hello/hello.mp4). Its
`lexicon.json` holds one pronunciation, so the voice says "story dot M D"
instead of pausing at the dot.

![hello preview](hello/preview.gif)

![hello contact sheet](hello/sheet.png)

## dns

How a browser finds a website. One diagram adds an arrow per step as the
resolver asks the root server, the TLD server and the authoritative
server, hands the address back to the browser and keeps it in its cache.
Each color has one meaning: blue is the side that asks, gray is the name
servers and their referrals, and green is the address. A list card on why
caching matters and a one-line takeaway follow. That makes 5 slides, 16
stills and a two minute video. [Watch it](dns/dns.mp4). The lexicon tells the voice how to read
192.0.2.10.

![dns preview](dns/preview.gif)

![dns contact sheet](dns/sheet.png)

## binary-search

A search for 53 in fifteen sorted numbers. lo and hi mark the range that
could still hold it, mid marks the box being compared, the boxes ruled
out turn gray and the answer turns green. A code card follows with the
same search in Python and a note per click, each with an arrow to its
line. That makes 4 slides, 16 stills and a video of a minute and a half. [Watch it](binary-search/binary-search.mp4).
The numbers in the boxes and the code are listed under `silent` in the
front matter, because the voice does not read them.

Steps 0 to 2 in `scenes/steps.json` are lists of ids from
`search.excalidraw`. Steps 3 to 9 each name their own scene file
(`search-3` to `search-9`) instead. Every element keeps its id from file
to file, so between steps the markers slide to their new boxes and the
boxes ruled out change color in place. Each also keeps its `seed`, so its
hand-drawn strokes keep their shape while it moves. The GIF below is
drawn from the same steps:

    excalive animate --steps examples/binary-search/scenes/search.excalidraw \
      --out examples/binary-search/preview.gif --width 960 --height 320 \
      --fps 15 --duration 1 --hold 1.2 --padding 30

![binary-search preview](binary-search/preview.gif)

![binary-search contact sheet](binary-search/sheet.png)
