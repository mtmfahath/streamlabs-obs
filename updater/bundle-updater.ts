import fetch from 'node-fetch';
import * as electron from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let updaterWindow: electron.BrowserWindow;

function spawnUpdaterWindow(basePath: string) {
  updaterWindow = new electron.BrowserWindow({
    width: 400,
    height: 180,
    frame: false,
    resizable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: true },
  });

  updaterWindow.on('ready-to-show', () => {
    updaterWindow.show();
  });

  updaterWindow.loadURL(`file://${basePath}/updater/index.html`);

  updaterWindow.webContents.openDevTools();
}

function downloadFile(srcUrl: string, dstPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    return fetch(srcUrl)
      .then(resp => (resp.ok ? Promise.resolve(resp) : Promise.reject(resp)))
      .then(({ body }) => {
        const fileStream = fs.createWriteStream(dstPath);

        body.pipe(fileStream);


      })
      .catch(e => reject(e));
  });
}


module.exports = async (basePath: string) => {
  const cdnBase = `https://slobs-cdn.streamlabs.com/${process.env.SLOBS_VERSION}/bundles/`;
  const localBase = `file://${basePath}/bundles/`;

  spawnUpdaterWindow(basePath);
  await new Promise(r => setTimeout(r, 999999));

  let useLocalBundles = false;

  if (process.argv.includes('--local-bundles')) {
    useLocalBundles = true;
  }

  if (process.env.NODE_ENV !== 'production') {
    useLocalBundles = true;
  }

  const localManifest = require(path.join(`${basePath}/bundles/manifest.json`));

  console.log('Local bundle info:', localManifest);

  // Check if bundle updates are available
  // TODO: Cache the latest bundle name for offline use?
  let serverManifest: { [bundle: string]: string } | undefined;

  if (!useLocalBundles) {
    try {
      const remoteManifestName = process.argv.includes('--bundle-qa')
        ? 'manifest-qa.json'
        : 'manifest.json';
      const response = await fetch(`${cdnBase}${remoteManifestName}`);

      if (response.status / 100 >= 4) {
        console.log('Bundle manifest not available, using local bundles');
        useLocalBundles = true;
      } else {
        const parsed = await response.json();
        console.log('Latest bundle info:', parsed);

        serverManifest = parsed;
      }
    } catch (e) {
      console.log('Bundle manifest fetch error', e);
      useLocalBundles = true;
    }
  }

  // const bundleDownloadDirectory = 

  // const bundleMap = {

  // }

  electron.session.defaultSession?.webRequest.onBeforeRequest(
    { urls: ['https://slobs-cdn.streamlabs.com/bundles/*.js'] },
    (request, cb) => {
      const bundleName = request.url.split('/')[4];

      if (!useLocalBundles && serverManifest && serverManifest[bundleName]) {
        if (serverManifest[bundleName] !== localManifest[bundleName]) {
          console.log(`Newer version of ${bundleName} is available`);
          cb({ redirectURL: `${cdnBase}${serverManifest[bundleName]}` });
          return;
        }
      }

      console.log(`Using local bundle for ${bundleName}`);
      cb({ redirectURL: `${localBase}${localManifest[bundleName]}` });
    },
  );

  // The following handlers should rarely be used and are a failsafe.
  // If something goes wrong while fetching bundles even when the pre-fetch
  // succeeded, then we restart the app and force it to use local bundles.

  let appRelaunching = false;

  function revertToLocalBundles() {
    if (appRelaunching) return;
    appRelaunching = true;
    console.log('Reverting to local bundles and restarting app');
    electron.app.relaunch({ args: ['--local-bundles'] });
    electron.app.quit();
  }

  if (!useLocalBundles) {
    electron.session.defaultSession?.webRequest.onHeadersReceived(
      { urls: [`${cdnBase}*.js`] },
      (info, cb) => {
        if (info.statusCode / 100 < 4) {
          cb({});
          return;
        }

        console.log(`Caught error fetching bundle with status ${info.statusCode}`);

        revertToLocalBundles();
      },
    );

    electron.session.defaultSession?.webRequest.onErrorOccurred(
      { urls: [`${cdnBase}*.js`] },
      info => {
        console.log('Caught error fetching bundle', info.error);

        revertToLocalBundles();
      },
    );
  }
};
