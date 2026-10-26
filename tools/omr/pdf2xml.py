#!/usr/bin/env python3
"""Turn pages of a PDF into MusicXML files the course can import (OMR with homr).

    .venv/bin/python pdf2xml.py BOOK.pdf --pages 8 --title "Dancing" --composer "Paul Harris"
    .venv/bin/python pdf2xml.py BOOK.pdf --pages 40 --crop 0,0.55,1,0.78 --title "Midnight Ride" --composer "Faber"

Per page: render at --dpi (300 is what homr wants), optionally crop to one piece, run homr, stamp the title and composer, then check
every bar adds up to its time signature (the same check the importer uses). A file whose bars all add up goes to ../../inbox/, ready
for ./ingest.sh. One with irregular bars goes to ./review/ instead, to be fixed in MuseScore (or re-cropped) before it is imported.

homr reads pitch and rhythm only: no dynamics, slurs, fingering or tempo marks. Read those from the page.
A page with several pieces on it comes out as ONE score (their bars run on): use --crop with one piece's area per run.
--crop is x0,y0,x1,y1 as fractions of the page, from the top left, e.g. 0,0.5,1,0.75 = the full width of the third quarter.

Better than --crop: pick a piece by its numbered systems (see scan.py), even across pages. They are cut out and stacked into one image:

    .venv/bin/python pdf2xml.py BOOK.pdf --piece 38:3,39:1-4 --title "Russian Folk Song" --composer Traditional
"""
import argparse, importlib.util, os, re, subprocess, sys, time, unicodedata
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
INBOX = os.path.join(ROOT, 'inbox')
REVIEW = os.path.join(HERE, 'review')
WORK = os.path.join(HERE, 'work')
HOMR = os.path.join(os.path.dirname(sys.executable), 'homr')
sys.path.insert(0, HERE)  # scan.py sits beside this file


def parse_pages(spec):
    """'8', '8-10' or '8,10-12' -> [8, 10, 11, 12]."""
    pages = []
    for part in spec.split(','):
        a, _, b = part.strip().partition('-')
        lo, hi = int(a), int(b or a)
        if lo < 1 or hi < lo:
            raise ValueError(f'bad page range {part!r}')
        pages += range(lo, hi + 1)
    return pages


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'score'


def parse_piece(spec):
    """'38:3,39:1-4' -> [(38, [3]), (39, [1, 2, 3, 4])]: system numbers as scan.py shows them, page by page.
    An element with a decimal point is a strip of the page instead, y0-y1 as fractions of its height (the escape hatch for a system the
    detector misses): '74:3+0.775-0.925' is system 3 and then that strip, e.g. 'Morning' on page 74."""
    out = []
    for part in spec.split(','):
        page, _, systems = part.strip().partition(':')
        if not systems:
            raise ValueError(f'bad piece part {part!r}: use PAGE:SYSTEMS, e.g. 38:3 or 39:1-4')
        items = []
        for r in systems.split('+'):
            if '.' in r:
                y0, _, y1 = r.partition('-')
                items.append((float(y0), float(y1)))
            else:
                a, _, b = r.partition('-')
                items += range(int(a), int(b or a) + 1)
        out.append((int(page), items))
    return out


def stitch(pdf, parts, dpi, work, name):
    """Cut the chosen systems out of their pages and stack them, in order, into one image for homr."""
    import cv2
    import numpy as np
    import scan
    strips = []
    for page, nums in parts:
        png = render(pdf, page, dpi, work)
        systems = scan.detect_systems(png)
        img = cv2.imread(png)
        for n in nums:
            if isinstance(n, tuple):  # a strip given as fractions of the page height
                h, w = img.shape[:2]
                strips.append(img[int(n[0] * h):int(n[1] * h), int(0.02 * w):int(0.98 * w)])
                continue
            if not 1 <= n <= len(systems):
                raise ValueError(f'page {page} has {len(systems)} system(s) (run scan.py to see them), not {n}')
            y0, y1, x0, x1 = systems[n - 1]
            strips.append(img[y0:y1, x0:x1])
    width = max(s.shape[1] for s in strips)
    gap = np.full((40, width, 3), 255, np.uint8)
    rows = []
    for s in strips:
        pad = np.full((s.shape[0], width - s.shape[1], 3), 255, np.uint8)
        rows += [np.hstack([s, pad]), gap]
    out = os.path.join(work, f'piece-{name}.png')
    cv2.imwrite(out, np.vstack(rows[:-1]))
    return out


def render(pdf, page, dpi, work):
    prefix = os.path.join(work, f'p{page:03d}')
    subprocess.run(['pdftoppm', '-r', str(dpi), '-f', str(page), '-l', str(page), '-png', '-singlefile', pdf, prefix], check=True)
    return prefix + '.png'


def crop(png, box):
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    x0, y0, x1, y1 = box
    im = Image.open(png)
    w, h = im.size
    out = png[:-4] + '-crop.png'
    im.crop((round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h))).save(out)
    return out


def run_homr(png):
    """homr writes <image>.musicxml (and a _teaser.png with what it found, for a visual check) next to the image."""
    env = dict(os.environ, PYTHONWARNINGS='ignore')
    p = subprocess.run([HOMR, png], capture_output=True, text=True, env=env)
    out = png[:-4] + '.musicxml'
    if not os.path.exists(out):
        tail = '\n'.join((p.stdout + p.stderr).strip().splitlines()[-6:])
        raise RuntimeError(f'homr produced no MusicXML for {os.path.basename(png)}:\n{tail}')
    return out


def stamp(root, title, composer):
    """Put the title and composer where the importer and the app look for them."""
    for old in root.findall('work'):
        root.remove(old)
    work = ET.Element('work')
    ET.SubElement(work, 'work-title').text = title
    root.insert(0, work)
    ident = root.find('identification')
    if ident is None:
        ident = ET.Element('identification')
        later = [i for i, el in enumerate(root) if el.tag in ('defaults', 'credit', 'part-list')]
        root.insert(later[0] if later else len(root), ident)
    for c in ident.findall('creator'):
        ident.remove(c)
    creator = ET.Element('creator', {'type': 'composer'})
    creator.text = composer
    ident.insert(0, creator)


_REST_TYPES = {0.5: ('eighth', 0), 1: ('quarter', 0), 1.5: ('quarter', 1), 2: ('half', 0), 3: ('half', 1), 4: ('whole', 0)}


def _rest(duration, divisions, voice, staff, measure_rest=False):
    n = ET.Element('note')
    ET.SubElement(n, 'rest', {'measure': 'yes'} if measure_rest else {})
    ET.SubElement(n, 'duration').text = str(duration)
    ET.SubElement(n, 'voice').text = str(voice)
    kind = _REST_TYPES.get(duration / divisions)
    if kind and not measure_rest:
        ET.SubElement(n, 'type').text = kind[0]
        for _ in range(kind[1]):
            ET.SubElement(n, 'dot')
    ET.SubElement(n, 'staff').text = str(staff)
    return n


def strip_marks(root):
    """homr sometimes invents fermatas, trills and arpeggio squiggles from slurs and accents, and it never reads real ornaments reliably:
    drop them all, so the page never shows a mark the book does not have. Returns how many were removed."""
    n = 0
    for note in root.iter('note'):
        for notations in note.findall('notations'):
            for tag in ('fermata', 'ornaments', 'arpeggiate', 'non-arpeggiate'):
                for el in notations.findall(tag):
                    notations.remove(el)
                    n += 1
            for tech in notations.findall('technical'):
                for el in tech.findall('tremolo'):
                    tech.remove(el)
            if len(notations) == 0:
                note.remove(notations)
    return n


def canonicalize(root):
    """homr writes each bar's notes in time order and hops between staves and voices with <backup>/<forward>. Rewrite every bar as one run
    per staff and voice, each starting at the bar line (a gap before a run becomes a rest), so fill_rests and patch_bars can replace or add
    notes without breaking the timing. The notes keep the onsets homr gave them. Returns the number of bars that were interleaved."""
    changed = 0
    for part in root.findall('part'):
        div = int(part.findtext('.//attributes/divisions') or 1)
        for m in part.findall('measure'):
            kids = list(m)
            first = next((i for i, k in enumerate(kids) if k.tag in ('note', 'backup', 'forward')), None)
            if first is None:
                continue
            last = max(i for i, k in enumerate(kids) if k.tag in ('note', 'backup', 'forward'))
            pre, post = kids[:first], kids[last + 1:]
            cur, key, streams, hops = 0, None, {}, 0
            for k in kids[first:last + 1]:
                if k.tag == 'note':
                    if k.find('chord') is None:
                        key = (k.findtext('staff', '1'), k.findtext('voice', '1'))
                        streams.setdefault(key, []).append((cur, [k]))
                        if k.find('grace') is None:
                            cur += int(k.findtext('duration') or 0)
                    else:
                        streams[key][-1][1].append(k)
                elif k.tag == 'backup':
                    cur -= int(k.findtext('duration') or 0)
                    hops += 1
                elif k.tag == 'forward':
                    cur += int(k.findtext('duration') or 0)
                    hops += 1
            if hops == 0 and len(streams) == 1:
                continue
            changed += 1
            body = []
            for (staff, voice), items in streams.items():
                end = 0
                for onset, notes in items:
                    if onset > end:
                        body.append(_rest(onset - end, div, voice, staff))
                        end = onset
                    body.extend(notes)
                    end += 0 if notes[0].find('grace') is not None else int(notes[0].findtext('duration') or 0)
                body.append(('backup', end))
            for el in kids:
                m.remove(el)
            for el in pre:
                m.append(el)
            for i, item in enumerate(body):
                if isinstance(item, tuple):
                    if i < len(body) - 1:
                        b = ET.Element('backup')
                        ET.SubElement(b, 'duration').text = str(item[1])
                        m.append(b)
                else:
                    m.append(item)
            for el in post:
                m.append(el)
    return changed


def restream(root):
    """Last step before a file is written: give every bar fresh <backup>s so each staff and voice starts on the bar line. After
    canonicalize, fill_rests, grand_staff and patch_bars each bar is one run per staff and voice, and rests added for an empty staff were
    appended with no backup, which would start them after the bar line. Ignores whatever backups are there."""
    for part in root.findall('part'):
        for m in part.findall('measure'):
            kids = list(m)
            idx = [i for i, k in enumerate(kids) if k.tag in ('note', 'backup', 'forward')]
            if not idx:
                continue
            pre, post = kids[:idx[0]], kids[idx[-1] + 1:]
            streams, key = {}, None
            for k in kids[idx[0]:idx[-1] + 1]:
                if k.tag != 'note':
                    continue
                if k.find('chord') is None:
                    key = (k.findtext('staff', '1'), k.findtext('voice', '1'))
                streams.setdefault(key, []).append(k)
            for el in kids:
                m.remove(el)
            for el in pre:
                m.append(el)
            runs = list(streams.values())
            for n, run in enumerate(runs):
                for note in run:
                    m.append(note)
                if n < len(runs) - 1:
                    b = ET.Element('backup')
                    ET.SubElement(b, 'duration').text = str(sum(int(x.findtext('duration') or 0) for x in run if x.find('chord') is None and x.find('grace') is None))
                    m.append(b)
            for el in post:
                m.append(el)


def fill_rests(root, order):
    """Faber and other method books print no rests for the hand that is silent. homr then writes bars that are short, and the hand that
    comes in late would play at the start of the bar. Two cases are safe to repair without knowing where the notes sit on the page:
      * a staff with no notes in a bar gets a whole-bar rest;
      * the hands take turns and their notes together fill the bar exactly: the one that plays first gets a rest after its notes,
        the other a rest before. Which plays first cannot be read from the file, so `order` says: 'upper-first' or 'lower-first'.
    Anything else is left alone (and then fails the bar check, which is right: it is a misread). Returns the bars changed."""
    changed = 0
    for part in root.findall('part'):
        div, bar = 1, None
        staves = int(part.findtext('.//attributes/staves') or 1)
        voices = {}
        for n in part.iter('note'):
            voices.setdefault(n.findtext('staff', '1'), n.findtext('voice', '1'))
        for m in part.findall('measure'):
            d = m.findtext('attributes/divisions')
            div = int(d) if d else div
            b, bt = m.findtext('attributes/time/beats'), m.findtext('attributes/time/beat-type')
            if b and bt:
                bar = div * 4 * int(b) // int(bt)
            if not bar or staves < 2:
                continue
            notes = {str(s): [n for n in m.findall('note') if n.findtext('staff', '1') == str(s)] for s in (1, 2)}
            dur = {s: sum(int(n.findtext('duration')) for n in ns if n.find('chord') is None) for s, ns in notes.items()}
            if not dur['1'] and not dur['2']:
                continue
            for s in ('1', '2'):
                if not notes[s] and s in voices:
                    m.append(_rest(bar, div, voices[s], s, measure_rest=True))
                    changed += 1
            if order and dur['1'] and dur['2'] and dur['1'] + dur['2'] == bar and len(voices) == 2:
                first, second = ('1', '2') if order == 'upper-first' else ('2', '1')
                m.insert(list(m).index(notes[first][-1]) + 1, _rest(dur[second], div, voices[first], first))
                m.insert(list(m).index(notes[second][0]), _rest(dur[first], div, voices[second], second))
                changed += 1
    return changed


def grand_staff(root):
    """A piece written on one bass-clef staff becomes a grand staff with an empty treble staff above (rests), the way the book prints
    its own left-hand pieces, so the app's Left button and hand filter work. Returns True when it changed the file."""
    part = root.find('part')
    if part.findtext('.//attributes/staves') or part.findtext('.//attributes/clef/sign') != 'F':
        return False
    first = part.find('measure/attributes')
    div = int(part.findtext('.//attributes/divisions') or 1)
    b, bt = part.findtext('.//attributes/time/beats'), part.findtext('.//attributes/time/beat-type')
    bar = div * 4 * int(b) // int(bt)
    # attributes: two staves, treble on 1, bass on 2
    attrs = [a for a in part.find('measure').findall('attributes')]
    clef_holder = next(a for a in attrs if a.find('clef') is not None)
    old = clef_holder.find('clef')
    at = list(clef_holder).index(old)
    clef_holder.remove(old)
    st = ET.Element('staves')
    st.text = '2'
    attrs[0].append(st)
    for num, sign, line in (('1', 'G', '2'), ('2', 'F', '4')):
        c = ET.Element('clef', {'number': num})
        ET.SubElement(c, 'sign').text = sign
        ET.SubElement(c, 'line').text = line
        clef_holder.insert(at, c)
        at += 1
    for m in part.findall('measure'):
        notes = m.findall('note')
        for n in notes:
            sf = n.find('staff')
            if sf is None:
                sf = ET.SubElement(n, 'staff')
            sf.text = '2'
            v = n.find('voice')
            if v is not None:
                v.text = '5'
        idx = list(m).index(notes[0]) if notes else len(m)
        total = sum(int(n.findtext('duration')) for n in notes if n.find('chord') is None)
        r = _rest(min(bar, total) if total < bar else bar, div, 1, 1, measure_rest=True)
        m.insert(idx, r)
    return True


def normalize_measure_rests(root):
    """homr writes a whole-bar rest as a whole rest of 4 beats even in 3/4 or 2/4. A rest that is alone in its staff and voice for the bar
    is a whole-bar rest: give it the length of the bar."""
    part = root.find('part')
    div = int(part.findtext('.//attributes/divisions') or 1)
    b, bt = int(part.findtext('.//attributes/time/beats')), int(part.findtext('.//attributes/time/beat-type'))
    bar = div * 4 * b // bt
    changed = 0
    measures = part.findall('measure')
    for m in measures:
        groups = {}
        for n in m.findall('note'):
            groups.setdefault((n.findtext('staff', '1'), n.findtext('voice', '1')), []).append(n)
        for notes in groups.values():
            lone = notes[0] if len(notes) == 1 else None
            # a whole rest (or a measure rest) fills the bar; a quarter rest alone in a pickup bar is only what it says
            if lone is not None and lone.find('rest') is not None and lone.findtext('type') in (None, 'whole') and int(lone.findtext('duration')) != bar:
                notes[0].find('duration').text = str(bar)
                changed += 1
    return changed


def patch_bars(root, patches):
    """Replace one hand's notes in single bars with typed ones (handfix notation), for a misread bar in an otherwise good conversion:
    [{"bar": 9, "hand": "lh", "notes": "G3:w"}]. Bars are counted from 1; `hand` is rh (treble staff) or lh (bass staff)."""
    import handfix
    part = root.find('part')
    div = int(part.findtext('.//attributes/divisions') or 1)
    voices = {}
    for n in part.iter('note'):
        voices.setdefault(n.findtext('staff', '1'), n.findtext('voice', '1'))
    measures = {m.get('number'): m for m in part.findall('measure')}
    for p in patches:
        m = measures.get(str(p['bar']))
        if m is None:
            raise ValueError(f"patch: no bar {p['bar']}")
        staff = '1' if p['hand'] == 'rh' else '2'
        old = [n for n in m.findall('note') if n.findtext('staff', '1') == staff]
        new = handfix.bar_notes(p['notes'], staff, voices.get(staff, '1' if staff == '1' else '5'), div)
        at = list(m).index(old[0]) if old else (list(m).index(next(n for n in m.findall('note') if n.findtext('staff', '1') == '2')) if staff == '1' and any(n.findtext('staff', '1') == '2' for n in m.findall('note')) else len(m))
        for n in old:
            m.remove(n)
        for k, n in enumerate(new):
            m.insert(min(at + k, len(m)), n)


def _importer():
    spec = importlib.util.spec_from_file_location('import_scores', os.path.join(ROOT, 'tools', 'import-scores.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _edge_bars(root):
    """Irregular first/last bars: the importer's check skips them (pickup bars), so a misread there would pass. A short first bar is fine
    only when the last bar is short too and the two together make one bar."""
    part = root.find('part')
    ms = part.findall('measure')
    if len(ms) < 2:
        return 0
    div, bar = 1, None
    sums = []
    for m in (ms[0], ms[-1]):
        d = m.findtext('attributes/divisions') or (part.findtext('.//attributes/divisions'))
        div = int(d) if d else div
        b, bt = part.findtext('.//attributes/time/beats'), part.findtext('.//attributes/time/beat-type')
        bar = div * 4 * int(b) // int(bt)
        per = {}
        for n in m.findall('note'):
            if n.find('chord') is None and n.find('grace') is None:
                k = (n.findtext('staff', '1'), n.findtext('voice', '1'))
                per[k] = per.get(k, 0) + int(n.findtext('duration') or 0)
        sums.append(max(per.values()) if per else 0)
    first, last = sums
    if first == bar and last == bar:
        return 0
    if first < bar and last < bar and first + last == bar:
        return 0
    return (first != bar) + (last != bar)


def _overruns(root):
    """Bars where a staff's notes, placed by simulating <backup>, run past the bar line (or start before it): timing the app would play wrongly."""
    part = root.find('part')
    div = int(part.findtext('.//attributes/divisions') or 1)
    bad = 0
    for m in part.findall('measure'):
        b, bt = part.findtext('.//attributes/time/beats'), part.findtext('.//attributes/time/beat-type')
        bar = div * 4 * int(b) // int(bt)
        cur, lo, hi = 0, 0, {}
        for el in m:
            if el.tag == 'backup':
                cur -= int(el.findtext('duration') or 0)
            elif el.tag == 'forward':
                cur += int(el.findtext('duration') or 0)
            elif el.tag == 'note':
                if el.find('chord') is None and el.find('grace') is None:
                    lo = min(lo, cur)
                    cur += int(el.findtext('duration') or 0)
                    key = (el.findtext('staff', '1'), el.findtext('voice', '1'))
                    hi[key] = max(hi.get(key, 0), cur)
        if lo < 0 or any(v > bar for v in hi.values()):
            bad += 1
    return bad


def check(root):
    """(irregular bars, bars checked, notes, staves): the importer's own bar check plus the first and last bar, so 'passes here' means 'passes there'."""
    bad, total = _importer().irregular_bars(root)
    bad += _edge_bars(root) + _overruns(root)
    total += 2
    notes = sum(1 for n in root.iter('note') if n.find('rest') is None)
    staves = int(root.findtext('.//attributes/staves') or 1)
    return bad, total, notes, staves


def _process(img, label, dest_name, out_dir, review_dir, t0, fill=None, patches=None):
    """homr on one image, stamp, check, file. Returns the result dict (without 'page')."""
    xml_path = run_homr(img)
    tree = ET.parse(xml_path)
    root = tree.getroot()
    stamp(root, label[0], label[1])
    strip_marks(root)
    canonicalize(root)
    if patches:
        patch_bars(root, patches)
    normalize_measure_rests(root)
    filled = fill_rests(root, fill)  # empty staves always get a whole-bar rest; `fill` says which hand leads when the hands take turns
    bass_only = grand_staff(root)
    restream(root)
    bad, total, notes, staves = check(root)
    if notes == 0:
        raise RuntimeError('no notes found: wrong page, or the crop misses the music')
    clean = bad == 0
    dest = os.path.join(out_dir if clean else review_dir, dest_name + '.musicxml')
    ET.indent(tree, space=' ')
    tree.write(dest, encoding='utf-8', xml_declaration=True)
    return dict(ok=clean, file=dest, bars=total, irregular=bad, notes=notes, staves=staves, rests_filled=filled, bass_only=bass_only,
                check_image=img[:-4] + '_teaser.png', seconds=round(time.time() - t0))


def _setup(pdf, out_dir, review_dir):
    pdf = os.path.abspath(os.path.expanduser(pdf))
    if not os.path.isfile(pdf):
        raise FileNotFoundError(pdf)
    if not os.path.exists(HOMR):
        raise RuntimeError(f'homr not found at {HOMR}: run tools/omr/setup.sh and use .venv/bin/python')
    out_dir, review_dir = out_dir or INBOX, review_dir or REVIEW
    work = os.path.join(WORK, slug(os.path.splitext(os.path.basename(pdf))[0])[:40])
    for d in (work, out_dir, review_dir):
        os.makedirs(d, exist_ok=True)
    return pdf, work, out_dir, review_dir


def convert_hand(title, composer, hand, name=None, out_dir=None, review_dir=None):
    """A piece typed in by hand from the page (see handfix.py), through the same stamp, check and filing as the OMR results."""
    import handfix
    t0 = time.time()
    res = dict(page='by hand', ok=False)
    try:
        out_dir, review_dir = out_dir or INBOX, review_dir or REVIEW
        for d in (out_dir, review_dir):
            os.makedirs(d, exist_ok=True)
        root = handfix.build(hand)
        stamp(root, title, composer)
        bad, total, notes, staves = check(root)
        dest = os.path.join(out_dir if bad == 0 else review_dir, (name or slug(title)) + '.musicxml')
        tree = ET.ElementTree(root)
        ET.indent(tree, space=' ')
        tree.write(dest, encoding='utf-8', xml_declaration=True)
        res.update(ok=bad == 0, file=dest, bars=total, irregular=bad, notes=notes, staves=staves, check_image=None, seconds=round(time.time() - t0))
    except Exception as e:
        res.update(error=str(e), seconds=round(time.time() - t0))
    return [res]


def convert(pdf, pages, title, composer, dpi=300, box=None, name=None, out_dir=None, review_dir=None):
    """Convert whole pages (or one crop of each) of a PDF; one result dict per page (a bad page never stops the rest)."""
    pdf, work, out_dir, review_dir = _setup(pdf, out_dir, review_dir)
    results = []
    for page in pages:
        t0 = time.time()
        res = dict(page=page, ok=False)
        try:
            img = render(pdf, page, dpi, work)
            if box:
                img = crop(img, box)
            label = title if len(pages) == 1 else f'{title} (p. {page})'
            dest = f'{name or slug(title)}{"" if len(pages) == 1 else f"-p{page}"}'
            res.update(_process(img, (label, composer), dest, out_dir, review_dir, t0))
        except Exception as e:
            res.update(error=str(e), seconds=round(time.time() - t0))
        results.append(res)
    return results


def convert_piece(pdf, piece, title, composer, dpi=300, name=None, out_dir=None, review_dir=None, fill_rests=None, patches=None):
    """One piece from numbered systems, possibly across pages (see parse_piece); returns a one-item list like convert()."""
    t0 = time.time()
    res = dict(page=','.join(str(p) for p, _ in piece), ok=False)
    try:
        pdf, work, out_dir, review_dir = _setup(pdf, out_dir, review_dir)
        dest = name or slug(title)
        img = stitch(pdf, piece, dpi, work, dest)
        res.update(_process(img, (title, composer), dest, out_dir, review_dir, t0, fill_rests, patches))
    except Exception as e:
        res.update(error=str(e), seconds=round(time.time() - t0))
    return [res]


def describe(r):
    if 'error' in r:
        return f"{'p.' if r['page'] != 'by hand' else ''}{r['page']}: FAILED ({r['seconds']}s) {r['error']}"
    verdict = 'OK -> inbox' if r['ok'] else f"REVIEW ({r['irregular']} irregular bar(s))"
    filled = f" · {r['rests_filled']} rest(s) added" if r.get('rests_filled') else ''
    return (f"{'p.' if r['page'] != 'by hand' else ''}{r['page']}: {verdict} · {r['notes']} notes, {r['staves']} staves, {r['bars']} inner bars{filled} · {r['seconds']}s\n"
            f"       {r['file']}" + (f"\n       look over what was read: {r['check_image']}" if r.get('check_image') else '\n       typed in by hand from the page'))


def main():
    ap = argparse.ArgumentParser(description='PDF pages -> MusicXML (homr), checked and filed for the importer.')
    ap.add_argument('pdf')
    ap.add_argument('--pages', help='whole pages: 8 or 8-10 or 8,10-12 (1-based)')
    ap.add_argument('--piece', help='one piece from numbered systems (scan.py), e.g. 38:3,39:1-4')
    ap.add_argument('--title', required=True)
    ap.add_argument('--composer', required=True)
    ap.add_argument('--crop', help='x0,y0,x1,y1 as fractions of the page, e.g. 0,0.5,1,0.75')
    ap.add_argument('--dpi', type=int, default=300)
    ap.add_argument('--fill-rests', choices=['upper-first', 'lower-first'], help='pieces where the hands take turns and the book prints no rests (see fill_rests)')
    ap.add_argument('--name', help='file name without extension (default: from the title)')
    ap.add_argument('--out', help='folder for good files (default: the repo inbox)')
    a = ap.parse_args()
    box = tuple(float(x) for x in a.crop.split(',')) if a.crop else None
    if box and (len(box) != 4 or not (0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1)):
        ap.error('--crop needs x0,y0,x1,y1 with 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1')
    if bool(a.pages) == bool(a.piece):
        ap.error('give --pages or --piece, not both and not neither')
    if a.piece:
        results = convert_piece(a.pdf, parse_piece(a.piece), a.title, a.composer, a.dpi, a.name, a.out, fill_rests=a.fill_rests)
    else:
        results = convert(a.pdf, parse_pages(a.pages), a.title, a.composer, a.dpi, box, a.name, a.out)
    for r in results:
        print(describe(r))
    if any(r.get('ok') for r in results):
        print('\nNext: ./ingest.sh   (then ./ingest.sh --apply)')
    sys.exit(0 if all(r.get('ok') for r in results) else 1)


if __name__ == '__main__':
    main()
