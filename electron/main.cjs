const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 1000,
        minWidth: 1024,
        minHeight: 700,
        icon: path.join(__dirname, 'assets', 'mhw-builder.ico'),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    } else {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
    }
};

const checkForStartupUpdate = async () => {
    if (!app.isPackaged) { return; }

    autoUpdater.autoDownload = false;

    autoUpdater.on('update-available', async info => {
        const answer = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'MHW Builder update available',
            message: `Version ${info.version} is available.`,
            detail: 'Would you like to download this update now?',
            buttons: ['Yes', 'No'],
            defaultId: 0,
            cancelId: 1,
        });
        if (answer.response === 0) {
            await autoUpdater.downloadUpdate();
        }
    });

    autoUpdater.on('update-downloaded', async () => {
        const answer = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'MHW Builder update ready',
            message: 'The update has been downloaded.',
            detail: 'Restart now to install it?',
            buttons: ['Restart and install', 'Later'],
            defaultId: 0,
            cancelId: 1,
        });
        if (answer.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });

    try {
        await autoUpdater.checkForUpdates();
    } catch (error) {
        console.warn('Startup update check failed:', error.message);
    }
};

app.whenReady().then(async () => {
    createWindow();
    await checkForStartupUpdate();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { app.quit(); }
});
