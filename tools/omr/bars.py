#!/usr/bin/env python3
"""One line per bar: .venv/bin/python bars.py FILE.musicxml  ->  `m3  RH: C4q D4q | LH: R:w`  (for comparing a conversion with the page)."""
import sys, collections, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
SHORT = {'whole': 'w', 'half': 'h', 'quarter': 'q', 'eighth': 'e', '16th': 's', 'breve': 'W'}
for m in root.find('part').findall('measure'):
    staves = collections.OrderedDict()
    for n in m.findall('note'):
        s = n.findtext('staff', '1')
        if n.find('rest') is not None: x = 'R'
        else:
            p = n.find('pitch'); a = p.findtext('alter'); x = p.findtext('step') + ('#' if a == '1' else 'b' if a == '-1' else '') + p.findtext('octave')
        x += SHORT.get(n.findtext('type', '?'), '?') + ('.' if n.find('dot') is not None else '')
        if n.find('chord') is not None and staves.get(s): staves[s][-1] += '+' + x.split('q')[0].split('h')[0].split('e')[0].split('w')[0].rstrip('.')
        else: staves.setdefault(s, []).append(x)
    ts = m.findtext('attributes/time/beats')
    print(f"m{m.get('number'):>2}" + (f" [{ts}/{m.findtext('attributes/time/beat-type')}]" if ts else '') + '  ' + ' | '.join(f"{'RH' if s == '1' else 'LH'}: {' '.join(v)}" for s, v in staves.items()))
