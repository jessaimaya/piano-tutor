#!/usr/bin/env python3
"""Stack the source crop (top) and the app's drawing (bottom): .venv/bin/python compare.py name... -> work/compare/<name>.jpg. Run compare.mjs first."""
import glob, os, sys
import cv2, numpy as np
for n in sys.argv[1:]:
    src = glob.glob(f'work/*/piece-{n}.png')
    app = cv2.imread(f'work/compare/{n}-app.png')
    if not src or app is None:
        print('missing', n); continue
    a = cv2.imread(src[0])
    w = 1300
    a = cv2.resize(a, (w, int(a.shape[0] * w / a.shape[1])), interpolation=cv2.INTER_AREA)
    b = cv2.resize(app, (w, int(app.shape[0] * w / app.shape[1])), interpolation=cv2.INTER_AREA)
    bar = np.full((14, w, 3), (0, 0, 200), np.uint8)
    cv2.imwrite(f'work/compare/{n}.jpg', np.vstack([a, bar, b]), [cv2.IMWRITE_JPEG_QUALITY, 80])
    print(n, 'ok')
