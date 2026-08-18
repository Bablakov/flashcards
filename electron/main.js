"use strict";

/**
 * Главный процесс ПК-приложения (§10 спецификации).
 *
 * Что здесь решается и почему:
 *  - git ходит в сеть ИЗ ГЛАВНОГО ПРОЦЕССА через IPC. В окне это был бы обычный
 *    fetch, который упирается в CORS (GitHub не отдаёт заголовки на git-протокол),
 *    и пришлось бы поднимать сторонний прокси. Здесь запрос идёт мимо браузерной
 *    песочницы: токен не покидает устройство, прокси не нужен;
 *  - ровно один экземпляр приложения: хранилище держит дерево файлов в памяти
 *    окна и сбрасывает на диск с задержкой, поэтому два окна затирали бы правки
 *    друг друга;
 *  - статика отдаётся с фиксированного порта 43117. Порт менять нельзя: origin
 *    определяет хранилище IndexedDB, а вместе с ним — все локальные данные;
 *  - трей и автозапуск нужны, чтобы напоминания приходили без открытого окна.
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const PORT = 43117;
const HOST = "127.0.0.1";
const APP_URL = `http://${HOST}:${PORT}/`;

let mainWindow = null;
let tray = null;
let quitting = false;

/* ------------------------------------------------- статический сервер --- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function staticRoot() {
  // В собранном приложении статика лежит рядом с asar, в разработке — в out/.
  const packaged = path.join(process.resourcesPath || "", "out");
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, "..", "out");
}

function startStaticServer() {
  const root = staticRoot();
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.join(root, urlPath);
    if (urlPath.endsWith("/")) filePath = path.join(filePath, "index.html");
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) filePath += ".html";
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(root, "index.html");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(PORT, HOST, () => resolve(server));
  });
}

/* -------------------------------------------------------- git по IPC --- */

ipcMain.handle("git:request", async (_event, req) => {
  // Тайм-аут: иначе зависший запрос оставит приложение в вечной «синхронизации».
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch(req.url, {
      method: req.method || "GET",
      headers: req.headers || {},
      body: req.body ? Buffer.from(req.body) : undefined,
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    url: response.url,
    method: req.method || "GET",
    statusCode: response.status,
    statusMessage: response.statusText,
    headers,
    body: new Uint8Array(buffer),
  };
});

/* ------------------------------------------------- автозапуск и трей --- */

ipcMain.handle("desktop:getAutoLaunch", () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle("desktop:setAutoLaunch", (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: !!enabled, args: ["--hidden"] });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle("desktop:info", () => ({
  version: app.getVersion(),
  platform: process.platform,
}));

function createTray() {
  const iconPath = path.join(__dirname, "icon.png");
  const image = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip("Flashcards");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Открыть", click: () => showWindow() },
      { label: "Синхронизировать", click: () => mainWindow?.webContents.send("desktop:sync") },
      { type: "separator" },
      {
        label: "Выход",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => showWindow());
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(hidden) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 420,
    show: !hidden,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  // Внешние ссылки — в системном браузере, а не внутри приложения.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Закрытие прячет окно в трей: иначе напоминания перестанут приходить.
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
}

/* ------------------------------------------------------ автообновление -- */

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.on("update-downloaded", (info) => {
      mainWindow?.webContents.send("desktop:update-ready", info?.version ?? "");
    });
    ipcMain.handle("desktop:installUpdate", () => {
      quitting = true;
      autoUpdater.quitAndInstall();
    });
    void autoUpdater.checkForUpdates();
    setInterval(() => void autoUpdater.checkForUpdates(), 24 * 3600 * 1000);
  } catch {
    // обновления не должны мешать работе приложения
  }
}

/* ------------------------------------------------------------- запуск --- */

// Ровно один экземпляр: два окна на одних данных затирают правки друг друга.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.whenReady().then(async () => {
    try {
      await startStaticServer();
    } catch (e) {
      console.error("static server failed", e);
    }
    const hidden = process.argv.includes("--hidden");
    createWindow(hidden);
    createTray();
    setupAutoUpdate();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(false);
      else showWindow();
    });
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("window-all-closed", () => {
    // Остаёмся в трее ради напоминаний — выход только через меню трея.
  });
}
