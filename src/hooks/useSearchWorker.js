import { useCallback, useEffect, useRef, useState } from 'react';
import { createSearchWorker } from '../workers/createSearchWorker';

export const useSearchWorker = ({ onPartial, onDone, onError, onStateChange }) => {
  const callbacksRef = useRef({ onPartial, onDone, onError, onStateChange });
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const [state, setState] = useState({ status: 'idle', requestId: null });
  callbacksRef.current = { onPartial, onDone, onError, onStateChange };

  const updateState = useCallback(nextState => {
    setState(nextState);
    callbacksRef.current.onStateChange?.(nextState);
  }, []);

  const terminate = useCallback(() => {
    const worker = workerRef.current;
    workerRef.current = null;
    worker?.terminate();
  }, []);

  const getWorker = useCallback(() => {
    if (workerRef.current) { return workerRef.current; }

    const worker = createSearchWorker();
    workerRef.current = worker;
    worker.onmessage = event => {
      const message = event.data;
      if (message.requestId !== requestIdRef.current) { return; }

      if (message.type === 'partial') {
        callbacksRef.current.onPartial?.(message.response);
      } else if (message.type === 'done') {
        callbacksRef.current.onDone?.(message.response);
      } else if (message.type === 'error') {
        callbacksRef.current.onError?.({
          message: message.message || 'Search worker failed.',
          stack: message.stack || ''
        });
      } else if (message.type === 'state') {
        updateState(message.state);
      }
    };
    worker.onerror = error => {
      callbacksRef.current.onError?.({
        message: error?.message || 'Search worker failed to start.',
        stack: ''
      });
      updateState({
        status: 'failed',
        requestId: requestIdRef.current,
        error: { message: error?.message || 'Search worker failed to start.', stack: '' }
      });
      if (workerRef.current === worker) { terminate(); }
    };
    return worker;
  }, [terminate, updateState]);

  const start = useCallback((params, useCached = false) => {
    const requestId = ++requestIdRef.current;
    updateState({ status: 'queued', requestId });
    getWorker().postMessage({ type: 'search', requestId, params, useCached });
    return requestId;
  }, [getWorker, updateState]);

  const cancel = useCallback(() => {
    const requestId = requestIdRef.current;
    requestIdRef.current++;
    // Search is CPU-bound. Termination stops it immediately; a message would wait
    // until the worker's event loop became available again.
    terminate();
    updateState({ status: 'cancelled', requestId, cancelReason: 'user' });
  }, [terminate, updateState]);

  useEffect(() => terminate, [terminate]);

  return { start, cancel, state, terminate };
};
