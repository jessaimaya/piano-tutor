#!/usr/bin/env python3
"""Check, rate and file new MusicXML downloads into the course library.

    python3 -I tools/import-scores.py                       # report on ~/Downloads and app/scores/incoming (changes nothing)
    python3 -I tools/import-scores.py ~/Downloads/foo.mxl   # report on specific files, folders or .zip bundles
    python3 -I tools/import-scores.py --apply               # also copy files into app/scores/ and add them to library.json

Per file it reports: title/composer read from the file, measured difficulty and the stage it lands in, time signature and
key, bar count, irregular bars, and a verdict:
  NEW        will be added
  DUPLICATE  same id or same notes as a score already in the library: skipped, never overwritten (--replace to overwrite)
  REVIEW     composer not on the classical/neoclassical list (pop, film, game...): skipped unless --accept-unknown
  BROKEN     not readable, or too many bars that do not add up to the time signature
Only files that really are MusicXML scores are looked at, so a Downloads folder full of other .xml files is fine.

Options: --apply  --replace  --accept-unknown  --stage N (force a stage)  --source "text" (where they came from)
"""
import argparse, glob, hashlib, importlib.util, io, json, os, re, shutil, sys, unicodedata, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = os.path.join(ROOT, 'inbox')
SCORES = os.path.join(ROOT, 'app', 'scores')
MANIFEST = os.path.join(SCORES, 'library.json')

# Classical and neoclassical surnames the course accepts (project rule: no pop arrangements). Extend as the library grows.
ACCEPTED = set('''
bach beethoven mozart haydn chopin schumann schubert brahms liszt mendelssohn clementi czerny burgmuller beyer gurlitt
turk kuhlau diabelli duvernoy heller gedike bartok kabalevsky khachaturian prokofiev shostakovich tchaikovsky rachmaninoff
rachmaninov scriabin debussy ravel satie faure saint-saens grieg dvorak smetana janacek sibelius albeniz granados
de falla scarlatti handel purcell couperin rameau pachelbel vivaldi telemann boccherini paganini field gounod bizet
offenbach delibes massenet fauchard petzold stamitz hook arne attwood reinecke lemoine concone wohlfahrt ketterer
einaudi richter glass part arvo kilar nyman jarvis frahm arnalds nils olafur max philip michael-nyman
joplin gottschalk elgar holst vaughan britten copland gershwin ives barber
trad traditional anonymous folk unknown
'''.split())

DEFAULT_BPM = {3: 72, 4: 66, 5: 80, 6: 92}


def _load_difficulty():
    spec = importlib.util.spec_from_file_location('score_difficulty', os.path.join(ROOT, 'tools', 'score-difficulty.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SD = _load_difficulty()


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s)).strip('-')


def read_zip_xml(data):
    """XML bytes inside a compressed .mxl."""
    z = zipfile.ZipFile(io.BytesIO(data))
    root = None
    if 'META-INF/container.xml' in z.namelist():
        m = re.search(r'full-path="([^"]+)"', z.read('META-INF/container.xml').decode('utf8', 'replace'))
        root = m and m.group(1)
    if not root:
        root = next(n for n in z.namelist() if not n.startswith('META-INF') and n.lower().endswith(('.xml', '.musicxml')))
    return z.read(root)


def candidates(paths):
    """Yield (label, original_bytes, ext, xml_bytes, source_path) for every score-looking file; unpack .zip bundles."""
    for p in paths:
        if os.path.isdir(p):
            found = []
            for ext in ('mxl', 'musicxml', 'xml', 'zip'):
                found += glob.glob(os.path.join(p, f'*.{ext}'))
            yield from candidates(sorted(found))
            continue
        ext = os.path.splitext(p)[1].lower().lstrip('.')
        try:
            data = open(p, 'rb').read()
            if ext == 'zip':
                z = zipfile.ZipFile(io.BytesIO(data))
                for n in z.namelist():
                    e = os.path.splitext(n)[1].lower().lstrip('.')
                    if e in ('mxl', 'musicxml', 'xml') and not n.startswith(('META-INF', '__MACOSX')) and not n.endswith('/'):
                        yield from candidates_from_bytes(f'{os.path.basename(p)}:{n}', z.read(n), e, p)
            else:
                yield from candidates_from_bytes(os.path.basename(p), data, ext, p)
        except Exception as e:  # unreadable archive etc.
            yield (os.path.basename(p), None, ext, f'unreadable: {e}', p)


def candidates_from_bytes(label, data, ext, src):
    try:
        xml = read_zip_xml(data) if (ext == 'mxl' or data[:2] == b'PK') else data
        if b'<score-partwise' not in xml[:4000] and b'<score-partwise' not in xml:
            return  # some other XML file: ignore silently
        yield (label, data, 'mxl' if (ext == 'mxl' or data[:2] == b'PK') else 'musicxml', xml, src)
    except Exception as e:
        yield (label, None, ext, f'unreadable: {e}', src)


def irregular_bars(root):
    """Count bars (not the first or last) where a voice does not fill the time signature."""
    bad = total = 0
    part = root.find('part')
    if part is None:
        return 0, 0
    div, beats, bt = 1, 4, 4
    measures = part.findall('measure')
    for i, m in enumerate(measures):
        voices = {}
        for el in m:
            if el.tag == 'attributes':
                if el.findtext('divisions'): div = int(el.findtext('divisions'))
                t = el.find('time')
                if t is not None and (t.findtext('beats') or '').isdigit():
                    beats, bt = int(t.findtext('beats')), int(t.findtext('beat-type'))
            elif el.tag == 'note' and el.find('chord') is None and el.find('grace') is None:
                key = (el.findtext('staff'), el.findtext('voice'))
                voices[key] = voices.get(key, 0) + int(el.findtext('duration') or 0)
            elif el.tag == 'forward':
                key = ('f', el.findtext('voice'))
                voices[key] = voices.get(key, 0) + int(el.findtext('duration') or 0)
        if 0 < i < len(measures) - 1:
            total += 1
            expected = div * 4 * beats / bt
            if voices and max(voices.values()) != expected:
                bad += 1
    return bad, total


def key_name(fifths, minor=False):
    major = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯']
    flats = ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭']
    return (major[fifths] if fifths >= 0 else flats[-fifths])


def describe(label, original, ext, xml):
    root = ET.fromstring(xml)
    SD.load = lambda _f, _r=root: _r
    v = SD.analyze(label)
    raw_title = (root.findtext('.//work-title') or root.findtext('.//movement-title') or '').strip()
    title = raw_title or os.path.splitext(label.split(':')[-1])[0].replace('-', ' ').replace('_', ' ').title()
    comp = next((c.text for c in root.findall('.//creator') if c.get('type') == 'composer' and c.text), '')
    comp = re.sub(r'\s*[\(\[].*$', '', comp).strip() or 'Unknown'
    parts = len(root.findall('part'))
    staves = int(root.findtext('.//attributes/staves') or 1)
    s = SD.score(v)
    beats, bt = (int(x) for x in v['ts'].split('/')) if v['ts'].replace('/', '').isdigit() else (4, 4)
    bad, total = irregular_bars(root)
    return dict(label=label, original=original, ext=ext, xml=xml, title=title, composer=comp, parts=parts, staves=staves,
                v=v, score=s, stage=SD.stage(s), beats=beats, bt=bt, bad=bad, total=total,
                sig=hashlib.sha1(f"{v['bars']}|{v['notes']}|{v['range']}|{v['fifths']}".encode()).hexdigest(),
                tempo=v['tempo'])


def surname(composer):
    parts = [p for p in re.split(r'[\s,]+', slug(composer).replace('-', ' ')) if p]
    return parts[-1] if parts else ''


def accepted(composer):
    names = set(slug(composer).replace('-', ' ').split())
    return bool(names & ACCEPTED) or slug(composer) in ACCEPTED


def library_index():
    entries = json.load(open(MANIFEST, encoding='utf8')) if os.path.exists(MANIFEST) else []
    sigs = {}
    for e in entries:
        f = os.path.join(SCORES, e['file'])
        if not os.path.exists(f):
            continue
        try:
            data = open(f, 'rb').read()
            xml = read_zip_xml(data) if (f.endswith('.mxl') or data[:2] == b'PK') else data
            d = describe(e['file'], data, 'mxl', xml)
            sigs[d['sig']] = e['id']
        except Exception:
            pass
    return entries, sigs


def skills_for(d):
    v, out = d['v'], []
    if d['beats'] != 4 or d['bt'] != 4:
        out.append(f"{d['beats']}/{d['bt']}")
    if v['fifths']:
        out.append(f"{key_name(v['fifths'])}-key-sig")
    if v['acc_share'] > 0.12:
        out.append('accidentals')
    if v['maxchord'] >= 3:
        out.append('chords')
    if v['shortest'] and v['shortest'] <= 0.25:
        out.append('fast-notes')
    if v['bars'] >= 64:
        out.append('long-form')
    return out or ['reading']


def beat_quarters(beats, bt):
    """Length of the beat in quarter notes, as in app/src/practice/meter.ts (dotted quarter in 6/8, 9/8, 12/8)."""
    compound = beats > 3 and beats % 3 == 0 and bt >= 8
    return 1 if bt < 4 else (12 if compound else 4) / bt


def entry_for(d, ident, filename, stage, source):
    q = beat_quarters(d['beats'], d['bt'])
    # The file's tempo mark is quarter notes per minute; the app's tempo counts the piece's own beat.
    bpm = max(20, int(round((d['tempo'] / q) if d['tempo'] else DEFAULT_BPM.get(stage, 72) / q)))
    notes = []
    if q != 1:
        notes.append(f"{d['beats']}/{d['bt']}: the beat is a {'dotted quarter' if q == 1.5 else 'eighth' if q == 0.5 else f'{q}-quarter'} note")
    if d['bad']:
        notes.append(f"{d['bad']} bars do not add up to the time signature: check how it renders")
    e = dict(id=ident, file=filename, title=d['title'], composer=d['composer'], stage=stage, skills=skills_for(d),
             targetBpm=bpm, hands='both' if d['staves'] >= 2 else 'rh', license='unverified-arrangement', source=source,
             difficulty=d['score'])
    if notes:
        e['notes'] = '; '.join(notes)
    return e


def file_inbox(verdicts, apply):
    """Move processed inbox files: all-NEW -> inbox/done, anything else -> inbox/held. Other file types are listed and left alone."""
    for name in sorted(os.listdir(INBOX)):
        full = os.path.join(INBOX, name)
        if os.path.isfile(full) and full not in verdicts and not name.startswith('.') and name != 'README.md':
            print(f'SKIPPED    {name}: not MusicXML (PDF? convert or download the .mxl/.musicxml version); left in inbox')
    if not apply:
        return
    for src, vs in verdicts.items():
        if os.path.dirname(os.path.abspath(src)) != INBOX:
            continue
        dest = 'done' if all(v == 'NEW' for v, _ in vs) else 'held'
        os.makedirs(os.path.join(INBOX, dest), exist_ok=True)
        shutil.move(src, os.path.join(INBOX, dest, os.path.basename(src)))
        why = '' if dest == 'done' else ' (' + ', '.join(sorted({v for v, _ in vs if v != 'NEW'})) + ')'
        print(f'FILED      {os.path.basename(src)} -> inbox/{dest}{why}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('paths', nargs='*')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--replace', action='store_true')
    ap.add_argument('--accept-unknown', action='store_true')
    ap.add_argument('--stage', type=int)
    ap.add_argument('--source', default='user download')
    ap.add_argument('--inbox', action='store_true', help='process ./inbox and, with --apply, file each result into inbox/done or inbox/held')
    a = ap.parse_args()
    if a.inbox:
        os.makedirs(INBOX, exist_ok=True)
        a.paths = a.paths or [INBOX]
    paths = a.paths or [os.path.expanduser('~/Downloads'), os.path.join(SCORES, 'incoming')]
    paths = [p for p in paths if os.path.exists(p)]
    verdicts = {}  # source path -> list of (verdict, label)

    def note(src, verdict, label):
        verdicts.setdefault(src, []).append((verdict, label))

    entries, sigs = library_index()
    ids = {e['id']: e for e in entries}
    added = 0
    seen_sigs = set()
    found = 0
    for label, original, ext, xml, src in candidates(paths):
        found += 1
        if original is None:
            print(f'BROKEN     {label}: {xml}')
            note(src, 'BROKEN', label)
            continue
        try:
            d = describe(label, original, ext, xml)
        except Exception as e:
            print(f'BROKEN     {label}: {e}')
            note(src, 'BROKEN', label)
            continue
        stage = a.stage or d['stage']
        bare_title = re.sub(r'\bno\.?\s*', '', d['title'], flags=re.I)
        ident = 'x-' + slug(surname(d['composer'])) + '-' + slug(bare_title)
        fname = ident[2:] + '.' + d['ext']
        v = d['v']
        facts = (f"{d['title'][:34]!r} by {d['composer'][:22]!r}  {v['ts']} key{v['fifths']:+d} bars{v['bars']} "
                 f"score {d['score']} -> stage {stage}" + (f"  tempo {int(d['tempo'])}" if d['tempo'] else ''))
        extra = []
        if d['bad'] > max(2, d['total'] // 10):
            print(f"BROKEN     {label}: {facts}\n           {d['bad']} of {d['total']} inner bars do not fill the time signature")
            note(src, 'BROKEN', label)
            continue
        if d['bad']:
            extra.append(f"{d['bad']} irregular bars")
        if d['parts'] > 1:
            extra.append(f"{d['parts']} parts (only the first is rated)")
        dup = ident if ident in ids else sigs.get(d['sig'])
        if (dup or d['sig'] in seen_sigs) and not a.replace:
            print(f'DUPLICATE  {label}: {facts}\n           already in the library as {dup or "another file in this batch"}; skipped')
            note(src, 'DUPLICATE', label)
            continue
        if not accepted(d['composer']) and not a.accept_unknown:
            print(f"REVIEW     {label}: {facts}\n           composer {d['composer']!r} is not on the classical/neoclassical list "
                  f"(project rule: no pop). Re-run with --accept-unknown, or add the name to ACCEPTED in this script.")
            note(src, 'REVIEW', label)
            continue
        seen_sigs.add(d['sig'])
        note(src, 'NEW', label)
        print(f"NEW        {label}: {facts}" + (f"  [{'; '.join(extra)}]" if extra else ''))
        if a.apply:
            os.makedirs(SCORES, exist_ok=True)
            with open(os.path.join(SCORES, fname), 'wb') as f:
                f.write(d['original'])
            new = entry_for(d, ident, fname, stage, a.source)
            entries = [e for e in entries if e['id'] != ident] + [new]
            added += 1
    if not found:
        print('No MusicXML files found in: ' + ', '.join(paths))
    if a.apply and added:
        entries.sort(key=lambda e: (e['stage'], e.get('difficulty', 0), e['id']))
        with open(MANIFEST, 'w', encoding='utf8') as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'\nAdded {added} score(s) to app/scores/library.json ({len(entries)} total). Check the notes/targetBpm in the app after playing.')
    elif not a.apply:
        print('\nDry run: nothing changed. Re-run with --apply to add the NEW ones.')
    if a.inbox:
        file_inbox(verdicts, a.apply)


if __name__ == '__main__':
    main()
