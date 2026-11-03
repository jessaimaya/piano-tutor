# Piece mode (learn one piece step by step)

Status: built 2026-10-29. Code in `app/src/piece/`.

## Idea

Course mode teaches the whole syllabus. **Piece mode** takes one score and works it until it is done, the way a teacher breaks a piece down:

1. **Know the notes.** Note cards limited to the notes this piece uses, one hand at a time (treble cards for the right hand, bass for the left). Fast and right counts.
2. **First hand.** The hand with less difficulty over the whole piece, section by section, easiest section first, then all of it.
3. **Second hand.** The same for the other hand.
4. **Hands together.** Two bars of the easiest place first, then that whole section, then the next easiest, and so on.
5. **Trouble spots.** Bars well above the rest of the piece (more than one standard deviation over the mean, at most three), with a bar of context each side.
6. **The whole piece**, both hands, wait mode.
7. **Up to tempo.** Tempo mode; the existing ladder raises the tempo after each clean run.

A one-hand piece skips phases 3 and 4.

## How difficulty is measured

`analysis.ts` reads the notes the score cursor reports (no extra parsing) and scores every bar for each hand: notes per bar, extra notes in chords, jumps bigger than a fifth, spread beyond a five-finger position, and black keys (weights in `WEIGHT`). The numbers only rank bars against each other inside one piece. Sections are 2, 4 or 8 bars depending on the piece's length.

## Progress

One `piano-tutor:piece:v1:<pieceId>` entry per piece (included in the backup file). A run counts toward a task when its accuracy is 90% or more; the task's goal is 2 runs (3 for trouble spots and the metronome). Skip and "Start this piece over" are on the screen. Ids are made from the task's kind, hands and bars, so progress survives re-planning.

## What is on the page

A step draws only its own bars (`ScoreView.setDrawnBars`), so its first bar opens the first line and nothing else is on the page. Other modes draw the whole piece.

## The moving line

Three things keep the line and the sound together. Each was measured, because the clock itself was never the problem:

- **Where it lands:** on the noteheads as drawn, not on OSMD's cursor bar, which can sit 6 px off them.
- **How fast it moves:** bars are drawn the same width (`setEvenBars`), which brings the fastest and slowest stretches of the line from about 3.3x apart to about 1.9x. On a narrow screen the staff shrinks (down to 0.7) to keep two such bars on a line; narrower still, it reads one bar a line. Bars stay even at every width.
- **When the sound starts:** the piano MP3s open with about 54 ms of silence, which the app now skips (`attackOf`). It is measured on the decoded audio because MP3 padding depends on the decoder.

In the minimal view the line is a wide grey band: thin and black it reads as one more stem or barline.

## Not built yet

- Loading a score file straight from the browser (use the library: `import-scores`).
- A real fingering or hand-position analysis; difficulty is a note-level estimate.
- Reading drills that are sight-reading of the piece's own bars (cards only for now).
