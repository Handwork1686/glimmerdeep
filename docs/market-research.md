# Market Research — Steam indie landscape (Oct 2026)

Purpose: choose a genre/concept with the best odds of commercial traction **for this specific production setup**:
a solo-AI production, all art code-authored pixel art, all audio synthesized, TypeScript/Phaser + Electron, no human playtesters before release.

## 1. Headline market facts

| Fact | Figure | Source |
|---|---|---|
| Games released on Steam in 2025 | 20,282 | Zukowski via GamesRadar [1] |
| 2025 releases that reached 1,000 reviews (≈$150k gross rule of thumb) | 608 (≈3%) | [1], [8] |
| Indie revenue concentration | ~85% of indie revenue in top 10% of titles (2024) | Opgamemarketing [2] |
| 2025 hits by genre (count, ≥1k reviews) | Narrative 51, Simulation 43, Horror 39, RPG 28, **Idle/Incremental 27**, **Roguelike 22** | HowToMarketAGame 2025 recap, via search summary [3] |
| Roguelike deckbuilder success rate | ~4.9% hit rate (above Steam avg) but ~2,800 card games in Deckbuilders Fest 2026 → saturated | [3], [5] |
| 2D platformers 2025 | 1,658 released, **3** hits → avoid pure platformer | [1], [4] |
| Action-roguelike cohort (Jan 24–Jun 25) | 1,849 games, 3.5% hit 1k reviews; median price $4.99 | SteamPageAnalyzer [8] |
| Roguelite revenue on Steam | ~$400M in 2025 (+80% YoY), concentrated in big launches | Recognizing Patterns [9] (unverified) |
| Ball x Pit (Breakout × survivors-progression hybrid) | 2M+ copies since Oct 2025 | Push Square / Devolver [6] |
| Bongo Cat (desktop idle) | ~100k reviews, 97% positive | AppMagic / Steam250 [7] |
| The Farmer Was Replaced / Idle Tiny Pasture | ~640k / ~600k copies | AppMagic [7] |
| Nodebuster ($2.99 incremental) | ~13.7k reviews, 97.6% positive | SteamBase [7] |
| Steam Deck hit tags (2026) | Roguelike deckbuilder & Metroidvania ~2% share vs 0.55% median tag; Megabonk & Ball x Pit in top 10 | GameDiscoverCo [10] |

## 2. What the data says

1. **"Crafty/buildy" and idle/incremental convert well** because Steam users actively *search* for them; idle/incremental is described as "white-hot" [4]. 27 incremental hits in 2025 despite tiny budgets — the genre rewards *systems depth*, not *asset volume*.
2. **Roguelites remain the most reliable "gamey" genre**, but differentiation is non-negotiable. The breakouts are **hybrids** with a one-sentence hook (Ball x Pit = "Breakout + survivors", Nodebuster = "incremental + clicker-roguelite", A Game About Digging a Hole = tiny-scope dig loop).
3. **The "dopamine factory" arcade roguelite** (short runs, number-go-up, screen fills with satisfying chain reactions) is the current sweet spot: Ball x Pit, Megabonk, Nodebuster, CloverPit. These games are extremely **trailer-able** — a 3-second GIF sells them.
4. **Avoid:** pure platformers (0.2% hit rate), pure Balatro-likes/deckbuilders (thousands of clones), narrative/horror (needs writing + illustration/3D we can't credibly produce), multiplayer social (needs servers & community seeding).
5. **Price:** genre median $4.99; polished single-player small games cluster at $4.99–$9.99. Small incremental-roguelites succeed at $2.99–$6.99 with very high review ratios (impulse buy → reviews → algorithm).

## 3. Fit with our production constraints

| Constraint | Implication |
|---|---|
| Code-authored pixel art | Favour small, readable sprites, tiles, particles & light — **not** big character illustrations. Abstract/elemental subjects (ore, crystals, light, machines) look *better* procedural than humanoids do. |
| Synth audio | Chiptune/synthwave/ambient is a genre-appropriate fit, satisfying "pling" SFX are synth-native. |
| No human playtesters | Prefer systems we can **simulate with bots** to tune (economies, upgrade curves) over hand-tuned platforming feel. |
| Single developer | Content multiplies through **systems** (upgrades × synergies) rather than handcrafted levels. |

## 4. Candidate concepts (scored 1–5)

| Concept | Demand | Low competition | Feasibility | Hook | Trailer-ability | Replay/content | **Total** |
|---|---|---|---|---|---|---|---|
| **A. Mining incremental-roguelite** — descend with a lantern, shatter ore in chain reactions, short runs, deep upgrade web, light as a resource | 5 | 4 | 5 | 4 | 5 | 5 | **28** |
| B. Pinball/physics roguelite — build a board of bumpers that combo | 4 | 3 | 4 | 4 | 5 | 4 | 24 |
| C. Twin-stick arcade roguelite — survivor-style waves, build-crafting | 4 | 2 | 4 | 3 | 4 | 4 | 21 |
| D. Desktop idle companion | 5 | 3 | 5 | 2 | 2 | 2 | 19 |
| E. Tactical grid roguelite (Into the Breach-like) | 3 | 4 | 3 | 3 | 2 | 4 | 19 |

**Recommendation: A.** It sits in the overlap of the two genres with the best 2025 hit counts for small teams (idle/incremental + roguelike), it is maximally trailer-able (a screen of shattering crystal veins with light bloom), its art subject matter (rock, ore, gems, light, machines, critters) is the best possible fit for procedural/hand-placed pixel art, and its balance is bot-simulatable.

Price target: **$5.99** (launch discount 10–15%), with a free demo for Next Fest.

## Sources
1. GamesRadar — [20,282 games released on Steam in 2025, 608 got 1,000 reviews](https://www.gamesradar.com/games/a-terrifying-20-282-games-were-released-on-steam-in-2025-and-just-608-managed-to-get-1-000-reviews-expert-finds-we-might-be-in-a-bit-of-an-indie-golden-age/)
2. Opgamemarketing — [The 2024 Indie & AA Games Market](https://opgamemarketing.substack.com/p/the-2024-indie-and-aa-game-market)
3. HowToMarketAGame — [What the hell happened in 2025?](https://howtomarketagame.com/2026/01/27/what-the-hell-happened-in-2025/) (direct fetch failed — DNS; figures via search summaries)
4. WN Hub — [Steam players don't care about platformers unless mixed with other genres](https://wnhub.io/news/stores-and-publishing/item-44107); presskit.gg — [Next Fest 2026 results](https://presskit.gg/blog/steam-next-fest-2026-results)
5. No Small Games — [Balatro-likes at Next Fest](https://nosmallgames.com/2025/06/i-tried-every-balatro-like-game-i-could-find-in-steam-next-fest-again/); Choost — [Best roguelite deckbuilders 2026](https://choostgames.com/blog/best-roguelite-deckbuilders-2026/)
6. Push Square — [Ball X Pit hits 2 million sales](https://www.pushsquare.com/news/2026/08/devolvers-brilliant-roguelite-dopamine-factory-ball-x-pit-is-a-smash-hit-at-2-million-sales)
7. AppMagic — [Idle games on Steam 2026](https://appmagic.rocks/research/idle-steam-games-2026); [Steam250 idler](https://steam250.com/tag/idler); [SteamBase incremental](https://steambase.io/games/best-incremental-steam-games)
8. SteamPageAnalyzer — [Action Roguelike games on Steam, measured](https://www.steampageanalyzer.com/niches/action-roguelike)
9. Recognizing Patterns — [The roguelite cull hasn't happened](https://recognizingpatterns.substack.com/p/the-roguelite-cull-hasnt-happened)
10. GameDiscoverCo — [Steam Deck's biggest 2026 hits](https://newsletter.gamediscover.co/p/what-are-steam-decks-biggest-2026); [July 2026 top new games](https://newsletter.gamediscover.co/p/july-2026s-top-new-pc-and-console)
11. Capsule sizes — [presskit.gg capsule guide](https://presskit.gg/field-guides/steam-capsule-art-guide); [SteamPageAnalyzer capsule sizes](https://www.steampageanalyzer.com/blog/steam-capsule-sizes)
