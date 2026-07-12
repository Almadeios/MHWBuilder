/* eslint-env worker */
import { searchAndSpeed } from '../util/logic';

self.onmessage = async event => {
    try {
        const startedAt = performance.now();
        const params = {
            ...event.data.params,
            partialResultFunc: (results, profile) => {
                self.postMessage({
                    type: 'partial',
                    response: JSON.parse(JSON.stringify({
                        results,
                        profile,
                        seconds: (performance.now() - startedAt) / 1000
                    }))
                });
            }
        };
        const response = await searchAndSpeed(params, event.data.useCached);
        // Keep the worker boundary strictly data-only. Some generated result objects retain
        // values that browsers reject with DataCloneError even though React never uses them.
        const transferableResponse = JSON.parse(JSON.stringify(response));
        self.postMessage({ type: 'done', response: transferableResponse });
    } catch (error) {
        self.postMessage({
            type: 'error',
            message: error?.message || String(error),
            stack: error?.stack || ''
        });
    }
};
