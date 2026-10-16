#!/usr/bin/env python3
"""Tokens, time and list-price cost of Claude Code sessions, from their transcripts.

  excalive usage ~/.claude/projects/<project>/<session>.jsonl
  excalive usage first=path/to/a.jsonl second=path/to/b.jsonl --total
  excalive usage ~/.claude/projects/<project>/       every .jsonl under it, subagents too

Each transcript is one row: model turns, tool calls, output tokens, cache
writes and reads, wall time (first to last record), active time (gaps
capped at --idle seconds, so a laptop asleep overnight does not count),
and cost at API list prices. A NAME=PATH argument names its row.

Costs are list prices per million tokens as of October 2026. A Claude
subscription bills differently, so treat the dollars as the size of the
work, not an invoice. Check https://claude.com/pricing before quoting them.
"""
import argparse, json, pathlib, sys, datetime as dt
from collections import Counter

# model: (input, output) $/MTok. Cache writes are 1.25x input (5 minute TTL)
# and 2x input (1 hour); cache reads 0.1x input unless READ overrides it.
PRICE = {
    'claude-fable-5-1': (10, 50), 'claude-mythos-5-1': (10, 50), 'claude-fable-5': (10, 50),
    'claude-opus-5-5': (4, 20), 'claude-opus-5': (5, 25), 'claude-opus-4-8': (5, 25),
    'claude-opus-4-7': (5, 25), 'claude-opus-4-6': (5, 25),
    'claude-sonnet-5-5': (2, 10), 'claude-sonnet-5': (2, 10), 'claude-sonnet-4-6': (3, 15),
    'claude-haiku-5-5': (0.10, 0.50), 'claude-haiku-4-5': (1, 5),
}
READ = {'claude-fable-5-1': 0.25, 'claude-mythos-5-1': 0.25, 'claude-opus-5-5': 0.20}


def price(model):
    model = (model or '').split('[')[0]
    if model not in PRICE:
        return None
    i, o = PRICE[model]
    return dict(inp=i, out=o, w5=1.25 * i, w1=2 * i, cr=READ.get(model, 0.1 * i))


def parse(path, idle):
    turns, tools, stamps = {}, 0, []
    for line in open(path, errors='replace'):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        if r.get('timestamp'):
            stamps.append(dt.datetime.fromisoformat(r['timestamp'].replace('Z', '+00:00')))
        m = r.get('message')
        if r.get('type') != 'assistant' or not isinstance(m, dict):
            continue
        if m.get('id') and m.get('usage'):
            turns[m['id']] = (m.get('model'), m['usage'])  # streamed records repeat an id; keep the last
        tools += sum(1 for c in m.get('content') or [] if isinstance(c, dict) and c.get('type') == 'tool_use')
    row, cost, unpriced = Counter(), 0.0, set()
    for model, u in turns.values():
        if model == '<synthetic>':
            continue
        cc = u.get('cache_creation') or {}
        tok = dict(inp=u.get('input_tokens') or 0, out=u.get('output_tokens') or 0,
                   cr=u.get('cache_read_input_tokens') or 0,
                   w5=cc.get('ephemeral_5m_input_tokens') or 0, w1=cc.get('ephemeral_1h_input_tokens') or 0)
        if not cc:  # no TTL breakdown recorded: count it at the 5 minute rate
            tok['w5'] = u.get('cache_creation_input_tokens') or 0
        row.update(tok)
        row['turns'] += 1
        p = price(model)
        if p:
            cost += sum(tok[k] * p[k] for k in p) / 1e6
        else:
            unpriced.add(model)
    stamps.sort()
    row['tools'] = tools
    row['wall'] = (stamps[-1] - stamps[0]).total_seconds() / 60 if stamps else 0
    row['active'] = sum(min((b - a).total_seconds(), idle) for a, b in zip(stamps, stamps[1:])) / 60
    return row, cost, unpriced


def targets(args):
    for a in args:
        name, _, p = a.partition('=') if '=' in a else ('', '', a)
        p = pathlib.Path(p).expanduser()
        if p.is_dir():
            for f in sorted(p.rglob('*.jsonl')):
                yield (name + '/' if name else '') + str(f.relative_to(p).with_suffix('')), f
        else:
            yield name or p.stem, p


def main():
    ap = argparse.ArgumentParser(prog='excalive usage', description=(__doc__ or '').split('\n')[0])
    ap.add_argument('paths', nargs='+', help='transcript .jsonl files or directories, optionally NAME=PATH')
    ap.add_argument('--idle', type=float, default=300, help='longest gap counted as active, seconds (300)')
    ap.add_argument('--total', action='store_true', help='add a total row')
    ap.add_argument('--json', action='store_true', help='print JSON instead of a table')
    a = ap.parse_args()
    rows, total, missing = [], Counter(), set()
    for name, path in targets(a.paths):
        row, cost, unpriced = parse(path, a.idle)
        row['cost'] = cost
        missing |= unpriced
        rows.append((name, row))
        total.update(row)
    if a.json:
        print(json.dumps({n: dict(r) for n, r in rows + ([('total', total)] if a.total else [])}, indent=1))
    else:
        w = max([len(n) for n, _ in rows] + [5])
        print(f"{'name':{w}} {'turns':>6} {'tools':>6} {'output':>10} {'cache write':>12} {'cache read':>13} {'wall m':>7} {'active m':>8} {'cost $':>8}")
        for n, r in rows + ([('total', total)] if a.total else []):
            print(f"{n:{w}} {r['turns']:>6} {r['tools']:>6} {r['out']:>10,} {r['w5'] + r['w1']:>12,} "
                  f"{r['cr']:>13,} {r['wall']:>7.1f} {r['active']:>8.1f} {r['cost']:>8.2f}")
    if missing:
        print('no price for ' + ', '.join(sorted(m or '?' for m in missing)) + '; their tokens cost 0 above', file=sys.stderr)


if __name__ == '__main__':
    main()
