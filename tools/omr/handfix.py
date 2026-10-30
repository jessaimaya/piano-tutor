"""Write MusicXML from a transcription typed by hand, for pieces that OMR cannot read (circled note heads, dense chords).

    {"timeSig": [4, 4], "fifths": 0, "rh": "C4+E4:q D4:q | R:w", "lh": "A3:q R:h. | R:w", "pickup": 2}  (pickup optional: an upbeat of that many quarter notes)

Bars are separated by `|`, notes by spaces. `C4:q` is a note (`F#4`, `Bb3` for accidentals), `C4+E4:h` a chord, `R:h.` a rest.
Durations: w h q e s (s = sixteenth), a trailing dot lengthens by half. Every bar must fill the time signature, else the error names the bar and the hand.
Triplets: `(G4:e G4:e B4:e)` is three notes in the time of two (a "(" opens the group, a ")" closes it; the durations are the written ones).
Ties: a trailing `~` ties the note to the next one of the same pitch (the next bar's first note is fine): `C4:q~ C4:q`.
A second voice for the left hand (a held bass note under moving quarters): "lh2", bars separated by `|` like the others, `-` for a bar without one.
Output has the same shape as homr's: one part, two staves (treble `rh`, bass `lh`), so the importer and the app treat it alike.
"""
import re
import xml.etree.ElementTree as ET
from fractions import Fraction

QUARTERS = {'w': 4, 'h': 2, 'q': 1, 'e': 0.5, 's': 0.25}
NAMES = {'w': 'whole', 'h': 'half', 'q': 'quarter', 'e': 'eighth', 's': '16th'}
DIVISIONS = 2  # a division is an eighth note
TUPLET_DIVISIONS = 12  # sixteenths and triplets need finer divisions (a triplet eighth is 4, a sixteenth 3)
PITCH = re.compile(r'^([A-G])([#b]?)(-?\d)$')


def _bars(text, beats, beat_type, hand, pickup=None):
    """[[(pitches or None, duration letter, dotted, flags)]] per bar, each checked against the time signature.
    `flags` holds `tuplet` ('start', 'mid' or 'stop') and `tie` ('start', 'stop' or 'both'), see the notation above.
    With a pickup (an upbeat of that many quarter notes), the first bar is that long and the last one is what is left of a full bar."""
    full = Fraction(4 * beats, beat_type)
    raw = [b.strip() for b in text.split('|') if b.strip()]
    bars, in_tuplet, tied = [], False, None
    for n, bar in enumerate(raw, 1):
        want = full
        if pickup:
            want = Fraction(pickup) if n == 1 else (full - Fraction(pickup) if n == len(raw) else full)
        notes, total = [], Fraction(0)
        for tok in ([] if bar == '-' else bar.split()):
            opens, closes = tok.startswith('('), tok.endswith(')')
            tok = tok.lstrip('(').rstrip(')')
            ties = tok.endswith('~')
            tok = tok.rstrip('~')
            what, _, dur = tok.partition(':')
            letter, dotted = dur.rstrip('.'), dur.endswith('.')
            if letter not in QUARTERS:
                raise ValueError(f'{hand} bar {n}: bad duration in {tok!r}')
            pitches = None if what == 'R' else what.split('+')
            for p in pitches or []:
                if not PITCH.match(p):
                    raise ValueError(f'{hand} bar {n}: bad pitch {p!r} in {tok!r}')
            flags = {}
            if opens:
                in_tuplet = True
                flags['tuplet'] = 'start'
            elif in_tuplet:
                flags['tuplet'] = 'mid'
            if closes:
                if not in_tuplet:
                    raise ValueError(f'{hand} bar {n}: ")" without "(" in {tok!r}')
                flags['tuplet'] = 'stop' if not opens else 'single'
                in_tuplet = False
            if tied is not None and pitches == tied:
                flags['tie'] = 'both' if ties else 'stop'
            elif tied is not None and pitches is not None:
                raise ValueError(f'{hand} bar {n}: a tied note is followed by {tok!r}, a different pitch')
            elif ties:
                if not pitches:
                    raise ValueError(f'{hand} bar {n}: a rest cannot be tied')
                flags['tie'] = 'start'
            if pitches is not None:
                tied = pitches if ties else None
            notes.append((pitches, letter, dotted, flags))
            total += _length(letter, dotted, 'tuplet' in flags or in_tuplet)
        if in_tuplet:
            raise ValueError(f'{hand} bar {n}: a "(" group is not closed: {bar!r}')
        if bar != '-' and total != want:
            raise ValueError(f'{hand} bar {n} has {float(total)} quarter notes, the time signature needs {float(want)}: {bar!r}')
        bars.append(notes)
    if tied is not None:
        raise ValueError(f'{hand}: the last note is tied to nothing')
    return bars


def _length(letter, dotted, tuplet):
    """Length in quarter notes; a triplet note takes two thirds of its written length."""
    q = Fraction(QUARTERS[letter]) * (Fraction(3, 2) if dotted else 1)
    return q * Fraction(2, 3) if tuplet else q


def _note(parent, pitches, letter, dotted, staff, voice, divisions=DIVISIONS, flags=None):
    flags = flags or {}
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
        dur = _length(letter, dotted, 'tuplet' in flags) * divisions
        if dur.denominator != 1:
            raise ValueError(f'{letter}{"." if dotted else ""} does not fit divisions={divisions}')
        ET.SubElement(n, 'duration').text = str(int(dur))
        tie = flags.get('tie')
        if tie and p is not None:
            if tie in ('stop', 'both'):
                ET.SubElement(n, 'tie', {'type': 'stop'})
            if tie in ('start', 'both'):
                ET.SubElement(n, 'tie', {'type': 'start'})
        ET.SubElement(n, 'voice').text = str(voice)
        ET.SubElement(n, 'type').text = NAMES[letter]
        if dotted:
            ET.SubElement(n, 'dot')
        if 'tuplet' in flags:
            tm = ET.SubElement(n, 'time-modification')
            ET.SubElement(tm, 'actual-notes').text = '3'
            ET.SubElement(tm, 'normal-notes').text = '2'
        ET.SubElement(n, 'staff').text = str(staff)
        notations = ET.Element('notations')
        if tie and p is not None:
            if tie in ('stop', 'both'):
                ET.SubElement(notations, 'tied', {'type': 'stop'})
            if tie in ('start', 'both'):
                ET.SubElement(notations, 'tied', {'type': 'start'})
        if not i and flags.get('tuplet') in ('start', 'single'):
            ET.SubElement(notations, 'tuplet', {'type': 'start'})
        if not i and flags.get('tuplet') in ('stop', 'single'):
            ET.SubElement(notations, 'tuplet', {'type': 'stop'})
        if len(notations):
            n.append(notations)


def build(spec):
    """MusicXML root for {"timeSig", "fifths", "rh", "lh"}; `lh` may be omitted for a right-hand-only piece."""
    beats, beat_type = spec.get('timeSig', [4, 4])
    pickup = spec.get('pickup')
    rh = _bars(spec['rh'], beats, beat_type, 'rh', pickup)
    lh = _bars(spec['lh'], beats, beat_type, 'lh', pickup) if spec.get('lh') else None
    lh2 = _bars(spec['lh2'], beats, beat_type, 'lh2', pickup) if spec.get('lh2') else None
    if lh is not None and len(lh) != len(rh):
        raise ValueError(f'rh has {len(rh)} bars, lh has {len(lh)}')
    if lh2 is not None and (lh is None or len(lh2) != len(rh)):
        raise ValueError(f'rh has {len(rh)} bars, lh2 has {len(lh2)}')
    text = ' '.join(str(spec.get(k) or '') for k in ('rh', 'lh', 'lh2'))
    divisions = TUPLET_DIVISIONS if re.search(r'\(|:s', text) else DIVISIONS
    root = ET.Element('score-partwise', {'version': '3.1'})
    pl = ET.SubElement(ET.SubElement(root, 'part-list'), 'score-part', {'id': 'P1'})
    ET.SubElement(pl, 'part-name').text = 'Piano'
    part = ET.SubElement(root, 'part', {'id': 'P1'})
    full_div = int(4 * beats / beat_type * divisions)
    for i, notes in enumerate(rh):
        m = ET.SubElement(part, 'measure', {'number': str(i + 1)})
        bar_div = int(pickup * divisions) if pickup and i == 0 else (full_div - int(pickup * divisions) if pickup and i == len(rh) - 1 else full_div)
        if i == 0:
            a = ET.SubElement(m, 'attributes')
            ET.SubElement(a, 'divisions').text = str(divisions)
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
        for pitches, letter, dotted, flags in notes:
            _note(m, pitches, letter, dotted, 1, 1, divisions, flags)
        if lh is not None:
            ET.SubElement(ET.SubElement(m, 'backup'), 'duration').text = str(bar_div)
            for pitches, letter, dotted, flags in lh[i]:
                _note(m, pitches, letter, dotted, 2, 2, divisions, flags)
        if lh2 is not None and lh2[i]:
            ET.SubElement(ET.SubElement(m, 'backup'), 'duration').text = str(bar_div)
            for pitches, letter, dotted, flags in lh2[i]:
                _note(m, pitches, letter, dotted, 2, 3, divisions, flags)
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
