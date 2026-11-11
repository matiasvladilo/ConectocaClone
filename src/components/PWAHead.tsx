import { useEffect } from 'react';

/**
 * PWAHead component
 * Adds all necessary meta tags and links for PWA functionality
 * Should be included once in the main App component
 */
export function PWAHead() {
  useEffect(() => {
    const head = document.head;

    // Remove existing PWA meta tags to avoid duplicates
    const existingMetas = head.querySelectorAll('[data-pwa-meta]');
    existingMetas.forEach(meta => meta.remove());

    // Manifest link
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '/manifest.json';
    manifestLink.setAttribute('data-pwa-meta', 'true');
    head.appendChild(manifestLink);

    // Theme color
    const themeColor = document.createElement('meta');
    themeColor.name = 'theme-color';
    themeColor.content = '#1e40af';
    themeColor.setAttribute('data-pwa-meta', 'true');
    head.appendChild(themeColor);

    // Apple-specific meta tags
    const appleMobileWebAppCapable = document.createElement('meta');
    appleMobileWebAppCapable.name = 'apple-mobile-web-app-capable';
    appleMobileWebAppCapable.content = 'yes';
    appleMobileWebAppCapable.setAttribute('data-pwa-meta', 'true');
    head.appendChild(appleMobileWebAppCapable);

    const appleMobileWebAppStatusBar = document.createElement('meta');
    appleMobileWebAppStatusBar.name = 'apple-mobile-web-app-status-bar-style';
    appleMobileWebAppStatusBar.content = 'black-translucent';
    appleMobileWebAppStatusBar.setAttribute('data-pwa-meta', 'true');
    head.appendChild(appleMobileWebAppStatusBar);

    const appleMobileWebAppTitle = document.createElement('meta');
    appleMobileWebAppTitle.name = 'apple-mobile-web-app-title';
    appleMobileWebAppTitle.content = 'CONECTOCA';
    appleMobileWebAppTitle.setAttribute('data-pwa-meta', 'true');
    head.appendChild(appleMobileWebAppTitle);

    // Apple touch icons
    const appleTouchIcon = document.createElement('link');
    appleTouchIcon.rel = 'apple-touch-icon';
    appleTouchIcon.href = '/icons/icon-192x192.png';
    appleTouchIcon.setAttribute('data-pwa-meta', 'true');
    head.appendChild(appleTouchIcon);

    const appleTouchIconPrecomposed = document.createElement('link');
    appleTouchIconPrecomposed.rel = 'apple-touch-icon-precomposed';
    appleTouchIconPrecomposed.href = '/icons/icon-192x192.png';
    appleTouchIconPrecomposed.setAttribute('data-pwa-meta', 'true');
    head.appendChild(appleTouchIconPrecomposed);

    // Apple splash screens - iPhone
    const addAppleSplashScreen = (
      width: number,
      height: number,
      ratio: number,
      orientation: 'portrait' | 'landscape' = 'portrait'
    ) => {
      const splash = document.createElement('link');
      splash.rel = 'apple-touch-startup-image';
      splash.href = '/icons/icon-512x512.png'; // Using icon as placeholder
      splash.media = `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`;
      splash.setAttribute('data-pwa-meta', 'true');
      head.appendChild(splash);
    };

    // iPhone 14 Pro Max, 14 Plus, 13 Pro Max, 12 Pro Max
    addAppleSplashScreen(430, 932, 3);
    // iPhone 14 Pro, 13 Pro, 12 Pro
    addAppleSplashScreen(393, 852, 3);
    // iPhone 14, 13, 12
    addAppleSplashScreen(390, 844, 3);
    // iPhone SE 3rd Gen, 8, 7, 6s
    addAppleSplashScreen(375, 667, 2);

    // Microsoft Tile
    const msapplicationTileColor = document.createElement('meta');
    msapplicationTileColor.name = 'msapplication-TileColor';
    msapplicationTileColor.content = '#1e40af';
    msapplicationTileColor.setAttribute('data-pwa-meta', 'true');
    head.appendChild(msapplicationTileColor);

    const msapplicationTileImage = document.createElement('meta');
    msapplicationTileImage.name = 'msapplication-TileImage';
    msapplicationTileImage.content = '/icons/icon-144x144.png';
    msapplicationTileImage.setAttribute('data-pwa-meta', 'true');
    head.appendChild(msapplicationTileImage);

    // Favicon
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/png';
    favicon.href = '/icons/icon-192x192.png';
    favicon.setAttribute('data-pwa-meta', 'true');
    head.appendChild(favicon);

    // Description
    const description = document.createElement('meta');
    description.name = 'description';
    description.content = 'CONECTOCA - Gestión de pedidos y producción';
    description.setAttribute('data-pwa-meta', 'true');
    head.appendChild(description);

    // Application name
    const applicationName = document.createElement('meta');
    applicationName.name = 'application-name';
    applicationName.content = 'CONECTOCA';
    applicationName.setAttribute('data-pwa-meta', 'true');
    head.appendChild(applicationName);

    // Mobile-web-app-capable
    const mobileWebAppCapable = document.createElement('meta');
    mobileWebAppCapable.name = 'mobile-web-app-capable';
    mobileWebAppCapable.content = 'yes';
    mobileWebAppCapable.setAttribute('data-pwa-meta', 'true');
    head.appendChild(mobileWebAppCapable);

    return () => {
      // Cleanup on unmount
      const metas = head.querySelectorAll('[data-pwa-meta]');
      metas.forEach(meta => meta.remove());
    };
  }, []);

  return null;
}
