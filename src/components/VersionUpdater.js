import { useEffect } from 'react';
import { getVersionedReloadUrl, shouldReloadForVersion } from '../util/appVersion';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const ATTEMPTED_VERSION_KEY = 'attemptedAppVersion';

const VersionUpdater = () => {
  useEffect(() => {
    const currentVersion = import.meta.env.VITE_BUILD_SHA;
    if (!currentVersion) { return undefined; }

    let active = true;
    const checkForUpdate = async() => {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}version.json?_=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (!response.ok || !active) { return; }
        const { version: publishedVersion } = await response.json();
        const attemptedVersion = sessionStorage.getItem(ATTEMPTED_VERSION_KEY);
        if (!shouldReloadForVersion(currentVersion, publishedVersion, attemptedVersion)) { return; }

        sessionStorage.setItem(ATTEMPTED_VERSION_KEY, publishedVersion);
        window.location.replace(getVersionedReloadUrl(window.location.href, publishedVersion));
      } catch (error) {
        // Updating is best-effort; offline users can continue using the loaded version.
      }
    };

    checkForUpdate();
    const intervalId = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') { checkForUpdate(); }
    };
    document.addEventListener('visibilitychange', checkWhenVisible);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, []);

  return null;
};

export default VersionUpdater;
