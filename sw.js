"use strict";

const CACHE_NAME = "pam2-s14-v1";
const APP_FILES = [
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon.svg",
  "./js/tests-render-bootstrap.js",
  "./js/core.js",
  "./js/storage-validation.js",
  "./js/storage-validation-stock.js",
  "./js/storage-migration.js",
  "./js/storage.js",
  "./js/calc-fx.js",
  "./js/calc-loan.js",
  "./js/calc-contrib.js",
  "./js/calc-losscut.js",
  "./js/calc-fx-daily.js",
  "./js/calc-fx-settlement.js",
  "./js/calc-fx-swap.js",
  "./js/calc-fx-realized.js",
  "./js/calc-fx-batch.js",
  "./js/calc-import.js",
  "./js/calc-import-save.js",
  "./js/ocr-rules.js",
  "./js/calc-ocr-normalize.js",
  "./js/calc-ocr-result.js",
  "./js/calc-ocr-block.js",
  "./js/calc-ocr.js",
  "./js/calc-ocr-stock.js",
  "./js/calc-ocr-stock-cards.js",
  "./js/calc-ocr-stock-parse.js",
  "./js/calc-ocr-stock-state.js",
  "./js/ocr-rules-stock.js",
  "./js/calc-ocr-stock-compare.js",
  "./js/calc-ocr-stock-save.js",
  "./js/calc-history-edit.js",
  "./js/calc-chart.js",
  "./js/calc-salecheck.js",
  "./js/calc-salecheck-hints.js",
  "./js/calc-salecheck-confirm.js",
  "./js/ui-common.js",
  "./js/ui-home.js",
  "./js/ui-loan.js",
  "./js/ui-losscut.js",
  "./js/ui-accounts.js",
  "./js/ui-contrib-forms.js",
  "./js/ui-contrib-plans.js",
  "./js/ui-contrib.js",
  "./js/ui-salecheck.js",
  "./js/ui-snapshot-form.js",
  "./js/ui-account-settings.js",
  "./js/ui-holdings.js",
  "./js/ui-snapshot-history.js",
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
  "./js/ui-chart-zoom.js",
  "./js/ui-chart.js",
  "./js/ui-chart-select.js",
  "./js/ui-data.js",
  "./js/ui-bulk.js",
  "./js/ui-bulk-ocr.js",
  "./js/ui-stock-update.js",
  "./js/ui-stock-update-render-card.js",
  "./js/ui-stock-update-screen.js",
  "./js/ui-stock-update-diagnosis.js",
  "./js/ui-stock-update-events.js",
  "./js/main.js",
  "./test.html",
  "./js/tests-migration.js",
  "./js/tests-summary.js",
  "./js/tests-input.js",
  "./js/tests-bulk.js",
  "./js/tests-chart.js",
  "./js/tests-chart-ui.js",
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
  "./js/tests-bulk-ocr.js",
  "./js/tests-ocr-stock.js",
  "./js/tests-ocr-stock-compare.js",
  "./js/tests-ocr-stock-data.js",
  "./js/tests-contrib.js",
  "./js/tests-contrib-render.js",
  "./js/tests-salecheck.js",
  "./js/tests-salecheck-render.js",
  "./js/tests-ocr-stock-state.js",
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
