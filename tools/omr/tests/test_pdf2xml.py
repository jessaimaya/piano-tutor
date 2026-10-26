"""Run: tools/omr/.venv/bin/python tools/omr/tests/test_pdf2xml.py"""
import os, sys, unittest
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pdf2xml

XML = '''<score-partwise><part id="P1"><measure number="1">
<attributes><divisions>2</divisions><staves>2</staves><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
<backup><duration>2</duration></backup>
<note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><voice>5</voice><staff>2</staff></note>
<backup><duration>2</duration></backup>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
</measure></part></score-partwise>'''


def onsets(root):
    """{(staff, pitch): onset} by simulating backup, forward and chords the way a reader does."""
    out, cur = {}, 0
    for el in root.find('part').find('measure'):
        if el.tag == 'backup':
            cur -= int(el.findtext('duration'))
        elif el.tag == 'forward':
            cur += int(el.findtext('duration'))
        elif el.tag == 'note':
            if el.find('chord') is None:
                start = cur
                cur += int(el.findtext('duration'))
            if el.find('rest') is None:
                out[(el.findtext('staff'), el.findtext('pitch/step') + el.findtext('pitch/octave'))] = start
    return out


class Canonicalize(unittest.TestCase):
    def test_keeps_onsets_and_makes_each_staff_one_run(self):
        root = ET.fromstring(XML)
        before = onsets(root)
        self.assertEqual(pdf2xml.canonicalize(root), 1)
        self.assertEqual(onsets(root), before)
        staves = [n.findtext('staff') for n in root.iter('note')]
        self.assertEqual(staves, ['1', '1', '2'])  # not 1, 2, 1

    def test_patch_after_canonicalize_does_not_move_the_other_hand(self):
        root = ET.fromstring(XML)
        pdf2xml.canonicalize(root)
        pdf2xml.patch_bars(root, [{'bar': 1, 'hand': 'rh', 'notes': 'B4:q A4:q'}])
        got = onsets(root)
        self.assertEqual(got[('1', 'B4')], 0)
        self.assertEqual(got[('1', 'A4')], 2)
        self.assertEqual(got[('2', 'G2')], 0)  # the left hand still starts on the bar line


class Restream(unittest.TestCase):
    def test_a_rest_added_for_an_empty_staff_starts_on_the_bar_line(self):
        root = ET.fromstring(XML.replace('<staves>2</staves>', '<staves>2</staves>'))
        pdf2xml.canonicalize(root)
        for n in list(root.iter('note')):
            if n.findtext('staff') == '2':
                root.find('part').find('measure').remove(n)  # the left hand has nothing in this bar
        m = root.find('part').find('measure')
        m.append(pdf2xml._rest(4, 2, 5, 2, measure_rest=True))  # what fill_rests does: appended with no backup
        pdf2xml.restream(root)
        cur, starts = 0, []
        for el in m:
            if el.tag == 'backup':
                cur -= int(el.findtext('duration'))
            elif el.tag == 'note':
                if el.find('chord') is None:
                    starts.append((el.findtext('staff'), cur))
                    cur += int(el.findtext('duration'))
        self.assertIn(('2', 0), starts)

    def test_every_staff_stays_inside_the_bar_after_all_the_steps(self):
        root = ET.fromstring(XML)
        pdf2xml.canonicalize(root)
        pdf2xml.restream(root)
        cur, ends = 0, {}
        for el in root.find('part').find('measure'):
            if el.tag == 'backup':
                cur -= int(el.findtext('duration'))
            elif el.tag == 'note' and el.find('chord') is None:
                cur += int(el.findtext('duration'))
                ends[el.findtext('staff')] = max(ends.get(el.findtext('staff'), 0), cur)
        self.assertTrue(all(e <= 4 for e in ends.values()), ends)


if __name__ == '__main__':
    unittest.main()
