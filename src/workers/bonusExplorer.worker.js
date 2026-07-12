/* eslint-env worker */
import { searchAndSpeed } from '../util/logic';
import SET_SKILLS from '../data/compact/set-skills.json';
import GROUP_SKILLS from '../data/compact/group-skills.json';
import SKILLS from '../data/compact/skills.json';
import HEAD from '../data/compact/head.json';
import CHEST from '../data/compact/chest.json';
import ARMS from '../data/compact/arms.json';
import WAIST from '../data/compact/waist.json';
import LEGS from '../data/compact/legs.json';
import { _x } from '../util/armorAccessor';
import { getUnsearchedSetBonusLevels } from '../util/bonusRecommendation';

const ARMOR_DATA_BY_SLOT = [HEAD, CHEST, ARMS, WAIST, LEGS];
const SEARCH_BUDGET_MS = 1800;
const SKILL_UPGRADE_BUDGET_MS = 3000;

const scoreCandidate = (skillName, sourceType, searchedSkills) => {
    const accessor = sourceType === 'set' ? _x.setSkills : _x.groupSkills;
    let score = 0;

    ARMOR_DATA_BY_SLOT.forEach(slotData => {
        Object.values(slotData).forEach(piece => {
            if (!accessor(piece)?.includes(skillName)) { return; }

            const matchingSkills = Object.entries(_x.skills(piece) || {}).reduce((total, [name, level]) => {
                return total + (searchedSkills[name] ? level * 10 : 0);
            }, 0);
            score += matchingSkills + (_x.slots(piece) || []).reduce((total, slot) => total + slot, 0) + 1;
        });
    });

    return score;
};

const getCandidates = params => {
    const skillUpgradeCandidates = Object.entries(params.skills || {}).flatMap(([skillName, currentLevel]) => {
        const maxLevel = SKILLS[skillName] || currentLevel;
        if (currentLevel >= maxLevel) { return []; }
        return [{
            skillName,
            sourceType: 'skill',
            level: currentLevel + 1,
            // Verify requested-skill upgrades before optional bonus paths.
            score: 2000000 + currentLevel
        }];
    });
    const setCandidates = Object.entries(SET_SKILLS).flatMap(([skillName, data]) => {
        const currentLevel = params.setSkills?.[skillName] || 0;
        const maxLevel = data?.[2]?.length || 1;
        return getUnsearchedSetBonusLevels(currentLevel, maxLevel).map(level => ({
            skillName,
            sourceType: 'set',
            level,
            score: scoreCandidate(skillName, 'set', params.skills) +
                (params.setSkillBonus === skillName ? 1000000 : 0)
        }));
    });
    const groupCandidates = Object.keys(GROUP_SKILLS).flatMap(skillName => {
        if (params.groupSkills?.[skillName]) { return []; }
        return [{
            skillName,
            sourceType: 'group',
            level: 1,
            score: scoreCandidate(skillName, 'group', params.skills) +
                (params.groupSkillBonus === skillName ? 1000000 : 0)
        }];
    });

    return [...skillUpgradeCandidates, ...setCandidates, ...groupCandidates]
        .filter(candidate => candidate.score > 0)
        .sort((a, b) => b.score - a.score || a.skillName.localeCompare(b.skillName) || b.level - a.level);
};

self.onmessage = async event => {
    const params = event.data;
    const candidates = getCandidates(params);
    const foundSetSkills = new Set();

    for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index];
        if (candidate.sourceType === 'set' && foundSetSkills.has(candidate.skillName)) {
            self.postMessage({ type: 'progress', completed: index + 1, total: candidates.length });
            continue;
        }
        const setSkills = candidate.sourceType === 'set' ?
            { ...params.setSkills, [candidate.skillName]: candidate.level } : params.setSkills;
        const groupSkills = candidate.sourceType === 'group' ?
            { ...params.groupSkills, [candidate.skillName]: candidate.level } : params.groupSkills;
        const skills = candidate.sourceType === 'skill' ?
            { ...params.skills, [candidate.skillName]: candidate.level } : params.skills;

        try {
            const response = await searchAndSpeed({
                ...params,
                skills,
                setSkills,
                groupSkills,
                limit: 1,
                findOne: true,
                maxSearchMs: candidate.sourceType === 'skill' ? SKILL_UPGRADE_BUDGET_MS : SEARCH_BUDGET_MS
            });
            if (response.results?.length) {
                if (candidate.sourceType === 'set') {
                    foundSetSkills.add(candidate.skillName);
                }
                self.postMessage({ type: 'result', candidate });
            }
        } catch (error) {
            self.postMessage({
                type: 'candidate-error',
                skillName: candidate.skillName,
                message: error?.message || String(error)
            });
        }

        self.postMessage({ type: 'progress', completed: index + 1, total: candidates.length });
    }

    self.postMessage({ type: 'done', total: candidates.length });
};
