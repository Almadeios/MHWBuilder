/* eslint-env worker */
import { OptimizerEngine } from '../util/optimizerEngine';

const engine = new OptimizerEngine({
    onMessage: message => self.postMessage(message),
    onStateChange: state => self.postMessage({
        type: 'state',
        requestId: state.requestId,
        state
    })
});

self.onmessage = event => {
    const message = event.data;
    if (message.type === 'cancel') {
        engine.cancel(message.reason);
        return;
    }
    if (message.type === 'search') {
        engine.start(message);
    }
};
