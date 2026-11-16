/**
 * Service Worker Registration Utility
 * Registers the service worker and handles updates
 */

export interface ServiceWorkerConfig {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: Error) => void;
}

export function registerServiceWorker(config?: ServiceWorkerConfig) {
  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers are not supported in this browser');
    return;
  }

  // Si la página ya tenía un service worker al cargar, un cambio de
  // controlador es una actualización. Si no, es la primera instalación
  // (el SW hace clients.claim()) y no hay nada que recargar.
  const hadController = Boolean(navigator.serviceWorker.controller);

  const register = () => {
    const swUrl = '/service-worker.js';

    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        console.log('[ServiceWorker] Registered successfully:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New update available
                console.log('[ServiceWorker] New content available; please refresh');
                if (config?.onUpdate) {
                  config.onUpdate(registration);
                }
              } else {
                // Content cached for offline use
                console.log('[ServiceWorker] Content cached for offline use');
                if (config?.onSuccess) {
                  config.onSuccess(registration);
                }
              }
            }
          });
        });

        // Periodically check for updates (every hour)
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      })
      .catch((error) => {
        console.error('[ServiceWorker] Registration failed:', error);
        if (config?.onError) {
          config.onError(error);
        }
      });
  };

  // Se llama desde un useEffect, que puede correr después del evento `load`
  // (pasa cuando la página carga rápido). En ese caso el listener nunca se
  // dispararía, así que registramos de inmediato.
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }

  // Handle controller change (new service worker activated)
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !refreshing) {
      refreshing = true;
      console.log('[ServiceWorker] Controller changed, reloading page');
      window.location.reload();
    }
  });
}

export function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.ready
    .then((registration) => {
      registration.unregister();
      console.log('[ServiceWorker] Unregistered');
    })
    .catch((error) => {
      console.error('[ServiceWorker] Unregistration failed:', error);
    });
}

export function clearCache() {
  if ('caches' in window) {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[Cache] Deleting:', cacheName);
          return caches.delete(cacheName);
        })
      );
    });
  }
}

export function checkForUpdates() {
  if (!('serviceWorker' in navigator)) {
    return Promise.resolve();
  }

  return navigator.serviceWorker.ready.then((registration) => {
    return registration.update();
  });
}
