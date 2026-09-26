const {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  ipcMain,
  net,
  protocol,
  session,
  screen,
  shell,
} = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isAppUrl, assetPath, isExternalUrl } = require('./security.cjs');
const nativeI18n = require('i18next').createInstance();
void nativeI18n.init({
  lng: 'ja',
  fallbackLng: 'en',
  resources: require('./messages.json'),
  initAsync: false,
});
const dataRoot = path.join(__dirname, '..', 'dist');
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data: blob:; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'";
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mojidata',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
app.enableSandbox();

function trusted(event) {
  if (
    !event.senderFrame ||
    event.senderFrame !== event.sender.mainFrame ||
    !isAppUrl(event.senderFrame.url)
  )
    throw new Error('Untrusted IPC sender');
}
ipcMain.handle('open-external', async (event, url) => {
  trusted(event);
  if (!isExternalUrl(url)) throw new Error('Invalid external URL');
  await shell.openExternal(url);
});
ipcMain.handle('copy-text', (event, text) => {
  trusted(event);
  if (typeof text !== 'string' || text.length > 5_000_000)
    throw new Error('Invalid clipboard text');
  clipboard.writeText(text);
});
ipcMain.handle('always-on-top', (event, value) => {
  trusted(event);
  if (typeof value !== 'boolean') throw new Error('Invalid window setting');
  BrowserWindow.fromWebContents(event.sender)?.setAlwaysOnTop(value);
});

ipcMain.handle('set-language', (event, language) => {
  trusted(event);
  if (language !== 'ja' && language !== 'en') throw new Error('Invalid language');
  void nativeI18n.changeLanguage(language);
  rebuildMenu();
});

function rebuildMenu() {
  const openAbout = (section) => {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    window?.webContents.send('open-about', section);
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: app.name,
              submenu: [
                { label: nativeI18n.t('aboutMac'), click: () => openAbout('about') },
                { type: 'separator' },
                { role: 'services', label: nativeI18n.t('services') },
                { type: 'separator' },
                { role: 'hide', label: nativeI18n.t('hide') },
                { role: 'hideOthers', label: nativeI18n.t('hideOthers') },
                { role: 'unhide', label: nativeI18n.t('unhide') },
                { type: 'separator' },
                { role: 'quit', label: nativeI18n.t('quit') },
              ],
            },
          ]
        : []),
      {
        label: nativeI18n.t('edit'),
        submenu: [
          { role: 'undo', label: nativeI18n.t('undo') },
          { role: 'redo', label: nativeI18n.t('redo') },
          { type: 'separator' },
          { role: 'cut', label: nativeI18n.t('cut') },
          { role: 'copy', label: nativeI18n.t('copy') },
          { role: 'paste', label: nativeI18n.t('paste') },
          { role: 'selectAll', label: nativeI18n.t('selectAll') },
        ],
      },
      {
        label: nativeI18n.t('view'),
        submenu: [
          { role: 'reload', label: nativeI18n.t('reload') },
          { role: 'resetZoom', label: nativeI18n.t('resetZoom') },
          { role: 'zoomIn', label: nativeI18n.t('zoomIn') },
          { role: 'zoomOut', label: nativeI18n.t('zoomOut') },
          { role: 'togglefullscreen', label: nativeI18n.t('togglefullscreen') },
        ],
      },
      {
        label: nativeI18n.t('window'),
        submenu: [
          { role: 'minimize', label: nativeI18n.t('minimize') },
          { role: 'close', label: nativeI18n.t('close') },
        ],
      },
      {
        label: nativeI18n.t('help'),
        submenu: [
          { id: 'about-app', label: nativeI18n.t('about'), click: () => openAbout('about') },
          { id: 'app-credits', label: nativeI18n.t('credits'), click: () => openAbout('credits') },
        ],
      },
    ]),
  );
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({
    width: Math.min(1200, width),
    height: Math.min(760, height),
    minWidth: Math.min(640, width),
    minHeight: Math.min(420, height),
    title: 'Mojidata Map',
    backgroundColor: '#f6f7f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  void window.loadURL('mojidata://app/index.html');
}

app.whenReady().then(() => {
  protocol.handle('mojidata', async (request) => {
    const filename = assetPath(dataRoot, request.url);
    if (!filename || request.method !== 'GET') return new Response('Forbidden', { status: 403 });
    try {
      const response = await net.fetch(pathToFileURL(filename).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', csp);
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(!!contents && isAppUrl(contents.getURL()) && permission === 'local-fonts');
  });
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, origin) =>
      !!contents && isAppUrl(contents.getURL()) && isAppUrl(origin) && permission === 'local-fonts',
  );
  session.defaultSession.on('will-download', (_event, item) =>
    item.setSaveDialogOptions({ title: nativeI18n.t('save') }),
  );
  rebuildMenu();
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
