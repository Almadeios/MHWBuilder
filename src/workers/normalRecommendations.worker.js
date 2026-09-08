/* eslint-env worker */
import { searchAndSpeed } from '../util/logic';
import { discoverSharedSlotRecommendations, verifyNormalRecommendation } from '../util/normalRecommendations';

self.onmessage = async({ data }) => {
    try {
        if (data.candidate.kind === 'capacity') {
            const batch = await discoverSharedSlotRecommendations(data.params, searchAndSpeed,
                update => self.postMessage({ type: 'batch', ...update }));
            self.postMessage({ type: 'batch', ...batch, done: true });
            return;
        }
        self.postMessage(await verifyNormalRecommendation(data.params, data.candidate, data.budgetMs, searchAndSpeed));
    } catch (error) {
        if (data.candidate.kind === 'capacity') {
            self.postMessage({ type: 'batch', recommendations: {}, done: true, error: String(error) });
            return;
        }
        self.postMessage({ candidate: data.candidate, results: [], status: 'unresolved', error: String(error) });
    }
};
