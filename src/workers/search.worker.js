/* eslint-env worker */
import { searchAndSpeed } from '../util/logic';

let pendingSearch = null;
let activeCancelToken = null;
let isProcessing = false;

const runPendingSearches = async() => {
    if (isProcessing) { return; }
    isProcessing = true;

    while (pendingSearch) {
        const request = pendingSearch;
        pendingSearch = null;
        const { requestId } = request;
        const cancelToken = { current: false };
        activeCancelToken = cancelToken;

        try {
            const startedAt = performance.now();
            const params = {
                ...request.params,
                cancelToken,
                partialResultFunc: (results, profile) => {
                    if (cancelToken.current) { return; }
                    self.postMessage({
                        type: 'partial',
                        requestId,
                        response: JSON.parse(JSON.stringify({
                            results,
                            profile,
                            seconds: (performance.now() - startedAt) / 1000
                        }))
                    });
                }
            };
            const response = await searchAndSpeed(params, request.useCached);
            if (cancelToken.current) { continue; }
            // Keep the worker boundary strictly data-only. Some generated result objects retain
            // values that browsers reject with DataCloneError even though React never uses them.
            const transferableResponse = JSON.parse(JSON.stringify(response));
            self.postMessage({ type: 'done', requestId, response: transferableResponse });
        } catch (error) {
            if (!cancelToken.current) {
                self.postMessage({
                    type: 'error',
                    requestId,
                    message: error?.message || String(error),
                    stack: error?.stack || ''
                });
            }
        } finally {
            if (activeCancelToken === cancelToken) {
                activeCancelToken = null;
            }
        }
    }

    isProcessing = false;
};

self.onmessage = event => {
    const message = event.data;
    if (message.type === 'cancel') {
        if (activeCancelToken) { activeCancelToken.current = true; }
        pendingSearch = null;
        return;
    }

    if (message.type !== 'search') { return; }
    if (activeCancelToken) { activeCancelToken.current = true; }
    pendingSearch = message;
    runPendingSearches();
};
