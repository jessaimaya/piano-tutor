import { buildMusicXml, type NotationPiece } from './notation';
import type { Hands } from '../practice/log';

/**
 * The starter library, following 02-syllabus.md.
 * Only original exercises and traditional / public-domain tunes live here:
 * scores from the books in literacy/ must not be bundled into the app.
 */

export type License = 'own' | 'traditional' | 'public-domain';

export interface Piece {
  id: string;
  title: string;
  composer: string;
  stage: number;
  skills: string[];
  license: License;
  /** Set for generated technique exercises (scales, arpeggios); they get their own collapsible section in the library. */
  group?: 'scales' | 'arpeggios';
  /** The tempo (quarter notes per minute) at which three clean runs finish the piece. */
  targetBpm: number;
  /** Which hands have notes; also the hands setting that counts toward "done". */
  hands: Hands;
  notation: NotationPiece;
}

export const STAGE_NAMES: Record<number, string> = {
  0: 'Orientation',
  1: 'Five-finger positions',
  2: 'Leaving the position',
  3: 'Accompaniment patterns',
  4: 'Real repertoire',
  5: 'Neoclassical core',
  6: 'Later goals',
};

type Source = Omit<Piece, 'hands' | 'notation'> & { notation: Omit<NotationPiece, 'title' | 'composer'> };

const sources: Source[] = [
  // ───────── Stage 0: hands take turns ─────────
  {
    id: 's0-turns', targetBpm: 56, title: 'Hands Take Turns', composer: 'Original exercise', stage: 0,
    skills: ['alternating-hands', 'five-finger-C', 'quarter-notes'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4:q/1 D4:q/2 E4:h/3 | R:w | E4:q/3 D4:q/2 C4:h/1 | R:w |',
      lh: 'R:w | G3:q/1 F3:q/2 E3:h/3 | R:w | C3:q/5 D3:q/4 C3:h/5 |',
    },
  },
  {
    id: 's0-echo', targetBpm: 56, title: 'Echo', composer: 'Original exercise', stage: 0,
    skills: ['alternating-hands', 'five-finger-C', 'skips'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4:q/1 E4:q/3 G4:h/5 | R:w | D4:q/2 F4:q/4 E4:h/3 | R:w | C4:w/1 |',
      lh: 'R:w | C3:q/5 E3:q/3 G3:h/1 | R:w | D3:q/4 F3:q/2 E3:h/3 | C3:w/5 |',
    },
  },

  {
    id: 's0-three-four', targetBpm: 60, title: 'Three Beats', composer: 'Original exercise', stage: 0,
    skills: ['alternating-hands', '3/4', 'five-finger-C', 'dotted-half'], license: 'own',
    notation: {
      timeSig: [3, 4], fifths: 0,
      rh: 'C4:q/1 D4:q/2 E4:q/3 | G4:h./5 | R:h. | R:h. | E4:q/3 D4:q/2 C4:q/1 | C4:h./1 |',
      lh: 'R:h. | R:h. | C3:q/5 E3:q/3 G3:q/1 | G3:h./1 | R:h. | R:h. |',
    },
  },
  {
    id: 's0-question', targetBpm: 56, title: 'Question and Answer', composer: 'Original exercise', stage: 0,
    skills: ['alternating-hands', 'five-finger-C', 'half-notes'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'G4:h/5 E4:h/3 | R:w | F4:h/4 D4:h/2 | R:w |',
      lh: 'R:w | G3:h/1 E3:h/3 | R:w | F3:h/2 C3:h/5 |',
    },
  },
  {
    id: 's0-march-lh', targetBpm: 60, title: 'Left-Hand March', composer: 'Original exercise', stage: 0,
    skills: ['left-hand', 'five-finger-C', 'quarter-notes', 'half-rests'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      lh: 'G3:q/1 F3:q/2 E3:q/3 D3:q/4 | C3:h/5 R:h | D3:q/4 E3:q/3 F3:q/2 G3:q/1 | C3:w/5 |',
    },
  },

  // ───────── Stage 1: five-finger positions ─────────
  {
    id: 's1-ode-rh', targetBpm: 72, title: 'Ode to Joy (right hand)', composer: 'Beethoven', stage: 1,
    skills: ['five-finger-C', 'dotted-quarter', 'melody'], license: 'public-domain',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'E4:q/3 E4:q F4:q G4:q/5 | G4:q F4:q E4:q D4:q/2 | C4:q/1 C4:q D4:q E4:q/3 | E4:q. D4:e D4:h |' +
        ' E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:e C4:h |',
    },
  },
  {
    id: 's1-unison', targetBpm: 60, title: 'Octaves Apart', composer: 'Original exercise', stage: 1,
    skills: ['unison', 'five-finger-C', 'hands-together'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4:q/1 D4:q/2 E4:q/3 F4:q/4 | G4:h/5 F4:q/4 E4:q/3 | D4:q/2 E4:q/3 F4:q/4 D4:q/2 | C4:w/1 |',
      lh: 'C3:q/5 D3:q/4 E3:q/3 F3:q/2 | G3:h/1 F3:q/2 E3:q/3 | D3:q/4 E3:q/3 F3:q/2 D3:q/4 | C3:w/5 |',
    },
  },
  {
    id: 's1-contrary', targetBpm: 60, title: 'Opening and Closing', composer: 'Original exercise', stage: 1,
    skills: ['contrary-motion', 'five-finger-C', 'hands-together'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4:q/1 D4:q/2 E4:q/3 F4:q/4 | G4:w/5 | F4:q/4 E4:q/3 D4:q/2 C4:q/1 | C4:w/1 |',
      lh: 'G3:q/1 F3:q/2 E3:q/3 D3:q/4 | C3:w/5 | D3:q/4 E3:q/3 F3:q/2 G3:q/1 | C3:w/5 |',
    },
  },
  {
    id: 's1-au-clair', targetBpm: 66, title: 'Au clair de la lune', composer: 'Traditional', stage: 1,
    skills: ['held-note', 'five-finger-C', 'hands-together'], license: 'traditional',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4:q/1 C4:q C4:q D4:q/2 | E4:h/3 D4:h/2 | C4:q/1 E4:q/3 D4:q/2 D4:q | C4:w/1 |',
      lh: 'C3:w | C3:w | C3:h G2:h | C3:w |',
    },
  },
  {
    id: 's1-ode-ht', targetBpm: 72, title: 'Ode to Joy (hands together)', composer: 'Beethoven', stage: 1,
    skills: ['held-note', 'five-finger-C', 'hands-together', 'dotted-quarter'], license: 'public-domain',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'E4:q/3 E4:q F4:q G4:q/5 | G4:q F4:q E4:q D4:q/2 | C4:q/1 C4:q D4:q E4:q/3 | E4:q. D4:e D4:h |' +
        ' E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:e C4:h |',
      lh: 'C3:w | G2:w | C3:w | C3:h G2:h | C3:w | G2:w | C3:w | G2:h C3:h |',
    },
  },

  {
    id: 's1-g-position', targetBpm: 60, title: 'Home in G', composer: 'Original exercise', stage: 1,
    skills: ['five-finger-G', 'hands-together', 'melody-over-accompaniment'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'G4:q/1 A4:q/2 B4:q/3 C5:q/4 | D5:h/5 C5:q/4 B4:q/3 | A4:q/2 B4:q/3 C5:q/4 A4:q/2 | G4:w/1 |',
      lh: 'G2:h/5 D3:h/1 | G2:h/5 D3:h/1 | D3:h/1 G2:h/5 | G2:w/5 |',
    },
  },
  {
    id: 's1-f-position', targetBpm: 60, title: 'Home in F', composer: 'Original exercise', stage: 1,
    skills: ['five-finger-F', 'flat', 'hands-together', 'melody-over-accompaniment'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: -1,
      rh: 'F4:q/1 G4:q/2 A4:q/3 Bb4:q/4 | C5:h/5 Bb4:q/4 A4:q/3 | G4:q/2 A4:q/3 Bb4:q/4 G4:q/2 | F4:w/1 |',
      lh: 'F2:h/5 C3:h/1 | F2:h/5 C3:h/1 | C3:h/1 F2:h/5 | F2:w/5 |',
    },
  },
  {
    id: 's1-mary', targetBpm: 72, title: 'Mary Had a Little Lamb', composer: 'Traditional', stage: 1,
    skills: ['five-finger-C', 'melody', 'hands-together'], license: 'traditional',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'E4:q/3 D4:q/2 C4:q/1 D4:q/2 | E4:q E4:q E4:h | D4:q D4:q D4:h | E4:q G4:q G4:h |' +
        ' E4:q D4:q C4:q D4:q | E4:q E4:q E4:q E4:q | D4:q D4:q E4:q D4:q | C4:w |',
      lh: 'C3:w | C3:w | G2:w | C3:w | C3:w | C3:w | G2:h G2:h | C3:w |',
    },
  },
  {
    id: 's1-hot-cross', targetBpm: 72, title: 'Hot Cross Buns', composer: 'Traditional', stage: 1,
    skills: ['five-finger-C', 'eighth-notes', 'melody'], license: 'traditional',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'E4:q/3 D4:q/2 C4:h/1 | E4:q D4:q C4:h | C4:e C4:e C4:e C4:e D4:e D4:e D4:e D4:e | E4:q D4:q C4:h |',
    },
  },
  {
    id: 's1-low-voice', targetBpm: 60, title: 'Low Voice', composer: 'Original exercise', stage: 1,
    skills: ['LH-melody', 'held-note', 'five-finger-C', 'hands-together'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4+G4:w | C4+G4:w | C4+G4:w | C4+G4:w |',
      lh: 'E3:q/3 F3:q/2 G3:h/1 | F3:q/2 E3:q/3 D3:h/4 | E3:q/3 F3:q/2 G3:q/1 E3:q/3 | C3:w/5 |',
    },
  },
  {
    id: 's1-breathe', targetBpm: 60, title: 'Breathe', composer: 'Original exercise', stage: 1,
    skills: ['quarter-rests', 'five-finger-C', 'hands-together'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4:q/1 R:q E4:q/3 R:q | D4:q/2 R:q F4:q/4 R:q | E4:q/3 R:q G4:q/5 R:q | C4:w/1 |',
      lh: 'R:q C3:q/5 R:q C3:q/5 | R:q G2:q R:q G2:q | R:q C3:q R:q E3:q/3 | C3:w/5 |',
    },
  },

  // ───────── Stage 2: leaving the position ─────────
  {
    id: 's2-scale-c-rh', targetBpm: 80, title: 'C Major Scale (right hand)', composer: 'Technique', stage: 2,
    skills: ['scale', 'thumb-under', 'C-major'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4:q/1 D4:q/2 E4:q/3 F4:q/1 | G4:q/2 A4:q/3 B4:q/4 C5:q/5 | C5:q/5 B4:q/4 A4:q/3 G4:q/2 | F4:q/1 E4:q/3 D4:q/2 C4:q/1 |',
    },
  },
  {
    id: 's2-scale-c-lh', targetBpm: 80, title: 'C Major Scale (left hand)', composer: 'Technique', stage: 2,
    skills: ['scale', 'thumb-under', 'C-major'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      lh: 'C3:q/5 D3:q/4 E3:q/3 F3:q/2 | G3:q/1 A3:q/3 B3:q/2 C4:q/1 | C4:q/1 B3:q/2 A3:q/3 G3:q/1 | F3:q/2 E3:q/3 D3:q/4 C3:q/5 |',
    },
  },
  {
    id: 's2-scale-c-ht', targetBpm: 72, title: 'C Major Scale (hands together)', composer: 'Technique', stage: 2,
    skills: ['scale', 'thumb-under', 'C-major', 'hands-together'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4:q/1 D4:q/2 E4:q/3 F4:q/1 | G4:q/2 A4:q/3 B4:q/4 C5:q/5 | C5:q/5 B4:q/4 A4:q/3 G4:q/2 | F4:q/1 E4:q/3 D4:q/2 C4:q/1 |',
      lh: 'C3:q/5 D3:q/4 E3:q/3 F3:q/2 | G3:q/1 A3:q/3 B3:q/2 C4:q/1 | C4:q/1 B3:q/2 A3:q/3 G3:q/1 | F3:q/2 E3:q/3 D3:q/4 C3:q/5 |',
    },
  },
  {
    id: 's2-twinkle', targetBpm: 80, title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional', stage: 2,
    skills: ['position-shift', 'melody', 'C-major'], license: 'traditional',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'C4:q/1 C4:q G4:q/5 G4:q | A4:q/5 A4:q G4:h | F4:q/4 F4:q E4:q/3 E4:q | D4:q/2 D4:q C4:h/1 |' +
        ' G4:q/5 G4:q F4:q/4 F4:q | E4:q/3 E4:q D4:h/2 | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h |' +
        ' C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h |',
    },
  },

  {
    id: 's2-scale-g-rh', targetBpm: 80, title: 'G Major Scale (right hand)', composer: 'Technique', stage: 2,
    skills: ['scale', 'thumb-under', 'G-major', 'sharp'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 1,
      rh: 'G4:q/1 A4:q/2 B4:q/3 C5:q/1 | D5:q/2 E5:q/3 F#5:q/4 G5:q/5 | G5:q/5 F#5:q/4 E5:q/3 D5:q/2 | C5:q/1 B4:q/3 A4:q/2 G4:q/1 |',
    },
  },
  {
    id: 's2-scale-g-lh', targetBpm: 80, title: 'G Major Scale (left hand)', composer: 'Technique', stage: 2,
    skills: ['scale', 'thumb-under', 'G-major', 'sharp'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 1,
      lh: 'G2:q/5 A2:q/4 B2:q/3 C3:q/2 | D3:q/1 E3:q/3 F#3:q/2 G3:q/1 | G3:q/1 F#3:q/2 E3:q/3 D3:q/1 | C3:q/2 B2:q/3 A2:q/4 G2:q/5 |',
    },
  },
  {
    id: 's2-scale-a-minor', targetBpm: 72, title: 'A Minor Scale (right hand)', composer: 'Technique', stage: 2,
    skills: ['scale', 'thumb-under', 'A-minor'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'A4:q/1 B4:q/2 C5:q/3 D5:q/1 | E5:q/2 F5:q/3 G5:q/4 A5:q/5 | A5:q/5 G5:q/4 F5:q/3 E5:q/2 | D5:q/1 C5:q/3 B4:q/2 A4:q/1 |',
    },
  },
  {
    id: 's2-chord-steps', targetBpm: 60, title: 'Chord Steps', composer: 'Original exercise', stage: 2,
    skills: ['triads', 'I-IV-V', 'C-major', 'melody-over-accompaniment'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'E4:q G4:q E4:q C4:q | F4:q A4:q F4:q C4:q | D4:q G4:q B3:q D4:q | C4:w |',
      lh: 'C3+E3+G3:w | F2+A2+C3:w | G2+B2+D3:w | C3+E3+G3:w |',
    },
  },
  {
    id: 's2-frere-jacques', targetBpm: 84, title: 'Frère Jacques', composer: 'Traditional', stage: 2,
    skills: ['melody', 'eighth-notes', 'G-position', 'hands-together'], license: 'traditional',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'G4:q/1 A4:q/2 B4:q/3 G4:q/1 | G4:q A4:q B4:q G4:q | B4:q/3 C5:q/4 D5:h/5 | B4:q C5:q D5:h |' +
        ' D5:e E5:e D5:e C5:e B4:q G4:q | D5:e E5:e D5:e C5:e B4:q G4:q | G4:q D4:q G4:h | G4:q D4:q G4:h |',
      lh: 'G2:w | G2:w | G2:w | G2:w | G2:w | G2:w | D3:h G2:h | D3:h G2:h |',
    },
  },

  // ───────── Stage 3: accompaniment patterns ─────────
  {
    id: 's3-broken-chords', targetBpm: 60, title: 'Quiet Water', composer: 'Original exercise', stage: 3,
    skills: ['broken-chord-LH', 'eighth-notes', 'melody-over-accompaniment'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'E4:h G4:h | F4:h D4:h | E4:h C4:h | D4:q E4:q F4:h |' +
        ' G4:h E4:h | D4:q E4:q F4:h | A4:q G4:q F4:h | E4:w |',
      lh: 'C3:e E3:e G3:e E3:e C3:e E3:e G3:e E3:e | G2:e B2:e D3:e B2:e G2:e B2:e D3:e B2:e |' +
        ' A2:e C3:e E3:e C3:e A2:e C3:e E3:e C3:e | F2:e A2:e C3:e A2:e F2:e A2:e C3:e A2:e |' +
        ' C3:e E3:e G3:e E3:e C3:e E3:e G3:e E3:e | G2:e B2:e D3:e B2:e G2:e B2:e D3:e B2:e |' +
        ' F2:e A2:e C3:e A2:e F2:e A2:e C3:e A2:e | C3:e E3:e G3:e E3:e C3:h |',
    },
  },
  {
    id: 's3-waltz', targetBpm: 84, title: 'Small Waltz', composer: 'Original exercise', stage: 3,
    skills: ['waltz-bass', '3/4', 'melody-over-accompaniment'], license: 'own',
    notation: {
      timeSig: [3, 4], fifths: 0,
      rh: 'G4:h E4:q | E4:q D4:q C4:q | D4:h B3:q | B3:q C4:q D4:q |' +
        ' E4:h G4:q | F4:q A4:q F4:q | G4:q F4:q D4:q | C4:h. |',
      lh: 'C3:q E3+G3:q E3+G3:q | C3:q E3+G3:q E3+G3:q | G2:q B2+D3:q B2+D3:q | G2:q B2+D3:q B2+D3:q |' +
        ' C3:q E3+G3:q E3+G3:q | F2:q A2+C3:q A2+C3:q | G2:q B2+D3:q B2+D3:q | C3:h. |',
    },
  },
  {
    id: 's3-grey-morning', targetBpm: 60, title: 'Grey Morning', composer: 'Original exercise', stage: 3,
    skills: ['broken-chord-LH', 'eighth-notes', 'A-minor', 'melody-over-accompaniment'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'E4:h A4:h | A4:h C5:h | G4:h E5:h | D5:h B4:h | C5:h E5:h | C5:q A4:q F4:h | B4:q D5:q G4:h | A4:w |',
      lh: 'A2:e E3:e A3:e E3:e A2:e E3:e A3:e E3:e | F2:e C3:e F3:e C3:e F2:e C3:e F3:e C3:e | C3:e G3:e C4:e G3:e C3:e G3:e C4:e G3:e | G2:e D3:e G3:e D3:e G2:e D3:e G3:e D3:e | A2:e E3:e A3:e E3:e A2:e E3:e A3:e E3:e | F2:e C3:e F3:e C3:e F2:e C3:e F3:e C3:e | G2:e D3:e G3:e D3:e G2:e D3:e G3:e D3:e | A2:e E3:e A3:e E3:e A2:e E3:e A3:e E3:e |',
    },
  },
  {
    id: 's3-rainy-waltz', targetBpm: 80, title: 'Rainy Waltz', composer: 'Original exercise', stage: 3,
    skills: ['waltz-bass', '3/4', 'A-minor', 'melody-over-accompaniment'], license: 'own',
    notation: {
      timeSig: [3, 4], fifths: 0,
      rh: 'A4:h E4:q | F4:q A4:q D5:q | D5:h B4:q | C5:h. | E5:h C5:q | D5:q F5:q A4:q | B4:q D5:q G4:q | A4:h. |',
      lh: 'A2:q C3+E3:q C3+E3:q | D3:q F3+A3:q F3+A3:q | G2:q B2+D3:q B2+D3:q | C3:q E3+G3:q E3+G3:q | A2:q C3+E3:q C3+E3:q | D3:q F3+A3:q F3+A3:q | G2:q B2+D3:q B2+D3:q | A2:h. |',
    },
  },
  {
    id: 's3-slow-tide', targetBpm: 60, title: 'Slow Tide', composer: 'Original exercise', stage: 3,
    skills: ['broken-chord-LH', 'eighth-notes', 'I-vi-IV-V', 'melody-over-accompaniment'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'E4:h G4:h | E4:h A4:h | F4:h A4:h | D4:h G4:h | E4:h G4:h | C5:h A4:h | B4:h D5:h | C5:w |',
      lh: 'C3:e E3:e G3:e C4:e G3:e E3:e G3:e E3:e | A2:e E3:e A3:e C4:e A3:e E3:e A3:e E3:e | F2:e C3:e F3:e A3:e F3:e C3:e F3:e C3:e | G2:e D3:e G3:e B3:e G3:e D3:e G3:e D3:e | C3:e E3:e G3:e C4:e G3:e E3:e G3:e E3:e | A2:e E3:e A3:e C4:e A3:e E3:e A3:e E3:e | G2:e D3:e G3:e B3:e G3:e D3:e G3:e D3:e | C3:e E3:e G3:e C4:e G3:e E3:e G3:e E3:e |',
    },
  },
  {
    id: 's3-music-box', targetBpm: 60, title: 'Music Box', composer: 'Original exercise', stage: 3,
    skills: ['broken-chord-RH', 'eighth-notes', 'I-V-vi-IV', 'RH-over-bass'], license: 'own',
    notation: {
      timeSig: [4, 4], fifths: 0,
      rh: 'E4:e G4:e C5:e G4:e E4:e G4:e C5:e G4:e | D4:e G4:e B4:e G4:e D4:e G4:e B4:e G4:e | E4:e A4:e C5:e A4:e E4:e A4:e C5:e A4:e | F4:e A4:e C5:e A4:e F4:e A4:e C5:e A4:e | E4:e G4:e C5:e G4:e E4:e G4:e C5:e G4:e | D4:e G4:e B4:e G4:e D4:e G4:e B4:e G4:e | F4:e A4:e C5:e A4:e F4:e A4:e C5:e A4:e | E4:q/3 G4:q/5 C5:h/1 |',
      lh: 'C3:h G3:h | G2:h D3:h | A2:h E3:h | F2:h C3:h | C3:h G3:h | G2:h D3:h | F2:h C3:h | C3:w |',
    },
  },
];

export const pieces: Piece[] = sources.map((s) => {
  const { rh, lh } = s.notation;
  const hands: Hands = rh && lh ? 'both' : rh ? 'rh' : 'lh';
  return { ...s, hands, notation: { ...s.notation, title: s.title, composer: s.composer } };
});

export function pieceXml(piece: Piece): string {
  return buildMusicXml(piece.notation);
}
