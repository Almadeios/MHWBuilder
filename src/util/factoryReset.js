export const clearAppData = async({
    localStorageArea = window.localStorage,
    sessionStorageArea = window.sessionStorage,
    cacheStorage = window.caches
} = {}) => {
    localStorageArea.clear();
    sessionStorageArea.clear();

    if (cacheStorage?.keys) {
        const cacheNames = await cacheStorage.keys();
        await Promise.all(cacheNames.map(cacheName => cacheStorage.delete(cacheName)));
    }
};
