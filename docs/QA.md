# Glimmerdeep: QA & Balance

## Automated checks
| Command | What it covers |
|---|---|
| `npm test` | 66 Vitest tests, listed below |
| `npm run sim -- 400 [--build=<playstyle>]` | A bot plays consecutive digs from the surface, shopping between digs by a playstyle's priorities, and logs milestone times and the stall gap |
| `node tools/qa/soak.mjs 45` | Browser soak test: autoplay at 12 depths, from the surface through every seal, the Heart and the endless depths, failing on any page error |
| `node tools/qa/shot.mjs` / `menu_shots.mjs` | Screenshots of the title, dig, camp, Workshop, Codex and achievements screens for visual review |
| `xvfb-run node tools/qa/electron.mjs` | Boots the packaged Linux build, checks the Steam/save bridge, and plays briefly |
| `python3 tools/audio/analyze.py` | Audio loudness (≈LUFS), peaks, DC offset, loop seams and spectrograms |
| `npm run art` | Rebuilds all sprites and fails on any off-palette pixel |

The Vitest suite covers:
- RNG determinism and that the tileset order matches the art pipeline
- **open world** (`tests/world.test.ts`): chunks are identical whatever order they are generated in; no side walls (far-left and far-right ground matches the shaft's density); veins cross chunk borders without seams; seals run under every column (no sideways bypass at x = ±500); broken seals generate open (never the demo's Amber Seal); one Heart, under the shaft; one hash-sited relic per unfound relic, no re-burial, Relic Sense pulls them in; capped caches in finished layers; every dig starts at the surface; walking 300 tiles sideways; the bot stays near the shaft
- **shards** (`tests/shards.test.ts`): 11 types with sprites, Codex text and distinct behaviour; embers and cinnabar are shard sources; one +shard upgrade raises every source; a bare vs a shard-built Shard Bomb (count, damage, recharge, rock broken); nothing deals damage except the drill, shards, drones and landings; Vein Rupture; pierce, split, ember sparks and the capped void-shard turn; per-burst and in-flight caps; auto-collect with no magnet; the Codex learns shard types
- **lantern** (`tests/lantern.test.ts`): the depth curve (≈1 at the surface, monotonic, ×4+ at the Heart); refuel tapers with depth and chain length; the stall drain starts only after its grace period and eases off when something breaks; a first dig holding "down" passes 100 m
- **playstyles** (`tests/playstyles.test.ts`): each world stat measurably raises its feature over 200 chunks; rich ground is rare; ground already generated never changes; World nodes say they affect newly explored ground; a shard build out-mines the same drill without shards; drill power has diminishing returns
- that every upgrade node is reachable, boon hands, the player never ends up inside rock, seals yield only to enough built drill power, chain pot payouts, relic perks, the Heart ending the game
- saves: round-trip, corruption recovery, full shape validation, backup restore, and every migration (v1→v2, v2→v3 combat refunds, v3→v4 lifts removed and `sealsBroken` derived from `maxDepth`, v4→v5 flare and magnet refunds at the list price paid, flare binding → Shard Bomb, flare count → bomb count; a v3 save migrates all the way through)
- banking (broken seals bank once and stay broken, even on a dark ending), the Codex percentage over 57 entries, achievements never revoked, Deep Pressure unlocks
- stacked Second Wind, Head Start, the corrupt-save flag (regression tests from the code review)

## Balance (shard rework)
Bot playthroughs (`npm run sim -- 400`), every dig from the surface. The bot is greedy and simple, so these are a rough stand-in for a person.

| Milestone | GDD target | Before the rework (lifts) | After (balanced build) |
|---|---|---|---|
| First dig | about 100 m | 106 m | bot 57 m (it wanders after ore); a player holding "down" reaches 107–124 m |
| Amber Seal (300 m, power 10) | 20–35 min | 31 min | 31 min |
| Glimmer Seal (520 m, power 22) | 40–55 min | 46 min | 36 min |
| Ember Seal (760 m, power 40) | 70–95 min | 93 min | 74 min |
| Hollow Seal (1050 m, power 90) | 100–125 min | 109 min | 89 min |
| World's Heart | 140–190 min | 149 min | 147 min |
| Stall gap (median, power frontier → lantern out) | short | 219 s | 200 s |

**Playstyles** (`--build=<playstyle>`: the bot favours that branch's nodes and buys other nodes only when nothing better is affordable, except that every build buys the drill power the next seal needs):

| Build | Heart (min) | Digs |
|---|---|---|
| Shardstorm (`shard`) | 94 | 20 |
| Prospector (`fortune`) | 108 | 21 |
| Chainlord (`chain`) | 113 | 22 |
| Trickster (`arcana`) | 119 | 23 |
| Surveyor (`surveyor`) | 121 | 23 |
| Driller (`drill`) | 122 | 24 |
| Balanced | 147 | 24 |
| Lanternkeeper (`lantern`) | 153 | 25 |

Every build reaches the Heart. Six of the eight sit within 30% of the fastest (94–122 min); the balanced and lantern bots are 56–63% slower. Before this pass, drill-only was the outlier (32 min against 54–117 min for the rest); now it sits mid-pack.

**What changed to get here** (all in data files):
- Price scale `ECON` 6; outer rings ×6 and ×24 (`TIER_MUL`); steeper drill power growth (Tempered Bit ×1.8, Diamond Edge ×2.0, Starmetal Bit 40k ×2.6, Refine the Bit 400k ×1.28) for diminishing returns.
- Seals answer only to built drill power (Workshop and relics), so a lucky boon hand can't skip a layer; seal powers 10 / 22 / 40 / 90 / 150.
- Cascades burn out (fewer child shards past a 300-link chain, none after 8 generations; fault shards never start more faults; Cataclysm thins with its chain); cascade-broken plain rock gives 15% XP; the pot multiplier grows only logarithmically past 1,500 links; Overcharge stacks to 3; levelling ×1.3 per level.
- Drain reductions stack to at most ×0.4; mined fuel tapers with depth.
- Playstyle engines: Reserve Tank (ore +6% per 100 max fuel per level), Lucky Stars (ore +1% per boon held per level), Midas Lamp (pots pay gems), Appraisal +15%.

### Known limitations
- **The Lanternkeeper and balanced bots are slower than the 30% band** (see the table). The balanced bot spreads its gold thin across every branch. Its early nodes don't earn, so it reaches each seal later; a stronger Reserve Tank didn't close the gap. A human mixing lantern with drill or fortune does fine; a pure lantern build is slow but never soft-locked.
- **The stall gap only fell from 219 s to about 200 s once the economy was rebalanced** (it was 1–50 s in between). Bots now spend long stretches at a seal wall wandering sideways in the open world; that wandering still breaks rock, so it isn't the "nothing to do" stall the drain targets. A player stuck at a seal can always mine sideways for shards.
- **Frame rate in the software renderer:** a dig with every node at level 8 runs at about 7 fps against 12 for a bare dig in headless SwiftShader (shards capped at 300 in flight, pickups at 180, with the extra banked at once). Real GPUs should be far faster, but this needs checking on a Steam Deck.
- No human playtests of the rework yet. A short round on the first hour (shard feel, the Shard Bomb, the first seal) is strongly recommended.
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
- [ ] Break each Strata Seal: the wave runs across; on the next dig that seal is open
- [ ] Dig 300+ tiles left and right: new ground keeps generating, the HUD points home, seals are still there
- [ ] Throw a bare Shard Bomb, then one with a shard build: the second clearly erupts
- [ ] Crack a geode, find a relic (perk applies at once), see a NEW ORE card
- [ ] Credits play once after the World's Heart; Deep Pressure 1 unlocks
- [ ] Load an old v2 save: combat upgrades are gone and refunded
- [ ] Load a v4 save with flare and magnet nodes: they are refunded, the bomb keeps your flare key
- [ ] All 37 achievements are reachable (see `src/systems/achievements.ts`)
- [ ] 100+ chain cascades stay smooth on a low-end GPU / Steam Deck
