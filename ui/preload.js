const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
        ipcRenderer.send(channel, data);
    },
    invoke: (channel, data) => {
        return ipcRenderer.invoke(channel, data);
    },
    on: (channel, callback) => {
        const newCallback = (_, ...args) => callback(...args);
        ipcRenderer.on(channel, newCallback);
        return () => ipcRenderer.removeListener(channel, newCallback);
    }
});