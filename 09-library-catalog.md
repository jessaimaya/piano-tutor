# Library catalog (`literacy/`)

> `literacy/` is the author's private collection of method books and is **not part of this repository**. Treat this file as a map of which published books fit which stage, and buy or borrow your own copies.

Book-level map of what is in `literacy/`, where it fits in [02-syllabus.md](02-syllabus.md), and how it connects to the app.
Updated 2026-10-25. The books stay local and are **not** bundled into the app (see [app/README.md](app/README.md#writing-a-lesson)).

**How the app uses a book:** you play from the book (paper, tablet or PDF) and the app listens. A piece only gets scored
when it exists in the app as MusicXML or in `pieces.ts`. Until then the catalog is the plan: *what to play next, from which page*.

## Method books and theory

| Book | Pages | Stage | Role | Text layer |
|---|---|---|---|---|
| Faber, *Adult Piano Adventures* All-in-One **Book 1** | 188 | 0–2 | Spine for the first ~6 months | yes |
| Faber, *Adult Piano Adventures* All-in-One **Book 2** | 201 | 3 | Continues Book 1 | yes |
| Bartók, *Mikrokosmos* Vol. I–II (Henle) | 60 | 1–3 | Daily short reading pieces | partly (OCR-quality) |
| Beyer, *Vorschule im Klavierspiel* Op. 101 | 86 | 1–3 | Extra reading. **Public domain**: the one book that can be transcribed into the app | no (scan) |
| *Discovering Music Theory*, ABRSM Grades 1–5 | 203 | 2–5 | Theory workbook; do the chapter for your grade | no (scan) |

## Sight-reading (feeds roadmap item 5, the sight-reading test)

| Book | Pages | Level | What the stages cover (from its contents page) |
|---|---|---|---|
| Paul Harris, *Improve Your Sight-Reading!* piano **Level 1** | 42 | Grade 1, early elementary | 9 stages: C major, small leaps, G major, F major, mixing hands, tied notes, A minor and phrasing, staccato/slurs/accents, D minor, longer exercises |
| … **Level 3** | 41 | Grade 3, late elementary | 9 stages: changing hand position, chords, A minor, B minor and D major, Bb major and G minor, Eb major, 3/8-style rhythms, revision |
| … **Level 5** | 37 | Grade 5, intermediate | 8 stages: pianistic styles (Alberti bass, walking bass, arpeggios), C minor, F# minor, thicker textures, complex rhythms, Ab major, syncopation, triplets, E major |
| … Level 2, Level 4 | 39 / 41 | Grade 2 / 4 | Same layout, contents not read |
| … Grade 6, 7, 8 | 40 / 36 / 40 | Later | Same layout |

Each stage has rhythm exercises, melodic exercises, then sight-reading pieces. Do the rhythm exercises first (clap or tap them).

Use: one test per day at the start of practice, played once without stopping. Start at Level 1 once Stage 2 begins.
When the app's sight-reading test exists, its difficulty levels should follow these (rhythm, key, range, hand independence).

## Graded repertoire

| Book | Pages | Stage | Notes |
|---|---|---|---|
| ABRSM *Piano Exam Pieces 2025–2026*, Grade 1 | 14 | 3 | Skip *Remember Me* (film song) |
| … Grade 2 | 20 | 3 | Kabalevsky *A Little Song* is a good pick |
| … Grade 3 | 23 | 4 | Skip *Where is Love?* and *The Muppet Show Theme* |
| … Grade 4 | 23 | 4 | Skip *Wallace and Gromit Theme* |
| … Grade 5 | 27 | 5 | Skip *Someone You Loved* and *The Village in May* (arrangements) |
| … Grade 6–8 | 27 / 32 / 42 | 5+ | Not yet checked against the no-pop rule |
| *Library of Easy Piano Classics* (Music Sales) | 296 | 3–5 | Arranged classical anthology. Includes *Gymnopédie No. 1* and *Canon* (Pachelbel) |
| *Library of Easy Piano Classics 2* | 233 | 3–5 | Same series. Starts with Bach *Prelude in C* |
| *The Library of Piano Classics* (Music Sales) | 353 | 5+ | Harder: Beethoven, Chopin nocturnes and preludes, Debussy *Clair de lune*. A long-term goal |

The two *Library of Easy Piano Classics* books are arrangements, not urtext. Check fingering and any simplification before relying on them.

## Neoclassical (your main goal)

| Book | Pages | Stage | Notes |
|---|---|---|---|
| Einaudi, *Divenire* (Chester, solo piano) | 90 | 5+ | Pieces: Uno, Divenire, Monday, Andare, Rose, Primavera, Oltremare, L'origine nascosta, Ascolta, Ritornare, Luce. Most are well beyond Stage 3 |
| Einaudi, *Islands: Essential Einaudi* | 141 | 4–5 | 19 pieces (page): I Giorni 6 · The Earth Prelude 12 · Le Onde 18 · Nightbook 26 · Divenire 34 · Fairytale 44 · Nuvole Bianche 48 · Dietro Casa 56 · Primavera 61 · Nefeli 68 · Berlin Song 76 · High Heels 81 · L'origine nascosta 88 · Love Is a Mystery 91 · Monday 96 · Lady Labyrinth 104 · Ancora 110 · Andare 128 · Indaco 138. Your likely first Einaudi book: *Dietro Casa*, *The Earth Prelude* and *Nuvole Bianche* fit the plan's early targets, and *Le Onde* is the Year 3+ goal |

## Removed

- Faber, *Adult Piano Adventures Popular Book 1* (pop arrangements), deleted 2026-10-25.
- A crime novel that landed in `literacy/` by mistake, deleted 2026-10-25.
- Einaudi *Piano Tab* Vol. 1 (Caligiuri), Einaudi *Elegy for the Arctic* tab and Jester *Easy Keyboard and Piano Pieces*, deleted 2026-10-25: note letters instead of staff reading.

## Open questions

- Level 2 and 4 of the Harris books, *Divenire*, and the Mikrokosmos numbering still need their contents read before pieces are assigned to stages.
- Which *Islands* pieces to buy as MusicXML first (see above).

## MuseTrainer library (github.com/musetrainer/library)

69 `.mxl` files. Personal use, so the licence question is parked: the composers are old, but the files are community
arrangements and the repo names no source. I downloaded all 69, rated each with [tools/score-difficulty.py](tools/score-difficulty.py)
and added the 44 that fit your goals to `app/scores/` (manifest: `app/scores/library.json`, field `difficulty` = the measured score).

How the rating works: it reads the notes (density of the busiest bars, hand span, accidentals, key signature, fastest note, chord size, length)
and gives about 20 for very easy up to 200 for virtuoso. Thresholds: ≤ 55 → stage 3, ≤ 85 → stage 4, ≤ 125 → stage 5, above → stage 6.
It cannot see tempo, so fast pieces (Bumblebee, Turkish March, Hungarian Dance) were moved up by hand, and a few pieces were set by
their usual grade (Chopin prelude and waltz). Each override is written in the entry's `notes`. Treat the stages as a first sort and
move any that feel wrong once you've played them.

**Stage 3 (≈ Grade 1–2)**: Carol of the Bells (easy) (32) · Swan Lake theme (easy) (41) · Für Elise (easy) (42) · Greensleeves (easy) (43) · Ode to Joy (easy variation) (44) · Minuet in G (BWV Anh. 114) (49) · Canon in D (easy, fingered) (52)

**Stage 4 (≈ Grade 3–4)**: Für Elise (beginner, 3/8) (66) · Prelude in C, BWV 846 (67) · Danse villageoise (73) · Nocturne Op. 9 No. 2 (easy) (76) · Gymnopédie No. 1 (78) · Air on the G String (78) · Canon in D (medium) (82)

**Stage 5 (≈ Grade 5–6)**: Waltz in A minor (B. 150) (74) · Lacrimosa (Requiem) (79) · Waltz of the Flowers (86) · Piano Sonata No. 16, K. 545, 1st mvt (87) · Canon in D (full) (97) · Nocturne in C♯ minor (posth.) (107) · Serenade (Ständchen), Liszt arr. (116) · Moonlight Sonata, 1st mvt (119) · Nocturne Op. 9 No. 2 (full) (120) · Für Elise (full, fingered) (125) · Prelude in E minor, Op. 28 No. 4 (131) · Ave Maria (D. 839) (132) · Gnossienne No. 1 (136)

**Stage 6 (Grade 7+, later goals)**: Arabesque No. 1 (98) · 12 Variations on "Twinkle, twinkle" (K. 265) (107) · Flight of the Bumblebee (108) · Hungarian Dance No. 5 (112) · Turkish March (fingered) (119) · Liebestraum No. 3 (124) · Nocturne Op. 9 No. 1 (127) · Waltz Op. 64 No. 2 (130) · Symphony No. 5, 1st mvt (piano solo) (134) · Prelude in C minor, BWV 847 (137) · Ballade No. 1 (142) · Clair de lune (148) · Dance of the Sugar Plum Fairy (159) · Moonlight Sonata, 3rd mvt (159) · Pathétique Sonata, 2nd mvt (170) · Toccata and Fugue in D minor (183) · La Campanella (206)

**Left out (25 files):** no-pop rule: *Bella Ciao* ×2 (TV arrangement), *Happy Birthday* ×2, *Mariage d'amour* ×3 (a 1970s pop-classical piece, also
listed as "Spring Waltz") · ragtime: *The Entertainer* ×2, *Maple Leaf Rag* · duplicates of pieces already included (Satie Gymnopédie short version,
Canon in D easy copy, Für Elise copies, Minuet copy, Chopin prelude copy, Clair de lune copy, Moonlight 3rd copy, Mozart K. 545 and Rondo copies) ·
unidentified or broken: *Passacaglia* ×2, *Hungarian Sonata*, the two *G minor Bach* files (one has almost no notes in it).
Compound-meter files (3/8, 9/8, 12/8) are included, but the count-in assumes quarter-note beats, so start them in wait mode.
Almost no file has fingering (only Canon and the A minor waltz do): use your books.

## piano-ml (github.com/piano-ml/piano-ml)

GPL-3.0 web app (Angular frontend, Java backend with a Postgres database; "learn piano with a MIDI keyboard"). It contains no sheet music
beyond two test files, so there was nothing to take on that front. Ideas worth borrowing (as ideas: we would write our own code,
since copying would pull in the GPL):

1. **Scale and arpeggio exercises with fingering for all 24 keys.** Its tables use the standard fingerings, two octaves, up and down,
   plus two-octave arpeggios in root position and both inversions. Our library has only C and G scales. This fits roadmap item 7
   (generated exercises) and the stage 2 exit criteria. Highest value.
2. **A tempo-and-repeat exercise runner**: each exercise has a tempo and repeat count, so you do it N times and the tempo goes up. We already
   have the ladder; we could feed it these generated exercises.
3. **Auto-grading a score 0–8 from features.** Its database has a `grade` column, but the model is not in the repo. We now do this
   ourselves (`tools/score-difficulty.py`), so nothing more to take.
4. **Browse by key and by composer/genre**, "popular scores in key": would help once the library has 80+ entries.
5. Not needed: accounts, Postgres, MusicBrainz lookups, OMR upload, auto-harmonization (a music21 script that adds chord symbols).

## Getting music into the app

OMR on the scanned books doesn't work well enough (tested on one Beyer page: 6 minutes per page, wrong bar lengths).
Beyer is public domain, but its pages are dense and the first exercises (Op. 101 pp. 8–9) are short five-finger drills that
`pieces.ts` already covers, so I'm not transcribing it now. For everything else, buy or download MusicXML (see
[04-sheet-music-sources.md](04-sheet-music-sources.md)).
