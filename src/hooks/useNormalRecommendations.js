import { useCallback, useEffect, useRef, useState } from 'react';
import { getNormalRecommendationCandidates } from '../util/normalRecommendations';

export const useNormalRecommendations = () => {
    const [state, setState] = useState({ status: 'idle', recommendations: {}, remaining: 0, total: 0 });
    const runRef = useRef(null);
    const clearWorkers = useCallback(() => {
        const run = runRef.current;
        if (!run) { return; }
        clearTimeout(run.timer);
        run.workers.forEach(worker => worker.terminate());
        run.workers = [];
        run.active = false;
    }, []);
    const reset = useCallback(() => {
        clearWorkers();
        runRef.current = null;
        setState({ status: 'idle', recommendations: {}, remaining: 0, total: 0 });
    }, [clearWorkers]);
    useEffect(() => clearWorkers, [clearWorkers]);

    const start = useCallback((params, resume = false) => {
        clearWorkers();
        const previous = resume ? runRef.current : null;
        const candidates = previous ? [...previous.pending.values()] : getNormalRecommendationCandidates(params);
        const run = { params: previous?.params || params, workers: [], active: true,
            queue: previous?.capacityChecked ? [...candidates] : [{ kind: 'capacity' }],
            capacityChecked: previous?.capacityChecked || false,
            pending: new Map(candidates.map(candidate => [candidate.name, candidate])),
            recommendations: { ...previous?.recommendations }, total: previous?.total || candidates.length,
            budgetMs: previous ? Math.min(30000, previous.budgetMs * 2) : 8000 };
        runRef.current = run;
        const publish = status => setState({ status, recommendations: { ...run.recommendations },
            remaining: run.pending.size, total: run.total, phase: previous ? 'deep' : 'quick' });
        const finish = () => {
            if (runRef.current !== run || !run.active) { return; }
            clearWorkers();
            publish(run.pending.size ? 'paused' : 'complete');
        };
        run.busy = 0;
        const dispatch = worker => {
            if (!run.active) { return; }
            const candidate = run.queue.shift();
            if (!candidate) {
                if (!run.busy) { finish(); }
                return;
            }
            run.busy++;
            worker.postMessage({ params: { ...run.params, recommendationDeepSlots: Boolean(previous) },
                candidate, budgetMs: run.budgetMs });
        };
        publish('running');
        if (!candidates.length) { finish(); return; }
        run.timer = setTimeout(finish, 60000);
        try {
            for (let i = 0; i < (previous ? 2 : 1); i++) {
                const worker = new Worker(new URL('../workers/normalRecommendations.worker.js', import.meta.url),
                    { type: 'module' });
                run.workers.push(worker);
                worker.onmessage = ({ data }) => {
                    if (runRef.current !== run || !run.active) { return; }
                    if (data.type === 'batch') {
                        Object.entries(data.recommendations).forEach(([name, info]) => {
                            run.recommendations[name] = info;
                            const candidate = run.pending.get(name);
                            if (!candidate) { return; }
                            if (info.level >= candidate.max) { run.pending.delete(name); } else {
                                run.pending.set(name, { ...candidate, level: info.level + 1 });
                            }
                        });
                        publish('running');
                        if (data.done) {
                            run.busy--;
                            if (previous) {
                                run.capacityChecked = true;
                                run.queue = [...run.pending.values()];
                                run.workers.forEach(dispatch);
                            } else { dispatch(worker); }
                        }
                        return;
                    }
                    run.busy--;
                    const candidate = data.candidate;
                    if (data.status !== 'unresolved') { run.pending.delete(candidate.name); }
                    if (data.status === 'proven') {
                        run.recommendations[candidate.name] = {
                            level: candidate.level, addedLevel: candidate.level - (run.params.skills[candidate.name] || 0),
                            slotTypes: candidate.slotTypes.length ? candidate.slotTypes : ['armor'],
                            seedResults: data.results, verifiedBy: 'optimizer'
                        };
                        if (candidate.level < candidate.max) {
                            const next = { ...candidate, level: candidate.level + 1 };
                            run.pending.set(next.name, next);
                            run.queue.push(next); // Check other skills before maximizing this one.
                        }
                    }
                    publish('running');
                    dispatch(worker);
                };
                worker.onerror = finish;
                dispatch(worker);
            }
        } catch {
            finish();
        }
    }, [clearWorkers]);
    const stop = useCallback(() => {
        clearWorkers();
        setState(current => ({ ...current, status: 'paused' }));
    }, [clearWorkers]);
    return { ...state, start, reset, stop };
};
