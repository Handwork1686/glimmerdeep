# GLIMMERDEEP — Game Design Document

> *The Great Lantern of Hearthmoor is going dark. Its light came from the Heart of the world. Dig down and bring it back.*

**Genre:** peaceful incremental mining game · shard chain reactions · 2D side-view pixel art, open world
**Platforms:** Steam (Windows / Linux / Steam Deck / macOS)
**Session:** 2–7 min digs · **Credits:** about 2.5–3 h for a balanced build · **Then:** endless depths, Deep Pressure, Codex completion

## 1. Pillars
1. **Shards are the fun.** Everything good underground is a shard source: crystals, embers, cinnabar, geodes, veins, even plain rock on a fault line. Hit them, chain them, blow them up. Plain rock is the slow part; shards are the fast part.
2. **Every swing pays.** Every dig, however short, makes you permanently stronger. Nothing is ever lost: loot is banked when the lantern dims.
3. **Feel your power grow, never fall off a cliff.** Every dig starts at the surface. Nothing is a wall: the layers melt into each other, rock gets harder along one smooth curve, and how far you get is decided by your lantern, your drill and your shards. Power comes as a long ramp, not a staircase.
4. **The world is open.** Mine as far left or right as you like, and down as far as it goes. You can even upgrade the world, so new ground holds more of what you love.
5. **Every branch is a way to play.** Drill, shards, chains, lantern, fortune, boons, the world: each one can carry you to the Heart.
6. **Peaceful, and you play it.** Nothing in the deep can hurt you; the only clock is your lantern. And the game never plays itself: chains cool off when you stand still, and shards only chain around you.

## 2. Core loops
| Loop | Length | Beats |
|---|---|---|
| Moment | 1–3 s | drill a shard source → it bursts → shards break rock and more sources → a chain catches |
| Dig | 2–7 min | start at Hearthmoor → tear down through conquered layers → chain shards at the frontier → level-up boon picks → the lantern dims → Ottilie's winch reels you home → results |
| Meta | 5–15 min | spend Gold / Gems / Cores in the Workshop → more power, more shards, a richer world → dig deeper |
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
**One funnel.** Every shard in the game is thrown by `Sim.spawnShards`: crystals breaking, embers, cinnabar, geode vaults, Vein Rupture, Fault Lines, Cataclysm, rune ribbons, dynamite, the Heart and the Shard Bomb. There is no other way to deal area damage: rock breaks only to the drill, shards and seismic landings (and board clears, which are shards' big cousins).

**One upgrade path.** Every shard type reads the same global stats, so one upgrade improves them all:

| Stat | What it does | Sources |
|---|---|---|
| Shards per burst | +N shards on every burst | Brittle Crystal, Splinters, Spiral Horn |
| Shard damage | x damage for all shards | Keen / Razor Shards, Keen Shards boon, Crystal Bell, Refine the Bit |
| Shard speed | faster and farther | Gyro Shards |
| Pierce | tiles a shard breaks through | Piercing Glass boon |
| Drill shards | the drill throws a glass volley every N breaks | Gearing (sooner), Pulverizer (+1), Glass Harvest |
| Split | chance to split in two on impact | Splitter, Prism Heart |
| Burst size | +% shards from burst sources | Shrapnel (node and boon) |
| Ricochet | bounces off what it can't break | Ricochet |

Damage = source power x (shard damage / 6) x type multiplier x depth scale, where depth scale = sqrt(rockHp(depth) / rockHp(0)) (about 23x at the Heart): shards keep up with the rock but slowly fall behind, so deep plain rock always takes more than one hit. **Every stack tapers**: shard damage, shards per burst, burst size and gold go through a diminishing-returns curve `dr(x, k) = k ln(1 + x / k)` after all sources are added, so no node doubles output. Caps: 28 shards per burst and 300 in flight; past a cap the extra count becomes damage on the shards that do fly. Cascades burn out: tiles broken by shards throw fewer shards once a chain passes ~300 links, none after 8 generations, and **none at all when the tile is more than 12 tiles from the Wick**: shards chain around you, not across the map.

**Eleven types**, each with its own silhouette, behaviour and Codex entry (`src/data/shards.ts`):

| Type | Behaviour | Source | Per-type upgrade |
|---|---|---|---|
| Glass | fast, light, flies far | quartz, Shard Bomb, ember sparks | — |
| Crystal | breaks through one tile and keeps going (a blue line) | glimmer, opal, moonstone | — |
| Ember | blows apart into 2+ glass sparks on impact | embers, fire opal | Ember Shards, Volatile, Salamander Scale |
| Cinnabar | heavy, slow, x1.6 damage: the hard-rock ram | cinnabar, dynamite | Cinnabar Shards |
| Geode | a mixed volley with the vault's own crystal | geode vaults | Geode Sense (more vaults) |
| Vein | the whole vein bursts from the inside | Vein Rupture (5% base on every ore) | Vein Shards (trigger chance) |
| Fault | plain rock cracks open | faultstone, Fault Lines | Fault Shards, Hairline Cracks |
| Cataclysm | the chain itself erupts, after a warning ring | every 100 links for everyone, every 30 with the capstone | Cataclysm |
| Void | curves gently toward ore and crystal (capped turn) | voidglass, aether | — |
| Prism | splits in two on its first impact | prism, heartstone, the Heart | — |
| Rune | thrown by a broken rune ribbon | rune ribbons | — |

**Readable at a glance.** Every type has its own silhouette, colour (no two alike), trail and voice: glass is a long white streak, crystal a blue line that stays behind, ember throws orange sparks and pops, cinnabar is big and smokes and thumps, geode glitters, vein flickers amber, fault sheds grit, a Cataclysm shard is huge and gold, void wobbles purple, prism cycles through colours, rune turns teal. The first time a type flies, a one-line toast says what it does; the Codex says it again on hover.

**Board clears** (rare, chain-gated, aimed by where you are, never chaining each other). Tiles a clear breaks pay out and link the chain, but throw no shards of their own and never count toward the next Surge.
| Clear | Trigger | Effect |
|---|---|---|
| **Surge** (line clear) | 75 fresh links arm one charge (SURGE! cue, flash, sound); only one charge at a time; it waits until used and is lost only when the dig ends | the next drill break clears up to 20 tiles in a straight line the way the drill points |
| **Prism Nova** (colour clear) | a prism shard's first hit while the chain is 50 or longer; one per prism shard | shatters every tile of the most common *ore* within 5 tiles (never plain rock, relics, rune ribbons or the Heart) |
| **Cataclysm** (area clear) | every 100 links (30 with the capstone) | a ring closes in on the Wick, then a storm of shards erupts |

**The Shard Bomb** replaces the Flare: same keys, a 10 s recharge (Cataclysm takes 3 s off), and a ring of 8 + 2 x Shards-per-burst glass shards carrying every shard upgrade. It has no upgrades of its own: a bare bomb is a modest pop, a shard-built bomb clears the screen. **Supernova** (mythic): any burst of 6+ shatters every crystal within 2 tiles, in a ripple.

## 6. The lantern
- **Depth drain:** fuel burns at `1 + (depth / 520)^1.35` per second (x1.04 at 50 m, x1.14 at 120 m, x2 at 520 m, x3.6 at 1050 m, x5 at the Heart), times Deep Pressure and the player's drain reductions (which together can never go below x0.4).
- **Throughput drain:** drill breaks in the last 3 s add 1.5% each per second to the burn (capped at x1.4); shard breaks never count, so a shard chain is not punished.
- **Stall drain:** drilling with nothing breaking and no chain alive for 2.5 s ramps the drain up to x1.5. "If you can't break it, the lantern won't wait."
- **Refuel tapers with depth:** chain links (also tapering with chain length), lamp moss and amber, Resonance, the Kindling node, Fuel Recycler, Shardlight and the Lantern Nova all pay `deepTaper(depth) = 1 / (1 + depth / 700)` of their value. Fuel from shard breaks (Fuel Recycler, Shardlight) shares one budget of 2 fuel per second. Chains still extend a dig, but never make fuel endless.
- **Layer milestones:** the first time you ever reach a layer, a card, a burst of shards and +5 max fuel for good.
- The HUD shows the live burn rate beside the fuel bar, flashes STALLED, and each biome card says how hard the lantern burns there. Second Wind, Darkness Assist and game speed stay. The lantern never kills: it ends the dig and banks everything.

## 7. The open world
- **Semi-procedural.** The structure is designed (seven layers by depth, the rune ribbon depths, the Heart at 1500 m, endless scaling below); the layout is generated in 32x32 chunks as you reach them.
- **Unbounded sideways, endless downward.** No side walls, no floor. Depth rules (layer, drain, ores, rock hardness) depend on depth only, so 600 m is Emberdeep wherever you are.
- **Deterministic.** A chunk depends only on the dig's seed, its position and the prospecting stats when it is generated, never on generation order. Veins and geodes belong to an origin chunk and are replayed by neighbours, so borders are seamless.
- **Fresh world each dig.** Every dig has a new seed. What persists: claimed layer milestones, found relics, upgrades, the Codex. Nothing is saved tile by tile.
- **Rune ribbons** replace the old seals: at each old seal depth, a 2-row ribbon of breakable rune stone runs under every column, with a gap of 1–2 tiles every 4–7 tiles. They are rich in rune shards and gold, tougher than the rock around them, and optional: mine through, around, or let a shard do it. Nothing in the game is a wall: there is no tile that needs a certain drill power, ever.
- **Gradient layers.** Layers blend over a 50 m band centred on each boundary: tiles, ores and shard sources mix from the outgoing layer into the incoming one with a smooth-step probability. The Workshop says "blending in around 275–325 m", never "at 300 m".
- **Rock hardness is one smooth curve** (`rockHp(depth)`: 2 at the surface, 18 at 150 m, 55 at 400 m, 110 at 640 m, 450 at 900 m, 800 at 1270 m, 1100 at the Heart, then +1.5 per metre forever). Plain rock averages that curve; ore keeps its toughness relative to the rock of its own layer.
- **The Heart** sits once, under the shaft at x = 0. Far from the shaft the HUD points home, and below 1400 m it points to the Heart.
- **Relics:** one hash-sited spot per unfound relic each dig (24 in all, never re-buried). Relic Sense pulls them nearer the shaft. Once a layer's relics are all found, its ground hides small gem caches instead.

### Layers and ribbons
| # | Name | Depth (m) | Ores | Shard sources | Ribbon |
|---|---|---|---|---|---|
| 1 | Rootsoil | 0–120 | copper, tin, quartz | quartz, a few soft embers | — |
| 2 | Amberstone | 120–300 | silver, amber, jade, fossil | quartz, embers, faultstone, geodes | 300 |
| 3 | Glimmer Grotto | 300–520 | gold, glimmer, opal, sapphire | quartz, glimmer, opal, faultstone, geodes | 520 |
| 4 | Emberdeep | 520–760 | fire opal, ruby, emerald | quartz, embers, fire opal, cinnabar, faultstone | 760 |
| 5 | The Hollow | 760–1050 | starmetal, voidglass, aether, prism | quartz, voidglass, aether, prism, faultstone, geodes | 1050 |
| 6 | The Mantle | 1050–1500 | mithril, moonstone, cinnabar, heartstone | quartz, moonstone, cinnabar, heartstone, faultstone | 1494 |
| 7 | The World's Heart | 1500+ | everything rare; endless below | everything, faultstone scarcer | — |

Every layer has quartz (glass), and faultstone from the Amberstone down. A **density floor** guarantees at least one shard source in every 32 x 8 block of every layer, with no World nodes bought; it only ever replaces plain rock (never ore, relics, ribbons, geodes, air or the Heart chamber). World nodes make rich ground richer; they never rescue a starved layer.

## 8. Chains and the pot
- Every cascade break (shard, wave, clear), every drilled valuable and **every drill break** adds a link: the drill keeps the combo going. Each drill break also buys 0.25 s of chain time (capped at twice the window; Chain Keeper adds more), and every tenth drill break throws a cone of glass shards the way the drill points (or toward ore just ahead).
- **The chain needs you.** Standing still, a chain cools off three times faster (and a link made while idle only buys a third of the window). It holds while the drill chews something valuable.
- The pot collects every coin mined during the chain and pays out x `1 + 7 (1 - e^-(raw - 1) / 7)` where `raw = 1 + g sqrt(min(n, 500)) + 4 g ln(max(1, n / 500))` (g is the pot growth stat): full value to about 500 links, then a slow climb that can never reach x8.
- Gold per ore also flattens with depth against the price ladder (`BALANCE.goldFlat`), so deep ground does not out-earn what the Workshop charges.

## 9. The Workshop: seven playstyles
78 nodes on seven spokes around the Lantern, plus five infinite Refine nodes between them. Every branch has an early build-defining node, an engine (gold or survival), and a synergy with another branch. The first node of each branch shows its playstyle hint.

| Branch | Playstyle | Early node | Engine | Synergy / capstone |
|---|---|---|---|---|
| Drill | Driller: raw power, and every break keeps the chain alive | Tempered Bit | Gearing, Overclock | Excavator; every drill node also feeds the chain (more drill shards, shards that hit ore harder) |
| Shatter | Shardstorm: shards break tiles for you | Brittle Crystal (+shards on every burst) | Keen / Razor Shards | Cataclysm (chain erupts, faster Shard Bomb) |
| Rig | Speed, heat and shard flight; keeps chains alive | Treads, Gyro Shards | Long Fuse, Deeper Pot | Splitter (shards split), Juggernaut Plow |
| Lantern | Lanternkeeper: stay down longer | Wick Oil | Reserve Tank (ore worth more per 100 max fuel), Kindling, Fuel Recycler (also fuel per shard break) | Last Light (+20% fuel, half drain when low) |
| Fortune | Prospector: earn more per tile | Appraisal (+15% gold, +1% shard damage) | Lucky Strike, Gem Sense, Deep Pockets | Midas Lamp (pots pay gems and throw shards) |
| Arcana | Trickster: more and better boons | Fortune's Draw (free reroll each dig) | Lucky Stars (ore worth more per boon held), Boon Echo, Shrapnel, Chain Keeper (replaces the drone) | Astral Lantern (+1 boon choice, a reroll, fuel on level-up) |
| World | Surveyor: make the ground richer | Shard Veins | Rich Veins, Geode Sense, Fuel Flora | Lucky Ground (rich ground chance) |

**World upgrades** change only *newly generated* ground: Shard Veins (+15% shard sources), Geode Sense (+20% vaults), Open Caverns (+12% caves), Fuel Flora (+25% moss and amber), Rich Veins (+12% ore, +18% gem ore), Relic Sense (relics nearer, longer pointer, more caches), Surveyor (brighter glow, relic pointer), Lucky Ground (+5% rich ground per level, capped at 15%: twice the shard sources, geodes and ore, a warm glow and a tip). Every chance that feeds generation is capped at 90%.

**Prices:** drill nodes are cheap and flat (Tempered Bit 10 x 1.25 per level, Diamond Edge 120 x 1.3, Starmetal Bit 2,500 x 1.35, Refine the Bit 20,000 x 1.22), the outer rings cost x1.3 / x2.5 / x6 (`TIER_MUL`), and the global price scale is `ECON` 12. Pace comes from smooth scaling, not from price walls. There is no drone: it is gone entirely.

**Refine** nodes repeat forever, one per playstyle: the Bit (drill power and shard damage), the Wick (fuel), the Purse (gold), the Pot (chain pot), the Eye (double ore and luck).

## 10. Boons and relics
Run-only boons (Common / Rare / Mythic), shown in a Nuclear Throne-style **boon bar** at the top right (also in Pause and Results): one icon per boon in pick order, a x2 / x3 badge for stacks, hover or tap for the effect and what is left of a timed one. Every playstyle has some: Splinters, Shrapnel, Piercing Glass (shards); Pot Luck, Long Fuse (chains); Gilded, Deep Pockets (fortune); Dowsing Rod (world).

**The lantern boons are active now** (the passive +vision / -drain / +max fuel boons are gone, because the Workshop already has them):
| Boon | Rarity | Effect |
|---|---|---|
| Kindled Links | common, x3 | chain links refuel 25% more per stack (the only chain-link fuel boon) |
| Shardlight | common, x2 | every 10 shard breaks restore 1 fuel (tapered, inside the 2/s shard-fuel budget) |
| Glass Harvest | common, x3 | drill breaks have an 8% chance per stack to throw 2 extra glass shards |
| Overburn | rare | 30 s of twice the burn for twice the shard damage (the bar counts it down) |
| Lantern Nova | rare | once a dig, below 25% fuel: a burst of shards around the Wick and some fuel |
| Echo Chain | rare | a chain of 20+ ends, an echo volley follows a second later; never an echo of an echo |

24 relics, four per layer above the Heart. Re-themed for the rework: Tin Miniature (+4% gold), Salamander Scale (ember shards +1 spark), Cartographer's Case (+1 Relic Sense).

## 11. The goal: the World's Heart
Below the Mantle Ribbon lies a great cavern under the shaft; at its centre, a 2x2 mass of blazing crystal. Breaking it refills the lantern, bursts into prism shards, scatters cores, plays the ending the first time, and opens Deep Pressure.

## 12. Endgame
Endless depths below the Heart (rock HP keeps rising by 1.5 per metre and ore value by 1/300 per metre), Deep Pressure tiers 1–10 (reach the Heart at your highest tier to open the next), the Codex (22 ores + 11 shard types + 24 relics = 57 entries), and the Refine nodes.

## 13. UI / Screens
Boot → Title → Camp (Workshop web, Pressure, Codex) → Dig (HUD) → Level-up hand → Results → Camp. Plus Settings, Pause, Achievements, Credits, Ending.
HUD: fuel bar with live burn rate and STALLED warning, Shard Bomb recharge, dynamite count; depth, layer, gold / gems / cores; the boon bar under them; chain counter with live pot; streak banners; relic pointer; home / Heart pointer; XP bar; NEW ORE cards.
**Toasts** (achievements, NEW SHARD lines, layer milestones) share one queue and show one at a time, about 3 s each, bottom-left above the level bar, so they never cover the currency row, the purchase panel or the chain; click to dismiss; three or more achievements at once become one "N achievements!" toast that opens the list; nothing re-toasts on load.
**Workshop affordability:** nodes you cannot afford grey out and the info panel says "Need 1,200 more gold"; nodes you can afford pulse and show their price in green. Reroll and banish grey out when you have none.

## 14. Accessibility
Full rebinding · gamepad · screen-shake slider · flash reduction · darkness assist · colour-independent ore and shard shapes · game speed 70/85/100% · pause anywhere · nothing in the game can hurt you.

## 15. Onboarding
One-time tips (`src/data/strings.ts`): moving and drilling, thrust, first ore, first chain, what shards are, the Shard Bomb, low fuel, stalling, first rune ribbon, wandering far from the shaft, rich ground, first geode, first relic, boulders, first level-up, first Workshop visit.

## 16. Audio direction
Warm lo-fi chiptune and mellow pads, one track and ambience bed per layer, an intensity stem that rises with the live chain. SFX: crunchy drill bites; glassy shatters whose pitch climbs through a chain; the Shard Bomb (a soft thump into a spray of tiny shatters); ember-shard pops; coin cascades for pots; a crack for rune ribbons; one short, distinct voice per shard type; a music-box phrase for relics.

## 17. Balance targets (tuned with `npm run sim -- 600 --build=<playstyle>`, `npm run sim:boons`)
The pace comes from a few global dials (`src/data/balance.ts`): Workshop prices x12, rock x1.3 on top of the `rockHp` curve, and gold flattened with depth (`gold / (1 + 40 (depth / 600)^2)`), so deep ground pays well without out-earning the price ladder. Mean over 8 world seeds, balanced bot:

| Milestone | Target | Balanced bot |
|---|---|---|
| First dig (holding down) | about 100 m | 100+ m (`tests/lantern.test.ts`) |
| 120 m (Amberstone) | 5–10 min | 7 min |
| 300 m | 12–25 min | 16 min |
| 520 m | 25–40 min | 29 min |
| 760 m | 45–65 min | 51 min |
| 1050 m | 70–100 min | 75 min |
| World's Heart | 150–180 min | 166 min |

Shape rules the sim checks: no band crosses more than 5x faster than the one before it (23 of 24 runs stay under 4x; the worst single run was 5.9x), plain rock never falls to one drill hit before the Heart, and shards break at least half the tiles in every build (89–97%). Every playstyle bot reaches the Heart; see `docs/QA.md`.

## 18. Narrative (light touch)
Hearthmoor lives by the light of its Great Lantern, carried up from the Heart of the world long ago and running out. You pilot the Wick, a lantern-pod built by the old lampwright Ottilie, whose winch reels you home at the end of every dig. There is no villain: only the deep, its shards and treasures, and the long way down.
