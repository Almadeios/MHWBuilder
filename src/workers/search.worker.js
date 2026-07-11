/* eslint-env worker */
import { searchAndSpeed } from '../util/logic';

self.onmessage = async event => {
    try {
        const response = await searchAndSpeed(event.data.params, event.data.useCached);
        self.postMessage({ type: 'done', response });
    } catch (error) {
        self.postMessage({
            type: 'error',
            message: error?.message || String(error),
            stack: error?.stack || ''
        });
    }
};
