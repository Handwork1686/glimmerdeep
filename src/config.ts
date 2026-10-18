/** Global constants shared by the simulation and the renderer. */
export const VIEW_W = 480;
export const VIEW_H = 270;
export const TILE = 16;
export const COLS = 30;
/** Rows of open sky above the turf line. Depth 0 m = first ground row. */
export const SKY_ROWS = 10;
export const MAX_DEPTH = 4000;
export const WORLD_ROWS = SKY_ROWS + MAX_DEPTH + 40;
export const STEP = 1 / 60;
export const GAME_VERSION = '1.0.0';
/** Demo builds (VITE_DEMO=1) end at the first Strata Seal and keep a separate save. */
export const DEMO = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEMO === '1';
