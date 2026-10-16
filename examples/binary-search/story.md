---
scenes: [scenes]
title: {font: 6}
video: out/binary-search.mp4
work: out/work
slides: {file: out/slides.md, images: out/img}
silent:
  # The numbers in the boxes are not read out, and neither is the code.
  search: [bn0, bn1, bn2, bn3, bn4, bn5, bn6, bn7, bn8, bn9, bn10, bn11, bn12, bn13, bn14]
  code: [code]
---

## title-card 0 | Binary search
Example 3 of 3: finding a number by cutting the list in half.

## search 0 | A search for 53
Here are fifteen numbers in sorted order, and we want to find 53.

## search 1
lo and hi mark the range that could still hold it. At the start, that is the whole list.

## search 2
mid is the box halfway between them. It holds 36.

## search 3
36 is less than 53, so everything up to mid turns gray, and lo moves just past it.

## search 4
mid moves to the middle of what is left: 60.

## search 5
60 is too big, so everything from mid on turns gray, and hi moves just left of it.

## search 6
Halfway again, mid lands on 47.

## search 7
47 is too small, so lo moves past it. Now lo and hi meet on one box.

## search 8
mid moves there too.

## search 9
It holds 53. Found in four looks, where reading left to right would take eleven.

## code 0 | The search in Python
Here is the same search in Python.

## code 1
The range starts as the whole list: lo at the first index, hi at the last.

## code 2
mid splits the range in half, rounding down.

## code 3
A miss moves one end past mid, so every look throws away half of what is left.

## end 0 | Half the list each time
Fifteen numbers take at most four looks, and a million take twenty. Thanks for watching.
