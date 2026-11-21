import { emptyLearnerData, LearningEngine, parseLearnerData } from '../core/learning/engine';
import type { Platform } from '../platform/types';

export interface GameContext {
  platform: Platform;
  engine: LearningEngine;
  save(): Promise<void>;
  resetProgress(): Promise<void>;
  setSfxMuted(muted: boolean): void;
  setMusicMuted(muted: boolean): void;
}

const LEARNER_KEY = 'learner-v1';
const SETTINGS_KEY = 'settings-v1';

let current: GameContext | null = null;

export async function initContext(platform: Platform): Promise<GameContext> {
  const engine = new LearningEngine(
    parseLearnerData(await platform.storage.get(LEARNER_KEY)) ?? emptyLearnerData(platform.now()),
  );
  try {
    const saved = JSON.parse((await platform.storage.get(SETTINGS_KEY)) ?? '{}');
    platform.sfx.muted = !!(saved.sfxMuted ?? saved.muted);
    platform.music.muted = !!saved.musicMuted;
  } catch {
    // ignore
  }
  const saveSettings = () =>
    void platform.storage.set(
      SETTINGS_KEY,
      JSON.stringify({ sfxMuted: platform.sfx.muted, musicMuted: platform.music.muted }),
    );

  current = {
    platform,
    engine,
    save: () => platform.storage.set(LEARNER_KEY, engine.serialize()),
    resetProgress: async () => {
      engine.data = emptyLearnerData(platform.now());
      await platform.storage.set(LEARNER_KEY, engine.serialize());
    },
    setSfxMuted: (muted) => {
      platform.sfx.muted = muted;
      saveSettings();
    },
    setMusicMuted: (muted) => {
      platform.music.muted = muted;
      saveSettings();
    },
  };
  return current;
}

export function ctx(): GameContext {
  if (!current) throw new Error('游戏上下文还没初始化');
  return current;
}
