# Setup: Yamaha P-115

## The instrument

- 88 keys with Yamaha's GHS weighted action (heavier in the bass, lighter in the treble). The full range covers every piece in the repertoire list.
- **USB TO HOST** port: class-compliant USB-MIDI, no driver needed on Linux, macOS or Windows. On Linux it shows up as an ALSA/PipeWire MIDI port (usually named "Digital Piano").
- Pedals: the **SUSTAIN** jack takes a switch footswitch (FC4/FC5). The **PEDAL UNIT** jack takes the Yamaha **LP-5A** 3-pedal unit (sustain, sostenuto, soft), which mounts on the L-85 stand. The LP-5A is now discontinued.

## What it sends over USB (from Yamaha's P-115 MIDI Reference, 2014)

| Message | Sent? | Notes for the app |
|---|---|---|
| Note on | ✅ velocity 1–127 | |
| Note off | ⚠️ **sent as Note On with velocity 0** | The app must treat `0x9n, note, 0` as note-off |
| **CC64 Sustain** | ✅ | Range 0–127. A switch pedal only ever sends 0 or 127 |
| CC66 Sostenuto · CC67 Soft | ✅ | Only with the LP-5A |
| Active Sensing (`0xFE`) | ✅ | Sent constantly; filter it out |
| MIDI Clock (`0xF8`) | ✅ | Filter unless you sync to the metronome |
| Channel | 1 by default | With Dual/Split voices, the second voice goes on channel 2 |

**Two panel settings that can silently break the app** (both default ON):

- **Control Change ON/OFF**: hold `[METRONOME/RHYTHM]` + `[PIANIST STYLE]` and press **E6**. If this is OFF, **no pedal data is sent**. If CC64 never shows up, check this first.
- **Local Control ON/OFF**: same buttons + **D6**. OFF means the piano makes no sound itself, which is only useful if the app produces the sound.

**Half-pedalling** (values between 0 and 127): not confirmed for the P-115 in Yamaha's docs. One retailer says the LP-5A supports it. Run the test below to find out.

## Test it (2 minutes)

**In the browser** (the same path your app will use):

```bash
cd ~/Code/piano-tutor/tools && python -m http.server 8000
# open http://localhost:8000/midi-check.html in Chrome or Edge
```

Web MIDI needs a secure context; `localhost` counts as one.
The page shows the device name, held keys, raw messages, and a bar for each pedal. It also
tells you whether the sustain pedal sends **only 0/127 (on/off)** or **continuous values (half-pedal)**.

**In the terminal** (Linux, ALSA tools):

```bash
aseqdump -l                  # find the piano's port, e.g. 20:0 "Digital Piano"
aseqdump -p 20:0             # play and press the pedal
# Expect: "Note on ... velocity 0" for releases, "Control change 0, controller 64, value 127/0"
```

What to look for:

1. Note releases show up as **Note on, velocity 0**. That's normal for this model.
2. Pressing the sustain pedal shows **controller 64**. If not: check Control Change (E6) and the pedal cable.
3. A slow press showing values like 12, 45, 90… means half-pedal works; just 0 ↔ 127 means it's a switch.

## Impact on the plan

- Pedal work starts in Stage 2 (*Für Alina*) and becomes essential in Stage 3+. On/off pedalling is enough until about Stage 5.
- If the test shows only on/off and you want half-pedal later (Debussy, Frahm), the cheapest upgrade is the LP-5A
  (second-hand, since it's discontinued), but that's a year-2 decision.
