"use strict";

/**
 * Мост между окном и главным процессом. Наружу отдаётся минимум:
 * сетевой запрос git, автозапуск, установка обновления и подписки на события.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  gitRequest: (options) => ipcRenderer.invoke("git:request", options),
  getAutoLaunch: () => ipcRenderer.invoke("desktop:getAutoLaunch"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("desktop:setAutoLaunch", enabled),
  info: () => ipcRenderer.invoke("desktop:info"),
  installUpdate: () => ipcRenderer.invoke("desktop:installUpdate"),
  onSyncRequest: (handler) => {
    ipcRenderer.on("desktop:sync", () => handler());
  },
  onUpdateReady: (handler) => {
    ipcRenderer.on("desktop:update-ready", (_event, version) => handler(version));
  },
});
