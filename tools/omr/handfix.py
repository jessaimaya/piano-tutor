"""Write MusicXML from a transcription typed by hand, for pieces that OMR cannot read (circled note heads, dense chords).

    {"timeSig": [4, 4], "fifths": 0, "rh": "C4+E4:q D4:q | R:w", "lh": "A3:q R:h. | R:w", "pickup": 2}  (pickup optional: an upbeat of that many quarter notes)

Bars are separated by `|`, notes by spaces. `C4:q` is a note (`F#4`, `Bb3` for accidentals), `C4+E4:h` a chord, `R:h.` a rest.
Durations: w h q e, a trailing dot lengthens by half. Every bar must fill the time signature, else the error names the bar and the hand.
Output has the same shape as homr's: one part, two staves (treble `rh`, bass `lh`), so the importer and the app treat it alike.
"""
import re
import xml.etree.ElementTree as ET

QUARTERS = {'w': 4, 'h': 2, 'q': 1, 'e': 0.5}
NAMES = {'w': 'whole', 'h': 'half', 'q': 'quarter', 'e': 'eighth'}
DIVISIONS = 2  # a division is an eighth note
PITCH = re.compile(r'^([A-G])([#b]?)(-?\d)$')


def _bars(text, beats, beat_type, hand, pickup=None):
    """[[(pitches or None, duration letter, dotted)]] per bar, each checked against the time signature.
    With a pickup (an upbeat of that many quarter notes), the first bar is that long and the last one is what is left of a full bar."""
    full = 4 * beats / beat_type
    raw = [b.strip() for b in text.split('|') if b.strip()]
    bars = []
    for n, bar in enumerate(raw, 1):
        want = full
        if pickup:
            want = pickup if n == 1 else (full - pickup if n == len(raw) else full)
        notes, total = [], 0.0
        for tok in bar.split():
            what, _, dur = tok.partition(':')
            letter, dotted = dur.rstrip('.'), dur.endswith('.')
            if letter not in QUARTERS:
                raise ValueError(f'{hand} bar {n}: bad duration in {tok!r}')
            pitches = None if what == 'R' else what.split('+')
            for p in pitches or []:
                if not PITCH.match(p):
                    raise ValueError(f'{hand} bar {n}: bad pitch {p!r} in {tok!r}')
            notes.append((pitches, letter, dotted))
            total += QUARTERS[letter] * (1.5 if dotted else 1)
        if total != want:
            raise ValueError(f'{hand} bar {n} has {total} quarter notes, the time signature needs {want}: {bar!r}')
        bars.append(notes)
    return bars


def _note(parent, pitches, letter, dotted, staff, voice, divisions=DIVISIONS):
    for i, p in enumerate(pitches or [None]):
        n = ET.SubElement(parent, 'note')
        if p is None:
            ET.SubElement(n, 'rest')
        else:
            if i:
                ET.SubElement(n, 'chord')
            step, acc, octave = PITCH.match(p).groups()
            pe = ET.SubElement(n, 'pitch')
            ET.SubElement(pe, 'step').text = step
            if acc:
                ET.SubElement(pe, 'alter').text = '1' if acc == '#' else '-1'
            ET.SubElement(pe, 'octave').text = octave
        ET.SubElement(n, 'duration').text = str(int(QUARTERS[letter] * (1.5 if dotted else 1) * divisions))
        ET.SubElement(n, 'voice').text = str(voice)
        ET.SubElement(n, 'type').text = NAMES[letter]
        if dotted:
            ET.SubElement(n, 'dot')
        ET.SubElement(n, 'staff').text = str(staff)


def build(spec):
    """MusicXML root for {"timeSig", "fifths", "rh", "lh"}; `lh` may be omitted for a right-hand-only piece."""
    beats, beat_type = spec.get('timeSig', [4, 4])
    pickup = spec.get('pickup')
    rh = _bars(spec['rh'], beats, beat_type, 'rh', pickup)
    lh = _bars(spec['lh'], beats, beat_type, 'lh', pickup) if spec.get('lh') else None
    if lh is not None and len(lh) != len(rh):
        raise ValueError(f'rh has {len(rh)} bars, lh has {len(lh)}')
    root = ET.Element('score-partwise', {'version': '3.1'})
    pl = ET.SubElement(ET.SubElement(root, 'part-list'), 'score-part', {'id': 'P1'})
    ET.SubElement(pl, 'part-name').text = 'Piano'
    part = ET.SubElement(root, 'part', {'id': 'P1'})
    full_div = int(4 * beats / beat_type * DIVISIONS)
    for i, notes in enumerate(rh):
        m = ET.SubElement(part, 'measure', {'number': str(i + 1)})
        bar_div = int(pickup * DIVISIONS) if pickup and i == 0 else (full_div - int(pickup * DIVISIONS) if pickup and i == len(rh) - 1 else full_div)
        if i == 0:
            a = ET.SubElement(m, 'attributes')
            ET.SubElement(a, 'divisions').text = str(DIVISIONS)
            ET.SubElement(ET.SubElement(a, 'key'), 'fifths').text = str(spec.get('fifths', 0))
            t = ET.SubElement(a, 'time')
            ET.SubElement(t, 'beats').text = str(beats)
            ET.SubElement(t, 'beat-type').text = str(beat_type)
            if lh is not None:
                ET.SubElement(a, 'staves').text = '2'
            for num, sign, line in ((1, 'G', 2), (2, 'F', 4)) if lh is not None else ((1, 'G', 2),):
                c = ET.SubElement(a, 'clef', {'number': str(num)} if lh is not None else {})
                ET.SubElement(c, 'sign').text = sign
                ET.SubElement(c, 'line').text = str(line)
        for pitches, letter, dotted in notes:
            _note(m, pitches, letter, dotted, 1, 1)
        if lh is not None:
            ET.SubElement(ET.SubElement(m, 'backup'), 'duration').text = str(bar_div)
            for pitches, letter, dotted in lh[i]:
                _note(m, pitches, letter, dotted, 2, 2)
    return root


def bar_notes(text, staff, voice, divisions):
    """The <note> elements for one bar typed in the notation above (no `|`), to patch into a file whose divisions are `divisions`."""
    holder = ET.Element('holder')
    for tok in text.split():
        what, _, dur = tok.partition(':')
        letter, dotted = dur.rstrip('.'), dur.endswith('.')
        if letter not in QUARTERS or (what != 'R' and not all(PITCH.match(p) for p in what.split('+'))):
            raise ValueError(f'bad note {tok!r}')
        _note(holder, None if what == 'R' else what.split('+'), letter, dotted, staff, voice, divisions)
    return list(holder)
