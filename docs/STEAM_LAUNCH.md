# Glimmerdeep: Steam Launch Checklist

Everything under **Done in the repo** is built and versioned. Everything under **Only you can do** needs your Steamworks account, money, or legal identity.

## Done in the repo
- [x] Desktop build is an Electron shell (`electron/main.cjs`). It has:
  - a window and fullscreen toggle (F11 / Alt+Enter)
  - file saves in the user-data folder, with an atomic write and a `.bak` backup
- [x] Steam integration through `steamworks.js`:
  - achievements
  - rich presence
  - the Steam overlay
  - graceful no-op when Steam is not running
- [x] 37 achievements. The IDs live in `src/systems/achievements.ts`; create them with the same IDs in Steamworks.
- [x] Gamepad support (XInput / PlayStation / Steam Deck), plus full keyboard rebinding.
- [x] Store assets in `store/`, all at the 2026 required sizes:

| File | Size |
|---|---|
| `header_capsule.png` | 920×430 |
| `small_capsule.png` | 462×174 |
| `main_capsule.png` | 1232×706 |
| `vertical_capsule.png` | 748×896 |
| `library_capsule.png` | 600×900 |
| `library_header.png` | 920×430 |
| `library_hero.png` | 3840×1240, artwork only |
| `library_logo.png` | 1280×720, transparent |
| `community_icon.png` | 184×184 |
| `icon_32.png`, `icon_256.png` | — |

- [x] Screenshots in `store/screenshots/` (1920×1080) and the trailer in `store/trailer.mp4` (1080p60, H.264).
- [x] Store copy in `store/store_page.md`, and a press kit in `presskit/`.

## Only you can do

### 1. Steamworks account
1. Pay the Steam Direct fee (US$100 per app) and finish identity and tax verification.
2. Create the app. Copy the **App ID** into:
   - `steam_appid.txt` next to the executable, for local testing only (never ship this file)
   - `STEAM_APP_ID` in your build environment, if you prefer
3. Change the placeholder studio name in `src/data/credits.ts` (`STUDIO`) and in `package.json` (`author`, `build.appId`).

### 2. Achievements
Create the 37 achievements in Steamworks → *Stats & Achievements*, using the IDs below. Then upload icons:
- Make 64×64 unlocked icons by exporting `atlas.png` frames `icon_*` at ×4.
- Make the locked versions by desaturating them.

`first_light, down_we_go, amber_age, seal_breaker, glimmering, into_the_fire, hollowed, mantle, lightbringer, endless, chain25, chain100, chain500, chain1000, pot10k, gold1k, gold25k, gold1m, gems50, geode, relic1, relic12, relic24, codex50, codex100, fully_lit, tinkerer, artisan, hoarder, mythic, flare_gun, deep_breath, gloom1, gloom5, gloom10, no_moss, speedy`

Mark `speedy` as hidden.

### 3. Steam Cloud
In Steamworks → *Steam Cloud*, enable Auto-Cloud with these roots:

| Platform | Root | Subdirectory | Pattern |
|---|---|---|---|
| Windows | `WinAppDataRoaming` | `Glimmerdeep` | `save.json` |
| Linux | `LinuxXdgConfigHome` | `Glimmerdeep` | `save.json` |
| macOS | `MacAppSupport` | `Glimmerdeep` | `save.json` |

### 4. Builds (SteamPipe)
```bash
npm ci
npm run test             # unit tests
npm run dist:linux       # release/linux-unpacked  (+ AppImage)
npm run dist:win         # release/win-unpacked (on Linux this needs wine; see below)
npx electron-builder --mac dir   # release/mac          (build on a Mac to sign/notarize)
```
- Create one depot per OS and upload the `*-unpacked` folders with `steamcmd` / ContentBuilder.
- Launch options:
  - Windows: `Glimmerdeep.exe`
  - Linux: `glimmerdeep`
  - macOS: `Glimmerdeep.app`
- **Steam Deck:** the game runs natively on Linux. Text is legible at 1280×800 (×2 scale), and the gamepad is fully supported. Submit for Deck Verified review.
- **Windows build on Linux:** the icon and version info are applied by `rcedit` under wine.
  - With only 64-bit wine installed, copy `~/.cache/electron-builder/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe` over `rcedit-ia32.exe`.
  - Building on Windows avoids this step.
- **Code signing:**
  - Windows: optional, but it avoids SmartScreen warnings.
  - macOS: notarization is required. Run `electron-builder` on a Mac with an Apple Developer ID.

### 5. Store page
1. Paste the copy from `store/store_page.md`.
2. Upload the capsules, screenshots and trailer.
3. Set the tags: *Incremental, Mining, Relaxing, Pixel Graphics, Casual, Singleplayer, Atmospheric, 2D, Roguelite, Controller.*
4. Price: **$5.99**, with an optional 10% launch discount.
5. Content survey: no mature content and no violence of any kind.
6. Valve requires the *Coming Soon* page to be live **at least 2 weeks** before release. Plan for at least 4–6 weeks of wishlist building, and ideally one **Steam Next Fest** with a demo.

### 6. Demo (recommended for Next Fest)
The demo is built in: `npm run dist:demo` writes to `release-demo/`.
- The Amber Seal (300 m) never breaks, and only the first two lift stops exist.
- On reaching the seal, a wishlist card is shown.
- The demo keeps its own save, so it never touches full-game progress.

Create a separate Steam *Demo* app and upload `release-demo/*-unpacked`.

### 7. Before pressing release
- [ ] A human playtest of at least 5 people, each playing 1–2 hours, focused on feel and first-hour pacing. See `docs/QA.md` for the balance-simulation numbers.
- [ ] Test on Windows and macOS hardware. Only the Linux build was run during development.
- [ ] Verify achievements on a Steam client with the real App ID.
- [ ] Back up the repository.
