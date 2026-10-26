---
name: import-scores
description: Import new MusicXML/.mxl downloads into the piano course library. Checks each file, rates its difficulty, assigns the stage, catches duplicates and non-classical composers, then adds it to app/scores/library.json. Use when the user has downloaded new sheet music, says "I have new scores", "import these", or drops .mxl/.musicxml/.zip files.
---

# Import new scores into the course

1. Run the report first (changes nothing). The normal route is the inbox: the user drops files in `inbox/` and `./ingest.sh` reports on it. (`python3 -I tools/import-scores.py [paths]` takes any files, folders or `.zip` bundles; with no arguments it reads `~/Downloads`.)

   `./ingest.sh`

2. Read the verdict per file and tell the user:
   - **NEW**: will be added. Show title, composer, stage, difficulty, time signature, bars.
   - **DUPLICATE**: already in the library (same id or same notes). Never overwrite; only use `--replace` if the user asks.
   - **REVIEW**: composer not on the classical/neoclassical list. The project rule is **no pop**: do not add these. If it is a legitimate classical composer missing from the list, add the surname to `ACCEPTED` in `tools/import-scores.py`, then re-run.
   - **BROKEN**: unreadable, or many bars that don't add up to the time signature. Report it and suggest re-exporting from MuseScore.

3. Ask before applying if anything is unusual (stage looks off for what the user said, e.g. they called it "beginner" but it landed in stage 4+). Then:

   `./ingest.sh --apply --source "musescore.com"` (add `--stage N` to override, only with the user's agreement). It adds the NEW scores, runs the tests, and moves files to `inbox/done/` or `inbox/held/`. PDFs are listed as SKIPPED and stay in the inbox.

4. After applying (tests already ran), tell the user which entries to check in the app (`targetBpm` is taken from the file's tempo marking or a stage default, and is a first guess to adjust after playing).
5. Optional: add a line for the new pieces to `09-library-catalog.md`.

Stage meaning: 3 = Grade 1–2, 4 = Grade 3–4 (first real repertoire), 5 = Grade 5–6, 6 = Grade 7+. The score ignores tempo, so fast pieces may deserve a higher stage by hand.
