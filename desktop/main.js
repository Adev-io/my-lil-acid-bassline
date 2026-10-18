// Desktop shell: opens the web app (../index.html) in its own window. No server, no build step.
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280, height: 900, backgroundColor: '#111', autoHideMenuBar: true,
    title: 'My lil acid bass, by A_Development',
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
