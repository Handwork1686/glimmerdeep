import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './config';
import { BootScene } from './scenes/Boot';
import { TitleScene } from './scenes/Title';
import { CampScene } from './scenes/Camp';
import { RunScene } from './scenes/Run';
import { HudScene } from './scenes/Hud';
import { ResultsScene } from './scenes/Results';
import { SettingsScene } from './scenes/Settings';
import { PauseScene } from './scenes/Pause';
import { CreditsScene } from './scenes/Credits';
import { AchievementsScene } from './scenes/Achievements';
import { CodexScene } from './scenes/Codex';
import { EndingScene } from './scenes/Ending';
import { DemoEndScene } from './scenes/DemoEnd';
import { Save } from './systems/save';
import { Controls } from './systems/controls';
import { Audio } from './systems/audio';

Save.load();
Controls.attach();

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#07060c',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  disableContextMenu: true,
  input: { gamepad: true },
  fps: { target: 60, smoothStep: true },
  audio: { disableWebAudio: false },
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH, zoom: 1 },
  scene: [BootScene, TitleScene, CampScene, RunScene, HudScene, ResultsScene, SettingsScene, PauseScene, CreditsScene, AchievementsScene, CodexScene, EndingScene, DemoEndScene],
});

/** Integer (pixel-perfect) or fill scaling, re-evaluated on resize. */
export function applyScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const fit = Math.min(w / VIEW_W, h / VIEW_H);
  const zoom = Save.data.settings.pixelPerfect ? Math.max(1, Math.floor(fit)) : Math.max(0.5, fit);
  game.scale.setZoom(zoom);
}
window.addEventListener('resize', applyScale);
game.events.once('ready', applyScale);
applyScale();

// audio fades/ducking advance every game step, whatever scene is active
game.events.on('step', (_t: number, delta: number) => Audio.update(Math.min(0.1, delta / 1000)));

// pause audio when the window loses focus (Steam overlay, alt-tab)
window.addEventListener('blur', () => game.sound.pauseAll());
window.addEventListener('focus', () => game.sound.resumeAll());

(window as unknown as { __game: Phaser.Game }).__game = game;
