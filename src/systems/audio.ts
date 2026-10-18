/** Sound + music with volume buses, variation, pitch jitter and voice limiting. */
import Phaser from 'phaser';
import { Save } from './save';

export interface AudioManifest {
  sfx: Record<string, number>; // key -> number of variations
  music: Record<string, { loopStart: number; stems?: string[] }>;
  ambience?: Record<string, number>;
}

interface PlayOpts {
  volume?: number;
  rate?: number;
  jitter?: number; // +- rate variation
  pan?: number;
}

class AudioImpl {
  private game!: Phaser.Game;
  manifest: AudioManifest = { sfx: {}, music: {} };
  private last: Record<string, number> = {};
  private live: Record<string, number> = {};
  private music: Phaser.Sound.WebAudioSound | null = null;
  private musicKey = '';
  private stem: Phaser.Sound.WebAudioSound | null = null;
  private stemTarget = 0;
  private duck = 1;
  private fades: { snd: Phaser.Sound.WebAudioSound; t: number; dur: number; out: boolean }[] = [];

  init(game: Phaser.Game, manifest: AudioManifest) {
    this.game = game;
    this.manifest = manifest;
  }

  get sound() {
    return this.game.sound;
  }

  private vol(bus: 'sfx' | 'music') {
    const s = Save.data.settings;
    return s.master * (bus === 'sfx' ? s.sfx : s.music);
  }

  play(key: string, o: PlayOpts = {}) {
    if (!this.game) return;
    const n = this.manifest.sfx[key];
    if (!n) return;
    const now = performance.now();
    if (now - (this.last[key] ?? 0) < 28) return;
    if ((this.live[key] ?? 0) >= 5) return;
    this.last[key] = now;
    const v = Math.floor(Math.random() * n);
    const k = `sfx_${key}_${v}`;
    if (!this.game.cache.audio.exists(k)) return;
    const rate = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (o.jitter ?? 0.05));
    const snd = this.sound.add(k, { volume: (o.volume ?? 1) * this.vol('sfx'), rate });
    if (o.pan !== undefined && 'setPan' in snd) (snd as Phaser.Sound.WebAudioSound).setPan(Math.max(-1, Math.min(1, o.pan)));
    this.live[key] = (this.live[key] ?? 0) + 1;
    snd.once('complete', () => {
      this.live[key]--;
      snd.destroy();
    });
    snd.play();
  }

  /** A looping sfx whose volume and pitch the caller drives every frame (0 volume = silent but alive). */
  loop(key: string): { set: (volume: number, rate: number) => void; hush: () => void; stop: () => void } | null {
    if (!this.game) return null;
    const k = `sfx_${key}_0`;
    if (!this.game.cache.audio.exists(k)) return null;
    const snd = this.sound.add(k, { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
    snd.play();
    let cur = 0;
    return {
      set: (volume: number, rate: number) => {
        // ease toward the target so the loop never clicks on and off
        cur += (volume - cur) * 0.25;
        if (!this.alive(snd)) return;
        snd.setVolume(cur * this.vol('sfx'));
        snd.setRate(rate);
      },
      hush: () => {
        cur = 0;
        if (this.alive(snd)) snd.setVolume(0);
      },
      stop: () => {
        if (this.alive(snd)) this.kill(snd);
      },
    };
  }

  playMusic(key: string, fade = 1200) {
    if (!this.game || this.musicKey === key) return;
    let k = `music_${key}`;
    if (!this.game.cache.audio.exists(k) && key.includes('_')) {
      // a variant track that is missing falls back to its base (e.g. heart_alt -> heart)
      key = key.split('_')[0];
      k = `music_${key}`;
      if (this.musicKey === key) return;
    }
    if (!this.game.cache.audio.exists(k)) return;
    const old = this.music;
    const oldStem = this.stem;
    if (old) this.fadeOut(old, fade / 1000);
    if (oldStem) this.kill(oldStem);
    this.musicKey = key;
    const m = this.sound.add(k, { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
    const info = this.manifest.music[key];
    if (info?.loopStart) {
      // emulate an intro + loop: when the track ends, restart at the loop point
      m.setLoop(false);
      m.on('complete', () => m.play({ seek: info.loopStart }));
    }
    m.play();
    this.music = m;
    this.fades.push({ snd: m, t: 0, dur: fade / 1000, out: false });
    const stemKey = `music_${key}_hi`;
    this.stem = null;
    if (this.game.cache.audio.exists(stemKey)) {
      const st = this.sound.add(stemKey, { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
      st.play();
      this.stem = st;
    }
  }

  stopMusic(fade = 800) {
    const old = this.music;
    this.musicKey = '';
    this.music = null;
    if (this.stem) {
      this.kill(this.stem);
      this.stem = null;
    }
    if (old) this.fadeOut(old, fade / 1000);
  }

  /** 0..1 intensity layer for the current track (driven by the live chain). */
  setIntensity(v: number) {
    this.stemTarget = v;
  }

  private amb: { snd: Phaser.Sound.WebAudioSound; target: number; key: string }[] = [];
  private ambKey = '';

  /** Biome ambience bed, crossfaded; '' fades it out. */
  playAmbience(kind: string) {
    if (!this.game || this.ambKey === kind) return;
    this.ambKey = kind;
    for (const a of this.amb) a.target = 0;
    const k = `amb_${kind}`;
    if (!kind || !this.game.cache.audio.exists(k)) return;
    const snd = this.sound.add(k, { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
    snd.play();
    this.amb.push({ snd, target: 1, key: kind });
  }

  setDuck(v: number) {
    this.duck = v;
  }

  private fadeOut(snd: Phaser.Sound.WebAudioSound, dur: number) {
    // a sound can only have one fade at a time; fading out wins
    this.fades = this.fades.filter((f) => f.snd !== snd);
    this.fades.push({ snd, t: 0, dur, out: true });
  }

  private alive(snd: Phaser.Sound.WebAudioSound | null): snd is Phaser.Sound.WebAudioSound {
    return !!snd && !!(snd as unknown as { manager: unknown }).manager && !this.destroyed.has(snd);
  }

  private destroyed = new WeakSet<Phaser.Sound.WebAudioSound>();

  private kill(snd: Phaser.Sound.WebAudioSound) {
    if (this.destroyed.has(snd)) return;
    this.destroyed.add(snd);
    try {
      snd.destroy();
    } catch {
      /* already gone */
    }
  }

  update(dt: number) {
    for (const a of this.amb) {
      if (!this.alive(a.snd)) continue;
      const tv = a.target * this.vol('sfx') * 0.9 * (0.5 + 0.5 * this.duck);
      a.snd.setVolume(a.snd.volume + (tv - a.snd.volume) * Math.min(1, dt * 1.5));
      if (a.target === 0 && a.snd.volume < 0.005) this.kill(a.snd);
    }
    this.amb = this.amb.filter((a) => this.alive(a.snd));
    for (const f of this.fades) {
      f.t += dt;
      if (!this.alive(f.snd)) continue;
      const k = Math.min(1, f.t / Math.max(0.01, f.dur));
      f.snd.setVolume(this.vol('music') * this.duck * (f.out ? 1 - k : k));
      if (k >= 1 && f.out) this.kill(f.snd);
    }
    const fading = new Set(this.fades.filter((f) => f.t < f.dur).map((f) => f.snd));
    this.fades = this.fades.filter((f) => f.t < f.dur);
    if (this.alive(this.music) && this.music.isPlaying && !fading.has(this.music)) {
      const target = this.vol('music') * this.duck;
      const cur = this.music.volume;
      if (Math.abs(cur - target) > 0.01) this.music.setVolume(cur + (target - cur) * Math.min(1, dt * 4));
    }
    if (this.alive(this.stem)) {
      const target = this.vol('music') * this.duck * this.stemTarget;
      const cur = this.stem.volume;
      this.stem.setVolume(cur + (target - cur) * Math.min(1, dt * 2));
    }
  }

  refreshVolumes() {
    if (this.alive(this.music)) this.music.setVolume(this.vol('music') * this.duck);
  }
}

export const Audio = new AudioImpl();
