# Lesson ladder and daily session (draft for review)

Status: **built for stages 0–2, 2026-10-26; sequence and generated content reviewed 2026-10-27 (see [13-progression-review.md](13-progression-review.md), which is newer than the unit tables below where they differ)** (see "Decisions" at the end and `app/README.md`). It was a draft first; the text below is the design as written, with the changes listed at the end. It turns [02-syllabus.md](02-syllabus.md) and [05-practice-routine.md](05-practice-routine.md) into something the app can run: what one day looks like, how it shrinks or grows with the time you have, and which unit of the course comes next. Part of [10-course-mode-plan.md](10-course-mode-plan.md). What is already playable is in [11-ingestion-ledger.md](11-ingestion-ledger.md).

Assumptions I made so I could write it (change any of them): you start at **Stage 0** (your profile says total beginner), the spine is Faber Adult Book 1 then 2, units advance by their exit criteria, and a missed day costs nothing (no streak penalty beyond the streak itself).

## 1. One day, as dots

At the top of the screen: one dot per step, filled when done, a ring on the current one. At 25 minutes there are **six** dots.

| Dot | Step | Min | What the app does | Track |
|---|---|---|---|---|
| 1 | **Warm-up** | 3 | The unit's technique item, tempo ladder on, hands separate then together. Slow and relaxed | K |
| 2 | **Reading** | 5 | Two or three new generated pieces at your reading level (one level below your main work), played once, no stopping | R, T |
| 3 | **New bars** | 6 | Today's piece, today's hand mode (table below), wait mode | C, M |
| 4 | **Make it steady** | 6 | The same piece in tempo mode: ladder up four bpm after each clean run | T, C |
| 5 | **Review** | 3 | One finished piece from the review pool, start to finish, tempo mode | M |
| 6 | **Play** | 2 | Something you like: the stretch piece of the unit, or any finished piece, no scoring pressure | M |

Minutes are a guide, not a timer that cuts you off. A step ends when you press **Next** (or the app offers it when the time is up). Skipping a step leaves its dot empty, so the day is not "complete", but nothing else is lost.

### The hand mode of "New bars" depends on which day of the piece it is

| Day with this piece | Hands | Mode |
|---|---|---|
| 1 | Listen once, then right hand | wait |
| 2 | Left hand | wait |
| 3 | Both, at half tempo | wait, then tempo |
| 4 and later | Both | tempo ladder from "Make it steady" |
| Piece with one hand only | That hand, skip day 2 | wait → tempo |

A piece is **finished** by the rule already in the app: three clean tempo runs in a row at its target tempo with its own hands. Then the next piece of the unit becomes "today's piece", and the finished one enters the review pool.

### If you have less (or more) time

The order of dropping is fixed by the routine's own rule: skipping the warm-up is fine, skipping reading is not.

| Minutes | Dots | Steps (min) |
|---|---|---|
| 10 | 3 | Reading 3 · New bars 5 · Play 2 |
| 15 | 4 | Reading 4 · New bars 5 · Make it steady 4 · Play 2 |
| 20 | 5 | Warm-up 2 · Reading 4 · New bars 5 · Make it steady 5 · Play 4 (review folds into play) |
| **25** | **6** | as in the table above |
| 30 | 6 | Warm-up 4 · Reading 6 · New bars 8 · Make it steady 7 · Review 3 · Play 2 |
| 45 | 7 | the 30-minute day plus a second piece's "New bars" (a piece from the previous unit that is not finished) |

### Once a week (from the routine's weekly rhythm)

Saturday replaces "New bars" and "Make it steady" with **replay**: every "kept up" piece once. Sunday's recording is left out until the app can record. Every fourth week the Reading step is the sight-reading test, and the result sets the reading level.

## 2. What the app picks each step

- **Warm-up:** the unit's exercises, easiest first: two warm-up days on each, then the next (units 1.5 and 2.1 go round instead). Five-finger positions come in four versions (steps, holds, thirds, mixed). Hands rotate by unit (right, left, turns, then both). Today the app has scales and arpeggios in 23 keys (stages 2+). **For Stages 0–1 the app has no pure five-finger-pattern exercise yet**; until I generate them (C, G, F, D positions, same machinery as the scales), Stage 0–1 warm-ups use the unit's easiest piece with a metronome.
- **Reading:** a rung of the reading ladder (`content/reading.ts`, 28 rungs, each adding one thing). Every unit covers a few rungs (`reading.from` to `reading.to`): you start on the first and climb by reading well (two days at 80% up, a day under 50% down), never past the unit's last rung, so reading cannot run ahead of the lesson. The seven-level test only places a new player.
- **Review pool:** finished pieces, oldest play first, so each comes round about once a week.
- **Stretch piece:** the unit's last piece, or the first Einaudi/Pärt-type target of the stage when one exists in the library.

## 3. The units

Each unit is a few days to two weeks: it ends when its **exit** is met, not when the calendar says so. "Own" pieces are in `pieces.ts`; "Faber" and the rest are imported scores (ids in the ledger and in `library.json`).

### Introduction week (before Stage 0)

Added 2026-10-27 at the player's request: **right hand first, then left, then basic exercises with both**, before any reading. Seven days, three units, no reading step and no note cards (reading the staff starts in unit 0.1). The five-finger exercise in the Middle C position is the whole day: warm-up (steps), the new exercise (holds, then thirds), the steady run, review and play. The unit fixes the hands, and the score shows the other hand's staff faded.

| Unit | Days | Hands | Exercise | Said at the keyboard |
|---|---|---|---|---|
| I.1 Right hand at the keyboard | 2 | right | steps (warm-up), holds | thumb on Middle C, curved fingers, finger numbers, arm weight |
| I.2 Left hand at the keyboard | 2 | left | steps (warm-up), holds | the left thumb on Middle C too: the hand reaches down, a mirror image |
| I.3 Both hands, basic exercises | 3 | both, slow on the first day | steps (warm-up), holds, thirds | both thumbs on Middle C; the hands move in opposite directions on the same fingers |

A unit ends after its days (`exit.days`), not by finishing a piece. A player who skips the placement test starts here; the sight-reading test places a player who passes nothing here too. *More → Go back to the introduction week* returns to it.

### Stage 0: Orientation (weeks 1–4)

Syllabus goal: names notes in the Middle C range, hands take turns, steady ♩=60.

| Unit | Focus | Main pieces (in order) | Reading rungs | Exit |
|---|---|---|---|---|
| 0.1 | Right hand, Middle C position | Two Notes · Hot Cross Buns (easy) · Down the Stairs · Chant of the Monk · Right-Hand Walk | 1–5 | Chant of the Monk finished |
| 0.2 | Left hand, Middle C and down | Three Steps Down · Left-Hand March · Left-Hand Walk · Echo | 6–9 | Left-Hand March finished |
| 0.3 | Hands take turns, 4/4 | Hands Take Turns · Question and Answer | 10–12 | Question and Answer finished |
| 0.4 | 3/4 and the dotted half | Three Beats · Midnight Ride | 13–14 | Midnight Ride finished |
| 0.5 | Stage exit | Shining Stars · Sixteen Bars | 15–16 | **Stage exit** (below) |

**Stage 0 exit:** a 16-bar hands-alternating piece without stopping in time (Sixteen Bars, a tempo run at 80%+ of steps in time) · reading rung 16 reached · name notes in the Middle C range within 2 seconds (not measurable by the app yet: a flash-card step would do it).

### Stage 1: Five-finger positions (months 1–3)

Syllabus goal: first hands together (octaves apart → one holds → contrary motion), positions C, G, F, D, eighth notes, upbeats.

| Unit | Focus | Main pieces | Reading rungs | Exit |
|---|---|---|---|---|
| 1.1 | Hands in octaves, treble and bass | Octaves Apart · Chant of the Monks · Ode to Joy (RH) · Ode to Joy (bass clef) · Lightly Row · All Through the Night | 17–18 | Chant of the Monks finished |
| 1.2 | One hand holds, the other moves | Ode to Joy (hands together) · Roman Trumpets · Hungarian Dance · Eine Kleine Nachtmusik · 500-Year-Old Melody · Russian Folk Song · Royal Procession | 19–20 | Royal Procession finished |
| 1.3 | Contrary motion, other positions | Opening and Closing · Home in G · Home in F · Au clair de la lune · Mary Had a Little Lamb · Theme from the Surprise Symphony · New World Symphony Theme | 21–22 | Opening and Closing, Home in G, Home in F finished |
| 1.4 | Eighth notes, rests, upbeats, 3/4 | Hot Cross Buns · French Minuet · Musette · Shepherd's Song · Simple Gifts · Gavotte · Morning | 23–24 | Gavotte finished |
| 1.5 | Stage exit | Theme by Mozart · Moon on the Water · English Folk Song · Low Voice · Breathe · May Dance · American Fiddle Tune · When the Saints · African Celebration | 24–25 | **Stage exit** (below) |

**Stage 1 exit:** reading rung 25 reached (the syllabus says "a Mikrokosmos piece at 90%"; the app's generated levels stand in for it) · five-finger patterns hands together in four keys (C, G, F, D: needs the missing warm-up exercises) · 8 pieces of the stage in the "kept up" pool.

### Stage 2: Leaving the position (months 3–7)

The app has the technique side (C, G, F, D scales and A minor, chord steps) and own pieces (C scale, Twinkle, Frère Jacques), but **no imported stage 2 music yet**: the matching book material is Faber Units 10–16 (sharps and flats, intervals, C and G scales, primary chords), which is the next thing to convert. Units, once it exists:

| Unit | Focus | Pieces |
|---|---|---|
| 2.1 | Sharps, flats, naturals; keys C, G, F | Faber Unit 10 pieces (to convert) · own scale pieces |
| 2.2 | One-octave scales, thumb-under | scales C, G, F, A minor · Faber Units 12–13 |
| 2.3 | Chords I–IV–V, melody over chords | Chord Steps · Faber Units 14 and 16 |
| 2.4 | Pedal, first pieces in your genre | Pärt *Für Alina* (not in the library: needs a score) |

### Stages 3–5

Outlined in the syllabus; the app has the technique (scales 2 octaves, arpeggios) and the musetrainer scores at stages 3–6 (Carol of the Bells, Swan Lake, Für Elise, Greensleeves, Minuet in G, Canon in D and others), plus 6 own stage 3 pieces. The course content for them (Faber Book 2, ABRSM Grade 1–2 onwards, Einaudi) is still on paper.

## 4. How a unit is stored (for the build)

One `course.json`, read like `library.json`, with the course data separate from the code (the principle in 06-app-notes):

```json
{ "stage": 1, "unit": "1.2", "title": "One hand holds, the other moves",
  "warmup": ["t-five-c", "t-five-g"],            // ids of exercises; missing ids fall back to the easiest main piece
  "reading": { "level": 2 },
  "main": ["x-brahms-hungarian-dance", "x-mozart-eine-kleine-nachtmusik", "..."],
  "stretch": "x-faber-royal-procession",
  "exit": { "finished": ["x-faber-royal-procession"], "readingLevel": 3 } }
```

State (current unit, piece, day of the piece, reading level, review pool) lives in the same place as the practice log, which is why persistent storage comes first in the build order.

## 5. What I need from you

1. **Where do you start?** Stage 0 as written, or run the sight-reading test first and start where it lands.
2. **The six dots and the minutes** (section 1): right, or would you rather have fewer, bigger steps (for the minimal view on the e-ink phone, four dots may read better)?
3. **Five-finger warm-ups:** should I generate them (about a day's work, same machinery as the scales), or do Stage 0–1 warm-ups from the pieces?
4. **Stage 2 content:** convert Faber Units 8–16 first so Stage 2 has real music, or build Course mode on Stages 0–1 and add Stage 2 content afterwards?
5. **Flash cards for note names** (Stage 0 exit): wanted as a small step in Stage 0 days, or skip?

## 6. Decisions (2026-10-26) and what was built

1. **Start:** the sight-reading test first. Course mode offers it on first use ("Take the test" or "Start at the beginning"); the level passed picks the unit (`placement` in `course.json`: 0 → 0.1, 1 → 0.2, 2 → 0.3, 3 → 1.1, 4 → 1.3, 5 or more → 1.5, the last unit that exists).
2. **Six dots** at 25 minutes, as in section 1.
3. **Five-finger warm-ups:** generated (`t-five-c/g/f/d`, section "Technique · Five fingers"); the rest of the harder steps use the pieces.
4. **Course mode first**, on stages 0 and 1; Stage 2 content is added afterwards (Faber Units 10–16 still to convert).
5. **Note cards:** built. They replace the warm-up on every second day of stage 0 (the first day is the five fingers); the stage 0 exit needs 18 fast and right cards of the last 20.

Changes from the draft above: unit 0.1 starts with Chant of the Monk (right hand only) and then Hands Take Turns; Echo is only in 0.2; Ode to Joy (hands together) is the last piece of unit 1.1 so its exit is reachable; the exit of 1.3 is three pieces (Opening and Closing, Home in G, Home in F); the 45-minute day has eight dots (a second piece with its own new-bars and steady steps); pieces whose score file is missing in a copy of the app are skipped when a day is planned. A reading level moves up after two days at 80% and down after one under 50%; the streak counts a day when reading and new bars are done.

Stage 2 now has three units (2.1 sharps and flats, 2.2 the C scale, 2.3 chords) built from Faber Book 1 Units 10–13, the app's scale exercises and its own pieces; placement levels 5, 6 and 7 start at 2.1, 2.2 and 2.3. Their pieces were compared with the page by eye, not bar by bar like Stages 0–1.

Not built yet: the Stage 0 flash cards beyond ten per day, a history page, "Practice more" beyond repeating the plan, Stage 2+.

## 7. Reviewed 2026-10-27: generated content follows the lesson

Reading, warm-ups, note cards and the Review and Play fallbacks were audited against the books and rebuilt so that each is tied to the unit and grows over its days. Several pieces moved because Faber's early pieces put the hands together sooner than this syllabus does. The audit, the evidence and the open questions are in [13-progression-review.md](13-progression-review.md).

A second pass the same day, after reading the three beginner books, moved the left hand's first position to Middle C and down (F3–C4) and made the first two units introduce one note at a time (new pieces: Two Notes, Hot Cross Buns (easy), Down the Stairs, Three Steps Down, Left-Hand Walk): [13-progression-review.md](13-progression-review.md) section 4.

An introduction week was added the same day (see its section above). A bug found with it: a day plan saved earlier the same day stayed for the whole day even if it had not been touched, so a plan built before a change to the course (for example the two-handed warm-up) kept showing. Now only a plan you have started is kept; an untouched one is made again from the course as it is, and *More → Plan today again* does it on demand.
