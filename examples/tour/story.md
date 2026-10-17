---
scenes: [scenes]
title: {font: 6}
video: out/tour.mp4
work: out/work
slides: {file: out/slides.md, images: out/img}
effects: [effects.mjs]
silent:
  # The code in each stage is not read out.
  path: [c1, c2, c3, c4]
  # The names and scores beside the bars are row labels.
  sort: [n-lin, n-ada, n-sam, n-kai, n-grace, s-lin, s-ada, s-sam, s-kai, s-grace]
---

## title-card 0 | A leaderboard that sorts itself
A motion and screenshot example: one new score, from the form to first place.

## app 0 | The leaderboard app
This leaderboard is a real web page, captured in a browser. It ranks four players, best score first.

## app 1
Typing Grace and 100 into the form makes a new score.

## app 2
One click on Add score, and Grace lands in first place, above Lin.

## path 0 | The path of a new score
Behind that click, the score takes four steps. First the page reads the form and turns the typed score into a number.

## path 1
Next, the add function keeps the best score for each player. A new name is added, and a name already on the board keeps the higher of its two scores.

## path 2
Then it sorts by score. Subtracting one score from the other puts the highest first.

## path 3
Last, the render function redraws the table from the sorted list.

## path 4
Every click runs those four steps, from the form to the table.

## sort 0 | Sorting by score
As bars, the five scores stand in the order they were stored, with Grace last.

## sort 1
Sorted as text, 100 would stay last, because the character 1 comes before 4.

## sort 2
Comparing the scores as numbers takes that back, and Grace moves to the top.

## sort 3
Because each player keeps a best score, Sam playing again for 95 grows his bar and lifts him to second place.

## sort 4
The winner is Grace, with 100, until a better score arrives.

## end 0 | From a click to first place
That is how one score travels from a click to first place. Thanks for watching.
