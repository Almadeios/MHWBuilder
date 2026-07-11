/* eslint-env worker */
import { searchAndSpeed } from '../util/logic';

self.onmessage = async event => {
    try {
        const response = await searchAndSpeed(event.data.params, event.data.useCached);
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
