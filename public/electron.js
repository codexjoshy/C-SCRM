// handle squirrel events for Windows
// const setupEvents = require("./installers/setupEvents");
// if (setupEvents.handleSquirrelEvent()) {
//   return;
// }
import {
  default as installExtension,
  REACT_DEVELOPER_TOOLS,
  // REDUX_DEVTOOLS
} from 'electron-devtools-installer';

import { app, BrowserWindow, shell, ipcMain, Menu, TouchBar } from 'electron';
const { TouchBarButton, TouchBarLabel, TouchBarSpacer } = TouchBar;

// const stateHandler = require('../state-handler.js');

import path from 'path';
import isDev from 'electron-is-dev';

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    backgroundColor: '#F7F7F7',
    minWidth: 880,
    show: false,
    titleBarStyle: 'default',
    webPreferences: {
      nodeIntegration: false,
      preload: __dirname + '/../preload.js',
    },
    height: 860,
    width: 1280,
    icon: __dirname + '/64x64.png',
  });

  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  if (isDev) {
    installExtension(REACT_DEVELOPER_TOOLS)
      .then((name) => {
        console.log(`Added Extension: ${name}`);
      })
      .catch((err) => {
        console.log('An error occurred: ', err);
      });

    // installExtension(REDUX_DEVTOOLS)
    //   .then(name => {
    //     console.log(`Added Extension: ${name}`);
    //   })
    //   .catch(err => {
    //     console.log("An error occurred: ", err);
    //   });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    ipcMain.on('open-external-window', (event, arg) => {
      shell.openExternal(arg);
    });
  });

  mainWindow.webContents.openDevTools();
};

const generateMenu = () => {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'about' }, { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteandmatchstyle' },
        { role: 'delete' },
        { role: 'selectall' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      role: 'help',
      submenu: [
        {
          click() {
            // require('electron').shell.openExternal(
            //   'https://getstream.io/winds'
            // );
          },
          label: 'Learn More',
        },
        {
          click() {
            // require('electron').shell.openExternal(
            //   'https://github.com/GetStream/Winds/issues'
            // );
          },
          label: 'File Issue on GitHub',
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.on('ready', () => {
  loadSessionData();
  createWindow();
  generateMenu();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
