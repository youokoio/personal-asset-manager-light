"use strict";

const CACHE_NAME = "pam2-s12b-v1";
const APP_FILES = [
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon.svg",
  "./js/tests-render-bootstrap.js",
  "./js/core.js",
  "./js/storage.js",
  "./js/calc-fx.js",
  "./js/calc-loan.js",
  "./js/calc-losscut.js",
  "./js/calc-fx-daily.js",
  "./js/calc-fx-settlement.js",
  "./js/calc-fx-swap.js",
  "./js/calc-fx-realized.js",
  "./js/calc-fx-batch.js",
  "./js/calc-import.js",
  "./js/calc-import-save.js",
  "./js/ocr-rules.js",
  "./js/calc-ocr.js",
  "./js/calc-history-edit.js",
  "./js/calc-chart.js",
  "./js/ui-common.js",
  "./js/ui-home.js",
  "./js/ui-loan.js",
  "./js/ui-losscut.js",
  "./js/ui-accounts.js",
  "./js/ui-fx-swap.js",
  "./js/ui-fx-rates.js",
  "./js/ui-fx-position-form.js",
  "./js/ui-fx-position-settlement.js",
  "./js/ui-fx-batch.js",
  "./js/ui-fx-import.js",
  "./js/ui-fx.js",
  "./js/ui-fx-daily.js",
  "./js/ui-fx-history-edit.js",
  "./js/ui-fx-history.js",
  "./js/ui-chart.js",
  "./js/ui-data.js",
  "./js/ui-bulk.js",
  "./js/main.js",
  "./test.html",
  "./js/tests-migration.js",
  "./js/tests-summary.js",
  "./js/tests-input.js",
  "./js/tests-bulk.js",
  "./js/tests-chart.js",
  "./js/tests-holdings.js",
  "./js/tests-fx.js",
  "./js/tests-fx-daily.js",
  "./js/tests-losscut.js",
  "./js/tests-snapshot-edit.js",
  "./js/tests-fx-settlement.js",
  "./js/tests-fx-settlement-simulation.js",
  "./js/tests-fx-swap-allocation.js",
  "./js/tests-fx-swap-estimate.js",
  "./js/tests-fx-position-batch.js",
  "./js/tests-loan.js",
  "./js/tests-ocr-data.js",
  "./js/tests-ocr.js",
  "./js/tests.js"
];

self.addEventListener("install",event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    for (const file of APP_FILES) {
      const url = new URL(file,self.registration.scope);
      const request = new Request(url.href,{cache:"reload"});
      const response = await fetch(request);

      if (!response || !response.ok) {
        throw new Error("アプリファイルを取得できません: " + file);
      }

      await cache.put(url.href,response);
    }

    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch",event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(new Request(request,{cache:"no-cache"})).then(response => {
      if (response && response.ok) {
        const responseCopy = response.clone();
        return caches.open(CACHE_NAME)
          .then(cache => cache.put(request,responseCopy))
          .then(() => response);
      }
      return response;
    }).catch(() => caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        if (cached) return cached;
        if (request.mode === "navigate") {
          return cache.match(new URL("./index.html",self.registration.scope).href);
        }
        return Response.error();
      })
    ))
  );
});
