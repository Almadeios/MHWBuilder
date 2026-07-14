/* eslint-env worker */
import { searchAndSpeed } from '../util/logic';
import SKILLS from '../data/compact/skills.json';
import SET_SKILLS from '../data/compact/set-skills.json';
import GROUP_SKILLS from '../data/compact/group-skills.json';
import {
    getNewBonusDiscoveryCandidates,
    getRequestedBonusUpgradeCandidates,
    partitionRecommendationCandidates
} from '../util/bonusRecommendation';
import { buildBonusFeasibilityIndex } from '../util/bonusFeasibility';
import HEAD from '../data/compact/head.json';
import CHEST from '../data/compact/chest.json';
import ARMS from '../data/compact/arms.json';
import WAIST from '../data/compact/waist.json';
import LEGS from '../data/compact/legs.json';

const SKILL_UPGRADE_BUDGET_MS = 3000;
const BONUS_DISCOVERY_BUDGET_MS = 12000;
const BONUS_VERIFICATION_BUDGET_MS = 8000;
const BONUS_VERIFICATION_RETRY_BUDGET_MS = 16000;
const ARMOR_DATA = { ...HEAD, ...CHEST, ...ARMS, ...WAIST, ...LEGS };

const verifyCandidate = async(
    params, candidate, startingBest = null, maxSearchMs, discoveryContext = null
) => {
    let low = Math.max(candidate.currentLevel + 1, (startingBest?.level || 0) + 1);
    let high = candidate.maxLevel;
    let best = startingBest ? {
        level: startingBest.level,
        results: [startingBest.result]
    } : null;
    let timedOut = false;

    while (low <= high) {
        const level = Math.ceil((low + high) / 2);
        const skills = { ...params.skills };
        const setSkills = { ...params.setSkills };
        const groupSkills = { ...params.groupSkills };
        const isDiscoveryCandidate = candidate.sourceType.startsWith('discover-');
        if (!isDiscoveryCandidate && candidate.sourceType.endsWith('set-bonus')) {
            setSkills[candidate.skillName] = level;
        } else if (!isDiscoveryCandidate && candidate.sourceType.endsWith('group-bonus')) {
            groupSkills[candidate.skillName] = level;
        } else if (!isDiscoveryCandidate) {
            skills[candidate.skillName] = level;
        }

        try {
            const searchParams = {
                ...params,
                skills,
                setSkills,
                groupSkills,
                ...isDiscoveryCandidate ? {
                    ...discoveryContext,
                    bonusDiscoveryTargetType: candidate.sourceType === 'discover-set-bonus' ?
                        'set' : 'group',
                    bonusDiscoveryTargetName: candidate.skillName,
                    bonusDiscoveryTargetLevel: level
                } : {},
                // A previous result need not contain a newly requested armor bonus. Run the
                // directed proof from the prepared MITM data instead of restricting it to seeds.
                priorResults: [],
                limit: 1,
                findOne: true,
                maxSearchMs
            };
            let response = await searchAndSpeed(searchParams);
            if (isDiscoveryCandidate && !response.results?.length && response.profile?.timedOut) {
                response = await searchAndSpeed({
                    ...searchParams,
                    maxSearchMs: Math.max(maxSearchMs, BONUS_VERIFICATION_RETRY_BUDGET_MS)
                });
            }
            if (response.results?.length) {
                best = { level, results: response.results };
                low = level + 1;
            } else {
                timedOut = timedOut || Boolean(response.profile?.timedOut);
                high = level - 1;
            }
        } catch (error) {
            self.postMessage({
                type: 'candidate-error',
                skillName: candidate.skillName,
                message: error?.message || String(error)
            });
            timedOut = true;
            high = level - 1;
        }
    }

    return { best, timedOut };
};

const getCandidates = params => {
    const skillUpgradeCandidates = Object.entries(params.skills || {}).flatMap(([skillName, currentLevel]) => {
        const maxLevel = SKILLS[skillName] || currentLevel;
        if (currentLevel >= maxLevel) { return []; }
        return [{
            skillName,
            sourceType: 'skill',
            currentLevel,
            maxLevel,
            // Verify requested-skill upgrades before optional bonus paths.
            score: 2000000 + currentLevel
        }];
    });
    const bonusUpgradeCandidates = getRequestedBonusUpgradeCandidates(
        params, SET_SKILLS, GROUP_SKILLS
    );
    const bonusDiscoveryCandidates = getNewBonusDiscoveryCandidates(
        params, SET_SKILLS, GROUP_SKILLS
    );
    const regularCandidates = [...bonusUpgradeCandidates, ...skillUpgradeCandidates];
    const allCandidates = [...regularCandidates, ...bonusDiscoveryCandidates];
    const feasibleCandidates = buildBonusFeasibilityIndex(
        ARMOR_DATA,
        params,
        allCandidates
    )
        .filter(candidate => candidate.feasibleByArmorCount)
        .filter(candidate => candidate.score > 0)
        .sort((a, b) => b.score - a.score || a.skillName.localeCompare(b.skillName));
    const feasibleDiscoveryCandidates = feasibleCandidates.filter(candidate =>
        candidate.sourceType.startsWith('discover-')
    );
    const feasibleRegularCandidates = feasibleCandidates.filter(candidate =>
        !candidate.sourceType.startsWith('discover-')
    );
    return {
        candidates: partitionRecommendationCandidates(
            feasibleRegularCandidates, params.workerIndex, params.workerCount
        ),
        discoveryCandidates: partitionRecommendationCandidates(
            feasibleDiscoveryCandidates, params.workerIndex, params.workerCount
        ),
        initialCount: allCandidates.length,
        feasibleCount: feasibleCandidates.length
    };
};

self.onmessage = async event => {
    const params = event.data;
    const { candidates, discoveryCandidates, initialCount, feasibleCount } = getCandidates(params);
    const runsDiscovery = discoveryCandidates.length > 0;
    const totalWork = candidates.length + (runsDiscovery ? discoveryCandidates.length + 1 : 0);
    self.postMessage({
        type: 'init',
        workerIndex: params.workerIndex,
        assigned: totalWork,
        initialCount,
        feasibleCount
    });

    let completed = 0;
    const frontierBestByName = new Map();
    const setCandidates = discoveryCandidates.filter(candidate =>
        candidate.sourceType === 'discover-set-bonus'
    );
    const groupCandidates = discoveryCandidates.filter(candidate =>
        candidate.sourceType === 'discover-group-bonus'
    );
    const discoveryContext = {
        bonusDiscovery: true,
        bonusDiscoverySetNames: setCandidates.map(candidate => candidate.skillName),
        bonusDiscoveryGroupNames: groupCandidates.map(candidate => candidate.skillName)
    };
    if (runsDiscovery) {
        const discoveryStartedAt = performance.now();
        try {
            const response = await searchAndSpeed({
                ...params,
                ...discoveryContext,
                priorResults: [],
                limit: 100,
                findOne: false,
                maxSearchMs: BONUS_DISCOVERY_BUDGET_MS,
                bonusDiscoveryTargetType: '',
                bonusDiscoveryTargetName: '',
                bonusDiscoveryTargetLevel: 0
            });
            const candidateByName = new Map(
                discoveryCandidates.map(candidate => [candidate.skillName, candidate])
            );
            (response.results || []).forEach(result => {
                Object.entries(result.setSkills || {}).forEach(([skillName, level]) => {
                    if (!candidateByName.has(skillName)) { return; }
                    const current = frontierBestByName.get(skillName);
                    if (!current || level > current.level) {
                        frontierBestByName.set(skillName, { level, result });
                    }
                });
                Object.entries(result.groupSkills || {}).forEach(([skillName, level]) => {
                    if (!candidateByName.has(skillName)) { return; }
                    const current = frontierBestByName.get(skillName);
                    if (!current || level > current.level) {
                        frontierBestByName.set(skillName, { level, result });
                    }
                });
            });
            frontierBestByName.forEach(({ level, result }, skillName) => {
                const candidate = candidateByName.get(skillName);
                self.postMessage({
                    type: 'result',
                    candidate: { ...candidate, level },
                    seedResults: [result]
                });
            });
        } catch (error) {
            self.postMessage({
                type: 'candidate-error',
                skillName: 'bonus discovery frontier',
                message: error?.message || String(error)
            });
        }
        completed++;
        self.postMessage({
            type: 'progress',
            workerIndex: params.workerIndex,
            completed,
            total: totalWork,
            // Results were already published above. Count discoveries per candidate during
            // directed verification so the displayed total is not inflated by this frontier.
            found: false,
            // The frontier is intentionally best-effort. Only a directed verification that
            // cannot finish makes the final exploration partial.
            timedOut: false,
            durationMs: performance.now() - discoveryStartedAt,
            skillName: 'bonus discovery frontier'
        });
    }

    for (const candidate of discoveryCandidates) {
        const candidateStartedAt = performance.now();
        const startingBest = frontierBestByName.get(candidate.skillName) || null;
        const { best, timedOut } = await verifyCandidate(
            params, candidate, startingBest, BONUS_VERIFICATION_BUDGET_MS, discoveryContext
        );

        if (best && (!startingBest || best.level > startingBest.level)) {
            self.postMessage({
                type: 'result',
                candidate: { ...candidate, level: best.level },
                seedResults: best.results
            });
        }

        completed++;
        self.postMessage({
            type: 'progress',
            workerIndex: params.workerIndex,
            completed,
            total: totalWork,
            found: Boolean(best),
            timedOut,
            durationMs: performance.now() - candidateStartedAt,
            skillName: candidate.skillName
        });
    }

    for (const candidate of candidates) {
        const candidateStartedAt = performance.now();
        const { best, timedOut } = await verifyCandidate(
            params,
            candidate,
            null,
            candidate.maxSearchMs || SKILL_UPGRADE_BUDGET_MS
        );

        if (best) {
            self.postMessage({
                type: 'result',
                candidate: { ...candidate, level: best.level },
                seedResults: best.results
            });
        }

        completed++;
        self.postMessage({
            type: 'progress',
            workerIndex: params.workerIndex,
            completed,
            total: totalWork,
            found: Boolean(best),
            timedOut,
            durationMs: performance.now() - candidateStartedAt,
            skillName: candidate.skillName
        });
    }

    self.postMessage({ type: 'done', workerIndex: params.workerIndex, total: totalWork });
};
