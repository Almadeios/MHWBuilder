export const createSearchWorker = () => new Worker(
    new URL('./search.worker.js', import.meta.url),
    { type: 'module' }
);
