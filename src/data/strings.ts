/**
 * Player-facing text. Keeping copy in one table makes it reviewable and ready
 * for localisation (swap this module per language).
 * `{key}` placeholders are filled from the current bindings by `fmtKeys`.
 */
export const S = {
  tips: {
    move: '{left}/{right} to move. Hold {down} to drill down.',
    thrust: 'Hold {up} to thrust upward and drill the ceiling.',
    ore: 'Ore is yours to keep. Everything banks when your lantern runs dry.',
    crystal: 'Crystals burst into shards, and shards break more crystals. Chain them!',
    chain: 'Every ore, crystal and shard break adds to your chain. When it ends, the pot pays out multiplied.',
    lowlight: 'Your lantern is running low. Long chains, lamp moss and amber refuel it.',
    shardbomb: 'Press {shardbomb} for a Shard Bomb: it bursts into shards that carry every shard upgrade you own.',
    shards: 'Shards are what you hit underground to boost you: crystals, embers, cinnabar, geodes. Hit them, chain them, blow them up.',
    geode: 'A geode! Crack the shell and the crystals inside go off all at once.',
    relic: 'A relic: a keepsake from the deep. Its gift stays with you forever.',
    boulder: 'Loose boulders fall when you dig out what holds them up.',
    levelup: 'Level up! Pick one boon. It lasts until this dig ends.',
    workshop: 'Spend what you found in the Workshop, then dig again.',
    stall: "If you can't break it, the lantern won't wait. Drilling and breaking nothing burns fuel faster: find softer rock or a shard.",
    rich: 'Rich ground! This stretch holds twice the shard sources, geodes and ore.',
    farOut: 'The deep goes on sideways forever. The Heart lies under the shaft: the marker points home.',
  },
  cards: {
    secondWind: 'SECOND WIND',
    secondWindSub: 'The flame catches again',
    milestone: 'NEW DEPTH',
    newOre: 'NEW ORE',
    newShard: 'NEW SHARD',
    relic: 'RELIC FOUND',
    heart: "THE WORLD'S HEART",
    heartSub: 'Its light floods up the shaft...',
  },
  streaks: [
    [10, 'SPARK'],
    [25, 'CHAIN'],
    [50, 'CASCADE'],
    [100, 'AVALANCHE'],
    [250, 'LANDSLIDE'],
    [500, 'QUAKE'],
    [1000, 'WORLDBREAKER'],
  ] as [number, string][],
  results: {
    dark: 'THE LANTERN DIMS',
    darkSub: "Ottilie's winch reels you home, pockets full.",
    quit: 'BACK TO THE SURFACE',
    heart: "THE WORLD'S HEART",
    heartSub: 'Its light carries you all the way home.',
    banked: 'Everything you found is safely banked.',
    nextHeart: "Next: the World's Heart waits at 1500 m.",
    nextEndless: 'Next: how deep does the world go?',
    nextDepth: 'Next: beat your record of {depth} m.',
  },
  camp: {
    hintMenu: 'Spend what you found, then dig again.',
    hintWeb: '{confirm} buy (hold to repeat)    {back} back    arrows move',
    unlockFirst: 'Unlock a connected node first.',
    mastered: 'MASTERED',
  },
};

/** Replace {action} placeholders with the current control labels. */
export function fmtKeys(s: string, label: (a: string) => string, vars: Record<string, string | number> = {}): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : label(k)));
}
