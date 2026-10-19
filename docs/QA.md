# Glimmerdeep: QA & Balance

## Automated checks
| Command | What it covers |
|---|---|
| `npm test` | 105 Vitest tests, listed below |
| `npm run sim -- 600 [--build=<playstyle>] [--boons=<family>] [--grant=<boon>]` | A bot plays consecutive digs from the surface, shopping between digs by a playstyle's priorities. Logs time to every 100 m band, how long the first pass took to cross each band, plain-rock hits to break (drill and shard), the share of tiles shards broke, fuel burn inside and outside chains, and the stall gap. Env: `SIM_SEED=<offset>`, `BAL_ECON`, `BAL_ROCK`, `BAL_GOLDFLAT`, `BAL_SHARDDMG`, `BAL_DRAIN` override the dials in `src/data/balance.ts` |
| `npm run sim:boons [-- --max]` | What each boon is worth: a mid-game build starts a dig with one stack (or all stacks) and skips every other hand; depth, gold, length and tiles broken against a dig with no boon |
| `node tools/qa/soak.mjs 45` | Browser soak test: autoplay at 12 depths, from the surface through the Heart and the endless depths, failing on any page error |
| `node tools/qa/round2_shots.mjs` | Screenshots of the Workshop (affordable vs greyed), the Camp's next-layer band, a batched achievement toast, a NEW SHARD toast and the boon bar with its tooltip |
| `node tools/qa/shot.mjs` / `menu_shots.mjs` | Screenshots of the title, dig, camp, Workshop, Codex and achievements screens |
| `xvfb-run node tools/qa/electron.mjs` | Boots the packaged Linux build, checks the Steam/save bridge, and plays briefly |
| `python3 tools/audio/analyze.py` | Audio loudness (about LUFS), peaks, DC offset, loop seams and spectrograms |
| `npm run art` | Rebuilds all sprites and fails on any off-palette pixel |

The Vitest suite covers:
- RNG determinism and that the tileset order matches the art pipeline
- **no gates** (`tests/gates.test.ts`): no unbreakable tile in any column from the surface to the Heart; every solid tile has finite HP; `rockHp` is smooth, monotone and keeps climbing past the Heart; layers blend over 50 m with no row jumping; a starter-drill bot ends by lantern-out (not a wall) and shards alone take it deeper; drill nodes are cheaper and flatter than before
- **open world** (`tests/world.test.ts`): chunks are identical whatever order they are generated in; no side walls; veins cross chunk borders; rune ribbons run under every column with gaps; one Heart, under the shaft; relics sited once, never re-buried; capped caches; every dig starts at the surface; walking 300 tiles sideways; the bot stays near the shaft
- **pacing** (`tests/pacing.test.ts`): the pot multiplier stays under x8 for any chain and pot growth; shard, burst and gold stacks have diminishing returns; shards grow with the square root of the rock; a mid build's hits to break plain rock never fall with depth (drill and shards); every drill break is a chain link with a tapered refuel and extra chain time; every tenth drill break throws a glass volley along the drill; a standing chain cools off three times faster and stops clearing tiles; shards that break tiles far from the Wick throw no more shards; shard-break fuel never exceeds 2 per second
- **shards and board clears** (`tests/shards.test.ts`, `tests/shardmix.test.ts`): 11 types with sprites, Codex text, distinct colours, a hint line and a voice; embers and cinnabar are shard sources; one +shard upgrade raises every source; a bare vs a shard-built Shard Bomb; nothing deals damage except the drill, shards and landings; Vein Rupture, pierce, split, ember sparks, the capped void turn; caps; every layer keeps a shard source in every 32 x 8 block (no World nodes); the floor only replaces plain rock; glass in every layer and faultstone from the Amberstone down; every shard type is reachable in regular play; Surge (one charge, 75 links, persists across a chain ending, fires along the drill, its breaks do not re-arm it, throw no shards); Prism Nova (ore only, one per prism shard, needs a chain of 50); the Cataclysm warning ring
- **boons** (`tests/boons.test.ts`): the passive lantern boons and the drone are gone; Kindled Links is the only chain-link fuel boon and stacks additively; Shardlight (tapered, capped at 2 fuel/s); Overburn (twice the burn, drill and shard damage for 30 s, then over); Lantern Nova (once, below 25%); Glass Harvest; **Echo Chain: exactly one echo, never an echo of an echo** (checked by mutation: without the guards the test fails)
- **toasts** (`tests/toasts.test.ts`): one at a time, in arrival order across achievements, shard lines and milestones; three or more achievements batch into one; the corner sits above the level bar and clear of the currency row; an achievement is never awarded or toasted twice
- **lantern** (`tests/lantern.test.ts`): the depth curve; refuel tapers with depth and chain length; the stall drain; a first dig holding "down" passes 100 m
- **playstyles** (`tests/playstyles.test.ts`): each world stat raises its feature over 200 chunks; rich ground is rare; ground already generated never changes; a shard build out-mines the same drill without shards; drill power has diminishing returns
- every upgrade node reachable, boon hands, the player never ends up inside rock, a rune ribbon breaks with the starter drill, chain pot payouts, relic perks, the Heart ending the game
- saves (`tests/save.test.ts`): round-trip, corruption recovery, field-by-field shape validation, backup restore, **an older save is discarded for a fresh one (settings kept)**; banking (layer milestones bank once and stay claimed), the Codex percentage over 57 entries, achievements never revoked, Deep Pressure unlocks

## Balance (round 2: natural progression)
Bot playthroughs, every dig from the surface; the bot is greedy and simple, so these are a rough stand-in for a person. **Mean over 8 world seeds** (single runs vary by about 30%):

| Milestone | Target | Balanced | Shardstorm (`shard`) | Driller (`drill`) |
|---|---|---|---|---|
| 120 m | 5–10 min | 7 | 11 | 8 |
| 300 m | 12–25 | 16 | 28 | 15 |
| 520 m | 25–40 | 29 | 33 | 32 |
| 760 m | 45–65 | 51 | 51 | 52 |
| 1050 m | 70–100 | 75 | 102 | 81 |
| **World's Heart** | **150–180** | **166** | **170** | **163** |

Before the round (balanced, one run): 300 m at 31 min, 520 m at 36, 760 m at 74, 1050 m at 89, Heart at 147 min; shard 94 and drill 122. It was slow because of the seals (a bot waited at each until its drill was strong enough) and then ran away in the deep (pot x20, 1.3 billion gold). The pace now comes from a smooth ramp: the sim measures how long the *first pass* through every 100 m band takes, and no band is crossed more than 5x faster than the one before it in 23 of 24 runs (typically under 3x; the worst was 5.9x in one Shardstorm seed).

The other bots reach the Heart too: Surveyor 176 min, Trickster 203, Lanternkeeper 229, Prospector 223, Chainlord 261 (4 seeds each). Chainlord is slowest because the pot now caps at x8, so a pot-only investment no longer snowballs.

**Shards break 89–97% of tiles in every build** (drill-heavy 89–91%), far above the 50% target. No build ever reaches one-hit drill mining before the Heart (hits to break plain rock with the drill: 2 at 100 m, 7–14 at 500 m, 20–40 at the Heart for the balanced and drill builds; one shard needs 1, 2–3 and 3–5 hits at the same depths). A single shard does break soft shallow rock in one hit (at 100 m, 1 hit); from 500 m on, never.

**What changed to get here** (dials in `src/data/balance.ts`, curves in `src/core/rock.ts`):
- Rock hardness follows one smooth curve (2 HP at the surface, 1,100 at the Heart, +1.5 per metre below); ore keeps its toughness relative to its own layer's rock (clamped to 0.35–1.6x), so quartz in the deep is no longer free.
- The pot multiplier tapers to under x8; shard damage, shards per burst, burst size and gold go through `k ln(1 + x/k)`; shards scale with the square root of the rock, not linearly.
- Chains cool off when the Wick stands still; shards break and throw only near the Wick; fuel from shard breaks has one budget (2/s).
- Prices x12 (`TIER_MUL` 1 / 1 / 1 / 1.3 / 2.5 / 6, drill nodes much cheaper); gold flattened with depth; rock x1.3.
- Midas Touch nerfed (gold x7 in the mid-game test): chance 2.5%, and its nuggets flatten with depth like all gold.

**Boon worth** (`npm run sim:boons`, one mid-game build, all stacks, eight seeds, other hands skipped; ratios against no boon): money boons give +20–35% gold (Pot Luck 1.34, Gilded 1.32, Lucky Strike 1.20), shard boons +10–20% depth (Piercing 1.16, Keen 1.13), Kindled Links +16% depth and +24% length, Shardlight +9% depth and +18% length, Lantern Nova +9% length, Midas Touch +36% gold, Prism Heart (mythic) x1.4 depth and x2.4 tiles. Caveat: **Overburn and Echo Chain do not show up in this test** (about x1.0): the bot has a continuous chain so Echo Chain rarely fires, and it takes Overburn in the first 30 s, when rock is soft and the drill speed-up is wasted. They are timing-and-position boons; the tests check that they do what they say, but a human playtest is the real balance check.

### Known limitations
- **No human playtests of round 2 yet.** The pacing numbers are bot numbers. A short round on the first hour (the Surge, the new boons, the Workshop affordability and toasts) is strongly recommended.
- **Early shard sources are one-hit.** At 100 m a shard still breaks soft plain rock in one hit. Past 500 m it never does.
- **Board clears fire often for the bot** (a Surge about every 20-30 s of continuous drilling). "Rare" is relative to its chains; if a human playtest finds it too frequent, raise `SURGE_LINKS` (75).
- **Frame rate in the software renderer:** a dig at depth runs at 5-8 fps in headless SwiftShader, the same as before the round (checked side by side); a real GPU should be far faster, but this still needs checking on a Steam Deck.
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
- [ ] Break into each rune ribbon: it throws rune shards and gold, and you can also walk through its gaps
- [ ] Cross a layer boundary: the ground changes gradually over about 50 m, with no single-row cut; the first time ever, a milestone toast and +5 max fuel
- [ ] Stand still mid-chain: the chain dies in about half a second and nothing keeps clearing
- [ ] Reach a chain of 75: SURGE! appears; the next drill break clears a line of tiles
- [ ] Unlock three or more achievements at once: one toast, bottom-left, nothing covering gold or the level bar
- [ ] Workshop: nodes you cannot afford are grey and say how much more you need
- [ ] Pick Overburn, Lantern Nova, Echo Chain: the boon bar shows them with tooltips- [ ] Dig 300+ tiles left and right: new ground keeps generating, the HUD points home, the ribbons are still there
- [ ] Throw a bare Shard Bomb, then one with a shard build: the second clearly erupts
- [ ] Crack a geode, find a relic (perk applies at once), see a NEW ORE card
- [ ] Credits play once after the World's Heart; Deep Pressure 1 unlocks
- [ ] Load an old (v5 or earlier) save: it is discarded for a fresh one, your settings survive
- [ ] All 37 achievements are reachable (see `src/systems/achievements.ts`)
- [ ] 100+ chain cascades stay smooth on a low-end GPU / Steam Deck
