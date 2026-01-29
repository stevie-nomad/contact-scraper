// Browser API compatibility layer
(function(global, factory) {
  if (typeof define === 'function' && define.amd) {
    define('webextension-polyfill', ['module'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(module);
  } else {
    var mod = {
      exports: {}
    };
    factory(mod);
    global.browser = mod.exports;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function(module) {
  'use strict';

  if (typeof browser === 'undefined' || Object.getPrototypeOf(browser) !== Object.prototype) {
    const CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE = 'The message port closed before a response was received.';

    const wrapAPIs = () => {
      const apiMetadata = {
        storage: ['local', 'sync', 'managed', 'session'],
        runtime: ['connect', 'sendMessage', 'onMessage', 'getManifest'],
        tabs: ['query', 'sendMessage', 'update', 'onUpdated', 'onActivated'],
        downloads: ['download']
      };

      const wrappedAPIs = {};

      for (const namespace of Object.keys(apiMetadata)) {
        wrappedAPIs[namespace] = {};
        
        if (!chrome[namespace]) {
          continue;
        }

        for (const key of apiMetadata[namespace]) {
          if (chrome[namespace][key]) {
            if (typeof chrome[namespace][key] === 'function') {
              wrappedAPIs[namespace][key] = (...args) => {
                return new Promise((resolve, reject) => {
                  chrome[namespace][key](...args, (...results) => {
                    if (chrome.runtime.lastError) {
                      if (chrome.runtime.lastError.message === CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE) {
                        resolve();
                      } else {
                        reject(chrome.runtime.lastError);
                      }
                    } else {
                      resolve(results.length > 1 ? results : results[0]);
                    }
                  });
                });
              };
            } else {
              wrappedAPIs[namespace][key] = chrome[namespace][key];
            }
          }
        }
      }

      return wrappedAPIs;
    };

    module.exports = wrapAPIs();
  } else {
    module.exports = browser;
  }
}); 