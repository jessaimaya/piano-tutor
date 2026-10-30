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


class HandfixNotation(unittest.TestCase):
    """Triplets, sixteenths, ties and a second left-hand voice typed by hand (handfix.py)."""

    def build(self, **spec):
        import handfix
        return handfix.build({'timeSig': [4, 4], 'fifths': 0, **spec})

    def test_triplet_and_sixteenths_fill_the_bar(self):
        root = self.build(rh='(C5:e D5:e E5:e) F5:e G5:e A5:s B5:s C6:q C6:e | C5:w')
        notes = root.find('part').find('measure').findall('note')
        self.assertEqual(root.findtext('.//divisions'), '12')
        self.assertEqual([n.findtext('duration') for n in notes], ['4', '4', '4', '6', '6', '3', '3', '12', '6'])
        self.assertEqual(len(root.findall('.//time-modification')), 3)

    def test_a_bar_that_does_not_add_up_is_refused(self):
        with self.assertRaises(ValueError):
            self.build(rh='(C5:e D5:e) C5:h C5:q | C5:w')

    def test_ties_run_across_the_bar_line_and_must_keep_the_pitch(self):
        root = self.build(rh='C5:h C5:h~ | C5:w')
        ties = [(n.findtext('duration'), [t.get('type') for t in n.findall('tie')]) for n in root.iter('note')]
        self.assertEqual(ties, [('4', []), ('4', ['start']), ('8', ['stop'])])
        with self.assertRaises(ValueError):
            self.build(rh='C5:h D5:h~ | C5:w')

    def test_second_voice_starts_on_the_bar_line_and_skips_dash_bars(self):
        root = self.build(rh='C5:w | C5:w', lh='C4:q C4:q C4:h | C4:w', lh2='G2:w | -')
        first, second = root.findall('part/measure')
        kinds = [k.tag + (':' + k.findtext('voice') if k.tag == 'note' else ':' + k.findtext('duration')) for k in first if k.tag in ('note', 'backup')]
        self.assertIn('backup:8', kinds)
        self.assertEqual([k.findtext('voice') for k in first.findall('note')], ['1', '2', '2', '2', '3'])
        self.assertEqual([k.findtext('voice') for k in second.findall('note')], ['1', '2'])

    def test_plain_pieces_keep_two_divisions(self):
        self.assertEqual(self.build(rh='C5:h C5:h').findtext('.//divisions'), '2')


if __name__ == '__main__':
    unittest.main()
