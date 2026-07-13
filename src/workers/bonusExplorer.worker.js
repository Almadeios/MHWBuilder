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
const ARMOR_DATA = { ...HEAD, ...CHEST, ...ARMS, ...WAIST, ...LEGS };

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
    const allCandidates = [
        ...bonusUpgradeCandidates, ...skillUpgradeCandidates, ...bonusDiscoveryCandidates
    ];
    const feasibleCandidates = buildBonusFeasibilityIndex(
        ARMOR_DATA,
        params,
        allCandidates
    )
        .filter(candidate => candidate.feasibleByArmorCount)
        .filter(candidate => candidate.score > 0)
        .sort((a, b) => b.score - a.score || a.skillName.localeCompare(b.skillName));
    return {
        candidates: partitionRecommendationCandidates(
            feasibleCandidates, params.workerIndex, params.workerCount
        ),
        initialCount: allCandidates.length,
        feasibleCount: feasibleCandidates.length
    };
};

self.onmessage = async event => {
    const params = event.data;
    const { candidates, initialCount, feasibleCount } = getCandidates(params);
    self.postMessage({
        type: 'init',
        workerIndex: params.workerIndex,
        assigned: candidates.length,
        initialCount,
        feasibleCount
    });

    for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        const candidateStartedAt = performance.now();
        let low = candidate.currentLevel + 1;
        let high = candidate.maxLevel;
        let best = null;
        let timedOut = false;

        while (low <= high) {
            const level = Math.ceil((low + high) / 2);
            const skills = { ...params.skills };
            const setSkills = { ...params.setSkills };
            const groupSkills = { ...params.groupSkills };
            if (candidate.sourceType.endsWith('set-bonus')) {
                setSkills[candidate.skillName] = level;
            } else if (candidate.sourceType.endsWith('group-bonus')) {
                groupSkills[candidate.skillName] = level;
            } else {
                skills[candidate.skillName] = level;
            }

            try {
                const response = await searchAndSpeed({
                    ...params,
                    skills,
                    setSkills,
                    groupSkills,
                    limit: 1,
                    findOne: true,
                    maxSearchMs: candidate.maxSearchMs || SKILL_UPGRADE_BUDGET_MS
                });
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
                high = level - 1;
            }
        }

        if (best) {
            self.postMessage({
                type: 'result',
                candidate: { ...candidate, level: best.level },
                seedResults: best.results
            });
        }

        self.postMessage({
            type: 'progress',
            workerIndex: params.workerIndex,
            completed: index + 1,
            total: candidates.length,
            found: Boolean(best),
            timedOut,
            durationMs: performance.now() - candidateStartedAt,
            skillName: candidate.skillName
        });
    }

    self.postMessage({ type: 'done', workerIndex: params.workerIndex, total: candidates.length });
};
