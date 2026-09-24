const {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  ipcMain,
  net,
  protocol,
  session,
} = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isAppUrl, assetPath } = require('./security.cjs');
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

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 1050,
    minWidth: 700,
    minHeight: 600,
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
    item.setSaveDialogOptions({ title: 'Mojidata Map — ファイルを保存' }),
  );
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      {
        label: '編集',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: '表示',
        submenu: [
          { role: 'reload' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
        ],
      },
      { label: 'ウィンドウ', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    ]),
  );
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
