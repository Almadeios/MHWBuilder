import { useCallback, useEffect, useRef, useState } from 'react';
import { DEBUG } from '../util/constants';
import {
  createBonusExplorationCacheKey, createBonusProgress, summarizeBonusWorkerStats
} from '../util/bonusExplorerState';

const WORKER_COUNT = 3;
const MAX_CACHE_ENTRIES = 10;
const createWorker = () => new Worker(
  new URL('../workers/bonusExplorer.worker.js', import.meta.url),
  { type: 'module' }
);

export const useBonusExplorer = ({ onElapsed, onResult }) => {
  const [isExploring, setIsExploring] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progress, setProgress] = useState(createBonusProgress());
  const callbacksRef = useRef({ onElapsed, onResult });
  const workersRef = useRef([]);
  const statsRef = useRef(null);
  const cacheRef = useRef(new Map());
  const startedAtRef = useRef(0);
  callbacksRef.current = { onElapsed, onResult };

  const terminate = useCallback(() => {
    workersRef.current.forEach(worker => worker.terminate());
    workersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    terminate();
    statsRef.current = null;
    setIsExploring(false);
    setProgressPercent(0);
    setProgress(createBonusProgress());
  }, [terminate]);

  const stop = useCallback(() => {
    terminate();
    statsRef.current = null;
    setIsExploring(false);
    setProgressPercent(0);
    setProgress(current => ({
      ...current,
      status: current.total > 0 ? 'cancelled' : 'idle'
    }));
  }, [terminate]);

  const start = useCallback(params => {
    if (!(params.priorResults || []).length || statsRef.current) { return false; }
    const cacheKey = createBonusExplorationCacheKey(params);
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      cached.resultMessages.forEach(message => callbacksRef.current.onResult?.(message));
      setProgress(cached.progress);
      setProgressPercent(100);
      callbacksRef.current.onElapsed?.(cached.elapsedSeconds);
      return true;
    }

    startedAtRef.current = performance.now();
    setIsExploring(true);
    setProgressPercent(0);
    setProgress(createBonusProgress('running'));
    statsRef.current = {
      workers: Array.from({ length: WORKER_COUNT }, () => ({ completed: 0, total: 0 })),
      done: 0,
      found: 0,
      timedOut: 0,
      initial: 0,
      feasible: 0,
      resultMessages: [],
      cacheKey
    };

    const handleMessage = event => {
      const message = event.data;
      const stats = statsRef.current;
      if (!stats) { return; }
      if (message.type === 'result') {
        stats.resultMessages.push(message);
        callbacksRef.current.onResult?.(message);
      } else if (message.type === 'init') {
        stats.workers[message.workerIndex].total = message.assigned;
        stats.initial = message.initialCount;
        stats.feasible = message.feasibleCount;
      } else if (message.type === 'progress') {
        stats.workers[message.workerIndex].completed = message.completed;
        stats.workers[message.workerIndex].total = message.total;
        if (message.found) { stats.found++; }
        if (message.timedOut) { stats.timedOut++; }
        const nextProgress = summarizeBonusWorkerStats(stats);
        setProgressPercent(nextProgress.total ? nextProgress.completed / nextProgress.total * 100 : 0);
        setProgress(nextProgress);
      } else if (message.type === 'done') {
        stats.done++;
        if (stats.done < WORKER_COUNT) { return; }
        const elapsedSeconds = (performance.now() - startedAtRef.current) / 1000;
        const completedProgress = summarizeBonusWorkerStats(
          stats, stats.timedOut > 0 ? 'partial' : 'complete'
        );
        if (stats.timedOut === 0) {
          const cache = cacheRef.current;
          if (cache.size >= MAX_CACHE_ENTRIES) { cache.delete(cache.keys().next().value); }
          cache.set(stats.cacheKey, {
            resultMessages: stats.resultMessages,
            progress: completedProgress,
            elapsedSeconds
          });
        }
        setProgress(completedProgress);
        setProgressPercent(100);
        callbacksRef.current.onElapsed?.(elapsedSeconds);
        terminate();
        statsRef.current = null;
        setIsExploring(false);
      } else if (message.type === 'candidate-error' && DEBUG) {
        console.warn(`Bonus exploration failed for ${message.skillName}: ${message.message}`);
      }
    };

    workersRef.current = Array.from({ length: WORKER_COUNT }, (_, workerIndex) => {
      const worker = createWorker();
      worker.onmessage = handleMessage;
      worker.onerror = error => {
        console.error('Bonus exploration worker failed:', error);
        stop();
      };
      worker.postMessage({ ...params, workerIndex, workerCount: WORKER_COUNT });
      return worker;
    });
    return true;
  }, [stop, terminate]);

  useEffect(() => terminate, [terminate]);

  return {
    isExploring,
    progress,
    progressPercent,
    reset,
    start,
    stop
  };
};
