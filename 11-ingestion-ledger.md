# Ingestion ledger

What from the books in `literacy/` is already in the app as playable MusicXML, and what is still missing. The books themselves are private and are not in the repo ([09-library-catalog.md](09-library-catalog.md) maps them to stages). Updated 2026-10-26.

"Ingested" means a piece is in `app/scores/library.json`, checked against the page. Everything else is still on paper. Conversion tooling: [tools/omr/README.md](tools/omr/README.md).

## In the library now (generated)

Refresh with `python3 -I tools/ledger.py`. The app also has 31 own exercises (`pieces.ts`, stages 0–3) and 46 generated scales and arpeggios, which are not in this table.

<!-- library:start -->
| Source | Scores | Stages |
|---|---|---|
| Faber Adult Piano Adventures Book 1 | 33 | 0: 6, 1: 22, 2: 5 |
| musetrainer/library | 44 | 3: 7, 4: 7, 5: 13, 6: 17 |
| **All imported scores** | **77** | 0: 6, 1: 22, 2: 5, 3: 7, 4: 7, 5: 13, 6: 17 |
<!-- library:end -->

## By book

| Book | Status | Done | Missing |
|---|---|---|---|
| Faber, *Adult Piano Adventures* **Book 1** | **partly** | 33 pieces from Units 2–13 (24 checked note by note, 4 from Units 8–9 and 5 from Units 10–13 checked against the page by eye), see below | Unit 1 (pp. 9–27, almost no staves: keyboard diagrams, not read closely), 4 lyric-heavy pieces of Units 10–11, Units 14–16 |
| Faber, *Adult Piano Adventures* **Book 2** | not started | – | everything (Stage 3 spine) |
| Bartók, *Mikrokosmos* Vol. I–II | not started | – | everything; scan is 162 ppi, so expect more OMR errors |
| Beyer, *Vorschule* Op. 101 | not started | – | everything. Public domain, but dense; an earlier 150 ppi test failed |
| *Discovering Music Theory* Grades 1–5 | not for import | – | a workbook: do it on paper |
| Paul Harris, *Improve Your Sight-Reading!* Levels 1–5, Grades 6–8 | not started | page 8 of Level 1 was converted as a test only (not in the library) | everything. Five pieces share a page, so each needs its own crop. The in-app sight-reading test covers levels 1–7 meanwhile |
| ABRSM *Piano Exam Pieces 2025–26*, Grades 1–8 | not started | – | everything; some pieces are to be skipped (film and pop songs, see 09) |
| *Library of Easy Piano Classics* 1 and 2 | not started | – | everything (arranged anthologies, 296 and 233 pages) |
| *The Library of Piano Classics* | not started | – | everything (Stage 5+) |
| Einaudi, *Islands* and *Divenire* | not started | – | everything; dense pages, homr is untested on them |
| musetrainer library (downloaded MusicXML, not from the books) | done | 44 scores | – |

## Faber Book 1, unit by unit (PDF page numbers)

| Unit | PDF pages | In the library | Not ingested, and why |
|---|---|---|---|
| 1 Introduction to Playing | 11–29 | – | keyboard and rhythm diagrams, no pieces found with the staff scan; not read page by page |
| 2 Orientation to the Staff | 30–43 | Russian Folk Song, Midnight Ride, Chant of the Monk, Chant of the Monks | "Catch a Falling Star" (1957 pop song); the Study in 2nds exercises (technique) |
| 3 Reading Reinforcement | 44–51 | Shining Stars, Roman Trumpets | – |
| 4 More About Staff Reading | 52–63 | Eine Kleine Nachtmusik, New World Symphony Theme, Royal Procession | "Jingle Bells" (Christmas song) |
| 5 More Bass Clef Note Reading | 64–71 | Ode to Joy (bass clef), All Through the Night, Lightly Row, Theme from the Surprise Symphony, Hungarian Dance, Shepherd's Song | – |
| 6 Eighth Notes | 72–83 | French Minuet, Morning, English Folk Song, Gavotte, Simple Gifts | "Taps" and "Happy Birthday" (a bugle call and a pop song) |
| 7 Treble Space Notes | 84–91 | Moon on the Water, 500-Year-Old Melody | "Reveille" (bugle call) |
| 8 Treble C Pentascale | 92–97 | May Dance, When the Saints Go Marching In, African Celebration | the 3-minute technique pages |
| 9 G Pentascales in 3 Locations | 98–105 | Musette, Theme by Mozart, American Fiddle Tune | the pentascale warm-ups |
| 10 Sharps and Flats | 106–117 | Half-Time Band, Romance (Mozart), Sleeping Beauty Waltz | **to do by hand:** Greensleeves (lyrics confuse the OMR); not converted: Summer Mountain Rain (pedal and 8va notation), the warm-ups and teacher duets |
| 11 Intervals | 118–129 | – | **to do by hand:** Danny Boy, Aria (Mozart), Nobody Knows the Trouble I've Seen (lyrics); Chinese Kites and New Age Sounds not tried; skipped: "The Lion Sleeps Tonight" (1961 pop song) |
| 12 The C Major Scale | 130–135 | Scale Waltz | **to do:** Vive la France! (the overlapping boxes need strips) |
| 13 The G7 Chord | 136–143 | Trumpet Voluntary | **to do:** the rest of the unit |
| 14 Primary Chords in C Major | 144–155 | – | **to do** |
| 15 The G Major Scale (continued) | 156–161 | – | **to do** |
| 16 Primary Chords in G Major | 162–175 | – | **to do** |

Unit 13 is the G7 chord (its page header was cut off in the first scan, which is why an earlier version of this table called it the G major scale).

## Single pieces from loose PDFs

| Piece | Source | How it got in |
|---|---|---|
| Tomorrow's Song (Ólafur Arnalds, 48 bars, stage 4) | *Living Room Songs* sheet PDF, `batches/arnalds-tomorrows-song.json` | OMR misread 20 bars (ties, triplets, a held low note read as extra bars), so it was typed from the page with `handfix.py` (now with triplets, ties, sixteenths and a second left-hand voice). Low notes measured from the page image. Both staves are written in treble clef on the page; the left hand is kept at its written pitch and drawn in bass clef. The held bass note is its own voice. Check it against the page while playing. |

## What is next, in the order the course needs it

1. Faber Book 1: hand-transcribe the four lyric-heavy pieces, then Units 14–16 (Stage 2).
2. Paul Harris Levels 1–2 for sight-reading practice (Stage 1–2), one crop per piece.
3. Faber Book 2 (Stage 3), then ABRSM Grades 1–2.
4. Mikrokosmos and Beyer for daily short reading, if the scans convert well enough.
5. Easy Piano Classics 1–2 and the Einaudi books for the repertoire blocks of Stages 3–5.

Skipped pieces are not lost: they are listed here and in `tools/omr/batches/*.json`.
