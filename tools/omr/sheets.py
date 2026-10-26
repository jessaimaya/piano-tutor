#!/usr/bin/env python3
"""Put two annotated scan pages side by side: .venv/bin/python sheets.py BOOK.pdf FIRST LAST  -> work/<book>/sheet-FIRST-*.jpg"""
import os, sys, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdf2xml
pdf, first, last = os.path.abspath(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
work = os.path.join(pdf2xml.WORK, pdf2xml.slug(os.path.splitext(os.path.basename(pdf))[0])[:40])
for a in range(first, last + 1, 2):
    ims = []
    for p in (a, a + 1):
        f = os.path.join(work, f'scan-p{p:03d}.jpg')
        im = cv2.resize(cv2.imread(f), (900, 1280)) if os.path.exists(f) else np.full((1280, 900, 3), 255, np.uint8)
        cv2.putText(im, f'pdf p.{p}', (330, 1245), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (255, 0, 0), 4)
        ims.append(im)
    out = os.path.join(work, f'sheet-{a:03d}.jpg')
    cv2.imwrite(out, np.hstack(ims), [cv2.IMWRITE_JPEG_QUALITY, 75])
    print(out)
