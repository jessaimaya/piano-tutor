#!/usr/bin/env python3
"""Write finger numbers into Tomorrow's Song:  python3 -I tools/fingering.py

The score has none, and a beginner needs them on the staff. They are standard MusicXML <fingering> marks, which the score view draws.
Safe to run again: notes that already have a fingering are left alone. Reading the other way, `--check` lists what would change.

Right hand: two positions (see RH_A and RH_RUN). Left hand: every note below Middle C is the bass note (5), every note from Middle C up
is the upper note (1). From bar 15 the bass note is held while the upper note repeats, up to a 10th apart (D3 with F4): no hand spans
that, so both are marked 5 and 1 and the bass note is played first and held with the pedal.
A repeated note keeps its finger, so only the first of a run in a bar is written (REPEATS = True writes them all).
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCORE = os.path.join(ROOT, 'app', 'scores', 'arnalds-tomorrow-s-song.musicxml')
REPEATS = False

RH_A = {'G4': 1, 'A4': 2, 'B4': 3, 'C5': 4, 'D5': 5, 'G5': 5}  # hand on G4..D5; the jump to G5 is a 5 as well
RH_RUN = {'G5': 5, 'F5': 4, 'E5': 3, 'D5': 2, 'C5': 1, 'G4': 1}  # hand on C5..G5
DOWN_BARS = {18, 22, 34, 38}  # G5 F5 E5 D5 C5 C5, all in the C5 position
UP_BARS = {19, 23, 35, 39}    # C5 D5 E5 in that position, then back down to G4

NOTE = re.compile(r'<note>.*?</note>', re.S)
MEASURE = re.compile(r'(?=<measure number=")')


def finger(bar: int, staff: str, name: str) -> int:
    if staff == '2':
        return 5 if int(name[-1]) < 4 else 1
    table = RH_RUN if bar in DOWN_BARS | UP_BARS else RH_A
    if name not in table:
        raise SystemExit(f'bar {bar}: no finger for {name}')
    return table[name]


def tag(note: str, name: str) -> str:
    return re.search(rf'<{name}>(.*?)</{name}>', note, re.S).group(1)


def mark(text: str) -> tuple[str, int]:
    out, count = [], 0
    last: dict[tuple[str, str], tuple[str, int]] = {}  # (staff, voice) -> the note just played and its finger
    for part in MEASURE.split(text):
        m = re.match(r'<measure number="(\d+)"', part)
        if not m:
            out.append(part)
            continue
        bar = int(m.group(1))
        last.clear()  # every bar starts with a number, whatever the bar before ended on

        def one(match: re.Match) -> str:
            nonlocal count
            note = match.group(0)
            if '<pitch>' not in note or '<tie type="stop"' in note:
                return note
            name = tag(note, 'step') + tag(note, 'octave')
            staff, voice = tag(note, 'staff'), tag(note, 'voice')
            f = finger(bar, staff, name)
            repeat = last.get((staff, voice)) == (name, f)
            last[(staff, voice)] = (name, f)
            if '<fingering' in note or (repeat and not REPEATS):
                return note
            xml = f'<technical><fingering>{f}</fingering></technical>'
            count += 1
            if '</notations>' in note:
                return note.replace('</notations>', xml + '</notations>')
            return note.replace('</note>', f'<notations>{xml}</notations></note>')

        out.append(NOTE.sub(one, part))
    return ''.join(out), count


if __name__ == '__main__':
    src = open(SCORE, encoding='utf8').read()
    new, n = mark(src)
    if '--check' in sys.argv:
        print(f'{n} fingerings would be added')
    else:
        open(SCORE, 'w', encoding='utf8').write(new)
        print(f'{n} fingerings added')
