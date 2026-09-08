import SKILLS from '../data/compact/skills.json';
import DECORATIONS from '../data/compact/decoration.json';
import { ELEMENT_SKILL_TABLES } from './damageScoring';
import { createSlotRecommendationAnalyzer, requestedArmorSlots } from './slotRecommendations';

export const getNormalRecommendationCandidates = params => {
    const decorations = [...Object.values(DECORATIONS), ...(params.customDecorations || [])
        .map(deco => [deco.type, deco.skills, deco.size])];
    return Object.entries(SKILLS).filter(([name, max]) => {
        const element = ELEMENT_SKILL_TABLES[name];
        return max > (params.skills?.[name] || 0) &&
            (!element || element.elementType === params.weaponElementType || params.skills?.[name]);
    }).map(([name, max]) => ({ name, max, level: (params.skills?.[name] || 0) + 1,
        minimumSlotSizes: Object.fromEntries(['armor', 'weapon'].map(type => [type,
            Math.min(...decorations.filter(([decoType, skills]) => decoType === type && skills?.[name])
                .map(([, , size]) => Number(size)))])),
        slotTypes: [...new Set(decorations.filter(([, skills]) => skills?.[name]).map(([type]) => type))]
    })).sort((a, b) => {
        // Weapon skills are especially easy to miss when all displayed weapon slots are used.
        return Number(b.slotTypes.includes('weapon')) - Number(a.slotTypes.includes('weapon')) || a.name.localeCompare(b.name);
    });
};

export const normalVerificationParams = (params, candidate, budgetMs) => ({
    ...params,
    skills: candidate ? { ...params.skills, [candidate.name]: candidate.level } : { ...params.skills },
    priorResults: [], // A real search may replace any unpinned piece or charm.
    recommendationSlots: {},
    bonusDiscovery: false,
    bonusDiscoverySetNames: [], bonusDiscoveryGroupNames: [],
    bonusDiscoveryTargetType: '', bonusDiscoveryTargetName: '', bonusDiscoveryTargetLevel: 0,
    limit: 1, findOne: true, maxSearchMs: budgetMs
});

export const verifyNormalRecommendation = async(params, candidate, budgetMs, search) => {
    const response = await search(normalVerificationParams(params, candidate, budgetMs));
    const witnesses = (response.results || []).filter(result =>
        Object.entries({ ...params.skills, [candidate.name]: candidate.level })
            .every(([name, level]) => (result.skills?.[name] || 0) >= level) &&
        Object.entries(params.setSkills || {}).every(([name, level]) => (result.setSkills?.[name] || 0) >= level) &&
        Object.entries(params.groupSkills || {}).every(([name, level]) => (result.groupSkills?.[name] || 0) >= level));
    let status = response.profile?.timedOut || response.profile?.cancelled ? 'unresolved' : 'checked';
    if (witnesses.length) { status = 'proven'; }
    return { candidate, results: witnesses, status };
};

export const discoverSharedSlotRecommendations = async(params, search, onUpdate = () => {}) => {
    const candidates = getNormalRecommendationCandidates(params);
    const analyzer = createSlotRecommendationAnalyzer(params, candidates);
    const started = performance.now();
    const deadline = started + 20000;
    const update = () => onUpdate({ recommendations: { ...analyzer.recommendations },
        stats: { ...analyzer.stats, milliseconds: performance.now() - started } });
    analyzer.analyze(params.priorResults || [], Math.min(deadline, started + 5000));
    update();
    if (!params.recommendationDeepSlots) {
        return { recommendations: analyzer.recommendations,
            stats: { ...analyzer.stats, milliseconds: performance.now() - started } };
    }
    // At most six global queries, each shared by all skills that use the found
    // capacity. Unproven skills remain available for optional exact follow-up.
    for (const type of ['weapon', 'armor']) {
        const missingSizes = [...new Set(candidates.filter(candidate =>
            !analyzer.recommendations[candidate.name] && candidate.slotTypes.includes(type))
            .map(candidate => candidate.minimumSlotSizes[type]))].filter(Number.isFinite).sort((a, b) => b - a);
        for (const size of missingSizes) {
            if (analyzer.capacities[type] >= size || performance.now() >= deadline) { continue; }
            const recommendationSlots = { armor: requestedArmorSlots(params), weapon: [] };
            recommendationSlots[type] = recommendationSlots[type].concat(size);
            analyzer.stats.armorSearches++;
            const response = await search({ ...normalVerificationParams(params, null, 1),
            skills: params.skills, recommendationSlots, priorResults: [],
            maxSearchMs: Math.min(2500, deadline - performance.now()) });
            analyzer.analyze(response.results || [], deadline);
            update();
        }
    }
    return { recommendations: analyzer.recommendations,
        stats: { ...analyzer.stats, milliseconds: performance.now() - started } };
};
