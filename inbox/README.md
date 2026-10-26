# Inbox

Drop new sheet music here (`.mxl`, `.musicxml`, `.xml`, or a `.zip` of them), then from the repo root run:

    ./ingest.sh            # report only
    ./ingest.sh --apply    # add the new ones to the course, run the tests, and file the results

After `--apply`, files move to `inbox/done/` (added to the library) or `inbox/held/` (duplicate, composer needs review, or broken).
PDFs are listed as SKIPPED and left here: the app needs MusicXML.
