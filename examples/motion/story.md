---
scenes: [scenes]
title: {font: 6}
video: out/motion.mp4
work: out/work
slides: {file: out/slides.md, images: out/img}
lexicon: [lexicon.json]
effects: [effects.mjs]
silent:
  # The handler's code is not read out.
  handler: [code]
---

## title-card 0 | How a view counter counts
A motion example: one web request, from the click to the count.

## request 0 | The trip behind one page view
A view counter needs three parts. A browser shows the page, a server runs a handler, and a database keeps the count, which stands at 41 views.

## request 1
Opening the page sends a GET request for slash views. That request is the visit being counted.

## request 2
The server does no counting of its own. It asks the database to add one to the stored number.

## request 3
Inside the database, 41 becomes 42. Counting there means two visits at the same moment still add two.

## request 4
The database sends the new count, 42, back to the server.

## request 5
The server puts that number in its reply, and the page shows 42 views.

## request 6
Every visit makes the same trip. After a thousand more, the page and the database both show 1,042.

## handler 0 | The handler on the server
All of the server's work fits in one short handler.

## handler 1
The handler runs once per request, whenever a browser asks for slash views.

## handler 2
The database adds one itself. A single update raises the count and hands back the new value.

## handler 3
The reply carries the new count back to the page.

## end 0 | A page view in motion
That is how a page counts its views. Thanks for watching.
