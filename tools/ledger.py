#!/usr/bin/env python3
"""Refresh the generated table in 11-ingestion-ledger.md from app/scores/library.json:  python3 -I tools/ledger.py

The rest of that file (which books are done, partly done or untouched, and why pieces were skipped) is written by hand when a book is worked on."""
import collections, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(ROOT, '11-ingestion-ledger.md')
START, END = '<!-- library:start -->', '<!-- library:end -->'


def source_of(e):
    s = e.get('source', '')
    return re.sub(r',? p+\.? ?[\d–-]+.*$', '', s).strip() or 'unknown'


def table():
    lib = json.load(open(os.path.join(ROOT, 'app', 'scores', 'library.json'), encoding='utf8'))
    by = collections.OrderedDict()
    for e in sorted(lib, key=lambda e: (source_of(e), e['stage'])):
        by.setdefault(source_of(e), []).append(e)
    lines = ['| Source | Scores | Stages |', '|---|---|---|']
    for src, es in by.items():
        st = collections.Counter(e['stage'] for e in es)
        lines.append(f"| {src} | {len(es)} | " + ', '.join(f'{s}: {n}' for s, n in sorted(st.items())) + ' |')
    total = collections.Counter(e['stage'] for e in lib)
    lines.append(f"| **All imported scores** | **{len(lib)}** | " + ', '.join(f'{s}: {n}' for s, n in sorted(total.items())) + ' |')
    return '\n'.join(lines)


def main():
    text = open(LEDGER, encoding='utf8').read()
    a, b = text.index(START) + len(START), text.index(END)
    open(LEDGER, 'w', encoding='utf8').write(text[:a] + '\n' + table() + '\n' + text[b:])
    print('updated', LEDGER)


if __name__ == '__main__':
    main()
