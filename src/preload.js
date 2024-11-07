const { contextBridge, ipcRenderer } = require('electron');

class PreloadAPI {
    openFile() {
        return ipcRenderer.invoke('dialog:openFile');
    }

    runFFmpeg(args) {
        ipcRenderer.send('execute:runFFmpeg', args);
    }

    runWhisper(args) {
        ipcRenderer.send('execute:runWhisper', args);
    }

    returnCommand(output) {
        ipcRenderer.on('return:Command', output);
    }

    processMassage(massage) {
        ipcRenderer.on('process:Massage', massage);
    }
}

contextBridge.exposeInMainWorld('electronAPI', new PreloadAPI());
