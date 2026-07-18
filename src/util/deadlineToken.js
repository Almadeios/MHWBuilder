export const createDeadlineToken = ({
    budgetMs,
    cancelToken,
    now = () => performance.now()
}) => {
    const startedAt = now();
    const deadline = startedAt + Math.max(0, Number(budgetMs || 0));
    let timedOut = false;

    return {
        deadline,
        startedAt,
        get current() {
            if (!timedOut && budgetMs > 0 && now() >= deadline) {
                timedOut = true;
            }
            return timedOut || Boolean(cancelToken?.current);
        },
        get timedOut() {
            return timedOut;
        }
    };
};
