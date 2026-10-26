#!/usr/bin/env python3
"""Find the staff systems on PDF pages, so a piece can be picked by number (pdf2xml.py --systems 2,3) instead of by guessed fractions.

    .venv/bin/python scan.py BOOK.pdf --pages 40-45     # writes an annotated picture per page into work/<book>/scan-pNNN.jpg

A staff is five equally spaced long horizontal lines. A treble staff with a bass staff just below it is one system (a grand staff).
Systems are numbered from the top of the page. Title text is not detected: look at the picture and name the piece yourself.
"""
import argparse, os, sys
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def _line_centres(binary, min_len):
    """y of every long horizontal line (rows touching one are merged), with the x range of the longest."""
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (min_len, 1)))
    rows = np.flatnonzero(opened.sum(axis=1) > 0)
    lines, start = [], None
    for i, y in enumerate(rows):
        if start is None:
            start = y
        if i + 1 == len(rows) or rows[i + 1] - y > 1:
            band = opened[start:y + 1]
            cols = np.flatnonzero(band.any(axis=0))
            lines.append(((start + y) / 2, cols[0], cols[-1], y - start + 1))
            start = None
    return lines


def _staves(lines, space=None):
    """Five evenly spaced lines: (top, bottom, spacing, x0, x1). The top and bottom line fix a grid and the three between must sit near it.
    A page where a beam merges two lines into one thick one loses that staff: take it as a strip instead (pdf2xml.py --piece, y0-y1 fractions)."""
    staves, i = [], 0
    while i < len(lines):
        found = None
        for last in range(i + 4, len(lines)):
            span = lines[last][0] - lines[i][0]
            if span > 4 * 45:
                break
            g = span / 4
            if g < 8 or (space and not 0.8 * space <= g <= 1.25 * space):
                continue
            chain, missed = [i], 0
            for k in (1, 2, 3):
                want = lines[i][0] + k * g
                hit = [m for m in range(i + 1, last) if abs(lines[m][0] - want) <= 0.3 * g]
                if hit:
                    chain.append(min(hit, key=lambda m: abs(lines[m][0] - want)))
                else:
                    missed += 1
            if missed == 0:
                found = chain + [last]
                break
        if found:
            ys = [lines[m][0] for m in found]
            staves.append((ys[0], ys[-1], (ys[-1] - ys[0]) / 4, int(min(lines[m][1] for m in found)), int(max(lines[m][2] for m in found))))
            i = found[-1] + 1
        else:
            i += 1
    return staves


def detect_systems(png):
    """[(y0, y1, x0, x1)] in pixels, top to bottom, each with room for ledger lines, dynamics and fingering."""
    img = cv2.imread(png, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(png)
    h, w = img.shape
    binary = (img < 140).astype(np.uint8)
    lines = _line_centres(binary, max(40, int(0.03 * w)))  # short lines: a slightly skewed scan breaks long ones
    # Two passes: the usual staff spacing of the page first (a slur or a hairpin can look like five lines, and teacher-duet staves are
    # small), then only staves of about that spacing. Notation is 20 px or more between lines at 300 dpi; smaller ones are not read.
    first = [st[2] for st in _staves(lines) if 20 <= st[2] <= 45]
    staves = _staves(lines, float(np.median(first))) if first else _staves(lines)
    systems, i = [], 0
    while i < len(staves):
        top, bottom, d, x0, x1 = staves[i]
        nxt = staves[i + 1] if i + 1 < len(staves) else None
        if nxt and nxt[0] - bottom < 12 * d and abs(nxt[3] - x0) < 3 * d and abs(nxt[4] - x1) < 3 * d:
            bottom, x1 = nxt[1], max(x1, nxt[4])  # a grand staff: treble and bass, the same width, one under the other
            i += 1
        systems.append((max(0, int(top - 5 * d)), min(h, int(bottom + 5 * d)), max(0, x0 - int(3 * d)), min(w, x1 + int(2 * d))))
        i += 1
    return systems


def annotate(png, systems, out, width=900):
    img = cv2.imread(png)
    for n, (y0, y1, x0, x1) in enumerate(systems, 1):
        cv2.rectangle(img, (x0, y0), (x1, y1), (0, 0, 255), 4)
        cv2.putText(img, str(n), (max(x0 - 90, 5), y0 + 80), cv2.FONT_HERSHEY_SIMPLEX, 3, (0, 0, 255), 8)
    s = width / img.shape[1]
    cv2.imwrite(out, cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 70])


def main():
    sys.path.insert(0, HERE)
    import pdf2xml
    ap = argparse.ArgumentParser(description='Number the staff systems on PDF pages.')
    ap.add_argument('pdf')
    ap.add_argument('--pages', required=True)
    ap.add_argument('--dpi', type=int, default=300)
    a = ap.parse_args()
    pdf = os.path.abspath(a.pdf)
    work = os.path.join(pdf2xml.WORK, pdf2xml.slug(os.path.splitext(os.path.basename(pdf))[0])[:40])
    os.makedirs(work, exist_ok=True)
    for page in pdf2xml.parse_pages(a.pages):
        png = pdf2xml.render(pdf, page, a.dpi, work)
        systems = detect_systems(png)
        out = os.path.join(work, f'scan-p{page:03d}.jpg')
        annotate(png, systems, out)
        print(f'p.{page}: {len(systems)} system(s) -> {out}')


if __name__ == '__main__':
    main()
