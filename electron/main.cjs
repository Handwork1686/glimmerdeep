// Glimmerdeep desktop shell: window, file saves (Steam Cloud friendly), Steam bridge.
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !app.isPackaged && process.env.GLIMMER_DEV === '1';
let steam = null;
let win = null;

function initSteam() {
  try {
    const steamworks = require('steamworks.js');
    // In development, steam_appid.txt next to the executable (or the APP_ID env) supplies the id.
    const appIdFile = path.join(path.dirname(process.execPath), 'steam_appid.txt');
    const appId = Number(process.env.STEAM_APP_ID || (fs.existsSync(appIdFile) ? fs.readFileSync(appIdFile, 'utf8').trim() : 0)) || undefined;
    steam = steamworks.init(appId);
    steamworks.electronEnableSteamOverlay();
    console.log('[steam] initialised as', steam.localplayer.getName());
  } catch (e) {
    steam = null;
    console.log('[steam] not available:', e && e.message);
  }
}

// Saves live in the user data folder. Configure Steam Auto-Cloud to sync
// "<userdata>/save.json" (see docs/STEAM_LAUNCH.md).
const savePath = () => path.join(app.getPath('userData'), 'save.json');

ipcMain.on('save:read', (e, slot) => {
  try {
    const p = slot === 'bak' ? savePath() + '.bak' : savePath();
    e.returnValue = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  } catch {
    e.returnValue = null;
  }
});
ipcMain.on('save:write', (e, data) => {
  e.returnValue = true;
  try {
    const tmp = savePath() + '.tmp';
    fs.writeFileSync(tmp, data, 'utf8');
    if (fs.existsSync(savePath())) fs.copyFileSync(savePath(), savePath() + '.bak');
    fs.renameSync(tmp, savePath());
  } catch (err) {
    console.error('save failed', err);
  }
});
ipcMain.on('steam:achievement', (_e, id) => {
  try {
    if (steam && !steam.achievement.isActivated(id)) steam.achievement.activate(id);
  } catch (err) {
    console.error('achievement failed', err);
  }
});
ipcMain.on('steam:presence', (_e, text) => {
  try {
    if (steam) steam.localplayer.setRichPresence('status', String(text).slice(0, 255));
  } catch {
    /* ignore */
  }
});
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', (_e, on) => win && win.setFullScreen(!!on));

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 810,
    minWidth: 480,
    minHeight: 270,
    backgroundColor: '#07060c',
    title: 'Glimmerdeep',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  // read the saved fullscreen preference before the first frame
  try {
    const raw = fs.existsSync(savePath()) ? JSON.parse(fs.readFileSync(savePath(), 'utf8')) : null;
    if (raw && raw.settings && raw.settings.fullscreen) win.setFullScreen(true);
  } catch {
    /* fresh install */
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.alt && input.key === 'Enter'))) win.setFullScreen(!win.isFullScreen());
    if (isDev && input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  if (isDev) win.loadURL('http://localhost:5173/');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.whenReady().then(() => {
  initSteam();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
