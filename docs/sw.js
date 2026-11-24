/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "afcc5e216080f85fbaea35d8c3fabfd6"
  }, {
    "url": "pwa-512x512.png",
    "revision": "9c53d12fe164e3842991cce4786a6916"
  }, {
    "url": "pwa-192x192.png",
    "revision": "eaec0909e841fa824764d512f17490e6"
  }, {
    "url": "index.html",
    "revision": "ca8451a9abfebffc3cf713e0f7529212"
  }, {
    "url": "icon.svg",
    "revision": "ea3a64be2c7cde15431a51da3b0cf2c9"
  }, {
    "url": "favicon.ico",
    "revision": "c023a879d6c7f42c089c5ef489c58e61"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "ac481823069794f393bb345357d66a84"
  }, {
    "url": "stockfish/stockfish-19-lite-single.wasm",
    "revision": "c56761eebb1beb83d680f58428ed6286"
  }, {
    "url": "stockfish/stockfish-19-lite-single.js",
    "revision": "81cc4511ffb3f02a40da47fcb1413cc5"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/index-Dg2uo0hb.css",
    "revision": null
  }, {
    "url": "assets/index-C6PgE70A.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "ac481823069794f393bb345357d66a84"
  }, {
    "url": "favicon.ico",
    "revision": "c023a879d6c7f42c089c5ef489c58e61"
  }, {
    "url": "icon.svg",
    "revision": "ea3a64be2c7cde15431a51da3b0cf2c9"
  }, {
    "url": "pwa-192x192.png",
    "revision": "eaec0909e841fa824764d512f17490e6"
  }, {
    "url": "pwa-512x512.png",
    "revision": "9c53d12fe164e3842991cce4786a6916"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "afcc5e216080f85fbaea35d8c3fabfd6"
  }, {
    "url": "stockfish/stockfish-19-lite-single.js",
    "revision": "81cc4511ffb3f02a40da47fcb1413cc5"
  }, {
    "url": "stockfish/stockfish-19-lite-single.wasm",
    "revision": "c56761eebb1beb83d680f58428ed6286"
  }, {
    "url": "manifest.webmanifest",
    "revision": "bbc5f77adabb04b4624b4abf90a19dd0"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
