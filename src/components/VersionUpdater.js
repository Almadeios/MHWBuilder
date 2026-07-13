import { useEffect } from 'react';
import { getVersionedReloadUrl, shouldReloadForVersion } from '../util/appVersion';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const ATTEMPTED_VERSION_KEY = 'attemptedAppVersion';

const VersionUpdater = () => {
  useEffect(() => {
    // CRA injects these build-time values; they are not runtime environment access.
    // eslint-disable-next-line no-process-env
    const currentVersion = process.env.REACT_APP_BUILD_SHA;
    if (!currentVersion) { return undefined; }

    let active = true;
    const checkForUpdate = async() => {
      try {
        // eslint-disable-next-line no-process-env
        const base = process.env.PUBLIC_URL || '';
        const response = await fetch(`${base}/version.json?_=${Date.now()}`, { cache: 'no-store' });
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
