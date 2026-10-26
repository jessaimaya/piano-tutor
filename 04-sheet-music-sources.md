# Sheet Music Sources

## 1. Community transcription platforms (what you remembered)

The sites you're thinking of, where musicians transcribe pieces and upload them in a standard format:

| Platform | What it is | Format | Notes |
|---|---|---|---|
| **musescore.com** | The biggest community score library, made with the free MuseScore Studio | `.mscz` → exports **MusicXML**, MIDI, PDF | Most downloads need **Pro**; **Pro+** adds "official" licensed scores. Quality varies a lot, so check the rating, comments and whether it's "original" vs. "easy". For copyrighted music, MuseScore now licenses publisher catalogues instead of relying on arrangers changing a few notes |
| **flat.io** | Collaborative notation editor with a public score library | MusicXML | Smaller library, cleaner editor |
| **Noteflight** | Browser notation + community | MusicXML | Smaller library |

**For your genre:** search "Einaudi", "Arnalds", "Frahm", "Tiersen" etc. on musescore.com.
Prefer scores labelled as transcriptions of the original over "easy piano" versions, and cross-check
against the recording.

## 2. Official, paid (best quality for your composers)

| Composer | Where |
|---|---|
| Einaudi | Chester Music / Wise books (Hal Leonard in the US); single pieces on Musicnotes / Sheet Music Direct |
| Nils Frahm | ***SHEETS*** series: digital singles from **Faber Music** (fabermusic.com/SHEETS), softcover books from **Leiter Verlag** |
| Ólafur Arnalds | ***some kind of peace*** piano songbook from the **Decca** shop; some single titles on Musicnotes |
| Chad Lawson | **chadlawson.com** songbooks (print/PDF, ≈ $25) · Hal Leonard *Piano Sheet Music Collection* |
| Yann Tiersen | Chester Music (*EUSA*) · *Piano Works 1994–2003* |
| Paterlini | Musicnotes (single titles) |
| General | **Musicnotes**, **Sheet Music Direct**, **Sheet Music Plus**, **Presto Music**, **Virtual Sheet Music** |

⚠️ "ArrangeMe" and similar self-publishing listings on these stores are **third-party arrangements**,
not the composer's score. They're often fine, but check the product page.

## 3. Free, public domain (classical spine and app content)

| Source | What's there | Format |
|---|---|---|
| **IMSLP** (imslp.org) | Practically every public-domain score: Beyer, Czerny, Burgmüller, Bach, Satie, Chopin, Schumann… | Mostly PDF scans |
| **Mutopia Project** | Engraved public-domain and CC-licensed music, with a piano filter and a style label but no difficulty column. Per piece: `.ly` (LilyPond), `.mid`, PDF, PostScript. **No MusicXML** (checked a piece folder, 2026-10-25) | LilyPond, PDF, MIDI |

*Getting Mutopia into the app:* LilyPond cannot export MusicXML itself. The `python-ly` package (`ly musicxml piece.ly`) can: on one test piece it gave 49 bars per hand but printed warnings and got 2 of the 49 bars wrong in length, so every converted file needs a bar-length check and a look in the app. Worth doing for individual pieces you want, not as a bulk import. MIDI → MusicXML works too but loses hands, key and notation.
| **OpenScore** (MuseScore + IMSLP) | Public-domain scores re-typeset as digital notation, CC0 | MusicXML / mscz |
| **musescore.com public-domain scores** | Many classical teaching pieces already transcribed | MusicXML via export |
| **8notes.com** | Easy classical pieces, graded | PDF (MIDI for some) |

*Bartók Mikrokosmos:* public domain in the EU/many countries (Bartók died in 1945), still under
copyright in the US. Buy the Boosey edition if you're in the US.

## 4. Formats that matter for the app

| Format | Use |
|---|---|
| **MusicXML** (`.musicxml`, `.mxl`) | The standard exchange format. Has notes, rhythm, both staves, fingering, dynamics, measures. **Use this as the app's native format** |
| **MIDI** | Timing and pitch only; no notation (hands, fingering, beaming). Fine for scoring, bad for display |
| **PDF** | Needs OMR (optical music recognition) to convert: **Audiveris** (free) or the PDF import in MuseScore 4. Expect to fix errors by hand |
| **MEI** / **LilyPond** | Scholarly / engraving formats; convertible |

## 5. Copyright, in plain terms (not legal advice)

- Public-domain composers (died more than 70 years ago in most places): use freely, including in your app.
- Bought PDFs / books: for **personal use**, transcribing them into MusicXML for your own practice tool is
  generally tolerated; **don't redistribute** or bundle them into a public app.
- If the app ever becomes public, ship only public-domain material + your own exercises, and let users
  import their own files.
