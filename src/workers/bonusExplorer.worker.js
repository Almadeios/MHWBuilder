/* eslint-env worker */
import { searchAndSpeed } from '../util/logic';
import SET_SKILLS from '../data/compact/set-skills.json';
import GROUP_SKILLS from '../data/compact/group-skills.json';
import TALISMANS from '../data/compact/talisman.json';
import {
    buildCandidateVerificationParams,
    getBonusCandidatePriority,
    getFastBonusProofLevels,
    getBonusRecommendationCandidates,
    getBoundedRecommendationSearchMs,
    getUnsearchedBonusLevels,
    isBonusWitnessImprovement,
    partitionRecommendationCandidates
} from '../util/bonusRecommendation';
import { buildBonusFeasibilityIndex } from '../util/bonusFeasibility';
import { BONUS_EXPLORATION_WALL_BUDGET_MS } from '../util/bonusExplorerState';
import { findLocalBonusWitnesses } from '../util/bonusNeighborhood';
import HEAD from '../data/compact/head.json';
import CHEST from '../data/compact/chest.json';
import ARMS from '../data/compact/arms.json';
import WAIST from '../data/compact/waist.json';
import LEGS from '../data/compact/legs.json';

const FAST_CANDIDATE_BUDGET_MS = 1700;
const MINIMUM_SEARCH_BUDGET_MS = 100;
const LOCAL_WITNESS_BUDGET_MS = 2500;
const LARGE_BONUS_POOL_THRESHOLD = 40;
const LARGE_BONUS_POOL_BUDGET_MS = 5000;
const ARMOR_DATA = { ...HEAD, ...CHEST, ...ARMS, ...WAIST, ...LEGS };

const candidateId = candidate => `${candidate.sourceType}:${candidate.skillName}`;
const postCandidateStatus = (candidate, status, details = {}) => self.postMessage({
    type: 'candidate-status',
    candidateId: candidateId(candidate),
    candidate: {
        skillName: candidate.skillName,
        sourceType: candidate.sourceType,
        currentLevel: candidate.currentLevel,
        maxLevel: candidate.maxLevel,
        requiredPoints: candidate.requiredPoints,
        reachablePoints: candidate.reachablePoints,
        contributorPieceCount: candidate.contributorPieceCount,
        feasibleByArmorCount: candidate.feasibleByArmorCount,
        status,
        ...details
    }
});
const getVerificationStatus = (best, timedOut) => {
    if (best) { return 'proven'; }
    return timedOut ? 'unresolved' : 'impossible';
};

const verifyCandidate = async(
    params, candidate, startingBest = null, maxSearchMs, explorationDeadline,
    { levels = null, continueAfterProof = false } = {}
) => {
    const currentLevel = Math.max(candidate.currentLevel, startingBest?.level || 0);
    const levelsToTry = levels || getUnsearchedBonusLevels(currentLevel, candidate.maxLevel);
    let best = startingBest ? {
        level: startingBest.level,
        results: [startingBest.result]
    } : null;
    let timedOut = false;

    for (const level of levelsToTry) {
        const remainingMs = getBoundedRecommendationSearchMs(
            explorationDeadline, maxSearchMs
        );
        if (remainingMs < MINIMUM_SEARCH_BUDGET_MS) {
            timedOut = true;
            break;
        }
        try {
            // Candidate fallbacks are exact ordinary searches. Keeping the batch discovery
            // vector here made a one-bonus proof much larger than the equivalent manual search.
            const searchParams = buildCandidateVerificationParams(
                params, candidate, level, remainingMs
            );
            const response = await searchAndSpeed(searchParams);
            if (response.results?.length) {
                if (!best || level > best.level) {
                    best = { level, results: response.results };
                }
                if (!continueAfterProof) {
                    // Exact continuation levels are tested maximum-first.
                    break;
                }
            } else {
                const searchTimedOut = Boolean(response.profile?.timedOut);
                timedOut = timedOut || searchTimedOut;
            }
        } catch (error) {
            self.postMessage({
                type: 'candidate-error',
                skillName: candidate.skillName,
                message: error?.message || String(error)
            });
            timedOut = true;
        }
    }

    return { best, timedOut };
};

const getCandidates = params => {
    const allBonusCandidates = getBonusRecommendationCandidates(
        params, SET_SKILLS, GROUP_SKILLS
    );
    const bonusDiscoveryCandidates = allBonusCandidates.filter(candidate =>
        candidate.sourceType.startsWith('discover-')
    );
    const regularCandidates = allBonusCandidates.filter(candidate =>
        !candidate.sourceType.startsWith('discover-')
    );
    const allowedCandidateIds = params.recommendationCandidateIds?.length ?
        new Set(params.recommendationCandidateIds) : null;
    const allCandidates = [...regularCandidates, ...bonusDiscoveryCandidates]
        .filter(candidate => !allowedCandidateIds || allowedCandidateIds.has(candidateId(candidate)));
    const indexedCandidates = buildBonusFeasibilityIndex(
        ARMOR_DATA,
        params,
        allCandidates
    ).map(candidate => ({
        ...candidate,
        resumeLevel: Number(params.recommendationStartingLevels?.[candidateId(candidate)] || 0)
    })).sort((a, b) =>
        getBonusCandidatePriority(b) - getBonusCandidatePriority(a) ||
        b.score - a.score ||
        a.skillName.localeCompare(b.skillName)
    );
    const feasibleCandidates = indexedCandidates
        .filter(candidate => candidate.feasibleByArmorCount && candidate.score > 0);
    const assignedCandidates = partitionRecommendationCandidates(
        indexedCandidates, params.workerIndex, params.workerCount
    );
    const assignedFeasibleCandidates = assignedCandidates.filter(candidate =>
        candidate.feasibleByArmorCount && candidate.score > 0
    );
    const feasibleDiscoveryCandidates = feasibleCandidates.filter(candidate =>
        candidate.sourceType.startsWith('discover-') &&
        assignedFeasibleCandidates.includes(candidate)
    );
    const feasibleRegularCandidates = feasibleCandidates.filter(candidate =>
        !candidate.sourceType.startsWith('discover-') &&
        assignedFeasibleCandidates.includes(candidate)
    );
    return {
        candidates: feasibleRegularCandidates,
        discoveryCandidates: feasibleDiscoveryCandidates,
        rejectedCandidates: assignedCandidates.filter(candidate =>
            !candidate.feasibleByArmorCount || candidate.score <= 0
        ),
        initialCount: allCandidates.length,
        feasibleCount: feasibleCandidates.length
    };
};

self.onmessage = async event => {
    const params = event.data;
    const explorationBudgetMs = Math.max(
        BONUS_EXPLORATION_WALL_BUDGET_MS,
        Number(params.recommendationBudgetMs || 0)
    );
    const explorationDeadline = performance.now() + explorationBudgetMs;
    const exhaustiveCandidateBudgetMs = Math.max(
        MINIMUM_SEARCH_BUDGET_MS,
        Number(params.recommendationCandidateBudgetMs || explorationBudgetMs)
    );
    const {
        candidates, discoveryCandidates, rejectedCandidates, initialCount, feasibleCount
    } = getCandidates(params);
    const totalWork = candidates.length + discoveryCandidates.length;
    self.postMessage({
        type: 'init',
        workerIndex: params.workerIndex,
        assigned: totalWork,
        initialCount,
        feasibleCount,
        budgetMs: explorationBudgetMs
    });
    rejectedCandidates.forEach(candidate => postCandidateStatus(candidate, 'impossible', {
        reason: 'armor-points',
        requiredPoints: candidate.requiredPoints,
        reachablePoints: candidate.reachablePoints
    }));
    [...candidates, ...discoveryCandidates].forEach(candidate =>
        postCandidateStatus(candidate, 'queued')
    );

    let completed = 0;
    const localCandidates = [...candidates, ...discoveryCandidates];
    const localWitnesses = findLocalBonusWitnesses({
        armorData: ARMOR_DATA,
        candidates: localCandidates,
        deadlineAt: Math.min(
            explorationDeadline,
            performance.now() + LOCAL_WITNESS_BUDGET_MS
        ),
        params,
        results: params.priorResults || [],
        talismans: TALISMANS
    });
    const resolvedLocalWitnesses = new Map([...localWitnesses].filter(([skillName, witness]) => {
        const candidate = localCandidates.find(item => item.skillName === skillName);
        return isBonusWitnessImprovement(candidate, witness.level);
    }));
    localCandidates.forEach(candidate => {
        const witness = resolvedLocalWitnesses.get(candidate.skillName);
        if (!witness) { return; }
        self.postMessage({
            type: 'result',
            candidate: { ...candidate, level: witness.level, verifiedBy: 'local-armor-swap' },
            seedResults: [witness.result]
        });
        postCandidateStatus(candidate, 'proven', {
            level: witness.level,
            verifiedBy: 'local-armor-swap'
        });
        completed++;
        self.postMessage({
            type: 'progress',
            workerIndex: params.workerIndex,
            completed,
            total: totalWork,
            found: true,
            timedOut: false,
            durationMs: 0,
            skillName: candidate.skillName
        });
    });
    const pendingCandidates = [...candidates, ...discoveryCandidates].filter(candidate =>
        !resolvedLocalWitnesses.has(candidate.skillName)
    );
    for (const candidate of pendingCandidates) {
        const candidateStartedAt = performance.now();
        const startingBest = candidate.resumeLevel ? { level: candidate.resumeLevel, result: null } : null;
        postCandidateStatus(candidate, 'verifying', startingBest ? { level: startingBest.level } : {});
        const fastDeadline = Math.min(
            explorationDeadline,
            performance.now() + FAST_CANDIDATE_BUDGET_MS
        );
        const exhaustiveDeadline = Math.min(
            explorationDeadline,
            performance.now() + (candidate.contributorPieceCount >= LARGE_BONUS_POOL_THRESHOLD ?
                Math.min(exhaustiveCandidateBudgetMs, LARGE_BONUS_POOL_BUDGET_MS) :
                exhaustiveCandidateBudgetMs)
        );
        const fastLevels = getFastBonusProofLevels(
            candidate.currentLevel, candidate.maxLevel
        );
        const { best, timedOut } = await verifyCandidate(
            params,
            candidate,
            startingBest,
            params.recommendationResume ? exhaustiveCandidateBudgetMs : FAST_CANDIDATE_BUDGET_MS,
            params.recommendationResume ? exhaustiveDeadline : fastDeadline,
            params.recommendationResume ? {} : {
                levels: fastLevels,
                continueAfterProof: true
            }
        );

        const foundNew = Boolean(best && (!startingBest || best.level > startingBest.level));
        if (foundNew) {
            self.postMessage({
                type: 'result',
                candidate: {
                    ...candidate,
                    level: best.level,
                    verifiedBy: params.recommendationResume ? 'exact-fallback' : 'fast-directed-proof'
                },
                seedResults: best.results
            });
        }
        postCandidateStatus(candidate, getVerificationStatus(best, timedOut), {
            ...best ? { level: best.level } : {},
            maxUnresolved: Boolean(best && best.level < candidate.maxLevel && timedOut),
            ...timedOut ? {
                reason: candidate.contributorPieceCount >= LARGE_BONUS_POOL_THRESHOLD ?
                    'large-pool-timeout' :
                    performance.now() >= explorationDeadline - MINIMUM_SEARCH_BUDGET_MS ?
                        'exploration-budget' : 'timeout'
            } : {}
        });

        completed++;
        self.postMessage({
            type: 'progress',
            workerIndex: params.workerIndex,
            completed,
            total: totalWork,
            found: foundNew,
            timedOut,
            durationMs: performance.now() - candidateStartedAt,
            skillName: candidate.skillName
        });
    }

    self.postMessage({ type: 'done', workerIndex: params.workerIndex, total: totalWork });
};
