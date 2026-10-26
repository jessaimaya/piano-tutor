#!/usr/bin/env python3
"""Measure notehead heights on a staff, so pitches can be checked by numbers instead of by eye.

    .venv/bin/python heads.py IMAGE.png TOP_LINE_Y SPACING --clef treble|bass [--x0 N --x1 N]

Finds filled and hollow note heads in the band around the staff, and prints for each: x, y, the half-space step from the top line
(0 = top line, 1 = the space below, ... 8 = bottom line) and the pitch name. Staff lines are taken out first, so heads on lines are found.
It is a checking tool: a head fused with a stem, beam or another head can be missed or doubled.
"""
import argparse, cv2, numpy as np

STEPS = 'CDEFGAB'
TOP = {'treble': ('F', 5), 'bass': ('A', 3)}


def name_at(k, clef):
    step, octave = TOP[clef]
    i = STEPS.index(step) + 7 * octave - k
    return f'{STEPS[i % 7]}{i // 7}'


def find_heads(img, top, sp, clef, x0=0, x1=None):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = g.shape
    x1 = x1 or w
    y0, y1 = int(top - 5 * sp), int(top + 9 * sp)
    bg = cv2.GaussianBlur(g, (0, 0), 25)
    dark = ((bg.astype(int) - g.astype(int)) > 30).astype(np.uint8)[y0:y1, x0:x1]
    lines = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (int(2.5 * sp), 1)))
    lines = cv2.dilate(lines, np.ones((3, 1), np.uint8))
    nolines = dark & (1 - lines)
    # a head is wide as it is tall: open with a disc about 0.7 staff spaces across (hollow heads lose their middle; their ring stays thick)
    k = max(3, int(0.55 * sp)) | 1
    heads = cv2.morphologyEx(nolines, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    n, _, stats, cent = cv2.connectedComponentsWithStats(heads)
    out = []
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if bw < 0.6 * sp or bh < 0.5 * sp or bh > 1.8 * sp or bw > 3.2 * sp:
            continue
        cy = cent[i][1] + y0
        step = (cy - top) / (sp / 2)
        out.append((round(cent[i][0] + x0), round(cy), round(step, 2), name_at(round(step), clef)))
    return sorted(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('top', type=float); ap.add_argument('spacing', type=float)
    ap.add_argument('--clef', default='treble', choices=['treble', 'bass'])
    ap.add_argument('--x0', type=int, default=0); ap.add_argument('--x1', type=int)
    a = ap.parse_args()
    for x, y, step, name in find_heads(cv2.imread(a.image), a.top, a.spacing, a.clef, a.x0, a.x1):
        print(f'x={x:5d} y={y:5d} step={step:6.2f} {name}')


if __name__ == '__main__':
    main()
