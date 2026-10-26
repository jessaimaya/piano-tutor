# Course Mode Plan (daily routine, Duolingo-style)

Status: **stages 0–2 built** (2026-10-26), generated content reviewed and made progressive 2026-10-27 ([13-progression-review.md](13-progression-review.md)); see Progress below.

## Goal

Open the app, press one button, and do today's session. Two modes:

- **Free mode**: today's app. Browse the library and play or practise anything.
- **Course mode**: a structured daily session built from [02-syllabus.md](02-syllabus.md) and [05-practice-routine.md](05-practice-routine.md): warm up, then continue where you left off.

The available time is set by the player (default **25 min**). Dots at the top show which step of today's session you are on (filled = done, ring = current).

## What already exists

- **Syllabus:** 6 stages, 5 tracks (Reading, Time, Coordination, Technique, Music) and exit criteria, built from the books in `literacy/`.
- **Routine:** 3 min warm-up, 5 min sight-reading, 12 min main work, 5 min music; weekly rhythm (Sat replay, Sun record) and a monthly check.
- **App:** scoring, practice log, bar ranges and looping, tempo ladder, generated scales and arpeggios (23 keys), sight-reading test generator (7 levels, stages 0–3 only), minimal view for e-ink.
- **Library (121 pieces)**, built-in plus imported, by stage: 0: 5, 1: 11, 2: 9, 3: 13, 4: 7, 5: 13.

## Gaps

1. **No machine-readable course.** The syllabus is prose. Course mode needs a **lesson ladder**: ordered units per stage, each naming that day's warm-up, reading level, main piece and bars, and music piece, plus exit criteria the app can check from scores.
2. **Content per block.** Main work and music have pieces. Sight-reading is generated for stages 0–3 only; beyond that, the Paul Harris PDFs can now be converted with the local OMR tool (`tools/omr/`, homr), one piece per crop.
3. **Persistent storage.** Progress, streaks and "where I left off" would live in localStorage, already a high-priority backlog item in [06-app-notes.md](06-app-notes.md). A streak needs this fixed first.
4. **Book extraction.** `pdftotext` is installed. Tables of contents and unit pages of Faber 1–2, Beyer, Mikrokosmos and the ABRSM books can be read locally to write a unit-by-unit map. The notes themselves can be converted piece by piece with `tools/omr/` (2026-10-26: Faber Book 1 Units 2–9 are in the library: 6 pieces at stage 0 and 18 at stage 1; some by OMR, some typed from the page, all checked against it; Unit 8 and part of Unit 9 are still to do, Units 10–16 are Stage 2 material; see [11-ingestion-ledger.md](11-ingestion-ledger.md)); check each result against the page. Faber and Milnes pieces are the biggest gap. Books are for personal practice only and are never bundled (see the licensing rule in `app/README.md`).

## Build order

1. Persistent storage with export and import.
2. `course.json`: the lesson ladder, linked to library pieces and generators.
3. Session runner: top dots, one step at a time, Next/Skip, resume after closing the app.
4. Time scaling: 25 min = 3/5/12/5. 10 min = sight-reading + main work only (skipping reading is not allowed, skipping the warm-up is). Other lengths scale proportionally.
5. Adapting to scores: repeat a step when the score is low, advance when the exit criteria are met.
6. Home screen with the Free / Course switch; Course mode also works in the minimal view.

Before any app code: write the lesson ladder as a document and review it. **Draft written 2026-10-26: [12-lesson-ladder.md](12-lesson-ladder.md)** (the daily session as dots, time scaling, units of Stages 0–1 built from the library, open questions).

## Progress (2026-10-26)

Built: backup export/import (1), `course.json` with stages 0–1 (2), the session runner with dots, Free | Course and the minimal view (3), time scaling (4),
the placement test, five-finger warm-ups and note cards. Adapting is partly in: the reading level moves, units advance on their exit, "Mark as finished" overrides;
there is no "repeat a step when the score is low" yet (the tempo ladder already repeats until runs are clean). Not built: Stage 2+ content, a real database behind
the storage (backups are the first step), a history page. Details: [12-lesson-ladder.md](12-lesson-ladder.md) section 6 and `app/README.md`.

## Decisions still open

| # | Question | Recommendation |
|---|---|---|
| 1 | Where is the player now? (start of Stage 0, or which Faber unit; last sight-reading level) | needed from the player |
| 2 | Spine books and permission to read the PDFs locally | Faber Adult Book 1 then 2; Beyer and Mikrokosmos for reading; ABRSM from Stage 3; neoclassical pieces inserted as the syllabus says |
| 3 | How to advance | Exit criteria advance automatically, with a "mark done" override |
| 4 | Lesson has no piece in the app yet | Fall back to a generated exercise and show "read from the book: Faber p. X" |
| 5 | Weekly rhythm | Saturday replay yes; Sunday recording later (the app cannot record yet) |
