/**
 * The sight-reading test: unseen pieces of rising level, stop when reading breaks down.
 * Pure state machine; the app feeds it the accuracy of each run.
 *
 *   level 1 → read a piece → ≥ 80% in time: next level
 *                          → less: one more piece at the same level; pass it and move on, miss it and the test ends
 *   result  = the highest level passed (0 if none)
 */

export const PASS_ACCURACY = 0.8;

export interface SightResult {
  level: number;
  accuracy: number;
  passed: boolean;
}

export interface SightState {
  /** The level of the piece to read next. */
  level: number;
  /** Failed pieces at this level so far (0 or 1). */
  misses: number;
  /** Highest level passed so far; 0 if none yet. */
  passedLevel: number;
  results: SightResult[];
  done: boolean;
}

export const startTest = (): SightState => ({ level: 1, misses: 0, passedLevel: 0, results: [], done: false });

export function recordResult(state: SightState, accuracy: number, maxLevel: number): SightState {
  if (state.done) return state;
  const passed = accuracy >= PASS_ACCURACY;
  const results = [...state.results, { level: state.level, accuracy, passed }];
  if (passed) {
    return state.level >= maxLevel
      ? { ...state, results, passedLevel: state.level, done: true }
      : { level: state.level + 1, misses: 0, passedLevel: state.level, results, done: false };
  }
  return state.misses === 0 ? { ...state, misses: 1, results } : { ...state, results, done: true };
}

/** What to tell the player when the test is over. */
export function describeOutcome(passedLevel: number, maxLevel: number, levelName: (level: number) => string): string {
  if (passedLevel === 0) {
    return `You did not pass level 1 this time (${levelName(1)}). That is a normal place to start: work through stages 0 and 1, then try again.`;
  }
  if (passedLevel >= maxLevel) {
    return `You passed every level, up to level ${maxLevel}: ${levelName(maxLevel)}. Your reading is ahead of the generated material: move on to real repertoire.`;
  }
  return `Your sight-reading level is ${passedLevel} of ${maxLevel}: ${levelName(passedLevel)}. Level ${passedLevel + 1} (${levelName(passedLevel + 1)}) is the next step: practise pieces like it, then test again in a week or two.`;
}
