# Progression review: is everything generated or picked for the day in step with the lesson?

Status: **done for stages 0–2, 2026-10-27.** Part of [10-course-mode-plan.md](10-course-mode-plan.md); the units are in [12-lesson-ladder.md](12-lesson-ladder.md).
The question: *every generated piece, warm-up and card must match the player's current unit, and get harder gradually over the days of a unit.*
This file is the audit that answered it, the reasoning behind the fixes, and what is still open.

## 1. What I used

**The books in `literacy/`, read for order, not for content:**

- Faber *Adult Piano Adventures* Book 1: the concept list printed at the head of each unit (the contents pages). The order is: Unit 2 staff, 4/4 and 3/4, Middle C to F, bass Middle C to A; Unit 3 treble G, bass G and F; Unit 4 thirds, rests; Unit 5 low bass C D E; Unit 6 eighth notes, upbeat, *mp*, crescendo; Unit 7 treble space notes F A C E; Unit 8 treble C pentascale; Unit 9 G pentascales; Unit 10 sharps, flats, naturals; Unit 11 4ths to 6ths; Unit 12 C scale; Unit 13 G7; Units 14–16 primary chords.
- The pieces themselves: I measured every piece of every unit from its MusicXML (range per hand, durations, meter, key, leaps, bars where both hands sound).
- Paul Harris *Improve Your Sight-Reading!* Levels 1–5: **the PDFs are scans with no text layer**, so I could not read them. Their structure comes from retailer listings: Level 1 stage 1 is 4/4, quarter notes, quarter rests, C major; stage 2 adds half notes and small leaps; stage 3 adds 3/4, the dotted quarter, G major; each stage goes from rhythm and melody exercises, to a prepared piece, to an unprepared one. That "one new thing per stage" shape is what the reading ladder copies.
- Bartók *Mikrokosmos* Vol. 1: only the order from listings (unison pieces first, then alternating hands, parallel motion, contrary motion). Not yet read from the PDF.

**Research, with its limits stated.** Most of it is small studies; I use it for direction, not as proof.

- *Deliberate practice and sight-reading.* In a study of pianists from novice to expert, deliberate practice accounted for nearly half of the variance in sight-reading ([Psychological Science, 2010](https://www.psychologicalscience.org/journals/psychological-science/0956797610373933/)). One review among the sight-reading papers I found says short interventions have minimal effect; I did not trace which paper it was, so treat that as unconfirmed. **Used for:** reading every day, in small steps, for a long time, not a cram.
- *Pinpoint the hard bit.* In 17 advanced piano majors, practice time and repeat counts did not predict next-day performance; isolating and repeating the exact hard passage did ([Duke, Simmons & Cash 2009](https://www.structural-learning.com/research-briefings/practise-the-hard-bit)). Small, correlational. **Used for:** keeping the bar-range and tempo ladder tools, and "hardest bars first" in the routine.
- *Interleaving.* Clarinettists who alternated pieces tended to do better than those who blocked, but it did not reach significance and they preferred blocking ([Carter & Grahn 2016](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4989027/)). Not piano. **Used for:** the day already mixes five kinds of work; note cards keep old notes in the mix instead of finishing one note then the next.
- *Middle C versus intervallic reading.* A small study of 7–11 year olds found the Middle C approach beat the mixed intervallic one on most tests, though intervallic is the favoured teaching ([DiCienzo 2019](https://ruor.uottawa.ca/handle/10393/39944)); a cognitive model of the two methods found intervallic needs more declarative knowledge and execution planning ([Emond et al.](https://piano.uottawa.ca/wp-content/uploads/2020/10/09.-Emond_cognitive-modelling.pdf)). **Used for:** introducing notes a few at a time, in positions, before asking for intervals. The two approaches are blended, which is also what Faber does.
- *Beginner method books* mostly lack explicit sight-reading material ([Pedagogy study](https://webbut.unitbv.ro/index.php/Series_VIII/article/download/11306/6735/20649)). **Used for:** the generated reading ladder is not optional extra, it fills a gap in the books.

## 2. What the audit found (before)

| # | Finding | Why it hurt a beginner |
|---|---|---|
| 1 | **Warm-up asked for both hands from day 1** in every unit (fixed the day before this review) | Hands together is a Stage 1 skill |
| 2 | **One reading scale of 7 levels for the whole course.** Level 2 to 3 added three keys, 3/4, 8 bars and wider range at once; levels moved with performance with no cap | The reading could run ahead of the lesson, or jump a cliff |
| 3 | **The warm-up was one fixed 8-bar pattern**, the same on day 1 and day 40 | No progression across days |
| 4 | **Note cards did not match the pieces.** Deck: bass F3–C4 from day 1; the unit pieces use C3–G3. Unit 0.1 (right hand only) drew bass cards | The cards taught notes the pieces did not use, and unit 0.1 showed notes it had not taught |
| 5 | **Review and Play steps** fell back to an unfinished piece with both hands on day 1 | Hard on day 1 |
| 6 | **Own pieces broke the order**: Ode to Joy (right hand) used a dotted-quarter rhythm in unit 1.1 (taught in 2.1); Hot Cross Buns used eighth notes in 1.3 (taught in 1.4); Echo ended with both hands together in a hands-take-turns unit | A piece asking for something not yet taught |
| 7 | **Faber's early pieces do not match the syllabus order.** *Chant of the Monks* (both hands, an octave apart, every bar) was in unit 0.3; *Roman Trumpets* and *Russian Folk Song* (hands together, one holding) were in the stage 0 exit unit | The syllabus says stage 0 hands never play together. Faber's own order puts hands together almost at once |
| 8 | Unit 0.1 held *Hands Take Turns*, which uses left-hand notes, before the left hand is taught. Four converted Faber pieces (Units 8–9) were in no unit at all | Sequencing gaps |
| 9 | Listen was available on the Reading step | Hearing a piece first defeats sight-reading |

## 3. What the course does now

### 3.1 The reading ladder (`content/reading.ts`)

25 rungs. Each adds **one** thing to the rung before. Each unit names the rungs it covers (`reading: { from, to }` in `course.json`); the player starts a unit on its first rung and climbs by reading well (two days at 80% up, one day under 50% down), **never past the unit's last rung**, so reading cannot outrun the lesson. The monthly sight-reading test no longer moves the rung; it only places a new player and dates the next test.

| Rungs | Unit | New at each rung |
|---|---|---|
| 1 · 2 · 3 | 0.1 | right hand C D E → all five notes → skips of a third |
| 4 · 5 · 6 | 0.2 | the same, left hand |
| 7 · 8 · 9 | 0.3 | hands take turns (2 bars each) → with thirds → 8 bars |
| 10 · 11 | 0.4 | 3/4 → dotted half notes, both meters |
| 12 · 13 | 0.5 | rests inside the tune → 12 bars |
| 14 · 15 | 1.1 | both hands an octave apart → 8 bars, both meters |
| 16 · 17 | 1.2 | one hand holds a note → a sixth wide, both meters |
| 18 · 19 | 1.3 | contrary motion → positions G and F |
| 20 · 21 | 1.4 | eighth notes in pairs → with rests |
| 22 | 1.5 | a moving left hand, keys C G F D |
| 23 · 24 · 25 | 2.1–2.3 | sharps and flats, a seventh wide → the octave, scale runs → left-hand chords I, IV, V |

The first rung of each unit overlaps the last of the one before where that makes sense, so a unit starts easy. A test (`reading.test.ts`) generates 40 pieces for every rung and checks the notes stay in the rung's range, only the rhythms and meters taught by then appear, the texture is what it says (turns never overlap, the octave unison is exact, contrary motion is contrary, chords are chords), and every bar adds up. A second test (`ladder.test.ts`) fails if a unit uses a rung that a later unit teaches.

### 3.2 Warm-ups (`technique.ts`, `plan.ts`)

- Each five-finger position has four versions, easiest first: **steps** (neighbouring fingers, quarters) → **holds** (half notes) → **thirds** (skip a finger) → **mixed** (the original).
- Each unit lists its exercises easiest first and the warm-up **climbs** the list: two warm-up days on each, then the next. Stage 1 and 2 units that revisit every key (1.5, 2.1) go round instead.
- The hands rotate by unit: right only (0.1), left only (0.2), right and left turns (0.3–0.5), right, left, then both (1.1), both from 1.2.
- A new `unitDays` counter (days that counted since entering the unit) drives both the warm-up and the cards.

### 3.3 Note cards (`cards.ts`)

- The deck is **every note introduced up to the current unit**, from `course.json`: treble C D E F G (0.1), bass C D E F G (0.2), bass A B C (0.4). It is exactly the notes the unit pieces use, and a test checks it against every stage 0 own piece.
- A note you have not yet answered fast and right three times comes up three times as often; known notes stay in the mix (a light spaced repetition). A miss takes one count away.

### 3.4 Order of concepts is now enforced (`concepts.test.ts`)

Each concept names the first unit that may use it: dotted half and 3/4 (0.4), rests inside a tune (0.2), both hands in one bar (1.1), chords in one hand (1.2), the flat key (1.3), the sharp key and eighth notes (1.4), the dotted quarter and accidentals outside the key (2.1). Every own piece and warm-up of every unit is checked against it. It caught three of the mistakes above on its first run.
The imported books are not in the repo, so I checked them by measuring their files (section 2, finding 7).

### 3.5 Re-sequencing (the part to review)

I followed the syllabus's coordination order (turns → octaves → one hand holds → contrary), since Faber's early units mix it.

| Piece | Was | Now | Reason |
|---|---|---|---|
| Chant of the Monks | 0.3 | **1.1** (its exit) | both hands an octave apart in every bar |
| Hands Take Turns | 0.1 | **0.3** | uses left-hand notes |
| Roman Trumpets, Russian Folk Song | 0.5 (stage exit) | **1.2** | hands together, one holding |
| Ode to Joy (hands together) | 1.1 (exit) | **1.2** (first) | the left hand holds: that is 1.2 |
| Hot Cross Buns | 1.3 | **1.4** | eighth notes |
| Shining Stars | 0.4 | 0.5 | the hands answer each other inside the bar |
| May Dance, American Fiddle Tune, When the Saints, African Celebration (Faber Units 8–9) | in no unit | 1.5 | converted but never used |
| *new:* Right-Hand Walk | – | 0.1 | a second right-hand-only piece for the first unit |
| *new:* Sixteen Bars | – | 0.5 (the stage exit) | a 16-bar hands-alternating piece, as the syllabus asks. Midnight Ride (20 bars, the hands never overlap) is the 0.4 exit |

Two own exercises were simplified (Ode to Joy lost its dotted rhythm in bars 4 and 8; Echo's last bar is now a rest in the left hand).

## 4. Open decisions and gaps

1. **Faber against the syllabus.** If you would rather follow Faber's pace (hands together from unit 2), the stage 0 pieces move back; say so and I will undo section 3.5. I chose the syllabus because "hands never together" in stage 0 is the one rule written for a total beginner.
2. **The seven-level placement test** is unchanged and coarse (level 2 to 3 is a big step). It only decides where you start, and it is conservative. A finer test could reuse the 25 rungs.
3. **Imported pieces are checked by measurement, not by a test.** The numbers are in section 2; tools/omr/ checks them against the page.
4. **The Reading step has no rhythm-only warm-up** (clapping or tapping a rhythm before reading it, which the Harris structure uses). It is a good next addition.
5. **Stage 3 and later** have no ladder yet: the course ends at unit 2.3.
6. **The evidence is thin.** The studies are small and mostly not piano beginners; use them as a direction.

**More literature that would help** (you offered): a second adult method with a different order, such as *Alfred's Adult All-in-One* Level 1, to see where the two disagree; the Paul Harris Level 1–3 books **as text** (or I can run OCR on the scans); and Bartók *Mikrokosmos* Vol. 1 read for its order. I have not mined the three beginner books in the repo root (Milnes, Williams, Ferrante) for their note-introduction order; I can do that next.
