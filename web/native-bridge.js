/**
 * We HR — bridge between the web app and the We HR mobile shell.
 *
 * Inside the Android/iOS app, the shell injects a `WeHrNative` JavaScript channel. Pages call
 * native features through `WeHrBridge.call(type, payload)`, which posts
 * `{ id, type, payload }` and resolves when the app answers with `window.weHrNativeReply(id, result)`.
 * In a normal browser `WeHrBridge.available` is false and pages use web APIs instead.
 *
 * Native calls: `locate` (GPS fix), `biometric` (OS fingerprint / Face ID prompt), `device` (model/OS).
 */
(() => {
  'use strict';

  const channel = window.WeHrNative && typeof window.WeHrNative.postMessage === 'function' ? window.WeHrNative : null;
  const pending = new Map();
  let nextId = 1;

  window.weHrNativeReply = (id, result) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(result || {});
  };

  window.WeHrBridge = {
    available: Boolean(channel),
    call(type, payload = {}, timeoutMs = 60000) {
      if (!channel) return Promise.reject(new Error('NATIVE_BRIDGE_UNAVAILABLE'));
      return new Promise((resolve) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ error: 'TIMEOUT' });
        }, timeoutMs);
        pending.set(id, { resolve, timer });
        channel.postMessage(JSON.stringify({ id, type, payload }));
      });
    },
  };

  if (channel) document.documentElement.classList.add('in-app');
})();
