import DECORATIONS from '../data/compact/decoration.json';
import INVENTORY from '../data/user/deco-inventory.json';
import SKILLS from '../data/compact/skills.json';
import { ELEMENT_SKILL_TABLES } from './damageScoring';
import { solveDecorationsIndexed } from './decorationSolver';
import { reserveSlots } from './slotReservation';
import { generateTalismans } from './talismanGenerator';

export const requestedArmorSlots = params => Object.entries(params.slotFilters || {})
    .flatMap(([size, count]) => Array(count).fill(Number(size)));

export const createSlotRecommendationAnalyzer = (params, candidates) => {
    const customs = params.customDecorations || [];
    const decorations = params.dontUseDecos ? {} : { ...DECORATIONS, ...Object.fromEntries(customs.map(deco =>
        [deco.name, [deco.type, deco.skills || {}, Number(deco.size || 1)]])) };
    const inventory = { ...INVENTORY, ...Object.fromEntries(customs.map(deco =>
        [deco.name, Math.max(0, Number(deco.amount ?? 99))])), ...params.decoMods };
    const isBlocked = skills => Object.keys(skills).some(name => {
        const element = ELEMENT_SKILL_TABLES[name];
        return element && element.elementType !== params.weaponElementType && !params.skills?.[name];
    });
    const recommendations = {};
    const capacities = { armor: 0, weapon: 0 };
    const cache = new Map();
    const charmPools = new Map();
    const charmChoices = new Map();
    const sameSlots = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const alternativeCharm = (source, candidate) => {
        if (params.useOnlyOwnedTalismans || params.mandatoryArmor?.[5] ||
            params.blacklistedArmorTypes?.includes('talisman')) { return null; }
        const [oldName, oldData] = Object.entries(source.talismanData || {})[0] || [];
        if (!oldData || params.mandatoryArmor?.includes(oldName)) { return null; }
        const key = JSON.stringify([oldName, candidate.name]);
        if (!charmChoices.has(key)) {
            if (!charmPools.has(candidate.name)) {
                charmPools.set(candidate.name, Object.entries(generateTalismans({ ...params.skills, [candidate.name]: 1 }))
                    .filter(([name, data]) => data[1][candidate.name] && !params.blacklistedArmor?.includes(name))
                    .sort((a, b) => b[1][1][candidate.name] - a[1][1][candidate.name]));
            }
            const choice = charmPools.get(candidate.name).find(([, data]) =>
                sameSlots(data[3], oldData[3]) && sameSlots(data[8], oldData[8]) &&
                Object.entries(params.skills || {}).every(([name, level]) =>
                    Math.min(level, data[1][name] || 0) >= Math.min(level, oldData[1][name] || 0)));
            charmChoices.set(key, choice || null);
        }
        const choice = charmChoices.get(key);
        if (!choice) { return null; }
        const [name, data] = choice;
        const baseSkills = { ...source.baseSkills };
        Object.entries(oldData[1]).forEach(([skill, level]) => { baseSkills[skill] = (baseSkills[skill] || 0) - level; });
        Object.entries(data[1]).forEach(([skill, level]) => { baseSkills[skill] = (baseSkills[skill] || 0) + level; });
        return { ...source, armorNames: source.armorNames.map(value => value === oldName ? name : value),
            baseSkills, talismanData: { [name]: data } };
    };
    const stats = { decorationChecks: 0, cacheHits: 0, armorSearches: 0 };
    const solve = (base, targets, armorSlots, weaponSlots) => {
        const skillsNeeded = Object.fromEntries(Object.entries(targets)
            .map(([name, level]) => [name, level - (base[name] || 0)]).filter(([, level]) => level > 0)
            .sort(([a], [b]) => a.localeCompare(b)));
        const key = JSON.stringify([skillsNeeded, [...armorSlots].sort(), [...weaponSlots].sort()]);
        if (cache.has(key)) { stats.cacheHits++; return cache.get(key); }
        stats.decorationChecks++;
        const result = solveDecorationsIndexed({ decorations, inventory, skillsNeeded, armorSlots, weaponSlots, isBlocked });
        cache.set(key, result);
        return result;
    };
    const makeWitness = (source, placement, reserved) => {
        const skills = { ...source.baseSkills };
        placement.decoNames.forEach(name => Object.entries(decorations[name][1]).forEach(([skill, level]) => {
            skills[skill] = Math.min(SKILLS[skill] || Infinity, (skills[skill] || 0) + level);
        }));
        return { ...source, skills, decoNames: placement.decoNames,
            requiredDecoNames: placement.decoNames, autoDecoNames: [],
            freeSlots: placement.freeSlots.concat(reserved), freeWeaponSlots: placement.freeWeaponSlots };
    };
    const analyze = (results, deadline = Infinity) => {
        const families = results.map(result => result.talismanFlex ? result.recommendationSeedResults || [] : [result]);
        let examined = 0;
        for (let round = 0; families.some(family => family[round]) && examined < 160; round++) {
            for (const family of families) {
                if (performance.now() >= deadline) { return; }
                const source = family[round];
                if (!source?.baseSkills || !source.slots || !source.weaponSlots) { continue; }
                examined++;
                if (!Object.entries(params.setSkills || {}).every(([name, level]) => (source.setSkills?.[name] || 0) >= level) ||
                    !Object.entries(params.groupSkills || {}).every(([name, level]) =>
                        (source.groupSkills?.[name] || 0) >= level)) {
                    continue;
                }
                const armor = reserveSlots(source.slots, requestedArmorSlots(params));
                if (!armor) { continue; }
                // Solve once for spare capacity, then test every jewel skill on the
                // same equipment. Cache equivalent decoration problems across sets.
                for (const type of ['weapon', 'armor']) {
                    for (const size of [3, 2, 1]) {
                        if (size <= capacities[type]) { continue; }
                        const pool = type === 'weapon' ? source.weaponSlots : armor.available;
                        const reservation = reserveSlots(pool, [size]);
                        if (!reservation) { continue; }
                        const placement = solve(source.baseSkills, params.skills || {},
                            type === 'armor' ? reservation.available : armor.available,
                            type === 'weapon' ? reservation.available : source.weaponSlots);
                        if (placement) { capacities[type] = size; break; }
                    }
                }
                for (const candidate of candidates) {
                    if (performance.now() >= deadline) { return; }
                    const known = Math.max(params.skills?.[candidate.name] || 0, recommendations[candidate.name]?.level || 0);
                    for (let level = known + 1; level <= candidate.max; level++) {
                        let witnessSource = source;
                        let placement = solve(source.baseSkills, { ...params.skills, [candidate.name]: level },
                            armor.available, source.weaponSlots);
                        if (!placement) {
                            const alternative = alternativeCharm(source, candidate);
                            if (alternative) {
                                placement = solve(alternative.baseSkills, { ...params.skills, [candidate.name]: level },
                                    armor.available, source.weaponSlots);
                                witnessSource = alternative;
                            }
                        }
                        if (!placement) { break; }
                        recommendations[candidate.name] = { level,
                            addedLevel: level - (params.skills?.[candidate.name] || 0),
                            slotTypes: candidate.slotTypes.length ? candidate.slotTypes : ['armor'],
                            seedResults: [makeWitness(witnessSource, placement, armor.reserved)], verifiedBy: 'shared-slots' };
                    }
                }
                if (examined >= 160) { break; }
            }
        }
    };
    return { analyze, recommendations, capacities, stats };
};
