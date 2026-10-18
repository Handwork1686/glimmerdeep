# GLIMMERDEEP — Game Design Document

> *The Great Lantern of Hearthmoor is going dark. Its light came from the Heart of the world. Dig down and bring it back.*

**Genre:** peaceful incremental mining game · shard chain reactions · 2D side-view pixel art, open world
**Platforms:** Steam (Windows / Linux / Steam Deck / macOS)
**Session:** 2–7 min digs · **Credits:** about 2.5 h for a balanced build · **Then:** endless depths, Deep Pressure, Codex completion

## 1. Pillars
1. **Shards are the fun.** Everything good underground is a shard source: crystals, embers, cinnabar, geodes, veins, even plain rock on a fault line. Hit them, chain them, blow them up. Plain rock is the slow part; shards are the fast part.
2. **Every swing pays.** Every dig, however short, makes you permanently stronger. Nothing is ever lost: loot is banked when the lantern dims.
3. **Feel your power grow.** Every dig starts at the surface. Seals you have broken stay broken, so the upper layers become something you tear through on the way to your frontier.
4. **The world is open.** Mine as far left or right as you like, and down as far as it goes. You can even upgrade the world, so new ground holds more of what you love.
5. **Every branch is a way to play.** Drill, shards, chains, lantern, fortune, boons, the world: each one can carry you to the Heart.
6. **Peaceful.** Nothing in the deep can hurt you. The only clock is your lantern.

## 2. Core loops
| Loop | Length | Beats |
|---|---|---|
| Moment | 1–3 s | drill a shard source → it bursts → shards break rock and more sources → a chain catches |
| Dig | 2–7 min | start at Hearthmoor → tear down through conquered layers → chain shards at the frontier → level-up boon picks → the lantern dims → Ottilie's winch reels you home → results |
| Meta | 5–15 min | spend Gold / Gems / Cores in the Workshop → more power, more shards, a richer world → break the next Strata Seal |
| Endgame | hours | endless depths below the Heart, Deep Pressure 1–10, the Codex, infinite Refine upgrades |

## 3. Controls
| Action | Keyboard | Gamepad |
|---|---|---|
| Move / drill (into tile) | WASD / Arrows | Left stick / D-pad |
| Thrust (fly up) | W / Up / Space (hold) | Stick up / A (hold) |
| **Shard Bomb** | E / Shift | X / RB |
| Dynamite (Cinnabar Charges) | Q | Y / LB |
| Pause | Esc / P | Start |
All rebindable. In a level-up hand the Shard Bomb key banishes a card.

## 4. The Wick (player)
- A lantern-pod with treads and a front drill. Gravity applies; thrust pushes upward.
- **Drilling:** hold a direction into a solid tile; the drill bites at *Drill Rate* for *Drill Power* damage. Heat, Plow, Auger, Wide Bit and Excavator work as before.
- **Pickups** always fly home on their own: anything within 30 px at once, everything after 2.5 s. There is no magnet stat.
- **Lantern fuel** (start 60) burns at a rate that climbs with depth (section 6).

## 5. Shards (the core system)
**One funnel.** Every shard in the game is thrown by `Sim.spawnShards`: crystals breaking, embers, cinnabar, geode vaults, Vein Rupture, Fault Lines, Cataclysm, seal waves, dynamite, the Heart and the Shard Bomb. There is no other way to deal area damage: rock breaks only to the drill, shards, drones and seismic landings.

**One upgrade path.** Every shard type reads the same global stats, so one upgrade improves them all:

| Stat | What it does | Sources |
|---|---|---|
| Shards per burst | +N shards on every burst | Brittle Crystal, Splinters, Spiral Horn |
| Shard damage | x damage for all shards | Keen / Razor Shards, Keen Shards boon, Crystal Bell, Refine the Bit |
| Shard speed | faster and farther | Gyro Shards |
| Pierce | tiles a shard breaks through | Piercing Glass boon |
| Split | chance to split in two on impact | Splitter, Prism Heart |
| Burst size | +% shards from burst sources | Shrapnel (node and boon) |
| Ricochet | bounces off what it can't break | Ricochet |

Damage = source power x (shard damage / 6) x type multiplier x (1 + depth / 250). Caps: 28 shards per burst and 450 in flight; past a cap the extra count becomes damage on the shards that do fly. Cascades burn out: tiles broken by shards throw fewer shards once a chain passes ~300 links, and none after 8 generations.

**Eleven types**, each with its own silhouette, behaviour and Codex entry (`src/data/shards.ts`):

| Type | Behaviour | Source | Per-type upgrade |
|---|---|---|---|
| Glass | fast, light, flies far | quartz, Shard Bomb, ember sparks | — |
| Crystal | breaks through one tile and keeps going | glimmer, opal, moonstone | — |
| Ember | blows apart into 2+ glass sparks on impact | embers, fire opal | Ember Shards, Volatile, Salamander Scale |
| Cinnabar | heavy, slow, x1.6 damage: the hard-rock ram | cinnabar, dynamite | Cinnabar Shards |
| Geode | a mixed volley with the vault's own crystal | geode vaults | Geode Sense (more vaults) |
| Vein | the whole vein bursts from the inside | Vein Rupture | Vein Shards (trigger chance) |
| Fault | plain rock cracks open | Fault Lines | Fault Shards, Hairline Cracks |
| Cataclysm | the chain itself erupts every 20 links | Cataclysm capstone | Cataclysm |
| Void | curves gently toward ore and crystal (capped turn) | voidglass, aether | — |
| Prism | splits in two on its first impact | prism, heartstone, the Heart | — |
| Rune | thrown by a breaking seal; can't touch seals | seal waves | — |

**The Shard Bomb** replaces the Flare: same keys, a 10 s recharge (Cataclysm takes 3 s off), and a ring of 8 + 2 x Shards-per-burst glass shards carrying every shard upgrade. It has no upgrades of its own: a bare bomb is a modest pop, a shard-built bomb clears the screen. **Supernova** (mythic): any burst of 6+ shatters every crystal within 2 tiles, in a ripple.

## 6. The lantern
- **Depth drain:** fuel burns at `1 + (depth / 520)^1.35` per second (x1.04 at 50 m, x1.14 at 120 m, x2 at 520 m, x3.6 at 1050 m, x5 at the Heart), times Deep Pressure and the player's drain reductions (which together can never go below x0.4).
- **Stall drain:** drilling with nothing breaking and no chain alive for 2.5 s ramps the drain up to x1.5. "If you can't break it, the lantern won't wait."
- **Refuel tapers with depth:** chain links (also tapering with chain length), lamp moss and amber, Resonance and Kindling all pay `1 / (1 + depth / 700)` of their value. Chains still extend a dig, but never make fuel endless.
- The HUD shows the live burn rate beside the fuel bar, flashes STALLED, and each biome card says how hard the lantern burns there. Second Wind, Darkness Assist and game speed stay. The lantern never kills: it ends the dig and banks everything.

## 7. The open world
- **Semi-procedural.** The structure is designed (seven layers by depth, seal depths, the Heart at 1500 m, endless scaling below); the layout is generated in 32x32 chunks as you reach them.
- **Unbounded sideways, endless downward.** No side walls, no floor. Depth rules (biome, drain, ores, seals) depend on depth only, so 600 m is Emberdeep wherever you are.
- **Deterministic.** A chunk depends only on the dig's seed, its position and the prospecting stats when it is generated, never on generation order. Veins and geodes belong to an origin chunk and are replayed by neighbours, so borders are seamless.
- **Fresh world each dig.** Every dig has a new seed. What persists: broken seals, found relics, upgrades, the Codex. Nothing is saved tile by tile.
- **Seals** run under every column, so they can't be bypassed sideways. A seal yields only to the drill you built (Workshop and relics; this dig's boons don't count). Once broken it stays broken on every later dig.
- **The Heart** sits once, under the shaft at x = 0. Far from the shaft the HUD points home, and below 1400 m it points to the Heart.
- **Relics:** one hash-sited spot per unfound relic each dig (24 in all, never re-buried). Relic Sense pulls them nearer the shaft. Once a layer's relics are all found, its ground hides small gem caches instead.

### Layers and seals
| # | Name | Depth (m) | Ores | Seal below | Drill power |
|---|---|---|---|---|---|
| 1 | Rootsoil | 0–120 | copper, tin, quartz | — | — |
| 2 | Amberstone | 120–300 | silver, amber, jade, fossil, quartz | The Amber Seal (300) | 10 |
| 3 | Glimmer Grotto | 300–520 | gold, glimmer, opal, sapphire | The Glimmer Seal (520) | 22 |
| 4 | Emberdeep | 520–760 | fire opal, ruby, emerald, embers | The Ember Seal (760) | 40 |
| 5 | The Hollow | 760–1050 | starmetal, voidglass, aether, prism | The Hollow Seal (1050) | 90 |
| 6 | The Mantle | 1050–1500 | mithril, moonstone, cinnabar, heartstone | The Mantle Seal (1494) | 150 |
| 7 | The World's Heart | 1500+ | everything rare; endless below | — | — |

## 8. Chains and the pot
- Every cascade break (shard, wave) and every drilled valuable adds a link. The chain timer (1.2 s, extended by Long Fuse and friends) holds while the drill chews something valuable.
- The pot collects every coin mined during the chain and pays out x `1 + growth x sqrt(links)` when it ends; past 1,500 links the multiplier only grows slowly (logarithmically).

## 9. The Workshop: seven playstyles
78 nodes on seven spokes around the Lantern, plus five infinite Refine nodes between them. Every branch has an early build-defining node, an engine (gold or survival), and a synergy with another branch. The first node of each branch shows its playstyle hint.

| Branch | Playstyle | Early node | Engine | Synergy / capstone |
|---|---|---|---|---|
| Drill | Driller: raw power | Tempered Bit | Gearing, Overclock | Excavator; power costs climb steeply past each seal |
| Shatter | Shardstorm: shards break tiles for you | Brittle Crystal (+shards on every burst) | Keen / Razor Shards | Cataclysm (chain erupts, faster Shard Bomb) |
| Rig | Speed, heat and shard flight; keeps chains alive | Treads, Gyro Shards | Long Fuse, Deeper Pot | Splitter (shards split), Juggernaut Plow |
| Lantern | Lanternkeeper: stay down longer | Wick Oil | Reserve Tank (ore worth more per 100 max fuel), Kindling, Fuel Recycler | Last Light (+20% fuel, half drain when low) |
| Fortune | Prospector: earn more per tile | Appraisal (+15% gold) | Lucky Strike, Gem Sense, Deep Pockets | Midas Lamp (pots pay gems) |
| Arcana | Trickster: more and better boons | Fortune's Draw (free reroll each dig) | Lucky Stars (ore worth more per boon held), Boon Echo, Shrapnel | Astral Lantern (+1 boon choice, a reroll, fuel on level-up) |
| World | Surveyor: make the ground richer | Shard Veins | Rich Veins, Geode Sense, Fuel Flora | Lucky Ground (rich ground chance) |

**World upgrades** change only *newly generated* ground: Shard Veins (+15% shard sources), Geode Sense (+20% vaults), Open Caverns (+12% caves), Fuel Flora (+25% moss and amber), Rich Veins (+12% ore, +18% gem ore), Relic Sense (relics nearer, longer pointer, more caches), Surveyor (brighter glow, relic pointer), Lucky Ground (+5% rich ground per level, capped at 15%: twice the shard sources, geodes and ore, a warm glow and a tip). Every chance that feeds generation is capped at 90%.

**Refine** nodes repeat forever, one per playstyle: the Bit (drill power and shard damage), the Wick (fuel), the Purse (gold), the Pot (chain pot), the Eye (double ore and luck).

## 10. Boons and relics
30 run-only boons (Common / Rare / Mythic); each playstyle has at least one: Splinters, Shrapnel, Piercing Glass (shards); Pot Luck, Long Fuse (chains); Steady Wick, Oil Flask, Kindling (lantern; Kindling now boosts chain refuel); Gilded, Deep Pockets (fortune); Dowsing Rod (world: this dig's new ground holds more shard sources and geodes). Overcharge stacks to 3.
24 relics, four per layer above the Heart. Re-themed for the rework: Tin Miniature (+4% gold), Salamander Scale (ember shards +1 spark), Cartographer's Case (+1 Relic Sense).

## 11. The goal: the World's Heart
Below the Mantle Seal lies a great cavern under the shaft; at its centre, a 2x2 mass of blazing crystal. Breaking it refills the lantern, bursts into prism shards, scatters cores, plays the ending the first time, and opens Deep Pressure.

## 12. Endgame
Endless depths below the Heart (rock HP and ore value rise by 1/300 per metre), Deep Pressure tiers 1–10 (reach the Heart at your highest tier to open the next), the Codex (22 ores + 11 shard types + 24 relics = 57 entries), and the Refine nodes.

## 13. UI / Screens
Boot → Title → Camp (Workshop web, Pressure, Codex) → Dig (HUD) → Level-up hand → Results → Camp. Plus Settings, Pause, Achievements, Credits, Ending.
HUD: fuel bar with live burn rate and STALLED warning, Shard Bomb recharge, dynamite count; depth, layer, gold / gems / cores; chain counter with live pot; streak banners; relic pointer; home / Heart pointer; XP bar; NEW ORE and NEW SHARD cards.

## 14. Accessibility
Full rebinding · gamepad · screen-shake slider · flash reduction · darkness assist · colour-independent ore and shard shapes · game speed 70/85/100% · pause anywhere · nothing in the game can hurt you.

## 15. Onboarding
One-time tips (`src/data/strings.ts`): moving and drilling, thrust, first ore, first chain, what shards are, the Shard Bomb, low fuel, stalling, first seal, broken seals staying broken, wandering far from the shaft, rich ground, first geode, first relic, boulders, first level-up, first Workshop visit.

## 16. Audio direction
Warm lo-fi chiptune and mellow pads, one track and ambience bed per layer, an intensity stem that rises with the live chain. SFX: crunchy drill bites; glassy shatters whose pitch climbs through a chain; the Shard Bomb (a soft thump into a spray of tiny shatters); ember-shard pops; coin cascades for pots; a deep crack for seals; a music-box phrase for relics.

## 17. Balance targets (tuned with `npm run sim -- 400 --build=<playstyle>`)
| Milestone | Target | Balanced bot |
|---|---|---|
| First dig (holding down) | about 100 m | 107–124 m |
| Amber Seal (300 m) | 20–35 min | 28 min |
| Glimmer Seal (520 m) | 40–55 min | 38 min |
| Ember Seal (760 m) | 70–95 min | 78 min |
| Hollow Seal (1050 m) | 100–125 min | 94 min |
| World's Heart (credits) | 140–190 min | 147 min |

Every playstyle bot reaches the Heart; see `docs/QA.md` for the per-build band.

## 18. Narrative (light touch)
Hearthmoor lives by the light of its Great Lantern, carried up from the Heart of the world long ago and running out. You pilot the Wick, a lantern-pod built by the old lampwright Ottilie, whose winch reels you home at the end of every dig. There is no villain: only the deep, its shards and treasures, and the long way down.
