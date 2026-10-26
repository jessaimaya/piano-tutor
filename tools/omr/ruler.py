#!/usr/bin/env python3
"""Label the pitch of every line and space of a staff on a crop, so notes can be read off exactly instead of judged by eye.

    .venv/bin/python ruler.py IMAGE.png OUT.png Y0 Y1 X0 X1 --treble TOP_LINE_Y,SPACING --bass TOP_LINE_Y,SPACING

Y/X crop the image; the line positions are in the full image's pixels (scan._staves prints them). Names are drawn at the left edge and as
faint ticks across, three ledger positions above and below.
"""
import argparse, cv2
import numpy as np

TREBLE_TOP = ('F', 5)   # top line of the treble staff
BASS_TOP = ('A', 3)     # top line of the bass staff
STEPS = 'CDEFGAB'


def names(top, count_above=4, count_below=9):
    """[(position index from the top line in half-spaces, pitch name)]: 0 = top line, 1 = the space below it, ..."""
    step, octave = top
    idx = STEPS.index(step) + 7 * octave
    out = []
    for k in range(-count_above, count_below + 1):
        i = idx - k
        out.append((k, f'{STEPS[i % 7]}{i // 7}'))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('out')
    ap.add_argument('y0', type=int); ap.add_argument('y1', type=int); ap.add_argument('x0', type=int); ap.add_argument('x1', type=int)
    ap.add_argument('--treble'); ap.add_argument('--bass')
    ap.add_argument('--scale', type=float, default=1.0)
    a = ap.parse_args()
    im = cv2.imread(a.image)
    for spec, top, color in ((a.treble, TREBLE_TOP, (0, 0, 220)), (a.bass, BASS_TOP, (200, 80, 0))):
        if not spec:
            continue
        y, sp = (float(v) for v in spec.split(','))
        for k, name in names(top):
            yy = int(round(y + k * sp / 2))
            if a.y0 <= yy <= a.y1:
                is_line = k % 2 == 0 and 0 <= k <= 8
                cv2.line(im, (a.x0, yy), (a.x0 + (36 if is_line else 24), yy), color, 2)
                cv2.putText(im, name, (a.x0 + 40, yy + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    crop = im[a.y0:a.y1, a.x0:a.x1]
    if a.scale != 1.0:
        crop = cv2.resize(crop, None, fx=a.scale, fy=a.scale, interpolation=cv2.INTER_AREA)
    cv2.imwrite(a.out, crop)


if __name__ == '__main__':
    main()
