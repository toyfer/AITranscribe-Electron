const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
        openFile: () => ipcRenderer.invoke('dialog:openFile'),
        runFFmpeg: args => ipcRenderer.send('execute:runFFmpeg',args),
        runAiTranscribe: args => ipcRenderer.send('execute:runAiTranscribe',args),
        runCommand: command => ipcRenderer.send('execute:runCommand', command),
        returnCommand: output => ipcRenderer.on('return:Command', output),
        processMassage: massage => ipcRenderer.on('process:Massage', massage)
});
