# GLIMMERDEEP — Game Design Document

> *The Great Lantern of Hearthmoor is going dark. Its light came from the Heart of the world. Dig down and bring it back.*

**Genre:** peaceful incremental mining game · chain reactions · 2D side-view pixel art
**Platforms:** Steam (Windows / Linux / Steam Deck / macOS)
**Price target:** $5.99 · **Session:** 2–6 min digs · **Credits:** about 2.5–3 h · **Then:** endless depths, Deep Pressure, Codex completion

## 1. Pillars
1. **Every swing pays.** Every dig, however short, makes you permanently stronger. Nothing is ever lost.
2. **Streaks are the star.** Drill ore to ore and set crystals off; a long chain fills a pot that pays out multiplied. The screen should erupt.
3. **Discovery.** Every layer of the world has ores you have never seen, geodes to crack and relics to find.
4. **Get absurdly strong.** The upgrade web has no ceiling. By the end the Wick tears through rock like paper.
5. **Peaceful.** Nothing in the deep can hurt you. The only clock is your lantern's fuel.

## 2. Core loops
| Loop | Length | Beats |
|---|---|---|
| Moment | 1–3 s | steer the Wick → drill a tile → it breaks → ore pops and flies to your pockets → a chain catches |
| Dig | 2–6 min | ride the lift down → mine and chain → level-up boon picks (1 of 3) → fuel runs out → the lift hauls you up → results |
| Meta | 5–15 min | spend Gold / Gems / Cores in the Workshop → more drill power → break the next Strata Seal → new layer, new ores |
| Endgame | hours | endless depths below the Heart, Deep Pressure tiers 1–10, the Codex, infinite Refine upgrades |

Digs **never** lose loot: everything collected is banked when the fuel runs out.

## 3. Controls
| Action | Keyboard | Gamepad |
|---|---|---|
| Move / drill (into tile) | WASD / Arrows | Left stick / D-pad |
| Thrust (fly up) | W / Up / Space (hold) | Stick up / A (hold) |
| Flare (radial blast) | E / Shift | X / RB |
| Dynamite (unlock) | Q | Y / LB |
| Pause | Esc / P | Start |
All rebindable. Menus: arrows/enter, mouse, or gamepad.

## 4. The Wick (player)
- A small lantern-pod with treads and a front drill. Gravity applies; thrust pushes upward.
- **Drilling:** hold a direction into a solid tile; the drill bites at *Drill Rate* for *Drill Power* damage.
  - **Heat:** continuous drilling heats the bit, up to +40% speed (more with Heat Sink / Red Hot). The bit glows and the motor hum rises.
  - **Plow:** if a tile's remaining HP is at most your drill power (×3 with the Juggernaut Plow), it breaks on contact. Overpowered drills tear straight through.
  - **Auger** also bores the tile behind the target; **Wide Bit** hits the side tiles; **Excavator** chews a full 3×3.
- **Lantern fuel** (start 60) drains 1/s, faster in deeper layers. Nothing else can drain it. The light radius shrinks as fuel runs low. At 0 the lantern dims and the lift hauls the Wick up.
- Fuel comes back from lamp moss, amber, chain links, Kindling, Resonance and boons.

## 5. World
- A vertical shaft 30 tiles wide; 1 tile = 1 m. Deterministic generation from a seed (value-noise caves, random-walk ore veins, scattered specials).
- **Boulders** fall when unsupported and burst harmlessly into a little loot. **Embers** and **cinnabar** explode (chain fuel). **Crystals** shatter into shards.
- **Geode vaults:** hollow crystal pockets (a violet shell full of the layer's crystal, a core at the centre). Crack one and it all goes off at once.
- **Relics:** 24 unique keepsakes, 4 per layer above the Heart, buried at random each dig until found.

### Layers
| # | Name | Depth (m) | Rock | Ores | Fuel drain |
|---|---|---|---|---|---|
| 1 | Rootsoil | 0–120 | dirt, clay, stone | copper, tin, quartz ◆ | ×1.0 |
| 2 | Amberstone | 120–300 | sandstone, limestone | silver, amber (fuel), jade, fossil (gem), quartz ◆ | ×1.12 |
| 3 | Glimmer Grotto | 300–520 | crystal rock | gold, glimmer ◆, opal ◆, sapphire (gem) | ×1.28 |
| 4 | Emberdeep | 520–760 | basalt, obsidian | fire opal, ruby (gem), emerald (gem), ember ✹ | ×1.45 |
| 5 | The Hollow | 760–1050 | voidstone | starmetal, voidglass ◆, aether ◆, prism (gems) | ×1.65 |
| 6 | The Mantle | 1050–1500 | magma rock | mithril, moonstone ◆, cinnabar ✹, heartstone (core) | ×1.8 |
| 7 | The World's Heart | 1500+ | heart rock | heartstone, everything rare; endless below | ×2.0 |

◆ = shatters into shards; ✹ = explodes.

### Strata Seals (the gates)
A full-width band of runed stone sits at every layer boundary. A seal yields only to a drill of enough power; shards and blasts can't touch it. When one tile breaks, a shattering wave runs across the whole band (and counts as a giant chain).

| Seal | Depth | Drill power |
|---|---|---|
| The Amber Seal | 300 m | 10 |
| The Glimmer Seal | 520 m | 22 |
| The Ember Seal | 760 m | 40 |
| The Hollow Seal | 1050 m | 90 |
| The Mantle Seal | 1494 m | 150 |

**Lift stops** (Hearthmoor, Amber Landing, Grotto Gate, Ember Stair, Hollow Rim, Mantle Steps) open once you have reached their depth on foot. The Deep Heart stop opens after the Heart.

## 6. Chains and the chain pot (the hook)
- **Links:** every cascade break (shard, blast, rupture, flare) and every *drilled* ore, crystal, gem, relic, geode or seal tile adds a link.
- **Timer:** a chain stays alive for 1.2 s (Long Fuse, relics and boons extend it), and the timer *holds* while the drill is chewing something valuable. Threading a tunnel ore to ore keeps a streak going; crystals blow it up.
- **The pot:** all gold mined during a chain gathers in a pot shown under the counter. When the chain ends, the pot pays out × `1 + growth·√links` (growth 0.06, raised by Chain Bounty, Deeper Pot, Refine the Pot, relics and boons).
- **Refuel:** each link refuels the lantern a little (tapering on very long chains), so streaks let you dig longer.
- **Streak tiers:** Spark ×10, Chain ×25, Cascade ×50, Avalanche ×100, Landslide ×250, Quake ×500, Worldbreaker ×1000. Each has a banner, a rising chime, a screen pulse and more music intensity.
- **Spreading:** shards fly outward and break the first tile they hit; embers and cinnabar explode; Vein Rupture damages a whole connected vein; Fault Lines makes plain rock sometimes burst into shards; Cataclysm fires a free flare every 25 links.

## 7. In-run progression: Boons (roguelite layer)
Ore grants XP → level-up → pause → choose 1 of 3 boons (reroll / banish with Workshop upgrades). 30 boons, Common / Rare / Mythic, stackable. Examples: Overcharge, Quick Hands, Long Fuse, Pot Luck, Red Hot, Wide Bit, Echo Drill, Vein Rupture, Volatile, Ricochet, Scout Drone, Second Wind, Supernova, Prism Heart, Midas Touch. See `src/data/boons.ts`.

## 8. Meta progression
- **The Workshop:** a pannable node web radiating from the Lantern into 6 branches: LANTERN, DRILL, RIG, SHATTER, FORTUNE, ARCANA (about 70 nodes, adjacent-unlock, 1–5 levels each). Each branch ends in a capstone that costs a core: Last Light, Excavator, Juggernaut Plow, Cataclysm, Midas Lamp, Astral Lantern.
- **Refine nodes** (Bit, Wick, Purse, Pot, Eye) repeat forever and multiply the final totals, so there is always something to buy.
- **Currencies:** Gold (all ore), Gems (fossil, sapphire, ruby, emerald, prism, geodes), Cores (geode hearts, heartstone, the World's Heart).
- **Relics** give small permanent perks the moment they are found.
- **The Codex** lists every ore (22) and relic (24): unknown entries stay "???", found ones show their count, value and a lore line. The first find of each ore shows a NEW ORE card.

## 9. The goal: the World's Heart
Below the Mantle Seal is a great cavern; at its centre sits the Heart, a 2×2 mass of blazing crystal. Breaking it:
1. refills the lantern, scatters cores and heartstone, and plays a golden swell;
2. on the first time, the ending plays (`scenes/Ending.ts`): the Heart breaks open, its light climbs the whole shaft, and the Great Lantern of Hearthmoor relights;
3. the credits roll, and Deep Pressure and the Deep Heart lift stop open.

## 10. Endgame
- **Endless depths** below the Heart (to 4000 m): rock HP rises by 1/300 per metre and ore value by the same, so deeper is always richer.
- **Deep Pressure 1–10:** each tier burns fuel faster and/or hardens rock for +25% gold per tier. Reaching the Heart at your highest tier, on a dig that started above the Mantle, opens the next.

## 11. UI / Screens
Boot → Title → Camp (Workshop web, lift select, Pressure, Codex) → Dig (HUD) → Level-up overlay → Results → Camp. Plus Settings, Pause, Achievements, Credits, Ending.
HUD: fuel bar, flare cooldown, dynamite count; depth, layer, gold/gems/cores (pickups fly into them); chain counter with live pot, multiplier and timer; streak banners; relic pointer (Survey Lamp II); XP bar.

## 12. Accessibility
Full rebinding · gamepad · screen-shake slider · flash reduction · darkness assist · colour-independent ore shapes · game speed 70/85/100% · pause anywhere · nothing in the game can hurt you.

## 13. Onboarding
One-time contextual tips stored in `save.tips`: moving and drilling, thrust, first ore, first chain, chain pots, low fuel, flares, first seal, first geode, first relic, boulders, first level-up, first Workshop visit, new lift stops. All copy lives in `src/data/strings.ts`.

## 14. Audio direction
Warm lo-fi chiptune and mellow pads. Each layer has its own track with an intensity stem that rises with the live chain, and its own ambience bed (drips, wind, crystal hum, lava rumble, void drone, molten roar, the Heart's hum). The Heart's theme is the main melody at last in full major.
SFX: crunchy drill bites with a looping motor hum that rises with heat; glassy shatters whose pitch climbs through a chain; coin cascades for pot cash-outs; a deep crack and teal chord for seals; a music-box phrase for relics.

## 15. Achievements (37)
First Light · Down We Go · Amber Age · Seal Breaker · Glimmering · Into the Fire · Hollowed · Under Pressure (the Mantle) · Lightbringer (the Heart) · Deeper Still (2,000 m) · Chain Reaction ×25 · Avalanche ×100 · Quake ×500 · Worldbreaker ×1000 · Jackpot (10k pot) · Pocket Change · Rich Vein · Motherlode · Gem Collector · Hollow Treasure (geode) · Keepsake · Curator (12 relics) · Every Last Treasure (24) · Field Notes (half the Codex) · Natural Historian (whole Codex) · Fully Lit · Tinkerer · Master Artisan · Boon Hoarder · Touched by Myth · Flare Gun · Deep Breath · Feeling the Weight · Crushing Depths · The Full Weight · Self-Reliant · Plummet (hidden).

## 16. Balance targets (tuned with `npm run sim`)
| Milestone | Target play time |
|---|---|
| First dig ends | about 2 min, about 100 m |
| Amber Seal (300 m) | 20–35 min |
| Glimmer Seal (520 m) | 40–55 min |
| Ember Seal (760 m) | 70–95 min |
| Hollow Seal (1050 m) | 100–125 min |
| World's Heart (credits) | 140–190 min |

## 17. Narrative (light touch)
Hearthmoor, a mining village, lives by the light of its Great Lantern. That light was carried up from the Heart of the world long ago, and it is running out. You pilot the Wick, a lantern-pod built by the old lampwright Ottilie, who speaks a line in camp as you go deeper. There is no villain: only the deep, its treasures, and the long way down.
