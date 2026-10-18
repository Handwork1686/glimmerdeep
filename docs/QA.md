# Glimmerdeep: QA & Balance

## Automated checks
| Command | What it covers |
|---|---|
| `npm test` | 32 Vitest tests, listed below |
| `npm run sim -- 200` | Bot plays 200 consecutive descents, shopping between runs, and logs milestone times |
| `node tools/qa/soak.mjs 45` | Browser soak test: autoplay at 12 depths, from the surface through every seal, the Heart and the endless depths, failing on any page error |
| `node tools/qa/shot.mjs` / `menu_shots.mjs` | Screenshots of the title, dig, camp, Workshop, Codex and achievements screens for visual review |
| `xvfb-run node tools/qa/electron.mjs` | Boots the packaged Linux build, checks the Steam/save bridge, and plays briefly |
| `python3 tools/audio/analyze.py` | Audio loudness (≈LUFS), peaks, DC offset, loop seams and spectrograms |
| `npm run art` | Rebuilds all sprites and fails on any off-palette pixel |

The Vitest suite covers:
- RNG determinism
- that the tileset order matches the art pipeline
- worldgen: determinism, walls, full-width Strata Seals, lift plugs, the Heart chamber, relic burial (and no re-burial once found), geode vaults
- that every upgrade node is reachable
- boon hands
- that the player never ends up inside rock
- that a seal only yields to enough drill power and then shatters across, the chain pot paying out at the right multiplier, relic perks applying at once, and the Heart ending the game
- save round-trip, corruption recovery, v1→v2 migration and the v2→v3 migration that refunds every removed combat upgrade in full
- run banking, the Codex, depth-based lift stops (the deepest only after the Heart), and Deep Pressure unlocks
- stacked Second Wind revives, Head Start always granting a boon, and the corrupt-save flag (regression tests from the code review)

## Balance targets vs. simulation
This is the bot's playthrough (`npm run sim -- 300`) with greedy shopping. It mines toward the nearest ore, crystal or relic and flares when that would start a chain, so it is a rough stand-in for a person.

| Milestone | GDD target | Simulated (bot) |
|---|---|---|
| First dig | about 2 min, about 100 m | 113 s, 106 m |
| Amberstone (120 m) | — | 7 min |
| Amber Seal (300 m, power 10) | 20–35 min | 31 min |
| Glimmer Seal (520 m, power 22) | 40–55 min | 46 min |
| Ember Seal (760 m, power 40) | 70–95 min | 93 min |
| Hollow Seal (1050 m, power 90) | 100–125 min | 109 min |
| World's Heart (credits) | 140–190 min | 163 min |

After the Heart the bot's digs reach 3,000–4,000 m and chains of 10,000+ links: the "overpowered" endgame, by design.

Tuning levers live in data files:
- `src/data/tiles.ts`: rock HP, ore values
- `src/data/biomes.ts`: ore density, fuel drain per layer, seal drill power
- `src/data/upgrades.ts`: costs, growth, `TIER_MUL`, `ECON`
- `src/core/stats.ts`: chain pot growth, chain timer, fuel per link

### Known limitations
- No human playtests yet. A short round focused on the first hour (feel of drilling and chains, the first seal) is strongly recommended before launch.
- Windows and macOS builds have been configured but not run on real hardware.

## Polish pass 2 (code review)
A high-effort code review across `src/core`, `Run`, `Hud`, `Camp` and `src/systems` found 10 issues. All 10 are fixed:
- Flare and dynamite presses were lost on high-refresh displays.
- Results and ending music stayed silent because fades only ran in some scenes.
- Stacked Second Wind revives didn't work.
- Head Start sometimes granted nothing.
- A corrupt save could be wiped silently.
- Achievements unlocked by a purchase could be lost on quit.
- The music intensity layer never started.
- The low-light heartbeat played twice per pulse.
- The bot was non-deterministic.
- The Workshop recomputed every node's stats on every frame.

Runs are now also banked if the window is closed mid-descent.

## Pass 3: the peaceful redesign
After the first playtest feedback ("the fighting is kind of bad"), every creature, guardian and hazard was removed and the game rebuilt around mining streaks, discovery and upgrading. See `docs/GDD.md`.

## Manual bug-bash checklist
- [ ] Alt-tab, minimise and Steam overlay mid-run: audio pauses, nothing breaks
- [ ] Unplug the controller mid-run: keyboard keeps working
- [ ] Resize the window and toggle fullscreen; pixel-perfect on/off
- [ ] Rebind every action, including clashes and Esc
- [ ] Corrupt `save.json` by hand: the game recovers from `.bak` or starts fresh with a notice
- [ ] Return to surface from the pause menu: loot is banked
- [ ] Break each Strata Seal: the wave runs across, the lift stop below opens
- [ ] Crack a geode, find a relic (perk applies at once), see a NEW ORE card
- [ ] Credits play once after the World's Heart; Deep Pressure 1 unlocks
- [ ] Load an old v2 save: combat upgrades are gone and refunded
- [ ] All 37 achievements are reachable (see `src/systems/achievements.ts`)
- [ ] 100+ chain cascades stay smooth on a low-end GPU / Steam Deck
