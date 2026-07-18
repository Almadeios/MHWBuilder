import { searchAndSpeed } from './logic';

export const OPTIMIZER_ENGINE_STATUS = Object.freeze({
    IDLE: 'idle',
    QUEUED: 'queued',
    RUNNING: 'running',
    STREAMING: 'streaming',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    FAILED: 'failed'
});

export const createOptimizerEngineState = (overrides = {}) => ({
    status: OPTIMIZER_ENGINE_STATUS.IDLE,
    requestId: null,
    startedAt: null,
    finishedAt: null,
    partialCount: 0,
    resultCount: 0,
    error: null,
    cancelReason: null,
    ...overrides
});

export const transitionOptimizerEngine = (state, event) => {
    if (event.type !== 'queue' && event.requestId !== state.requestId) {
        return state;
    }

    switch (event.type) {
    case 'queue':
        return createOptimizerEngineState({
            status: OPTIMIZER_ENGINE_STATUS.QUEUED,
            requestId: event.requestId
        });
    case 'start':
        return {
            ...state,
            status: OPTIMIZER_ENGINE_STATUS.RUNNING,
            startedAt: event.at
        };
    case 'partial':
        return {
            ...state,
            status: OPTIMIZER_ENGINE_STATUS.STREAMING,
            partialCount: state.partialCount + 1,
            resultCount: event.resultCount
        };
    case 'complete':
        return {
            ...state,
            status: OPTIMIZER_ENGINE_STATUS.COMPLETED,
            finishedAt: event.at,
            resultCount: event.resultCount
        };
    case 'cancel':
        return {
            ...state,
            status: OPTIMIZER_ENGINE_STATUS.CANCELLED,
            finishedAt: event.at,
            cancelReason: event.reason || 'cancelled'
        };
    case 'fail':
        return {
            ...state,
            status: OPTIMIZER_ENGINE_STATUS.FAILED,
            finishedAt: event.at,
            error: event.error
        };
    default:
        return state;
    }
};

const dataOnly = value => JSON.parse(JSON.stringify(value));
const resultCount = response => Array.isArray(response?.results) ? response.results.length : 0;

export class OptimizerEngine {
    constructor({
        now = () => performance.now(),
        onMessage = () => {},
        onStateChange = () => {},
        search = searchAndSpeed,
        serialize = dataOnly
    } = {}) {
        this.dependencies = { now, onMessage, onStateChange, search, serialize };
        this.state = createOptimizerEngineState();
        this.active = null;
    }

    getState() {
        return { ...this.state };
    }

    transition(event) {
        const nextState = transitionOptimizerEngine(this.state, event);
        if (nextState === this.state) { return; }
        this.state = nextState;
        this.dependencies.onStateChange(this.getState());
    }

    cancel(reason = 'cancelled') {
        if (!this.active) { return false; }
        this.active.cancelToken.current = true;
        this.transition({
            type: 'cancel',
            requestId: this.active.requestId,
            reason,
            at: this.dependencies.now()
        });
        this.active = null;
        return true;
    }

    async start({ requestId, params, useCached = false }) {
        this.cancel('superseded');
        const cancelToken = { current: false };
        const run = { requestId, cancelToken };
        this.active = run;
        this.transition({ type: 'queue', requestId });
        const startedAt = this.dependencies.now();
        this.transition({ type: 'start', requestId, at: startedAt });

        try {
            const response = await this.dependencies.search({
                ...params,
                cancelToken,
                partialResultFunc: (results, profile) => {
                    if (cancelToken.current || this.active !== run) { return; }
                    const partial = this.dependencies.serialize({
                        results,
                        profile,
                        seconds: (this.dependencies.now() - startedAt) / 1000
                    });
                    this.transition({
                        type: 'partial', requestId, resultCount: resultCount(partial)
                    });
                    this.dependencies.onMessage({ type: 'partial', requestId, response: partial });
                }
            }, useCached);

            if (cancelToken.current || this.active !== run) { return undefined; }
            const transferableResponse = this.dependencies.serialize(response);
            this.transition({
                type: 'complete',
                requestId,
                at: this.dependencies.now(),
                resultCount: resultCount(transferableResponse)
            });
            this.dependencies.onMessage({
                type: 'done', requestId, response: transferableResponse
            });
            return transferableResponse;
        } catch (error) {
            if (cancelToken.current || this.active !== run) { return undefined; }
            const serializedError = {
                message: error?.message || String(error),
                stack: error?.stack || ''
            };
            this.transition({
                type: 'fail', requestId, at: this.dependencies.now(), error: serializedError
            });
            this.dependencies.onMessage({ type: 'error', requestId, ...serializedError });
            return undefined;
        } finally {
            if (this.active === run) { this.active = null; }
        }
    }
}
