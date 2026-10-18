# Glimmerdeep

> *The Great Lantern of Hearthmoor is going dark. Its light came from the Heart of the world. Dig down and bring it back.*

A peaceful incremental mining game for Steam:
- Digs last 2–6 minutes, and nothing down there can hurt you.
- Chains of ore and crystal fill a pot that pays out multiplied when the streak ends.
- Seven layers to the World's Heart, 22 ores, geodes, 24 relics and a Codex.
- A 70-node upgrade web with no ceiling.
- About 2.5–3 hours to the credits, then endless depths and ten Deep Pressure tiers.

Everything was made in this repository from code: design, pixel art, music, sound, code and store assets.

| | |
|---|---|
| Market research | [`docs/market-research.md`](docs/market-research.md) |
| Game design | [`docs/GDD.md`](docs/GDD.md) |
| Art bible | [`docs/ART_BIBLE.md`](docs/ART_BIBLE.md) |
| QA & balance | [`docs/QA.md`](docs/QA.md) |
| **Steam launch checklist** | [`docs/STEAM_LAUNCH.md`](docs/STEAM_LAUNCH.md) |
| Store copy / press kit | [`store/store_page.md`](store/store_page.md), [`presskit/`](presskit/README.md) |
| Store art, screenshots, trailer | [`store/`](store/) |

## Run it
```bash
npm ci
npm run dev            # http://localhost:5173 (browser)
npm run electron       # desktop window
npm test               # unit tests
npm run dist:linux     # packaged build in release/
npm run dist:demo      # Next Fest demo (ends at the first Strata Seal) in release-demo/
```
**Controls**

| Action | Keyboard | Gamepad |
|---|---|---|
| Move / drill | WASD or arrows | stick |
| Thrust | W / Space | A |
| Flare | E | X |
| Dynamite | Q | Y |
| Pause | Esc | Start |

Every key can be rebound in Settings → Controls.

## Asset pipelines
| Command | Produces |
|---|---|
| `npm run art` | `public/assets/` atlas, tileset, backgrounds and fonts. Palette-audited. |
| `python3 tools/art/store.py` | Steam capsules, library art and app icon |
| `npm run audio` | 44 sound-effect sets, the 11-track soundtrack and 7 ambience beds (OGG) |
| `npm run sim -- 200` | Balance simulation over 200 bot descents |
| `node tools/qa/soak.mjs` | Browser soak test, run against `npm run dev` |
| `bash tools/qa/trailer_capture.sh && python3 tools/qa/trailer.py` | `store/trailer.mp4` |

## Layout
```
src/core/      deterministic simulation (no Phaser): sim, worldgen, bot, progression
src/data/      tuning tables: tiles, biomes, seals, upgrades, boons, relics, strings, credits
src/scenes/    Phaser scenes: Boot, Title, Camp (workshop), Run, Hud, Results, Codex, Settings, Pause, Credits, Achievements, Ending
src/systems/   save (versioned + migrations), controls (rebinding, gamepad), audio, achievements, banking
electron/      desktop shell + Steam bridge (steamworks.js)
tools/         art / audio / sim / QA pipelines
```
