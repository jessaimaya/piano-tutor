# Piano Tutor app

Browser practice app for the plan in the parent folder. Reads a MusicXML score, listens to your piano over
USB-MIDI (Web MIDI), and has two practice modes:

- **Wait**: the cursor stays on a step until you play exactly those notes. For learning a piece.
- **Tempo**: count-in, then the score follows a clock (with a metronome) and every note has a time window.
  You get the share of steps played in time, missed/extra notes, and whether you rush or drag.
  The target key is always the **next note you haven't played yet** (it moves the moment you play or miss the previous
  one, and it skips rests), shown on the keyboard and as "Next C4" in the status line. Untick "Show the next key" to
  practise without it. When you play a wrong or badly timed note, the key you should have played is marked with a dashed green outline
  and a line under the status says how far off you were ("You played D4, wanted C4: 2 semitones too high",
  "D4 was the right note, but 487 ms late", "Missed E4"). **Restart** starts the run again from a fresh count-in; **Stop** ends it.
  After a clean run the tempo goes up by 4 bpm until the piece's target tempo. Three clean runs in a row
  at the target tempo or faster, with the piece's own hands, mark the piece **done** (wait-mode runs never do).

After every run the result card has a **Try again** button (the same as Restart, where you can reach it): wait mode goes back to the first note, tempo mode into a fresh
count-in. It is there for every piece and exercise, in Free mode and in the course; each run is logged and counts as usual. The one exception is
the generated reading pieces of the course: a retry of the same piece is practice and is not counted again for the step. The sight-reading test has no retry.

## Run

```bash
cd app
npm install
npm run dev        # https://localhost:5173 in Chrome or Edge (self-signed: accept the warning once)
npm run dev:http   # the plain http://localhost:5173 server
npm test           # unit tests (vitest)
npm run build      # typecheck + production build
```

No piano plugged in? Play with the computer keyboard (shown in the sidebar) or click the on-screen keys.
With the P-115 connected, the device name appears in the top bar and the sustain pedal value is shown live.

## Course mode

The app opens in Course; **Free | Course** at the top switches (and remembers the choice) between the app as it was (browse the library, play anything) and a daily session, Duolingo-style.
Course mode hides the library and the mode and hands switches: each step decides what you play. One dot per step shows where you are
(filled = done, ring = here, dashed = skipped); a step counts when its goal is reached (a run, two readings, ten cards), **Next** or **Skip
step** moves on, and **Menu** goes back to the course page. A day counts for the streak when its *core* steps (reading and new bars) are done.

| Dot | Step | Min (at 25) |
|---|---|---|
| 1 | Warm-up: the unit's five-finger exercise (in the Middle C position in stage 0), easiest version first and one hand at a time in stage 0, or ten **note cards** every second day in stage 0 (the deck is the notes taught so far, a new note each day; a note on the staff, you play it, under 2 s is fast) | 3 |
| 2 | Reading: two generated pieces from the reading ladder (28 rungs, one new thing each). You start a unit on its first rung and climb after two good days, never past the unit's last, so reading never outruns the lesson | 5 |
| 3 | New bars: today's piece in wait mode; right hand on its first day, left hand on the second, both on the third | 6 |
| 4 | Make it steady: the same piece in tempo mode, +4 bpm per clean run | 6 |
| 5 | Review: the finished piece that has waited longest | 3 |
| 6 | Play: for the music | 2 |

Time today is 10, 15, 20, 25, 30 or 45 minutes (fewer or more dots; reading and new bars are never dropped). On Saturdays new bars and steady
become a **replay** of the finished pieces; every four weeks the reading step is the sight-reading test. The first time you open Course you can
take that test to find your start (its result picks a unit, `placement` in `course.json`) or begin at unit 0.1. A piece is finished by the rule
the log already uses (three clean tempo runs in a row at its target) or by **More → Mark as finished**; a unit ends when its exit pieces are
finished and the reading level (and, in stage 0, the cards) are good enough, and the next unit starts by itself.

The course is **`course/course.json`**: sixteen units (a seven-day introduction week, stages 0 and 1, and three of stage 2) naming each unit's warm-ups, warm-up hands, tips, note-card notes, reading rungs, pieces and exit; `npm test` checks that every id exists, that no exercise uses something taught in a later unit, and that no unit reads ahead of itself ([13-progression-review.md](../13-progression-review.md)).
Stage 2 stops at unit 2.3 (Faber Book 1 Units 10–13); later music is not converted yet: see `../11-ingestion-ledger.md`. Progress is in `piano-tutor:course:v1`.

| Module | Job | Tests |
|---|---|---|
| `src/course/ladder.ts` | reads and validates `course.json`, placement lookup | ✅ |
| `src/course/state.ts` | the saved state: today's plan, streak, reading level, cards, unit exits (all pure functions) | ✅ |
| `src/course/plan.ts` | builds a day: steps, time scaling, which hand, review pool, Saturday | ✅ |
| `src/course/cards.ts` | the note cards: the deck for a unit, weighted draws, a card as a one-bar score, judging key and time | ✅ |
| `src/content/reading.ts` | the reading ladder: 28 rungs and the generator for each | ✅ |
| `src/course/ui.ts` | the course page and the dots bar; asks `main.ts` to open pieces | browser |
| `src/storage/backup.ts` | **Backup** (in the course page): everything the app remembers as one JSON file, loaded back by replacing what is there | ✅ |
| `technique.ts` `positionPieces` | the five-finger warm-ups (the Middle C position, then C, G, F, D, each in four versions: steps, holds, thirds, mixed), library section "Technique · Five fingers" | ✅ |

In `npm run dev` the page exposes `window.__piano` (the course, the input bus, the log) for browser tests; the production build does not.

## Minimal view (small and e-ink screens)

The button at the top right switches to a minimal view (and back to the full app). Open `/?view=minimal` once to make a phone bookmark that
starts there. It is the same app and the same practice log, with only what you need at the piano: the score, **☰ Pieces**, Wait/Tempo,
Right/Left/Both, the tempo and Start/Stop. The rest (listen, bar range, timing level, calibration, sight-reading test, on-screen keyboard)
stays in the full view. Built for a monochrome e-ink screen such as the Minimal Phone (4.3", 600×800):

- pure black on white, no animation, and the score is a fixed window that turns its page when the cursor reaches the last system that fits
  (no scrolling); the page always starts at the top of a system, so a line is never cut, and the line after the one you are reading is
  always in view;
- the staff is drawn at the width of the window and shrinks until two systems fit its height (never below 0.4); `A−` / `A+` set the
  biggest size it may use, and it is drawn again when the window changes (turning the phone, a toolbar hiding);
- held sideways (landscape, under 520 px high) the score takes the whole height on the left and the controls stack in a column on the right;
- in a timed run the grey bar marks **the next note to play**, not where the clock is, and jumps the moment you play (or miss) it, so you see your key counted; there is no
  moving line, since e-ink smears continuous movement. The count-in reads "1 2 3 4" up, like the clicks, and the first note is on the click after the last number. The
  cue under the title says which note and how many clicks away it is ("Next D4 · in 2", then "Play D4 NOW"), and the line under it which note of how many you are on and what
  counted. Every note you play gets a ✓ under it on the score, a missed one a ✕, until the run starts again, and the feedback line confirms each key ("✓ C4 counted, on the beat");
- right notes show as a filled head on the staff, wrong ones as a dashed hollow head (no colour);
- tap the result card to put it away; tap the MIDI label to reconnect.

Web MIDI only works on `localhost` or `https`. `npm run dev` already serves https on every network address, so on a phone on the same wifi open
`https://<laptop address>:5173/?view=minimal` and accept the certificate warning once. Or `adb reverse tcp:5173 tcp:5173` and open
`http://localhost:5173` (use `npm run dev:http`), or host the `npm run build` output over https. If the page is not a secure origin the top bar says so.

Screenshots of the minimal view are in the main README (`../docs/screenshots/minimal-*.webp`); `node ../tools/screenshots/minimal.mjs` takes them again.

## What's in it

| Module | Job | Tests |
|---|---|---|
| `src/midi/parse.ts` | Raw MIDI → events. Handles the P-115's note-off-as-velocity-0, drops Active Sensing/Clock, CC64 | ✅ |
| `src/midi/input.ts` | One input bus for piano, computer keyboard and mouse | key mapping ✅ |
| `src/practice/wait-mode.ts` | The step state machine: chords in any order, wrong-note counting, first-try accuracy | ✅ |
| `src/practice/tempo-mode.ts` | Clock-driven scoring: time windows, early/late bias, missed and extra notes. Takes timestamps as input | ✅ |
| `src/practice/feedback.ts` | The wording for wrong, late and missed notes | ✅ |
| `src/practice/timeline.ts` | Reads a whole score into timed steps for the chosen hand(s) | ✅ |
| `src/practice/session.ts` | Connects a score cursor to wait mode; hand filtering; skips rest-only steps | ✅ (fake cursor) |
| `src/practice/log.ts` | Run history in localStorage; status new → practicing → done (3 clean tempo runs in a row at target) | ✅ |
| `src/content/notation.ts` | `"C4:q D4:q E4:h |"` → MusicXML, and refuses bars that don't add up | ✅ |
| `src/content/mxl.ts` | Opens compressed `.mxl` files (and plain `.musicxml`/`.xml`) | ✅ |
| `src/content/technique.ts` | Scales and arpeggios in every key (46 exercises), fingering derived from where the thumbs fall | ✅ |
| `src/content/scores.ts` | The imported-scores list: reads `scores/library.json`, loads each file on demand | build only |
| `src/content/pieces.ts` | The starter library (31 pieces, stages 0–3) | ✅ |
| `src/ui/staff-position.ts` | Where a key sits on a treble or bass staff (step from the top line, ledger lines, sharps): the red wrong-note drawn by `ScoreView.showWrong` | ✅ |
| `src/ui/view.ts` | Which view is on (`?view=` beats the saved choice) and the staff-size steps of the minimal view | ✅ |
| `src/ui/*` | OpenSheetMusicDisplay score + cursor, on-screen keyboard, small synth | checked in a browser |

## Scales and arpeggios

The library has two collapsed sections, **Technique · Scales** and **Technique · Arpeggios**: 23 keys each (12 major, 11 harmonic minor;
G♯ minor is left out because it needs double sharps). Two octaves up and down, hands an octave apart. Use the hand buttons to
practise one hand, then both. Scale fingering is the standard one; arpeggios are numbered only where the usual 1-2-3-1-2-3-5
keeps the thumb on a white key (the black-key arpeggios differ between method books). Check the fingering against your book
(Faber Book 2 has the scales).

## Adding a score file (`scores/`)

Drop a `.mxl`, `.musicxml` or `.xml` file in `app/scores/` and add a line to `app/scores/library.json`:

```json
{ "id": "x-my-piece", "file": "my-piece.mxl", "title": "My Piece", "composer": "Someone", "stage": 4,
  "skills": ["3/4"], "targetBpm": 72, "beatsPerBar": 3, "hands": "both", "license": "purchased", "source": "Islands p. 48" }
```

It then appears in the library under its stage, with the same practice log as the built-in pieces. `targetBpm` is only a first
estimate: change it after you've played the piece. A manifest line whose file is missing is skipped. `license` is
`public-domain` only when the file itself says so; the 9 files from the MuseTrainer repo are `unverified-arrangement`
(old works, but nobody has checked the arrangement). Score files are not tracked in git (see `.gitignore`); only the manifest is.

## Writing a lesson

Add an entry to `src/content/pieces.ts`:

```ts
{ id: 's1-my-piece', title: 'My Piece', composer: 'Original exercise', stage: 1,
  skills: ['five-finger-C'], license: 'own',
  notation: { timeSig: [4, 4], fifths: 0,
    rh: 'C4:q/1 D4:q/2 E4:h/3 | G4:w |',     // /1–/5 = fingering, | = bar line
    lh: 'C3:w | G2:w |' } }                  // chords: C3+G3:h   rests: R:q   dotted: q.
```

`npm test` fails with the exact bar if the durations don't add up.

**Licensing rule:** only original exercises and traditional / public-domain tunes go in `pieces.ts`.
Scores from commercial books are for your own practice and must not be bundled with the app.

## Known limits

- Tempo mode timestamps a note when the page handles it, not when the piano sent it. A few ms of jitter is
  well inside the 120–300 ms windows, but `MIDIMessageEvent.timeStamp` would be more exact.
- Tempo mode has been driven by a script with timed key presses, not yet by a person on the P-115.
- Meter changes inside a piece are ignored: the first time signature wins. A pickup bar counts as bar 1 for bar ranges.
- Listen is a plain synth with no pedal, so it shows the notes and rhythm, not the sound of a real piano.
- Latency calibration also absorbs the player's own habit of tapping early or late; repeat it as you improve.
- The sight-reading pass mark and tempos, and the target tempos of converted compound-meter pieces, are first estimates.

## Not built yet (from ../06-app-notes.md)

- Set a bar range by clicking the score
- A tempo ladder that resumes where you left off
- Pedal marks in Listen, and half-pedal handling (pending the result of `../tools/midi-check.html` on your pedal)

## Adding new scores

Drop MusicXML (`.mxl`, `.musicxml`, or a `.zip` of them) into `inbox/` at the repo root, then:

```
./ingest.sh            # report only
./ingest.sh --apply    # register the NEW ones in library.json, run the tests, file the results
```

Processed files move to `inbox/done/` or `inbox/held/` (duplicate, review or broken). The work is done by `tools/import-scores.py`.

Each file is checked, rated for difficulty, given a stage, and compared with the library: duplicates are skipped, composers outside
the classical/neoclassical list are held for review (no pop), and files whose bars don't fill the time signature are rejected.
In Claude Code the `import-scores` skill runs the same steps.

## Sight-reading test

"Sight-reading test" (top of the library) reads you generated pieces you have never seen, from level 1 (five notes, right hand) to
level 7 (hands together, five keys, eighth notes). 80% of the notes in time passes a level; a miss earns one more piece at that
level, a second miss ends the test. The result is saved. Run it every week or two to see your reading level rise.
