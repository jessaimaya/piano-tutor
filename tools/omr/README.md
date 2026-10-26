# OMR: PDF pages to MusicXML

Turns pages of a scanned PDF into MusicXML the course can import, using [homr](https://github.com/liebharc/homr) (AGPL-3.0, run locally; nothing is uploaded).

```bash
tools/omr/setup.sh                     # once: Python 3.12 env + homr + its models (~100 MB). Needs uv and pdftoppm
tools/omr/.venv/bin/python tools/omr/pdf2xml.py literacy/BOOK.pdf --pages 8 --crop 0,0.30,1,0.46 --title "Dancing" --composer "Paul Harris"
./ingest.sh --accept-unknown --stage 0   # then check, rate and file it (textbook composers are not on the classical list; the stage guess is high for exercises)
```

What happens per page: render at 300 dpi → optional crop → homr → title and composer written in → every bar checked against its time signature (the importer's own check).
Clean files go to `inbox/`; files with irregular bars go to `tools/omr/review/` to fix in MuseScore or re-crop. Each result also names an image of what homr found: look at it.

## Picking pieces and converting a book

A page holds several pieces and teaching diagrams, so pick pieces by their numbered staff systems instead of guessing fractions:

```bash
tools/omr/.venv/bin/python tools/omr/scan.py literacy/BOOK.pdf --pages 36-51     # a picture per page in tools/omr/work/<book>/scan-pNNN.jpg, systems numbered
tools/omr/.venv/bin/python tools/omr/sheets.py literacy/BOOK.pdf 36 51            # two pages side by side (sheet-036.jpg ...) to read through a unit quickly
tools/omr/.venv/bin/python tools/omr/pdf2xml.py literacy/BOOK.pdf --piece 38:3,39:1-4 --title "Russian Folk Song" --composer Traditional
```

`--piece PAGE:SYSTEMS,...` cuts the systems out and stacks them into one image, so a piece that runs over a page break is one score.
System numbers belong to a version of `scan.py`: if the detector changes, re-scan before trusting old numbers. When the detector misses a staff
(a beam can merge two staff lines into one thick line), give that part as a strip of the page, `74:3+0.775-0.925` = system 3, then the band from 77.5%
to 92.5% of the page height. For a list of pieces write a manifest (`batches/*.json`) and run `batch.py MANIFEST` (report only) or `batch.py MANIFEST --apply`
(adds the clean ones to the library through `tools/import-scores.py`, with the stage and source from the manifest; `--replace` overwrites pieces that are already there).

What each conversion goes through, in order: homr → title and composer → **canonicalize** (homr writes a bar in time order and hops between hands with `<backup>`;
every bar becomes one run per hand, each starting on the bar line) → typed-in `patches` → rests added for a silent hand (`--fill-rests`) → bass-only pieces get an
empty treble staff → **restream** (fresh backups) → checks (every bar adds up, first+last bar make one bar, no hand runs past the bar line).
Skipping canonicalize breaks things quietly: a patched or filled bar can look right in a list of notes and still put the left hand on the wrong beat.

Method books such as Faber print no rests for the hand that is silent, so homr's bars come out short, and the hand that enters late would play on beat 1.
`--fill-rests upper-first|lower-first` (manifest: `"fillRests"`) adds the missing rests where it is safe: an empty staff gets a whole-bar rest, and bars where the
two hands' notes together fill the bar exactly get a rest before the later hand. Which hand plays first is not in the file, so you say it. Any other short bar is
left alone and fails the check, which is right: it is a misread.

Checking a conversion against the page, in order of effort: `bars.py FILE` (one line per bar), `badbars.py FILE` (which bars fail), `ruler.py` and `heads.py` (label the
pitch of every line and space, or measure note heads: they settle "is that C5 or B4"), then the picture homr saves next to each result.

## First batch: Faber Adult Piano Adventures Book 1, Units 2–3 (2026-10-26, `batches/faber-1-units-2-3.json`)

| Piece | How it got in |
|---|---|
| Midnight Ride (pp. 38–39, 20 bars) | OMR, clean; every pitch checked against the page |
| Chant of the Monk (p. 42) | OMR, clean (15 notes counted by hand); right hand only |
| Shining Stars (pp. 44–45, 20 bars) | OMR with `upper-first` rests (16 added); every pitch checked |
| Russian Folk Song (pp. 36–37, 16 bars) | typed by hand from the page: OMR misread a bar line and invented notes |
| Chant of the Monks (p. 43, 10 bars) | typed by hand: the note heads contain letter names, which homr cannot read past |
| Roman Trumpets (pp. 46–47, 16 bars) | typed by hand: homr invented left-hand notes in four empty bars; the final 8va left-hand 5th is written at its sounding pitch |

OMR alone passed 3 of 6; the other 3 were transcribed from the page with `handfix.py` (a `"hand"` entry in the manifest, bars validated, same MusicXML shape) and
compared with the page in the app. They are as reliable as the transcription: check them against the book when you play them. Not converted on purpose:
"Catch a Falling Star" (a 1957 pop song: no pop), and the Study in 2nds exercises (technique, not pieces).

## Second batch: Faber Book 1, Units 4–9 (Stage 1), 18 pieces (`batches/faber-1-units-4-9.json`)

Nachtmusik, New World, Royal Procession, Ode to Joy (bass clef), All Through the Night, Lightly Row, Surprise Symphony, Hungarian Dance, Shepherd's Song,
French Minuet, Morning, English Folk Song, Gavotte, Simple Gifts, Moon on the Water, 500-Year-Old Melody, Musette, Theme by Mozart.

OMR alone passed 6 of 18 on the first run; 10 more needed typed-in bars or patches, and each was compared with the page. How they got in:

| How | Pieces |
|---|---|
| OMR, bars checked | Royal Procession (1 bar patched), Ode to Joy (bass clef), Lightly Row, Surprise Symphony, Hungarian Dance, 500-Year-Old Melody, Musette, English Folk Song |
| OMR + patches | New World (4 bars of left-hand rests), Moon on the Water (a chord), Theme by Mozart (7 right-hand bars an octave too high), Morning (a missed staff, taken as a strip) |
| typed from the page | Nachtmusik, All Through the Night, French Minuet, Gavotte, Shepherd's Song, Simple Gifts |

Only hand-checked pieces are in the library. The whole record of what is in and what is missing is [11-ingestion-ledger.md](../../11-ingestion-ledger.md); Unit 8 and part of Unit 9 are still to do. Left out on purpose: "Jingle Bells", "Happy Birthday", "Taps" and "Reveille" (a Christmas song, a pop song and two bugle calls: not
repertoire for this course), "Catch a Falling Star" and the teacher duets. The book's repeat in 500-Year-Old Melody is not played back.

## Third batch: Faber Book 1 Units 8–13 (`batches/faber-1-units-8-9.json`, `faber-1-units-10-13.json`)

Nine pieces: May Dance, When the Saints Go Marching In, African Celebration, American Fiddle Tune (Units 8–9, compared with the page); Half-Time Band, Romance,
Sleeping Beauty Waltz, Scale Waltz, Trumpet Voluntary (Units 10–13, compared with the page by eye only, flagged in the library). Four more were tried and are
**held for hand transcription** because the lyrics under the staves confuse the OMR (Greensleeves, Danny Boy, Aria, Nobody Knows the Trouble I've Seen; Danny Boy
came out with a different number of bars than the page). New tools: `compare.mjs` + `compare.py` (the source crop above the app's drawing of the converted score:
the fastest way to see a wrong note) and `strip_marks` (homr invents fermatas, trills and arpeggio squiggles: removed on every conversion).

## Tested 2026-10-26 (CPU only, 12 cores)

| Input | Time | Result |
|---|---|---|
| Harris level 1, one 4-bar piece (crop) | 7 s | 13 notes, both staves, all bars add up, pitches and rhythm match the page |
| Harris level 1, whole page (5 pieces) | 20 s | all 20 bars correct, but one score (the pieces' bars run on): crop each piece |
| Faber Adult Book 1 p. 38, "Midnight Ride" (crop) | 10 s | 4 bars, bass-clef notes and the treble dotted half correct, accents kept; loads and plays in the app |

Earlier the idea was dropped after a 150 ppi 4-bit Beyer scan took 6 minutes and gave wrong bar lengths. The scans in `literacy/` are mostly 300–360 ppi, which is a better input, and homr is much faster. Still untested: Beyer, Mikrokosmos (162 ppi) and dense pieces (Einaudi, Easy Piano Classics). Expect more errors the denser and lower-resolution the page is.

## Typed by hand (`handfix.py`)

When OMR cannot read a piece, put the transcription in the manifest: `"hand": {"timeSig": [4, 4], "fifths": 0, "rh": "C4+E4:q D4:q | R:w", "lh": "A3:q R:h. | R:w"}`.
Bars are separated by `|`; `C4+E4:q` is a chord, `R:h.` a dotted-half rest, `F#4` / `Bb3` accidentals. A bar that does not fill the time signature is an error that names the bar.

## Tests

`tools/omr/.venv/bin/python tools/omr/tests/test_pdf2xml.py` covers canonicalize, patching and the timing checks.

## Limits

- Pitch and rhythm only: no dynamics, slurs, fingering, pedal or tempo marks (accents do come through). Read those from the book.
- Empty staves lose their whole rests (a bar with only the other hand playing has no rest on the silent staff). The app does not need them.
- The importer's difficulty guess puts simple exercises at stage 3: pass `--stage N` (the manifest does).
- Circled note heads (Faber's hand-placement marks) and dense dyads confuse homr; see the first batch.
- **oemer** (the other engine considered) is not used: it crashes on current onnxruntime and numpy, needs different versions of each, ran 5 min a page when it did run, and has had no release since 2025.
- Books are copyrighted: converted files stay local (`inbox/`, `app/scores/` and the `.venv`, `work/`, `review/` folders are git-ignored). Do not publish them.

## As an MCP tool

```bash
claude mcp add piano-omr -- tools/omr/.venv/bin/python tools/omr/mcp_server.py
```

Gives Claude Code one tool, `pdf_to_musicxml(pdf_path, pages, title, composer, crop, dpi)`, which runs the same pipeline and returns the per-page report. Tested with a real MCP client (tool listing and error handling); not yet registered in this project's settings.
