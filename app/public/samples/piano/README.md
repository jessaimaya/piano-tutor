# Piano samples

One MP3 per key, C2 (`36.mp3`) to B5 (`83.mp3`), named by MIDI number. `80` and `82` do not exist: the app plays the nearest key, shifted.

- **Source:** https://github.com/Leethring/piano-sound-samples (`sound_keyboard_staff/`), 136 MP3s made with MuseScore.
- **License:** MIT, Copyright (c) 2020 Liam Lee. The full text is in `LICENSE` here and must stay with these files.
- **How they were chosen:** the source's file names are not reliable (many files are copies under another name), so
  `tools/piano-samples.py` measures each file's pitch and keeps one sample per key. `manifest.json` lists them with the
  silence before the hammer and the gain that makes the keys equally loud. Run the script on a fresh download of the source to rebuild this folder.
