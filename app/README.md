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

## Run

```bash
cd app
npm install
npm run dev        # http://localhost:5173 in Chrome or Edge
npm test           # unit tests (vitest)
npm run build      # typecheck + production build
```

No piano plugged in? Play with the computer keyboard (shown in the sidebar) or click the on-screen keys.
With the P-115 connected, the device name appears in the top bar and the sustain pedal value is shown live.

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
