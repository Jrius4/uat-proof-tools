import type { Config } from '../config.ts';
import type { Scenario } from '../scenario.ts';

export type RecordContext = {
  cfg: Config;
  scenario: Scenario;
  /** Directory the recorder must leave raw video, timeline.json and result.json in. */
  outDir: string;
  /** Show a visible browser/window instead of headless (web only). */
  headed?: boolean;
};

export type Recorder = (ctx: RecordContext) => Promise<void>;
