/**
 * The few global dials that set the pace of the whole game. Everything else is a
 * per-node or per-tile number; these scale whole families at once, so the sim can
 * tune the length of the dig without touching a hundred values.
 */
export const BALANCE = {
  /** Workshop prices */
  econ: 12,
  /** gold from ore, pots and everything else that pays */
  gold: 1,
  /** the deeper the ore, the less each piece pays relative to the price ladder: gold /= 1 + goldFlat * (depth / 600)^2 */
  goldFlat: 40,
  /** how tough all rock is (on top of the depth curve) */
  rock: 1.3,
  /** how hard every shard hits (on top of upgrades and depth) */
  shardDmg: 1,
  /** how fast the lantern burns (on top of depth) */
  drain: 1,
};
