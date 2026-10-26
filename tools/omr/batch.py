#!/usr/bin/env python3
"""Convert a list of pieces from a book (a JSON manifest) and, with --apply, add the good ones to the course library.

    .venv/bin/python batch.py batches/faber-1-units-2-3.json              # convert and report; nothing is added to the library
    .venv/bin/python batch.py batches/faber-1-units-2-3.json --apply      # also add every clean piece (importer: stage, source)
    .venv/bin/python batch.py batches/faber-1-units-2-3.json --only "Midnight Ride"

Manifest: {"pdf": "literacy/BOOK*.pdf", "source": "Book name", "pieces": [{"title", "composer", "piece": "38:3,39:1-4", "stage", "page": "book page", "fillRests": "upper-first", "hand": {"timeSig", "fifths", "rh", "lh"}, "patches": [{"bar": 9, "hand": "lh", "notes": "G3:w"}]}]}.
`piece` is a list of numbered systems (see scan.py). Converted files stay in work/staged; the library gets them through tools/import-scores.py,
so its checks (duplicates, irregular bars, composer list: textbook composers need --accept-unknown, which this passes) still apply.
Check each result in the app against the page before trusting it: the notes are read by a model, not typed by a person.
"""
import argparse, glob, json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdf2xml

STAGED = os.path.join(pdf2xml.WORK, 'staged')


def set_hands(title, hands):
    path = os.path.join(pdf2xml.ROOT, 'app', 'scores', 'library.json')
    with open(path, encoding='utf8') as f:
        entries = json.load(f)
    for e in entries:
        if e['title'] == title:
            e['hands'] = hands
    with open(path, 'w', encoding='utf8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('manifest')
    ap.add_argument('--apply', action='store_true', help='add clean pieces to the library')
    ap.add_argument('--only', help='just the piece with this title')
    ap.add_argument('--replace', action='store_true', help='with --apply: overwrite pieces that are already in the library (after fixing the conversion)')
    a = ap.parse_args()
    with open(a.manifest, encoding='utf8') as f:
        m = json.load(f)
    pdfs = glob.glob(os.path.join(pdf2xml.ROOT, m['pdf']))
    if len(pdfs) != 1:
        sys.exit(f"manifest pdf {m['pdf']!r} matches {len(pdfs)} files, need exactly 1")
    os.makedirs(STAGED, exist_ok=True)
    failed = 0
    for p in m['pieces']:
        if a.only and p['title'] != a.only:
            continue
        if p.get('skip') and not a.only:
            print(f"\n== {p['title']}: skipped ({p['skip']})")
            continue
        print(f"\n== {p['title']}  ({p['piece']})")
        if p.get('hand'):  # OMR could not read it: transcribed from the page (handfix.py); `piece` still says where it is
            r = pdf2xml.convert_hand(p['title'], p['composer'], p['hand'], out_dir=STAGED)[0]
        else:
            r = pdf2xml.convert_piece(pdfs[0], pdf2xml.parse_piece(p['piece']), p['title'], p['composer'], out_dir=STAGED, fill_rests=p.get('fillRests'), patches=p.get('patches'))[0]
        print(pdf2xml.describe(r))
        if not r['ok']:
            failed += 1
            continue
        src = f"{m['source']}, p. {p['page']}" if p.get('page') else m['source']
        cmd = ['python3', '-I', os.path.join(pdf2xml.ROOT, 'tools', 'import-scores.py'), r['file'],
               '--stage', str(p['stage']), '--source', src, '--accept-unknown'] + (['--apply'] if a.apply else []) + (['--replace'] if a.replace else [])
        out = subprocess.run(cmd, capture_output=True, text=True)
        print('   ' + '\n   '.join(l for l in out.stdout.strip().splitlines() if l.strip()))
        if a.apply and (r.get('bass_only') or p.get('hands')):  # a left-hand piece: the importer only sees "two staves" and says both hands
            set_hands(p['title'], p.get('hands', 'lh'))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
