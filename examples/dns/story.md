---
scenes: [scenes]
title: {font: 6}
lexicon: [lexicon.json]
video: out/dns.mp4
work: out/work
slides: {file: out/slides.md, images: out/img}
---

## title-card 0 | How a browser finds a website
Example 2 of 3: what happens between typing a name and seeing the page.

## lookup 0 | The path of one lookup
This is DNS, the Domain Name System. Your browser and a resolver ask the questions. A root server, a TLD server and an authoritative server answer them.

## lookup 1
You type example.com. The browser has no address for that name, so it asks the resolver, usually run by your internet provider.

## lookup 2
The resolver starts at the top. It asks a root server: example.com?

## lookup 3
The root server does not know, but it knows who runs dot com. Ask the dot com server.

## lookup 4
So the resolver asks the TLD server for dot com: example.com?

## lookup 5
That server points one level down. Ask the example.com server.

## lookup 6
The resolver asks the authoritative server, the one that holds the records for example.com.

## lookup 7
This one knows. The address is 192.0.2.10.

## lookup 8
The resolver hands 192.0.2.10 back to the browser, and the page starts to load.

## lookup 9
The resolver also keeps the answer in its cache: example.com is at 192.0.2.10. The next person who asks gets it from there.

## caching 1 | Why caching matters
A cached answer skips all three servers, so it comes back in a millisecond or two.

## caching 2
The busy servers get fewer questions. A root server would drown if every lookup started there.

## caching 3
Every answer expires after a set time, which the authoritative server picks. A changed address spreads once the old answers run out.

## takeaway 0 | The takeaway
The first lookup walks the whole chain. After that, the cache answers.

## end 0 | DNS in two minutes
That is how a name becomes an address. Thanks for watching.
