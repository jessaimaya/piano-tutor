# App Notes (for later)

Not a build spec; just how the plan should shape the app when you get to it.

> **Status (2026-10-25):** v0.2 is built in [`app/`](app/README.md). Done: wait mode (1), tempo mode (2), hand selection (3),
> the metronome ladder (+4 bpm per clean run, part of 4), the practice log (6), generated scales/arpeggios (7), the imported library
> (75+ entries) and the `inbox/` import workflow. Next: see the roadmap below.
> **Roadmap (decided 2026-10-25), in order:**
> 1. ✅ **Done 2026-10-25:** **Scale and arpeggio exercises with fingering, 23 keys** (idea from piano-ml). Major and minor (natural, harmonic), 1–2 octaves, arpeggios in root position and both inversions, hands separate then together. Runs through the existing tempo ladder. Replaces item 7 "generated exercises" as the first thing to build, and covers the stage 2 scale exit criteria.
> 2. ✅ **Done 2026-10-25:** **Library search and filter**: a search box (title, composer, skills; accents ignored), filters for stage, status, hands, hide-technique, and sort by course order / easiest first / A–Z, with composer, stage and measured difficulty shown on each result. Not done: filter by key (the files don't carry it reliably).
> 3. ✅ **Done 2026-10-25:** **Compound meters in tempo mode.** The tempo you set and each piece's target now count the piece's own beat, taken from its time signature: dotted quarter in 6/8, 9/8, 12/8; eighth in 3/8; quarter everywhere else (2/2 and 3/2 too). The count-in, metronome clicks (accent on the bar's first beat) and the tempo range follow it; the timeline underneath still counts quarter notes. Targets of the six affected library pieces were converted (*Für Elise* ×2, *Clair de lune*, *Lacrimosa*, Chopin Op. 9/2, *La Campanella*): treat them as first estimates. Meter changes inside a piece are not followed (the first time signature wins).
> 4. ✅ **Done 2026-10-25:** **Latency calibration** (idea from the piano-platform features guide). "Calibrate timing" in tempo mode: tap any key on 12 clicks (after 4 practice clicks); the median offset (±250 ms, rejected if the taps are uneven or too few) is stored and subtracted from every key press and from miss detection in tempo mode. A result of 40 ms or more "late on average" suggests running it. Caveat: the number also includes the player's own habit of tapping slightly early or late, so repeat it once you are comfortable. Not applied in wait mode (no timing there).
> 5. ✅ **Done 2026-10-25:** **Listen: hear the piece before you play it** (asked for by the learner: beginners need to hear the rhythm, then play it back). The ▶ Listen button plays the chosen hand(s) at the tempo box's value, after a bar of clicks (clicks can stay on throughout), with the cursor following and the sounding keys lit. Tied notes sound for their full length; the sound is a plain synth with no pedal, so it shows the rhythm and notes, not the colour of a real piano. Any key press during playback is ignored; Stop or Restart returns to practice. The tempo box now shows in wait mode too.
> 6. **Import tool for single Mutopia pieces** (LilyPond → MusicXML with `python-ly`, plus a bar-length check). Optional: only if a piece you want exists nowhere else as MusicXML.
> 7. ✅ **Done 2026-10-25:** **Sight-reading test** (SASR-like). Seven generated levels (`content/sight-reading.ts`): 1 right hand, five notes from Middle C; 2 left hand; 3 wider range, keys C/G/F, 3/4; 4 hands together over held bass; 5 moving bass and eighths; 6 five keys, dotted rhythms, rests, broken-chord bass; 7 faster eighths and leaps. Every piece is made fresh from a random seed (so always unseen) in the lesson notation, which rejects any bar that does not add up. The test runs in tempo mode at a fixed comfortable tempo with Listen and hand choice locked; 80% of notes in time passes a level, one more piece is given after a miss, two misses at a level end the test. The result (highest level passed) is saved and shown beside the button. Test runs are not written to the practice log. Not done: mapping the Harris books' levels onto ours (they are PDFs; use them as reading practice between tests), and tuning the pass mark and tempos after real use.
>
> 8. ✅ **Done 2026-10-25:** **Practise a range of bars, and loop it** (promoted from the backlog once pieces got long). "Bars _ to _" boxes limit the cursor, wait mode, tempo mode and Listen to those bars; a Loop checkbox restarts straight away after each pass (tempo mode: at the raised tempo after a clean pass, until Stop/Escape or the piece is done). The range is remembered per piece. Done as a cursor wrapper (`practice/range.ts`), so the modes did not change. Runs on a range are logged with `bars` and show progress but never finish a piece; only full runs do. Bar numbers count bars from the first one (a pickup bar counts as bar 1). Not done: clicking a bar on the score to set the range.
>
> **Backlog:** nothing scheduled. Candidates: single Mutopia imports (6), set the range by clicking the score, a tempo ladder that resumes where you left off, pedal marks in Listen.
>
> **Considered and dropped:** a falling-notes piano roll and particle effects (the app exists to teach reading notation, and the roll lets you skip it), importing raw `.mid` files (no notation, so no staff to read; MusicXML only), real-time chord naming with tonal.js (low value for a beginner; revisit at stage 4+ if chord reading becomes a goal), accounts and a database (piano-ml has them; this is a one-person local app), auto-harmonization, OMR upload (tested: too slow and inaccurate for piano scans), MusicBrainz lookups.

## What the app is for

The app is **the feedback loop**: it listens over USB-MIDI and scores what you play against a score.
The **curriculum** lives in the content (MusicXML + metadata), sequenced by [02-syllabus.md](02-syllabus.md).
Keep the two separate so the content can grow without code changes.

## Stack that has worked for this kind of tool

| Need | Option |
|---|---|
| MIDI input | **Web MIDI API** (Chrome/Edge; Firefox needs a permission prompt) · note-on/off + CC64 (sustain pedal) |
| Score rendering | **OpenSheetMusicDisplay** (MusicXML → SVG, built on VexFlow, has a cursor) or **Verovio** (MusicXML/MEI, very accurate engraving) |
| Playback / metronome | Tone.js or a plain WebAudio scheduler |
| Content editing | MuseScore Studio → export MusicXML |
| PDF → MusicXML | Audiveris / MuseScore 4 PDF import, then hand correction |

## P-115 specifics the MIDI layer must handle

- Note-off arrives as **Note On, velocity 0**: treat `0x9n` with `v=0` exactly like `0x8n`.
- Drop **Active Sensing** (`0xFE`) and **Clock** (`0xF8`) before anything else; the piano sends them constantly.
- Sustain is **CC64**. Treat ≥ 64 as down, but keep the raw value in case the pedal turns out to support half-pedalling.
- If no CC64 ever arrives, show a hint: *"Control Change may be off: hold METRONOME + PIANIST STYLE, press E6."*
- [tools/midi-check.html](tools/midi-check.html) already does all of this and can serve as the starting point.

## Content model (sketch)

```yaml
id: mikro-001
title: "Six Unison Melodies No. 1"
composer: Bartók
source: Mikrokosmos Vol. 1
file: scores/mikrokosmos/001.musicxml
stage: 1                 # 0–5, from the syllabus
grade: prep              # optional ABRSM/RCM-ish
type: reading | piece | technique | sight-reading
skills: [unison, five-finger-C, quarter-notes]
hands: both | rh | lh
keys: [C]
tempo: { start: 60, target: 92 }
license: public-domain | personal | own
```

`skills` tags are what let the app reproduce Marvel's slow step-up: *"give me 5 unseen
`stage:1` reading pieces with `skills: contrary-motion`."*

## Features, by value

1. **Wait mode**: the cursor waits until the right notes are pressed (learning mode)
2. **Tempo mode**: the score scrolls at a set tempo; scores pitch accuracy + timing deviation (performance / sight-reading)
3. **Hand selection**: practice RH or LH, with the app playing the other hand
4. **Loop a bar range** + **metronome ladder** (auto-raise tempo after N clean passes)
5. **Sight-reading level test** (SASR-like): unseen pieces of increasing level, stop when accuracy < threshold
6. **Practice log**: automatic version of the template in [05-practice-routine.md](05-practice-routine.md)
7. Generated exercises (random notes within constraints) as a challenge mode only, not as core content

## Content plan

| Stage | Content source |
|---|---|
| 0–1 | Your own MuseScore exercises (5-note positions, alternating hands) + Beyer Op. 101 + Mikrokosmos Vol. 1 (if public domain where you are) |
| 2–3 | Beyer, Türk, Gurlitt, Bach Notebook from OpenScore/musescore.com (public domain) |
| 4–5 | Your purchased neoclassical scores, transcribed to MusicXML for personal use |

Budget the time realistically: getting good MusicXML for 200+ small pieces is the actual
work, more than the code. Start with ~30 pieces for Stages 0–1 and grow from there.
