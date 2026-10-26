#!/usr/bin/env python3
"""Which bars do not add up: .venv/bin/python badbars.py FILE.musicxml  ->  bar number, hand, beats found, beats needed."""
import sys, collections, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
part = root.find('part')
div = int(part.findtext('.//attributes/divisions') or 1)
b, bt = int(part.findtext('.//attributes/time/beats')), int(part.findtext('.//attributes/time/beat-type'))
need = 4 * b / bt
ms = part.findall('measure')
for i, m in enumerate(ms):
    per = collections.Counter()
    for n in m.findall('note'):
        if n.find('chord') is None and n.find('grace') is None:
            per[(n.findtext('staff', '1'), n.findtext('voice', '1'))] += int(n.findtext('duration')) / div
    for (s, v), d in sorted(per.items()):
        if d != need:
            edge = ' (first/last bar: pickup?)' if i in (0, len(ms) - 1) else ''
            print(f"bar {m.get('number'):>2} {'RH' if s == '1' else 'LH'} voice {v}: {d:g} beats, needs {need:g}{edge}")
