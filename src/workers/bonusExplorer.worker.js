/* eslint-env worker */
import { searchAndSpeed } from '../util/logic';
import SKILLS from '../data/compact/skills.json';

const SKILL_UPGRADE_BUDGET_MS = 3000;

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
    return skillUpgradeCandidates
        .filter(candidate => candidate.score > 0)
        .sort((a, b) => b.score - a.score || a.skillName.localeCompare(b.skillName));
};

self.onmessage = async event => {
    const params = event.data;
    const candidates = getCandidates(params);

    for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        let low = candidate.currentLevel + 1;
        let high = candidate.maxLevel;
        let best = null;

        while (low <= high) {
            const level = Math.ceil((low + high) / 2);
            const skills = { ...params.skills, [candidate.skillName]: level };

            try {
                const response = await searchAndSpeed({
                    ...params,
                    skills,
                    setSkills: params.setSkills,
                    groupSkills: params.groupSkills,
                    limit: 1,
                    findOne: true,
                    maxSearchMs: SKILL_UPGRADE_BUDGET_MS
                });
                if (response.results?.length) {
                    best = { level, results: response.results };
                    low = level + 1;
                } else {
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

        self.postMessage({ type: 'progress', completed: index + 1, total: candidates.length });
    }

    self.postMessage({ type: 'done', total: candidates.length });
};
