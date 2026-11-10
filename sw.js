"use strict";

const CACHE_NAME = "pam2-s2-v2";
const APP_FILES = [
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon.svg",
  "./js/core.js",
  "./js/storage.js",
  "./js/ui-common.js",
  "./js/ui-home.js",
  "./js/ui-accounts.js",
  "./js/ui-data.js",
  "./js/main.js",
  "./test.html",
  "./js/tests.js"
];

self.addEventListener("install",event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
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
    fetch(request).then(response => {
      if (response && response.ok) {
        const responseCopy = response.clone();
        return caches.open(CACHE_NAME)
          .then(cache => cache.put(request,responseCopy))
          .then(() => response);
      }
      return response;
    }).catch(() => caches.match(request).then(cached => {
      if (cached) return cached;
      if (request.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    }))
  );
});
