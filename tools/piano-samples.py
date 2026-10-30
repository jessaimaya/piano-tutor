#!/usr/bin/env python3
"""Pick one clean sample per piano key from the downloaded set:  python3 -I tools/piano-samples.py <folder with the .mp3 files>

The set is github.com/Leethring/piano-sound-samples (MIT, see app/public/samples/piano/LICENSE), 136 MP3s made with MuseScore. Its file
names cannot be trusted (many files are copies under another name, some names are wrong), so each file's pitch is measured instead
and the sample chosen for a key is the one that really is that key. Needs ffmpeg and numpy.

Writes app/public/samples/piano/<midi>.mp3 and manifest.json: per sample, the seconds of silence before the hammer (`onset`) and the
gain that makes every key equally loud. Keys outside the measured range are made by the app from the nearest sample (see ui/sampler.ts).
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'app', 'public', 'samples', 'piano')
RATE = 44100
LOW, HIGH = 36, 83  # C2..B5: below this the fundamental is too weak to measure, above it the set has no files
TOLERANCE = 0.15    # semitones: a sample this close to a key is that key
TARGET_RMS = 0.12


def decode(path: str, tmp: str) -> np.ndarray:
    wav = os.path.join(tmp, hashlib.md5(path.encode()).hexdigest() + '.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', str(RATE), wav], check=True)
    return np.frombuffer(open(wav, 'rb').read()[44:], dtype=np.int16).astype(np.float64) / 32768


def measure(x: np.ndarray) -> dict:
    loud = np.flatnonzero(np.abs(x) > 0.02)
    onset = float(loud[0]) / RATE if len(loud) else 0.0
    start = int((onset + 0.08) * RATE)
    seg = x[start:start + int(1.2 * RATE)]
    n = 1 << 18
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n))
    freqs = np.fft.rfftfreq(n, 1 / RATE)
    hps = spec.copy()  # harmonic product spectrum: the pitch whose overtones all line up
    for h in (2, 3, 4):
        d = spec[::h]
        hps[:len(d)] *= d
    lo, hi = np.searchsorted(freqs, 25), np.searchsorted(freqs, 4500)
    f = freqs[lo + int(np.argmax(hps[lo:hi]))]
    first = x[int(onset * RATE):int((onset + 0.5) * RATE)]
    return {'midi': 69 + 12 * float(np.log2(f / 440)), 'onset': onset, 'rms': float(np.sqrt(np.mean(first ** 2)))}


def main(folder: str) -> None:
    found = []
    with tempfile.TemporaryDirectory() as tmp:
        for name in sorted(os.listdir(folder)):
            if name.lower().endswith('.mp3'):
                path = os.path.join(folder, name)
                found.append({'path': path, 'name': name, **measure(decode(path, tmp))})
    os.makedirs(OUT, exist_ok=True)
    roots = []
    for midi in range(LOW, HIGH + 1):
        near = [s for s in found if abs(s['midi'] - midi) <= TOLERANCE]
        if not near:
            continue
        best = min(near, key=lambda s: (abs(s['midi'] - midi), s['name']))
        shutil.copyfile(best['path'], os.path.join(OUT, f'{midi}.mp3'))
        roots.append({'midi': midi, 'file': f'{midi}.mp3', 'onset': round(best['onset'], 3), 'gain': round(TARGET_RMS / best['rms'], 3)})
    manifest = {'source': 'https://github.com/Leethring/piano-sound-samples', 'license': 'MIT', 'roots': roots}
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    missing = [m for m in range(LOW, HIGH + 1) if m not in {r['midi'] for r in roots}]
    print(f'{len(roots)} keys written to {OUT}; no sample for {missing} (the app shifts the nearest one)')


if __name__ == '__main__':
    main(sys.argv[1])
