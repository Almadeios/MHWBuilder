import packageJson from '../../package.json';

export const APP_VERSION = packageJson.version;

export const shouldReloadForVersion = (currentVersion, publishedVersion, attemptedVersion) => {
  return Boolean(
    currentVersion &&
    publishedVersion &&
    currentVersion !== publishedVersion &&
    attemptedVersion !== publishedVersion
  );
};

export const getVersionedReloadUrl = (href, publishedVersion) => {
  const url = new URL(href);
  url.searchParams.set('appVersion', publishedVersion);
  return url.toString();
};
