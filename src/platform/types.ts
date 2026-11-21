export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface SpeechAdapter {
  readonly available: boolean;
  has?(text: string): boolean;
  say(text: string, opts?: { interrupt?: boolean }): void;
  prefetch?(texts: string[]): void;
  primeInGesture?(): void;
  test?(text: string, cb: (ok: boolean, detail: string) => void): void;
}

export type SfxName =
  | 'tap'
  | 'letter'
  | 'pop'
  | 'correct'
  | 'wrong'
  | 'leak'
  | 'win'
  | 'lose'
  | 'streak'
  | 'fast'
  | 'coin'
  | 'heart'
  | 'escape'
  | 'card'
  | 'tick'
  | 'record'
  | 'intro';

export interface SfxAdapter {
  muted: boolean;
  play(name: SfxName, pitch?: number): void;
}

export type MusicMood = 'off' | 'calm' | 'battle' | 'danger';

export interface MusicAdapter {
  muted: boolean;
  setMood(mood: MusicMood): void;
}

export interface Platform {
  readonly name: string;
  readonly storage: StorageAdapter;
  readonly speech: SpeechAdapter;
  readonly sfx: SfxAdapter;
  readonly music: MusicAdapter;
  now(): number;
  haptic(pattern: number | number[]): void;
}
