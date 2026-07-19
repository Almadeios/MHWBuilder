import TALISMANS from "../data/compact/talisman.json";
import DECO_INVENTORY from "../data/user/deco-inventory.json";
import DECORATIONS from "../data/compact/decoration.json";
import SKILL_DB from "../data/compact/skills.json";
import SET_SKILL_DB from '../data/compact/set-skills.json';
import GROUP_SKILL_DB from '../data/compact/group-skills.json';
import {
    emptyGearPiece,
    emptyGearSet, formatArmorC, getArmorSkillNames, getBestDecos, getDecoSkillsFromNames,
    getInclusiveRemainingSlots,
    getJsonFromType, getSearchParameters, getSkillTestOrderBinary, groupArmorIntoSets,
    hasBiggerSlottage, hasLongerSlottage, hasNeededSkill, isEmpty, isInGroups,
    isInSets, mergeSumMaps, slottageLengthCompare,
    slottageSizeCompare, speed, updateSkillPotential
} from "./tools";
import {
    CHOSEN_ARMOR_DEBUG,
    DEBUG,
    OPTIMIZER_PROFILE
} from "./constants";
import { allTests } from "../test/tests";
import { getArmorTypeList, isGroupSkillName, isSetSkillName, stringToId } from "./util";
import INTERNAL_BLACKLIST from '../data/internal-blacklist.json';
import { _x } from "./armorAccessor";
import { generateTalismans } from "./talismanGenerator";
import { buildDamageProfile, ELEMENT_SKILL_TABLES, rankBuildsByDamage } from "./damageScoring";
import { solveDecorationsIndexed } from './decorationSolver';
import { createDeadlineToken } from './deadlineToken';

const INTERNAL_BLACKMAP = Object.fromEntries(INTERNAL_BLACKLIST.map(x => [x, true]));

let decoInventory = { ...DECO_INVENTORY };
let currentDecorations = { ...DECORATIONS };
const decorationReplacementCostCache = new Map();

// getting lazier..
let currentSlotFilters = {};
export let freeThree = [];
export let freeTwo = [];
export let freeOne = [];
export let cached;
export let lastOptimizerProfile = null;

const searchCache = new Map();
const MAX_SEARCH_CACHE_ENTRIES = 50;
const SEARCH_CACHE_VERSION = 22;
const MAX_COMBO_SEARCH_MS = 12000;
const talismanScoreCache = new Map();
const MAX_TALISMAN_SCORE_CACHE_ENTRIES = 2000;
const mitmHalfCache = new Map();
const MAX_MITM_HALF_CACHE_ENTRIES = 8;
const MAX_MITM_HALF_CACHE_STATES = 50000;
let mitmHalfCacheStateCount = 0;
const searchGearCache = new Map();
const MAX_SEARCH_GEAR_CACHE_ENTRIES = 8;
const searchFeasibilityCache = new Map();
const GENERATED_TALISMAN_CANDIDATE_LIMIT = 300;
const isOffElementAttackSkill = (skillName, params = {}) => {
    const elementTable = ELEMENT_SKILL_TABLES[skillName];
    if (!elementTable) { return false; }

    const selectedElement = params.weaponElementType || "None";
    return selectedElement === "None" || elementTable.elementType !== selectedElement;
};

const hasBlockedOffElementAttackSkill = (decoSkills = {}, params = {}, desiredSkills = {}) => {
    return Object.keys(decoSkills).some(skillName => {
        return isOffElementAttackSkill(skillName, params) && !desiredSkills[skillName];
    });
};

const normalizeQueryMap = value => {
    return Object.entries(value || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, level]) => `${key}:${level}`)
        .join("|");
};

const normalizeList = value => {
    return [...value || []].slice().sort().join(",");
};

const normalizeCustomTalismans = value => {
    return (value || [])
        .map(talisman => ({
            name: talisman?.name || "",
            skills: normalizeQueryMap(talisman?.skills || {}),
            slots: normalizeList(talisman?.slots || []),
            weaponSlots: normalizeList(talisman?.weaponSlots || [])
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

export const buildSearchCacheKey = parameters => {
    const params = parameters || {};
    const normalizedParams = {
        version: SEARCH_CACHE_VERSION,
        skills: normalizeQueryMap(params.skills),
        setSkills: normalizeQueryMap(params.setSkills),
        groupSkills: normalizeQueryMap(params.groupSkills),
        slotFilters: normalizeQueryMap(params.slotFilters),
        weaponSlots: normalizeList(params.weaponSlots),
        weaponBaseRaw: params.weaponBaseRaw || 0,
        weaponBaseAffinity: params.weaponBaseAffinity || 0,
        weaponType: params.weaponType || "other",
        weaponElementType: params.weaponElementType || "None",
        weaponElementValue: params.weaponElementValue || 0,
        weaponSharpness: params.weaponSharpness || "White",
        conditions: params.conditions || {},
        optimizationGoal: params.optimizationGoal || 'efficient',
        setSkillBonus: params.setSkillBonus || "",
        groupSkillBonus: params.groupSkillBonus || "",
        mandatoryArmor: normalizeList(params.mandatoryArmor),
        blacklistedArmor: normalizeList(params.blacklistedArmor),
        blacklistedArmorTypes: normalizeList(params.blacklistedArmorTypes),
        customTalismans: JSON.stringify(normalizeCustomTalismans(params.customTalismans)),
        customDecorations: JSON.stringify(normalizeCustomDecorations(params.customDecorations)),
        useOnlyOwnedTalismans: Boolean(params.useOnlyOwnedTalismans),
        dontUseDecos: Boolean(params.dontUseDecos),
        decoMods: normalizeQueryMap(params.decoMods),
        limit: params.limit ?? 20,
        findOne: Boolean(params.findOne),
        maxSearchMs: params.maxSearchMs || 0,
        exhaustive: Boolean(params.exhaustive),
        bonusDiscovery: Boolean(params.bonusDiscovery),
        bonusDiscoverySetNames: normalizeList(params.bonusDiscoverySetNames),
        bonusDiscoveryGroupNames: normalizeList(params.bonusDiscoveryGroupNames),
        bonusDiscoveryTargetType: params.bonusDiscoveryTargetType || '',
        bonusDiscoveryTargetName: params.bonusDiscoveryTargetName || '',
        bonusDiscoveryTargetLevel: Number(params.bonusDiscoveryTargetLevel || 0),
        rank: params.rank || "high"
    };

    return JSON.stringify(normalizedParams);
};

const buildSearchGearCacheKey = params => buildSearchCacheKey({
    ...params,
    limit: 0,
    findOne: false,
    maxSearchMs: 0,
    bonusDiscoveryTargetType: '',
    bonusDiscoveryTargetName: '',
    bonusDiscoveryTargetLevel: 0
});

const cacheSearchGear = (key, gear) => {
    if (searchGearCache.size >= MAX_SEARCH_GEAR_CACHE_ENTRIES) {
        const oldestKey = searchGearCache.keys().next().value;
        searchGearCache.delete(oldestKey);
        [...searchFeasibilityCache.keys()].forEach(feasibilityKey => {
            if (feasibilityKey === oldestKey || feasibilityKey.startsWith(`${oldestKey}::`)) {
                searchFeasibilityCache.delete(feasibilityKey);
            }
        });
    }
    searchGearCache.set(key, gear);
};

const cacheSearchResult = (key, results) => {
    if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
    }

    searchCache.set(key, results);
};

const getCachedSearchResult = key => {
    const results = searchCache.get(key);
    if (results === undefined) { return undefined; }
    searchCache.delete(key);
    searchCache.set(key, results);
    return results;
};

const normalizeCustomDecorations = value => (value || [])
    .map(deco => ({
        name: deco?.name || "",
        type: deco?.type || "armor",
        size: Number(deco?.size || 1),
        amount: Number(deco?.amount ?? 99),
        skills: normalizeQueryMap(deco?.skills || {})
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

const customDecorationsToCompact = value => Object.fromEntries((value || [])
    .filter(deco => deco?.name && ["armor", "weapon"].includes(deco?.type))
    .map(deco => [deco.name, [deco.type, deco.skills || {}, Number(deco.size || 1)]]));

export const configureSearchDecorations = (params = {}) => {
    const customDecorationMap = customDecorationsToCompact(params.customDecorations);
    currentDecorations = { ...DECORATIONS, ...customDecorationMap };
    decorationReplacementCostCache.clear();
    decoInventory = { ...DECO_INVENTORY };
    for (const deco of params.customDecorations || []) {
        if (deco?.name) {
            decoInventory[deco.name] = Math.max(0, Number(deco.amount ?? 99));
        }
    }
    for (const [decoName, decoAmount] of Object.entries(params.decoMods || {})) {
        if (Object.prototype.hasOwnProperty.call(decoInventory, decoName)) {
            decoInventory[decoName] = decoAmount;
        }
    }
    return currentDecorations;
};

const cacheTalismanScore = (key, score) => {
    if (talismanScoreCache.size >= MAX_TALISMAN_SCORE_CACHE_ENTRIES) {
        const oldestKey = talismanScoreCache.keys().next().value;
        talismanScoreCache.delete(oldestKey);
    }

    talismanScoreCache.set(key, score);
};

const createOptimizerProfile = engine => ({
    engine,
    runtimeMs: 0,
    stages: {},
    cacheHit: false,
    nodes: 0,
    pruned: 0,
    leaves: 0,
    results: 0,
    impossible: false,
    impossibleReasons: []
});

const recordOptimizerStage = (profile, stageName, startedAt) => {
    profile.stages[stageName] = (profile.stages[stageName] || 0) + performance.now() - startedAt;
};

const finishOptimizerProfile = (profile, results) => {
    profile.results = results.length;
    lastOptimizerProfile = profile;
    if (DEBUG && OPTIMIZER_PROFILE) {
        console.log(
            `[optimizer:${profile.engine}] ${profile.runtimeMs.toFixed(1)}ms, ` +
            `${profile.nodes.toLocaleString()} nodes, ${profile.pruned.toLocaleString()} pruned, ` +
            `${profile.leaves.toLocaleString()} leaves, ${profile.results.toLocaleString()} results, ` +
            `${Number(profile.compactedHalfStates || 0).toLocaleString()} compacted, ` +
            `${Number(profile.decorationSolverCalls || 0).toLocaleString()} deco checks`
        );
    }
};

const customTalismansToCompact = customTalismans => {
    return Object.fromEntries((customTalismans || []).map((talisman, index) => {
        const name = talisman.name || `Custom Talisman ${index + 1}`;
        return [name, [
            "talisman",
            talisman.skills || {},
            [],
            talisman.slots || [],
            0,
            [0, 0, 0, 0, 0],
            "high",
            [],
            talisman.weaponSlots || []
        ]];
    }));
};

export const getBestArmor = (
    skills, setSkills = {}, groupSkills = {},
    mandatoryPieceNames = [],
    blacklistedArmor = [],
    blacklistedArmorTypes = [],
    dontUseDecos = false,
    weaponSlots = [],
    setSkillBonus = '',
    groupSkillBonus = '',
    customTalismans = [],
    useOnlyOwnedTalismans = false,
    customDecorations = [],
    rank = "high"
) => {
    // const fullDataFile = getJsonFromType("armor");
    const fullDataFile = Object.fromEntries(
        Object.entries(getJsonFromType("armor")).filter(([name]) => !INTERNAL_BLACKMAP[name])
    );

    const mandatory = {};
    mandatoryPieceNames.forEach(name => {
        if (name) {
            const foundData = fullDataFile[name];
            const foundTalisman = TALISMANS[name];
            if (foundData || foundTalisman) {
                mandatory[foundData?.[0] || foundTalisman?.[0]] = name;
            } else {
                console.warn(`WARNING: Could not find mandatory armor ${name}!`);
            }
        }
    });

    const dataFile = Object.fromEntries(Object.entries(fullDataFile)
        .filter(([k, v]) => v[6] === rank && (!mandatory[v[0]] || k === mandatory[v[0]]) &&
            !blacklistedArmorTypes.includes(v[0]) && !blacklistedArmor.includes(k))
    );

    const customTalismanMap = customTalismansToCompact(customTalismans);
    const generatedTalismans = useOnlyOwnedTalismans ? {} : generateTalismans(skills);
    const talismans = {
        ...TALISMANS,
        ...generatedTalismans,
        ...customTalismanMap
    };

    const talismanSourcePriority = talismanName => {
        if (customTalismanMap[talismanName]) { return 2; }
        if (generatedTalismans[talismanName]) { return 1; }
        return 0;
    };

    const scoreTalisman = talismanData => {
        const talismanSkills = talismanData[1] || {};
        const talismanArmorSlots = talismanData[3] || [];
        const talismanWeaponSlots = talismanData[8] || [];
        const rarity = talismanData[6] || "low";

        const rarityScores = { low: 1, high: 3, master: 5 };
        const rarityBonus = rarityScores[rarity] || 1;
        const desiredSkillScore = Object.entries(skills).reduce((total, [skillName, targetLevel]) => {
            const level = Math.min(talismanSkills[skillName] || 0, targetLevel);
            return total + level * getSearchSkillWeight(skillName);
        }, 0);

        const totalSlots = (talismanArmorSlots?.length || 0) + (talismanWeaponSlots?.length || 0) * 1.5;
        return desiredSkillScore * 10 + totalSlots + rarityBonus * 0.5;
    };

    const bestTalismans = Object.fromEntries(Object.entries(talismans)
        .filter(([k, v]) => !blacklistedArmor.includes(k) &&
            (!mandatory[_x.type(v)] || k === mandatory[_x.type(v)]))
        .sort((a, b) => {
            return scoreTalisman(b[1]) - scoreTalisman(a[1]) ||
                talismanSourcePriority(b[0]) - talismanSourcePriority(a[0]);
        })
    );

    const topTalis = {};
    if (!blacklistedArmorTypes.includes("talisman")) {
        for (const [talisName, talisData] of Object.entries(bestTalismans)) {
            topTalis[talisName] = talisData;
        }
    }

    const firsts = emptyGearSet();
    firsts.talisman = {};
    const best = emptyGearSet();
    const allDecorations = { ...DECORATIONS, ...customDecorationsToCompact(customDecorations) };
    const bestDecos = dontUseDecos ? {} : Object.fromEntries(Object.entries(allDecorations)
        .filter(([, deco]) => ["armor", "weapon"].includes(deco[0]) && hasNeededSkill(deco[1], skills)));

    ["length", "size"].forEach(sortType => {
        const checker = emptyGearSet();
        const allSort = Object.fromEntries(Object.entries(dataFile)
            .sort((a, b) => {
                if (sortType === "size") {
                    return slottageSizeCompare(a[1][3], b[1][3], b[1][4] - a[1][4]);
                }
                return slottageLengthCompare(a[1][3], b[1][3], b[1][4] - a[1][4]); // default to defense at end
            })
        );

        for (const [armorName, armorData] of Object.entries(allSort)) {
            const category = armorData[0];
            if (isEmpty(checker[category])) {
                if (sortType === "size" && hasBiggerSlottage(firsts[category], armorData[3]) ||
                    sortType === "length" && hasLongerSlottage(firsts[category], armorData[3])) {
                    checker[category] = { checked: true };
                    firsts[category][armorName] = armorData;
                }
            }
            if (hasNeededSkill(armorData[1], skills)) {
                best[category][armorName] = armorData;
            }
        }
    });

    let totalMaxSkillPotential = {};
    let maxPossibleSkillPotential = emptyGearSet();
    let modPointMap = {};

    for (const skillName of Object.keys(skills)) {
        for (const [category, data] of Object.entries(best)) {
            for (const [armorName, armorData] of Object.entries(data)) {
                const { pot, totalPot, modMap } = updateSkillPotential(
                    maxPossibleSkillPotential, totalMaxSkillPotential,
                    modPointMap, category, skillName, armorName, armorData,
                    bestDecos, skills
                );
                maxPossibleSkillPotential = pot;
                totalMaxSkillPotential = totalPot;
                modPointMap = modMap;
            }
        }
    }

    // now do the same for talismans (since they can have multiple skills/slots now)
    // for (const skillName of Object.keys(skills)) {
    //     for (const [talismanName, talismanData] of Object.entries(topTalis)) {
    //         const { pot, totalPot, modMap } = updateSkillPotential(
    //             maxPossibleSkillPotential, totalMaxSkillPotential,
    //             modPointMap, "talisman", skillName, talismanName, talismanData,
    //             bestDecos, skills
    //         );
    //         maxPossibleSkillPotential = pot;
    //         totalMaxSkillPotential = totalPot;
    //         modPointMap = modMap;
    //     }
    // }

    // early check to see if it's even possible to reach the target
    // for (const [skillName, targetLevel] of Object.entries(skills)) {
    //     const relevantTalisman = Object.entries(topTalis).filter(([k, v]) => skillName in v[1]);
    //     const relevantTalismanLevel = relevantTalisman.length ? relevantTalisman[0][1][skillName] : 0;
    //     if ((totalMaxSkillPotential[skillName] || 0) + relevantTalismanLevel < targetLevel) {
    //         return null;
    //     }
    // }

    const bareMinimum = firsts;
    for (const [category, data] of Object.entries(maxPossibleSkillPotential)) {
        for (const statData of Object.values(data)) {
            for (const key of ["best", "more"]) {
                if (statData[key]) {
                    if (key === "more" && statData[key].length) {
                        for (const ex of statData[key]) {
                            bareMinimum[category][ex] = dataFile[ex];
                        }
                    } else {
                        bareMinimum[category][statData[key]] = dataFile[statData[key]];
                    }
                }
            }
        }
    }

    // now handle set/group skills
    const groupiesAlt = Object.fromEntries(Object.entries(dataFile)
        .filter(([, v]) => isInSets(v, setSkills) || isInGroups(v, groupSkills))
        .sort((a, b) => {
            return slottageSizeCompare(a[1][3], b[1][3], b[1][4] - a[1][4]);
        })
    );

    totalMaxSkillPotential = {};
    const maxPossibleSkillPotentialSet = emptyGearSet();

    const bestGroupiesAlt = {};
    for (const [name, aData] of Object.entries(groupiesAlt)) {
        if (!bestGroupiesAlt[aData[0]]) { bestGroupiesAlt[aData[0]] = {}; }
        bestGroupiesAlt[aData[0]][name] = aData;
    }

    if (!isEmpty(skills)) {
        modPointMap = {};
        for (const skillName of Object.keys(skills)) {
            for (const [category, data] of Object.entries(bestGroupiesAlt)) {
                const [groupiesGrouped] = groupArmorIntoSets(data, setSkills, groupSkills);

                for (const [groupName, groupArmors] of Object.entries(groupiesGrouped)) {
                    for (const [armorName, armorData] of Object.entries(groupArmors)) {
                        const { pot, totalPot, modMap } = updateSkillPotential(
                            maxPossibleSkillPotentialSet, totalMaxSkillPotential, modPointMap,
                            category, skillName, armorName, armorData,
                            bestDecos, skills, groupName
                        );
                        maxPossibleSkillPotential = pot;
                        totalMaxSkillPotential = totalPot;
                        modPointMap = modMap;
                    }
                }
            }
        }

        for (const [category, data] of Object.entries(maxPossibleSkillPotentialSet)) {
            for (const groupData of Object.values(data)) {
                for (const statData of Object.values(groupData)) {
                    for (const key of ["best", "more"]) {
                        if (key in statData) {
                            if (key === "more" && statData[key].length) {
                                for (const ex of statData[key]) {
                                    bareMinimum[category][ex] = dataFile[ex];
                                }
                            } else {
                                bareMinimum[category][statData[key]] = dataFile[statData[key]];
                            }
                        }
                    }
                }
            }
        }
    } else { // if no skills exist, only set/group skills, just copy over all set/group pieces
        for (const [category, data] of Object.entries(bestGroupiesAlt)) {
            bareMinimum[category] = { ...bareMinimum[category], ...data };
        }
    }

    bareMinimum.decos = bestDecos;
    bareMinimum.talisman = topTalis;

    // add in a dummy piece (no skills/slots) for any blacklisted armor types
    blacklistedArmorTypes.forEach(tipo => {
        bareMinimum[tipo] = emptyGearPiece(tipo, rank);
    });

    // add empty data for each armor type that doesn't have any
    // only possible way this could happen is with the talisman if there are only set/group skills
    // or any other armor type if someone does something crazy like blacklist every piece for that type
    const armorTypes = ['head', 'chest', 'arms', 'waist', 'legs', 'talisman'];
    for (const type of armorTypes) {
        if (!bareMinimum[type] || isEmpty(bareMinimum[type])) {
            bareMinimum[type] = emptyGearPiece(type, rank);
        }
    }

    // sort final return armor by slottage
    for (const [cat, armor] of Object.entries(bareMinimum)) {
        if (["decos", "talisman"].includes(cat)) {
            continue;
        }
        const sorted = Object.fromEntries(Object.entries(armor)
            .sort((a, b) => slottageLengthCompare(a[1][3], b[1][3]))
        );
        bareMinimum[cat] = sorted;
    }
    bareMinimum.weaponSlots = weaponSlots;
    bareMinimum.setSkillBonus = setSkillBonus;
    bareMinimum.groupSkillBonus = groupSkillBonus;

    if (DEBUG && CHOSEN_ARMOR_DEBUG) {
        const debugOutput = [];
        console.log('getBestArmor() return: ', bareMinimum);
        debugOutput.push("========================================");
        debugOutput.push("Chosen Armor Details:");
        debugOutput.push("========================================");

        if (!isEmpty(skills)) {
            debugOutput.push(`Skills: ${JSON.stringify(skills)}\n`);
        }
        if (!isEmpty(setSkills)) {
            debugOutput.push(`Set Skills: ${JSON.stringify(setSkills)}`);
        }
        if (!isEmpty(groupSkills)) {
            debugOutput.push(`Group Skills: ${JSON.stringify(groupSkills)}\n`);
        }

        for (const [category, data] of Object.entries(bareMinimum)) {
            if (category === "weaponSlots") { continue; }
            debugOutput.push(category.toUpperCase()); // Print category name

            for (const [aName, aData] of Object.entries(data)) {
                if (category === "talisman" || category === "decos") {
                    debugOutput.push(`\t${aName}, ${JSON.stringify(aData[1])}`);
                    continue;
                }

                const relevantSkills = Object.fromEntries(
                    Object.entries(aData[1]).filter(([k]) => k in skills)
                );
                const relevantSetSkill = setSkills && isInSets(aData, setSkills) ? ` / ${_x.setSkills(aData).join(", ")}` : "";
                const relevantGroupSkill = groupSkills &&
                    isInGroups(aData, groupSkills) ? ` / ${_x.groupSkills(aData).join(", ")}` : "";

                const skStr = isEmpty(relevantSkills) ? '' : JSON.stringify(relevantSkills);
                debugOutput.push(
                    // eslint-disable-next-line max-len
                    `\t${aName}: (${_x.type(aData)} - ${_x.slots(aData)}) ${skStr}${relevantSetSkill}${relevantGroupSkill}`,
                );
            }
            debugOutput.push("\n"); // Extra space after each category
        }
        console.log(debugOutput.join("\n"));
        console.log("========================================");
    }

    return bareMinimum;
};

export const armorCombo = (
    head, chest, arms, waist, legs, talisman,
    weaponSlots = [], setSkillBonus = '', groupSkillBonus = ''
) => {
    const armorSkills = [head.data[1], chest.data[1], arms.data[1], waist.data[1], legs.data[1], talisman.data[1]];
    const armorSlots = [head.data[3], chest.data[3], arms.data[3], waist.data[3], legs.data[3], talisman.data[3]];

    // Merging dictionaries
    const result = {};
    const slots = [];

    armorSkills.forEach(skill => {
        Object.entries(skill).forEach(([skillName, level]) => {
            result[skillName] = (result[skillName] || 0) + level;
        });
    });

    // Flattening slots list
    armorSlots.forEach(slotList => {
        if (!slotList) { return; }
        slots.push(...slotList);
    });

    // Convert result to sorted dictionary
    const skillTotals = Object.fromEntries(
        Object.entries(result).sort((a, b) => b[1] - a[1])
    );

    const armorSetNames = [
        ..._x.setSkills(head.data), ..._x.setSkills(chest.data),
        ..._x.setSkills(arms.data), ..._x.setSkills(waist.data),
        ..._x.setSkills(legs.data)
    ];
    const armorGroupNames = [
        ..._x.groupSkills(head.data), ..._x.groupSkills(chest.data),
        ..._x.groupSkills(arms.data), ..._x.groupSkills(waist.data),
        ..._x.groupSkills(legs.data)
    ];
    const setSkills = setSkillBonus ? { [setSkillBonus]: 1 } : {};
    const groupSkills = groupSkillBonus ? { [groupSkillBonus]: 1 } : {};

    armorSetNames.forEach(setName => {
        setSkills[setName] = (setSkills[setName] || 0) + 1;
    });

    armorGroupNames.forEach(groupName => {
        groupSkills[groupName] = (groupSkills[groupName] || 0) + 1;
    });

    return {
        names: [head.name, chest.name, arms.name, waist.name, legs.name, talisman.name],
        skills: skillTotals,
        slots: slots,
        weaponSlots: [...weaponSlots, ..._x.weaponSlots(talisman.data)],
        setSkills: setSkills,
        groupSkills: groupSkills,
        defense: [head.data[4], chest.data[4], arms.data[4], waist.data[4], legs.data[4]],
        talismanData: { [talisman.name]: talisman.data }
    };
};

const getUsefulDecoPoints = (decoSkills, skillsNeeded) => {
    return Object.entries(decoSkills).reduce((total, [skillName, level]) => {
        return total + Math.min(level, Math.max(0, skillsNeeded[skillName] || 0));
    }, 0);
};

const getRequestedDecoSkillsFromNames = (names, desiredSkills) => {
    const decoSkills = getDecoSkillsFromNames(names, currentDecorations);
    return Object.fromEntries(
        Object.entries(decoSkills).filter(([skillName]) => desiredSkills[skillName])
    );
};

const getDecosToFulfillSkillsGreedy = (
    decos, skillsNeeded, slotsAvailable, weaponSlotsAvailable, startingUsedDecosCount = {}, params = {}, desiredSkills = {}
) => {
    // Sort slots in ascending order to fill smallest first
    const slotPool = [...slotsAvailable].sort((a, b) => a - b);
    const weaponSlotPool = [...weaponSlotsAvailable].sort((a, b) => a - b);

    // Sort decorations: satisfy requested skills first. Bonus skills are offered as extras, not auto-selected.
    const sortedDecos = Object.entries(decos)
        .filter(([, decoData]) => getUsefulDecoPoints(decoData[1], skillsNeeded) > 0)
        .filter(([decoName]) => (decoInventory[decoName] || 0) > 0)
        .filter(([, decoData]) => !hasBlockedOffElementAttackSkill(decoData[1], params, desiredSkills))
        .filter(([, decoData]) => {
            const pool = decoData[0] === 'weapon' ? weaponSlotsAvailable : slotsAvailable;
            return pool.some(slotSize => slotSize >= decoData[2]);
        })
        .sort((a, b) => {
        const slotA = a[1][2];
        const slotB = b[1][2];
        const usefulSkillA = getUsefulDecoPoints(a[1][1], skillsNeeded);
        const usefulSkillB = getUsefulDecoPoints(b[1][1], skillsNeeded);
        if (usefulSkillB !== usefulSkillA) { return usefulSkillB - usefulSkillA; }
        return slotA - slotB;
        });

    const remainingSkills = { ...skillsNeeded };
    const usedDecos = [];
    const usedDecosCount = { ...startingUsedDecosCount };
    for (const skill of Object.keys(remainingSkills)) {
        while (remainingSkills[skill] > 0) {
            let foundMatch = false;

            const currentDecos = sortedDecos
                .map(([decoName, decoData]) => ({
                    decoName,
                    decoData,
                    usefulPoints: getUsefulDecoPoints(decoData[1], remainingSkills)
                }))
                .filter(candidate => candidate.usefulPoints > 0)
                .sort((a, b) => b.usefulPoints - a.usefulPoints ||
                    a.decoData[2] - b.decoData[2]);
            for (const { decoName, decoData: [decoType, decoSkills, decoSlot] } of currentDecos) {
                if (!(skill in decoSkills)) { continue; }
                if ((usedDecosCount[decoName] || 0) >= (decoInventory[decoName] || 0)) { continue; }
                if (hasBlockedOffElementAttackSkill(decoSkills, params, desiredSkills)) { continue; }

                // Try to find the smallest slot that fits
                const availablePool = decoType === "weapon" ? weaponSlotPool : slotPool;
                for (let i = 0; i < availablePool.length; i++) {
                    const slotSize = availablePool[i];
                    if (slotSize >= decoSlot) {
                        // Use this decoration
                        usedDecos.push(decoName);
                        usedDecosCount[decoName] = (usedDecosCount[decoName] || 0) + 1;
                        availablePool.splice(i, 1);

                        Object.entries(decoSkills).forEach(([decoSkill, level]) => {
                            if (remainingSkills[decoSkill] === undefined) { return; }
                            remainingSkills[decoSkill] = Math.max(0, remainingSkills[decoSkill] - level);
                        });
                        foundMatch = true;
                        break;
                    }
                }

                if (foundMatch) { break; }
            }

            if (!foundMatch) { return null; } // Cannot fulfill the skill
        }
    }

    return {
        decoNames: usedDecos,
        freeSlots: slotPool,
        freeWeaponSlots: weaponSlotPool
    };
};

const getDecosToFulfillSkills = (
    decos, desiredSkills, slotsAvailable, weaponSlotsAvailable, startingSkills, params = {}
) => {
    if (!decos || Object.keys(decos).length === 0) { return null; }

    const skillsNeeded = { ...desiredSkills };
    for (const skill in startingSkills) {
        if (skillsNeeded[skill] !== undefined) {
            skillsNeeded[skill] -= startingSkills[skill];
            if (skillsNeeded[skill] <= 0) {
                delete skillsNeeded[skill];
            }
        }
    }

    if (Object.keys(skillsNeeded).length === 0) {
        return {
            decoNames: [],
            freeSlots: slotsAvailable,
            freeWeaponSlots: weaponSlotsAvailable
        };
    }

    return getDecosToFulfillSkillsGreedy(
        decos, skillsNeeded, slotsAvailable, weaponSlotsAvailable, {}, params, desiredSkills
    ) || solveDecorationsIndexed({
        decorations: decos,
        inventory: decoInventory,
        skillsNeeded,
        armorSlots: slotsAvailable,
        weaponSlots: weaponSlotsAvailable,
        isBlocked: decoSkills => hasBlockedOffElementAttackSkill(
            decoSkills, params, desiredSkills
        )
    });
};

// Re-orders display results to put some more desirable elements up front
export const reorder = dataList => {
    // Attach original index to ensure stable sorting
    const indexedData = dataList.map((item, index) => ({ ...item, _originalIndex: index }));

    for (const data of indexedData) {
        // visually limit skills to stay within level bounds
        for (const [skName, skLevel] of Object.entries(data.skills)) {
            if (skLevel > SKILL_DB[skName]) {
                data.skills[skName] = SKILL_DB[skName];
            }
        }

        // sort skills by level then name
        const skills = Object.fromEntries(
            Object.entries(data.skills)
                .sort(([k1, v1], [k2, v2]) => v2 - v1 || k1.localeCompare(k2)) // Sort by level descending, then name ascending
        );
        data.skills = skills;

        data.setSkillPoints = { ...data.setSkills };
        data.groupSkillPoints = { ...data.groupSkills };

        // correct set skill levels
        const setSkills = Object.fromEntries(
            Object.entries(data.setSkills)
                .filter(([k, v]) => k && Math.floor(v / 2) > 0)
                .map(([k, v]) => [k, Math.floor(v / 2)])
        );
        data.setSkills = setSkills;

        // correct group skill levels
        const groupSkills = Object.fromEntries(
            Object.entries(data.groupSkills)
                .filter(([k, v]) => k && Math.floor(v / 3) > 0)
                .map(([k, v]) => [k, Math.floor(v / 3)])
        );
        data.groupSkills = groupSkills;
    }

    const damnSort = [...indexedData].sort((a, b) => {
        const damageCompare = (b.damageProfile?.expected_dps || 0) - (a.damageProfile?.expected_dps || 0);
        if (damageCompare !== 0) {
            return damageCompare;
        }
        return slottageSizeCompare(a.freeSlots, b.freeSlots); // Sort by biggest slot value
    });

    damnSort.forEach(d => d.slots.sort((a, b) => b - a));

    const pre = [];
    const post = [];
    const bestPerThree = {}; // Tracks the best (longest) list per (numThrees, numTwos)

    const sortedDamnSort = damnSort.sort((a, b) => {
        const damageCompare = (b.damageProfile?.expected_dps || 0) - (a.damageProfile?.expected_dps || 0);
        if (damageCompare !== 0) {
            return damageCompare;
        }

        const aThrees = a.freeSlots.filter(y => y === 3).length;
        const bThrees = b.freeSlots.filter(y => y === 3).length;

        const aTwos = a.freeSlots.filter(y => y === 2).length;
        const bTwos = b.freeSlots.filter(y => y === 2).length;

        return (
            bThrees - aThrees || // Most 3s
            bTwos - aTwos || // Most 2s
            b.freeSlots.length - a.freeSlots.length || // Longest slots
            Object.keys(b.skills).length - Object.keys(a.skills).length
        );
    });

    sortedDamnSort.forEach(res => {
        const numThrees = res.freeSlots.filter(y => y === 3).length;
        const numTwos = res.freeSlots.filter(y => y === 2).length;
        const key = `${numThrees},${numTwos}`;

        if (!(key in bestPerThree)) {
            pre.push(res);
            bestPerThree[key] = res.freeSlots.length;
        } else {
            post.push(res);
        }
    });

    const ordered = [...pre, ...post];
    const excludeIds = new Set(ordered.map(obj => obj.id));

    const longestSlots = [...indexedData]
        .filter(v => !excludeIds.has(v.id))
        .sort((a, b) => {
            const damageCompare = (b.damageProfile?.expected_dps || 0) - (a.damageProfile?.expected_dps || 0);
            if (damageCompare !== 0) {
                return damageCompare;
            }

            const aHasPriority = a.freeSlots.some(val => val === 2 || val === 3) ? a.freeSlots.length : 0;
            const bHasPriority = b.freeSlots.some(val => val === 2 || val === 3) ? b.freeSlots.length : 0;

            return (
                b.freeSlots.length - a.freeSlots.length ||
                bHasPriority - aHasPriority ||
                // eslint-disable-next-line no-underscore-dangle
                a._originalIndex - b._originalIndex // Preserve stability
            );
        });

    return [...ordered, ...longestSlots];
};

const RAW_SEARCH_SKILL_WEIGHTS = {
    'Attack Boost': 4,
    "Agitator": 4,
    "Burst": 4,
    'Peak Performance': 3,
    "Resentment": 3,
    'Adrenaline Rush': 3,
    "Counterstrike": 3,
    "Foray": 3,
    'Offensive Guard': 3,
    'Critical Eye': 2,
    'Weakness Exploit': 2,
    'Maximum Might': 2,
    'Latent Power': 2,
    'Critical Boost': 2
};

const getSearchSkillWeight = (skillName, optimizationGoal = 'highest_dps') => {
    if (optimizationGoal === 'highest_raw' || optimizationGoal === 'highest_dps') {
        return RAW_SEARCH_SKILL_WEIGHTS[skillName] || 1;
    }

    return 1;
};

export const getDecorationReplacementCost = skillName => {
    if (decorationReplacementCostCache.has(skillName)) {
        return decorationReplacementCostCache.get(skillName);
    }
    const costs = Object.values(currentDecorations).flatMap(decoData => {
        const skillLevel = Number(decoData?.[1]?.[skillName] || 0);
        const slotSize = Number(decoData?.[2] || 0);
        return skillLevel > 0 && slotSize > 0 ? [slotSize / skillLevel] : [];
    });
    const replacementCost = costs.length ? Math.min(...costs) : 1;
    decorationReplacementCostCache.set(skillName, replacementCost);
    return replacementCost;
};

const scoreTalismanDecorationSavings = (talismanData, params) => {
    const talismanSkills = talismanData?.[1] || {};
    return Object.entries(params.skills || {}).reduce((total, [skillName, targetLevel]) => {
        const coveredLevel = Math.min(talismanSkills[skillName] || 0, targetLevel);
        return total + coveredLevel * getDecorationReplacementCost(skillName);
    }, 0);
};

export const sortTalismanCandidatesBySlotSavings = (entries, desiredSkills) => {
    const params = { skills: desiredSkills || {} };
    const targetCoverage = talismanData => Object.entries(desiredSkills || {}).reduce(
        (total, [skillName, targetLevel]) =>
            total + Math.min(talismanData?.[1]?.[skillName] || 0, targetLevel),
        0
    );
    return [...entries].sort((a, b) => {
        const savingsCompare = scoreTalismanDecorationSavings(b[1], params) -
            scoreTalismanDecorationSavings(a[1], params);
        if (savingsCompare !== 0) { return savingsCompare; }
        const coverageCompare = targetCoverage(b[1]) - targetCoverage(a[1]);
        if (coverageCompare !== 0) { return coverageCompare; }
        return a[0].localeCompare(b[0]);
    });
};

const getDamageProfileForSkills = (skills, params) => buildDamageProfile({
    skills,
    conditions: params.conditions,
    weaponBaseRaw: params.weaponBaseRaw,
    weaponBaseAffinity: params.weaponBaseAffinity,
    weaponType: params.weaponType,
    weaponElementType: params.weaponElementType,
    weaponElementValue: params.weaponElementValue,
    weaponSharpness: params.weaponSharpness
});

const scoreSkillGain = (currentSkills, addedSkills, params) => {
    const nextSkills = mergeSumMaps([currentSkills, addedSkills]);
    const targetScore = Object.entries(addedSkills).reduce((total, [skillName, level]) => {
        const targetLevel = params.skills?.[skillName] || 0;
        const missingLevel = Math.max(0, targetLevel - (currentSkills[skillName] || 0));
        return total + Math.min(level, missingLevel) * getSearchSkillWeight(skillName, params.optimizationGoal) * 1000;
    }, 0);
    if (params.optimizationGoal === 'efficient') {
        return { score: targetScore, nextSkills };
    }

    const currentProfile = getDamageProfileForSkills(currentSkills, params);
    const nextProfile = getDamageProfileForSkills(nextSkills, params);
    const modeledDamageGain = Math.max(
        0, (nextProfile.expected_dps || 0) - (currentProfile.expected_dps || 0)
    );
    return {
        score: targetScore + modeledDamageGain,
        nextSkills
    };
};

const scoreSocketDamagePotential = (baseSkills, armorSlots = [], weaponSlots = [], params) => {
    let currentSkills = { ...baseSkills };
    let totalScore = 0;
    const allSlots = [
        ...armorSlots.map(slot => ({ type: 'armor', size: slot })),
        ...weaponSlots.map(slot => ({ type: 'weapon', size: slot }))
    ].sort((a, b) => a.size - b.size);

    for (const slot of allSlots) {
        let best = null;
        for (const [decoName, decoData] of Object.entries(currentDecorations)) {
            const [decoType, decoSkills, decoSize] = decoData;
            if (decoType !== slot.type || decoSize > slot.size || (decoInventory[decoName] || 0) <= 0) {
                continue;
            }
            if (hasBlockedOffElementAttackSkill(decoSkills, params, params.skills || {})) {
                continue;
            }

            const scored = scoreSkillGain(currentSkills, decoSkills, params);
            if (!best || scored.score > best.score) {
                best = scored;
            }
        }

        if (best && best.score > 0) {
            totalScore += best.score;
            currentSkills = best.nextSkills;
        }
    }

    return totalScore;
};

const sortPiecesForSearch = (pieces, desiredSkills, optimizationGoal = 'highest_dps') => Object.entries(pieces).sort((a, b) => {
    const aData = a[1];
    const bData = b[1];
    let aContribution = 0;
    let bContribution = 0;

    for (const [skillName] of Object.entries(desiredSkills)) {
        const weight = getSearchSkillWeight(skillName, optimizationGoal);
        aContribution += (aData[1]?.[skillName] || 0) * weight;
        bContribution += (bData[1]?.[skillName] || 0) * weight;
    }
    aContribution += aData[3]?.length || 0;
    bContribution += bData[3]?.length || 0;

    return bContribution - aContribution;
});

const scoreTalismanForDamage = (talismanData, params) => {
    const talismanSkills = talismanData[1] || {};
    const directSkillScore = scoreSkillGain({}, talismanSkills, params).score;
    const socketScore = scoreSocketDamagePotential(talismanSkills, talismanData[3] || [], talismanData[8] || [], params);

    return directSkillScore + socketScore;
};

const getTalismanSignature = talismanData => {
    const skills = normalizeQueryMap(talismanData[1] || {});
    const armorSlots = normalizeList(talismanData[3] || []);
    const weaponSlots = normalizeList(talismanData[8] || []);
    return `${skills}::a${armorSlots}::w${weaponSlots}`;
};

const getTalismanScoreCacheKey = (talismanData, params) => JSON.stringify({
    talisman: getTalismanSignature(talismanData),
    skills: normalizeQueryMap(params.skills),
    conditions: params.conditions || {},
    optimizationGoal: params.optimizationGoal || 'highest_dps',
    weaponBaseRaw: params.weaponBaseRaw || 0,
    weaponBaseAffinity: params.weaponBaseAffinity || 0,
    weaponType: params.weaponType || 'other',
    weaponElementType: params.weaponElementType || 'None',
    weaponElementValue: params.weaponElementValue || 0,
    weaponSharpness: params.weaponSharpness || 'White',
    decoMods: normalizeQueryMap(params.decoMods)
});

const scoreTalismanForDamageCached = (talismanData, params) => {
    const cacheKey = getTalismanScoreCacheKey(talismanData, params);
    const cachedScore = talismanScoreCache.get(cacheKey);
    if (cachedScore !== undefined) {
        return cachedScore;
    }

    const score = scoreTalismanForDamage(talismanData, params);
    cacheTalismanScore(cacheKey, score);
    return score;
};

const scoreTalismanRequiredCoverage = (talismanData, params) => {
    const talismanSkills = talismanData[1] || {};
    const armorSlots = talismanData[3] || [];
    const weaponSlots = talismanData[8] || [];
    const targetSkills = params.skills || {};

    const targetCoverage = Object.entries(targetSkills).reduce((total, [skillName, targetLevel]) => {
        const coveredLevel = Math.min(talismanSkills[skillName] || 0, targetLevel);
        return total + coveredLevel;
    }, 0);
    const weightedCoverage = Object.entries(targetSkills).reduce((total, [skillName, targetLevel]) => {
        const coveredLevel = Math.min(talismanSkills[skillName] || 0, targetLevel);
        return total + coveredLevel * getSearchSkillWeight(skillName, params.optimizationGoal);
    }, 0);
    const socketValue = armorSlots.length * 12 + weaponSlots.length * 18 +
        armorSlots.reduce((total, slot) => total + slot, 0) +
        weaponSlots.reduce((total, slot) => total + slot * 1.5, 0);

    const decorationSavings = scoreTalismanDecorationSavings(talismanData, params);
    return targetCoverage * 100000 + decorationSavings * 10000 + weightedCoverage * 1000 + socketValue;
};

const sortTalismansForDamage = (gear, params) => {
    if (!gear?.talisman || params.findOne) { return gear; }

    const customTalismanNames = new Set((params.customTalismans || []).map(talisman => talisman.name));
    const isCustomTalisman = name => customTalismanNames.has(name);
    const isBaseTalisman = name => Boolean(TALISMANS[name]);
    const isGeneratedTalisman = name => !isCustomTalisman(name) && !isBaseTalisman(name);
    const sourcePriority = name => {
        if (isCustomTalisman(name)) { return 3; }
        if (isBaseTalisman(name)) { return 2; }
        return 1;
    };

    const [fixedTalismans, generatedTalismans] = Object.entries(gear.talisman).reduce((groups, entry) => {
        groups[isGeneratedTalisman(entry[0]) ? 1 : 0].push(entry);
        return groups;
    }, [[], []]);
    const coverageCandidateLimit = Math.ceil(GENERATED_TALISMAN_CANDIDATE_LIMIT * 0.6);
    const damageCandidateLimit = GENERATED_TALISMAN_CANDIDATE_LIMIT - coverageCandidateLimit;
    // Sorting comparators run O(n log n) times. Damage scoring is expensive and
    // the bounded global cache can churn when generated talismans exceed its
    // capacity, so compute both scores exactly once per candidate.
    const scoredGeneratedTalismans = generatedTalismans.map(entry => ({
        entry,
        coverage: scoreTalismanRequiredCoverage(entry[1], params),
        damage: scoreTalismanForDamageCached(entry[1], params)
    }));
    const damageScoreByName = new Map(scoredGeneratedTalismans.map(candidate => [
        candidate.entry[0], candidate.damage
    ]));
    const coverageCandidates = [...scoredGeneratedTalismans]
        .sort((a, b) => {
            const coverageCompare = b.coverage - a.coverage;
            if (coverageCompare !== 0) { return coverageCompare; }
            return b.entry[0].localeCompare(a.entry[0]);
        })
        .slice(0, coverageCandidateLimit)
        .map(candidate => candidate.entry);
    const damageCandidates = [...scoredGeneratedTalismans]
        .sort((a, b) => {
            const scoreCompare = b.damage - a.damage;
            if (scoreCompare !== 0) { return scoreCompare; }
            return b.entry[0].localeCompare(a.entry[0]);
        })
        .slice(0, damageCandidateLimit)
        .map(candidate => candidate.entry);
    const generatedCandidates = Array.from(new Map([...coverageCandidates, ...damageCandidates]));

    gear.talisman = Object.fromEntries([...fixedTalismans, ...generatedCandidates].sort((a, b) => {
        const savingsCompare = scoreTalismanDecorationSavings(b[1], params) -
            scoreTalismanDecorationSavings(a[1], params);
        if (savingsCompare !== 0) { return savingsCompare; }
        const scoreCompare = (damageScoreByName.get(b[0]) ?? scoreTalismanForDamageCached(b[1], params)) -
            (damageScoreByName.get(a[0]) ?? scoreTalismanForDamageCached(a[1], params));
        if (scoreCompare !== 0) { return scoreCompare; }

        return sourcePriority(b[0]) - sourcePriority(a[0]);
    }));

    return gear;
};

const normalizeSlotsForDominance = slots => [...slots || []].sort((a, b) => b - a);

const dominatesNumberArray = (left = [], right = []) => {
    const maxLength = Math.max(left.length, right.length);
    for (let i = 0; i < maxLength; i++) {
        if ((left[i] || 0) < (right[i] || 0)) {
            return false;
        }
    }

    return true;
};

const getPieceBonusSignature = (piece, relevantSetNames = null, relevantGroupNames = null) => {
    const setSkillNames = _x.setSkills(piece) || [];
    const groupSkillNames = _x.groupSkills(piece) || [];
    if (relevantSetNames || relevantGroupNames) {
        return JSON.stringify([
            [...relevantSetNames || []].map(name => setSkillNames.includes(name) ? 1 : 0),
            [...relevantGroupNames || []].map(name => groupSkillNames.includes(name) ? 1 : 0)
        ]);
    }
    return [
        ...setSkillNames,
        "|",
        ...groupSkillNames
    ].join(";");
};

const getDominanceSkillLevel = (piece, skillName) => {
    return _x.skills(piece)?.[skillName] || 0;
};

const doesPieceDominate = (challenger, target, desiredSkillNames, options = {}) => {
    if (!options.bonusSignatureMatched && getPieceBonusSignature(
        challenger, options.relevantSetNames, options.relevantGroupNames
    ) !== getPieceBonusSignature(
        target, options.relevantSetNames, options.relevantGroupNames
    )) {
        return false;
    }
    if (!dominatesNumberArray(normalizeSlotsForDominance(_x.slots(challenger)), normalizeSlotsForDominance(_x.slots(target)))) {
        return false;
    }
    if (!options.feasibilityOnly) {
        if ((_x.defense(challenger) || 0) < (_x.defense(target) || 0)) {
            return false;
        }
        if (!dominatesNumberArray(_x.resists(challenger), _x.resists(target))) {
            return false;
        }
    }

    return desiredSkillNames.every(skillName => {
        return getDominanceSkillLevel(challenger, skillName) >= getDominanceSkillLevel(target, skillName);
    });
};

export const pruneDominatedCandidateList = (
    candidateEntries, desiredSkills, profile = null, options = {}
) => {
    const desiredSkillNames = Object.keys(desiredSkills || {});
    if (profile) {
        profile.inputCandidateCount = (profile.inputCandidateCount || 0) + candidateEntries.length;
    }
    if (candidateEntries.length < 2) {
        if (profile) {
            profile.filteredCandidateCount = (profile.filteredCandidateCount || 0) + candidateEntries.length;
        }
        return candidateEntries;
    }

    const entriesByBonusSignature = new Map();
    candidateEntries.forEach(entry => {
        const signature = getPieceBonusSignature(
            entry[1], options.relevantSetNames, options.relevantGroupNames
        );
        const group = entriesByBonusSignature.get(signature) || [];
        group.push(entry);
        entriesByBonusSignature.set(signature, group);
    });
    const keptEntries = new Set();
    const matchedOptions = { ...options, bonusSignatureMatched: true };
    entriesByBonusSignature.forEach(group => {
        const keptInGroup = [];
        for (const entry of group) {
            const [, piece] = entry;
            if (keptInGroup.some(([, keptPiece]) => doesPieceDominate(
                keptPiece, piece, desiredSkillNames, matchedOptions
            ))) {
                continue;
            }

            for (let index = keptInGroup.length - 1; index >= 0; index--) {
                if (doesPieceDominate(
                    piece, keptInGroup[index][1], desiredSkillNames, matchedOptions
                )) {
                    keptInGroup.splice(index, 1);
                }
            }
            keptInGroup.push(entry);
        }
        keptInGroup.forEach(entry => keptEntries.add(entry));
    });
    const kept = candidateEntries.filter(entry => keptEntries.has(entry));

    if (profile) {
        profile.filteredCandidateCount = (profile.filteredCandidateCount || 0) + kept.length;
        profile.dominatedCandidateCount = (profile.dominatedCandidateCount || 0) +
            candidateEntries.length - kept.length;
    }
    return kept;
};

const getSortedCandidateList = (
    gear, slot, desiredSkills, optimizationGoal = 'highest_dps', profile = null
) => {
    if (slot === "talisman") {
        const candidates = sortTalismanCandidatesBySlotSavings(Object.entries(gear[slot]), desiredSkills);
        if (profile) {
            profile.inputCandidateCount = (profile.inputCandidateCount || 0) + candidates.length;
            profile.filteredCandidateCount = (profile.filteredCandidateCount || 0) + candidates.length;
        }
        return candidates;
    }

    return pruneDominatedCandidateList(
        sortPiecesForSearch(gear[slot], desiredSkills, optimizationGoal),
        desiredSkills,
        profile,
        gear.feasibilityOnly ? {
            feasibilityOnly: true,
            relevantSetNames: gear.relevantSetNames,
            relevantGroupNames: gear.relevantGroupNames
        } : {}
    );
};

const getBonusSupportTargets = (setSkills, groupSkills, setSkillBonus, groupSkillBonus) => [
    ...Object.entries(setSkills || {}).map(([name, level]) => ({
        name,
        type: 'set',
        points: Math.max(0, level * 2 - (setSkillBonus === name ? 1 : 0))
    })),
    ...Object.entries(groupSkills || {}).map(([name]) => ({
        name,
        type: 'group',
        points: Math.max(0, 3 - (groupSkillBonus === name ? 1 : 0))
    }))
].filter(target => target.points > 0);

const getBonusSupportVector = (piece, targets) => targets.map(target => {
    const names = target.type === 'set' ? _x.setSkills(piece) : _x.groupSkills(piece);
    return (names || []).includes(target.name) ? 1 : 0;
});

const addBonusSupportVectors = (left, right, targets) => left.map((value, index) =>
    Math.min(targets[index].points, value + right[index])
);

const getUniqueSupportVectors = vectors => [...new Map(
    vectors.map(vector => [vector.join(','), vector])
).values()];

const advanceBonusSupportStates = (states, vectors, targets) => getUniqueSupportVectors(
    states.flatMap(state => vectors.map(vector => addBonusSupportVectors(state, vector, targets)))
);

export const pruneBonusUnsupportedCandidateLists = (
    candidateLists, setSkills = {}, groupSkills = {}, setSkillBonus = '', groupSkillBonus = '',
    profile = null
) => {
    const targets = getBonusSupportTargets(
        setSkills, groupSkills, setSkillBonus, groupSkillBonus
    );
    if (!targets.length) { return candidateLists; }
    const slots = ['head', 'chest', 'arms', 'waist', 'legs'];
    const zero = targets.map(() => 0);
    const vectorsBySlot = slots.map(slot => getUniqueSupportVectors(
        (candidateLists[slot] || []).map(([, piece]) => getBonusSupportVector(piece, targets))
    ));
    const prefix = [ [zero] ];
    slots.forEach((slot, index) => {
        prefix[index + 1] = advanceBonusSupportStates(prefix[index], vectorsBySlot[index], targets);
    });
    const suffix = Array(slots.length + 1);
    suffix[slots.length] = [zero];
    for (let index = slots.length - 1; index >= 0; index--) {
        suffix[index] = advanceBonusSupportStates(
            suffix[index + 1], vectorsBySlot[index], targets
        );
    }
    const next = { ...candidateLists };
    let removed = 0;
    slots.forEach((slot, slotIndex) => {
        next[slot] = (candidateLists[slot] || []).filter(([, piece]) => {
            const pieceVector = getBonusSupportVector(piece, targets);
            const supported = prefix[slotIndex].some(left => suffix[slotIndex + 1].some(right =>
                targets.every((target, targetIndex) =>
                    left[targetIndex] + pieceVector[targetIndex] + right[targetIndex] >= target.points
                )
            ));
            if (!supported) { removed++; }
            return supported;
        });
    });
    if (profile) {
        profile.bonusUnsupportedCandidateCount =
            (profile.bonusUnsupportedCandidateCount || 0) + removed;
        profile.filteredCandidateCount = Math.max(
            0, (profile.filteredCandidateCount || 0) - removed
        );
    }
    return next;
};

const getEquivalentArmorSignature = (
    piece, desiredSkills, requiredSetPoints, requiredGroupPoints, discoveryBonuses = null
) => JSON.stringify({
    skills: Object.entries(desiredSkills).map(([skillName, targetLevel]) => [
        skillName,
        Math.min(targetLevel, _x.skills(piece)?.[skillName] || 0)
    ]),
    slots: normalizeSlotsForDominance(_x.slots(piece)),
    sets: discoveryBonuses ?
        [..._x.setSkills(piece) || []]
            .filter(name => discoveryBonuses.setNames.has(name)).sort() :
        Object.keys(requiredSetPoints).map(skillName =>
            (_x.setSkills(piece) || []).includes(skillName) ? 1 : 0
        ),
    groups: discoveryBonuses ?
        [..._x.groupSkills(piece) || []]
            .filter(name => discoveryBonuses.groupNames.has(name)).sort() :
        Object.keys(requiredGroupPoints).map(skillName =>
            (_x.groupSkills(piece) || []).includes(skillName) ? 1 : 0
        )
});

export const groupEquivalentArmorCandidates = (
    entries, desiredSkills, requiredSetPoints = {}, requiredGroupPoints = {},
    discoveryBonuses = null
) => {
    const groups = new Map();
    entries.forEach(entry => {
        const signature = getEquivalentArmorSignature(
            entry[1], desiredSkills, requiredSetPoints, requiredGroupPoints,
            discoveryBonuses === true ? {
                setNames: new Set(entries.flatMap(([, piece]) => _x.setSkills(piece) || [])),
                groupNames: new Set(entries.flatMap(([, piece]) => _x.groupSkills(piece) || []))
            } : discoveryBonuses
        );
        const group = groups.get(signature) || [];
        group.push(entry);
        groups.set(signature, group);
    });
    const representatives = [];
    const membersByPiece = new Map();
    groups.forEach(members => {
        representatives.push(members[0]);
        membersByPiece.set(members[0][1], members);
    });
    return { representatives, membersByPiece };
};

const expandEquivalentPieceSets = (pieces, membersByPiece, limit) => {
    const slots = ['head', 'chest', 'arms', 'waist', 'legs', 'talisman'];
    const expanded = [];
    const visit = (index, current) => {
        if (expanded.length >= limit) { return; }
        if (index >= slots.length) {
            expanded.push(current);
            return;
        }
        const slot = slots[index];
        const representative = pieces[slot];
        const members = membersByPiece.get(representative[1]) || [representative];
        members.forEach(member => visit(index + 1, { ...current, [slot]: member }));
    };
    visit(0, {});
    return expanded;
};

export const orderMitmSlotsByRestriction = (slots, candidateLists) => [...slots].sort(
    (left, right) => candidateLists[left].length - candidateLists[right].length ||
        left.localeCompare(right)
);

const buildSearchGear = (params, setSkills = params.setSkills, groupSkills = params.groupSkills) => {
    const candidateSetSkills = params.bonusDiscovery ? {
        ...setSkills,
        ...Object.fromEntries(params.bonusDiscoverySetNames.map(name => [name, 1]))
    } : setSkills;
    const candidateGroupSkills = params.bonusDiscovery ? {
        ...groupSkills,
        ...Object.fromEntries(params.bonusDiscoveryGroupNames.map(name => [name, 1]))
    } : groupSkills;
    let gear = speed(
        getBestArmor, params.skills, candidateSetSkills, candidateGroupSkills,
        params.mandatoryArmor, params.blacklistedArmor, params.blacklistedArmorTypes,
        params.dontUseDecos, params.weaponSlots, params.setSkillBonus, params.groupSkillBonus,
        params.customTalismans, params.useOnlyOwnedTalismans, params.customDecorations
    );
    gear = {
        ...gear,
        weaponElementType: params.weaponElementType,
        weaponElementValue: params.weaponElementValue,
        weaponType: params.weaponType,
        weaponBaseRaw: params.weaponBaseRaw,
        weaponBaseAffinity: params.weaponBaseAffinity,
        weaponSharpness: params.weaponSharpness
    };

    return sortTalismansForDamage(gear, params);
};

const getPieceSkillPotential = (
    slot, piece, skillName, decorationOptions, baseWeaponSlots = []
) => {
    const points = piece[1]?.[skillName] || 0;
    const armorSlots = piece[3] || [];
    const weaponSlots = slot === "talisman" ? [...baseWeaponSlots, ..._x.weaponSlots(piece)] : [];
    let bestDecoPotential = 0;

    for (const deco of decorationOptions) {
        const validSlots = deco[0] === "weapon" ? weaponSlots : armorSlots;
        const decoSkillLevel = deco[1]?.[skillName];
        if (decoSkillLevel && validSlots.length) {
            bestDecoPotential = Math.max(
                bestDecoPotential,
                decoSkillLevel * validSlots.filter(slotSize => slotSize >= deco[2]).length
            );
        }
    }

    return points + bestDecoPotential;
};

const buildSkillPotentialSuffix = (candidateLists, armorSlots, desiredSkills, decos, baseWeaponSlots = []) => {
    const skillNames = Object.keys(desiredSkills);
    const piecePotentialMap = buildPiecePotentialMap(candidateLists, armorSlots, desiredSkills, decos, baseWeaponSlots);
    const potential = Object.fromEntries(
        skillNames.map(name => [name, Array(armorSlots.length + 1).fill(0)])
    );

    for (let index = armorSlots.length - 1; index >= 0; index--) {
        const slot = armorSlots[index];
        for (const skillName of skillNames) {
            const bestSlotPotential = candidateLists[slot].reduce((best, [, piece]) => {
                return Math.max(best, piecePotentialMap.get(piece)?.[skillName] || 0);
            }, 0);
            potential[skillName][index] = potential[skillName][index + 1] + bestSlotPotential;
        }
    }

    return { potential, piecePotentialMap };
};

const buildPiecePotentialMap = (candidateLists, armorSlots, desiredSkills, decos, baseWeaponSlots = []) => {
    const skillNames = Object.keys(desiredSkills);
    const piecePotentialMap = new Map();
    const decorationOptionsBySkill = Object.fromEntries(skillNames.map(skillName => [
        skillName,
        Object.values(decos).filter(deco => deco[1]?.[skillName])
    ]));

    for (const slot of armorSlots) {
        for (const [, piece] of candidateLists[slot]) {
            if (piecePotentialMap.has(piece)) { continue; }
            piecePotentialMap.set(piece, Object.fromEntries(
                skillNames.map(skillName => [
                    skillName,
                    getPieceSkillPotential(
                        slot, piece, skillName, decorationOptionsBySkill[skillName], baseWeaponSlots
                    )
                ])
            ));
        }
    }

    return piecePotentialMap;
};

export const validateSearchFeasibility = (
    gear, desiredSkills = {}, setSkills = {}, groupSkills = {}, optimizationGoal = 'highest_dps',
    profile = null
) => {
    const armorSlots = getArmorTypeList();
    let candidateLists = Object.fromEntries(
        armorSlots.map(slot => [
            slot,
            getSortedCandidateList(gear, slot, desiredSkills, optimizationGoal, profile)
        ])
    );
    candidateLists = pruneBonusUnsupportedCandidateLists(
        candidateLists, setSkills, groupSkills, gear.setSkillBonus, gear.groupSkillBonus, profile
    );
    const reasons = [];

    for (const slot of armorSlots) {
        if (!candidateLists[slot].length) {
            reasons.push(`No ${slot} candidates remain after the current filters.`);
        }
    }

    const { potential } = buildSkillPotentialSuffix(
        candidateLists, armorSlots, desiredSkills, gear.decos || {}, gear.weaponSlots || []
    );
    for (const [skillName, targetLevel] of Object.entries(desiredSkills)) {
        const maximum = potential[skillName]?.[0] || 0;
        if (maximum < targetLevel) {
            reasons.push(`${skillName} Lv. ${targetLevel} cannot be reached (maximum ${maximum}).`);
        }
    }

    const checkBonusPieces = (requirements, accessor, pointsForLevel, bonusName) => {
        for (const [skillName, level] of Object.entries(requirements)) {
            const bonusPoint = bonusName === skillName ? 1 : 0;
            const required = Math.max(0, pointsForLevel(level) - bonusPoint);
            const maximum = armorSlots.reduce((total, slot) => total + (
                candidateLists[slot].some(([, piece]) => accessor(piece)?.includes(skillName)) ? 1 : 0
            ), 0);
            if (maximum < required) {
                reasons.push(`${skillName} requires ${required} matching pieces, but at most ${maximum} are available.`);
            }
        }
    };

    checkBonusPieces(setSkills, _x.setSkills, level => level * 2, gear.setSkillBonus);
    checkBonusPieces(groupSkills, _x.groupSkills, () => 3, gear.groupSkillBonus);

    return { possible: reasons.length === 0, reasons, candidateLists };
};

const getMitmSlotKey = slots => [...slots].sort((a, b) => b - a).join(',');

const createMitmVectorSchema = (
    desiredSkills, requiredSetPoints, requiredGroupPoints, discoveryBonuses = null
) => {
    const skillNames = Object.keys(desiredSkills);
    const setNames = Object.keys(requiredSetPoints);
    const groupNames = Object.keys(requiredGroupPoints);
    return {
        skillNames,
        skillTargets: skillNames.map(name => desiredSkills[name]),
        skillIndex: new Map(skillNames.map((name, index) => [name, index])),
        setNames,
        setTargets: setNames.map(name => requiredSetPoints[name]),
        setIndex: new Map(setNames.map((name, index) => [name, index])),
        groupNames,
        groupTargets: groupNames.map(name => requiredGroupPoints[name]),
        groupIndex: new Map(groupNames.map((name, index) => [name, index])),
        preserveBonusDiversity: Boolean(discoveryBonuses),
        discoverySetNames: discoveryBonuses?.setNames || new Set(),
        discoveryGroupNames: discoveryBonuses?.groupNames || new Set()
    };
};

const addBonusCounts = (counts, names, trackedNames) => {
    const next = { ...counts };
    (names || []).forEach(name => {
        if (!trackedNames.has(name)) { return; }
        next[name] = (next[name] || 0) + 1;
    });
    return next;
};

const getBonusCountsKey = counts => Object.entries(counts || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, points]) => `${name}:${points}`)
    .join(',');

const addMapToMitmVector = (source, additions, index, targets) => {
    const result = new Uint16Array(source);
    Object.entries(additions || {}).forEach(([name, level]) => {
        const position = index.get(name);
        if (position !== undefined) {
            result[position] = Math.min(targets[position], result[position] + level);
        }
    });
    return result;
};

const addNamesToMitmVector = (source, names, index, targets) => {
    const result = new Uint8Array(source);
    (names || []).forEach(name => {
        const position = index.get(name);
        if (position !== undefined) {
            result[position] = Math.min(targets[position], result[position] + 1);
        }
    });
    return result;
};

const sumMitmVectors = (left, right, targets) => {
    const result = new Uint16Array(targets.length);
    for (let index = 0; index < targets.length; index++) {
        result[index] = Math.min(targets[index], left[index] + right[index]);
    }
    return result;
};

const mitmVectorToMap = (vector, names) => Object.fromEntries(
    names.map((name, index) => [name, vector[index]]).filter(([, level]) => level > 0)
);

const getMitmSortedSlots = slots => [...slots].sort((left, right) => right - left);

const doSortedMitmSlotsDominate = (superior, candidate) =>
    superior.length >= candidate.length && candidate.every((size, index) => superior[index] >= size);

const doesMitmSkillVectorDominate = (superior, candidate) => {
    if (superior.skillVector.length !== candidate.skillVector.length) { return false; }
    for (let index = 0; index < superior.skillVector.length; index++) {
        if (superior.skillVector[index] < candidate.skillVector[index]) { return false; }
    }
    return true;
};

export const doesMitmStateDominate = (superior, candidate) =>
    doesMitmSkillVectorDominate(superior, candidate) &&
        doSortedMitmSlotsDominate(
            superior.sortedArmorSlots || getMitmSortedSlots(superior.armorSlots),
            candidate.sortedArmorSlots || getMitmSortedSlots(candidate.armorSlots)
        ) && doSortedMitmSlotsDominate(
            superior.sortedWeaponSlots || getMitmSortedSlots(superior.weaponSlots),
            candidate.sortedWeaponSlots || getMitmSortedSlots(candidate.weaponSlots)
        );

const addToMitmInfeasibleFrontier = (frontier, state) => {
    if (frontier.some(existing => doesMitmStateDominate(existing, state))) { return frontier; }
    return frontier.filter(existing => !doesMitmStateDominate(state, existing)).concat(state);
};

const getMitmStateKey = state => [
    state.skillVector.join(','),
    state.setVector.join(','),
    state.groupVector.join(','),
    getMitmSlotKey(state.slots),
    getMitmSlotKey(state.weaponSlots),
    state.preserveBonusDiversity ? getBonusCountsKey(state.setBonusCounts) : '',
    state.preserveBonusDiversity ? getBonusCountsKey(state.groupBonusCounts) : ''
].join('|');

const getMitmBonusKey = state => `${state.setVector.join(',')}|${state.groupVector.join(',')}`;

const getMitmCoverageScore = state => {
    const skillScore = state.skillVector.reduce((total, level) => total + level, 0);
    const discoveryScore = Object.values(state.setBonusCounts || {})
        .concat(Object.values(state.groupBonusCounts || {}))
        .reduce((total, points) => total + points, 0);
    return discoveryScore * 10000 + skillScore * 100 +
        state.slots.reduce((total, size) => total + size, 0) +
        state.weaponSlots.reduce((total, size) => total + size, 0);
};

const getMitmHalfCacheKeys = (slotsToBuild, candidateLists, vectorSchema) => {
    const candidateSignature = slotsToBuild.map(slot => [
        slot,
        candidateLists[slot].map(([name, piece]) =>
            slot === 'talisman' ? [name, piece] : name
        )
    ]);
    const baseKey = JSON.stringify([
        slotsToBuild,
        vectorSchema.skillNames,
        vectorSchema.setNames,
        vectorSchema.groupNames,
        vectorSchema.preserveBonusDiversity,
        [...vectorSchema.discoverySetNames].sort(),
        [...vectorSchema.discoveryGroupNames].sort(),
        candidateSignature
    ]);
    const targetKey = JSON.stringify([
        vectorSchema.skillTargets,
        vectorSchema.setTargets,
        vectorSchema.groupTargets
    ]);
    const baseHash = stringToId(baseKey);
    return { baseKey, baseHash, cacheKey: `${baseHash}|${targetKey}` };
};

const cacheMitmHalf = (key, entry) => {
    const { states } = entry;
    while (mitmHalfCache.size >= MAX_MITM_HALF_CACHE_ENTRIES ||
        mitmHalfCacheStateCount + states.length > MAX_MITM_HALF_CACHE_STATES) {
        const oldestKey = mitmHalfCache.keys().next().value;
        if (oldestKey === undefined) { break; }
        mitmHalfCacheStateCount -= mitmHalfCache.get(oldestKey).states.length;
        mitmHalfCache.delete(oldestKey);
    }
    if (states.length > MAX_MITM_HALF_CACHE_STATES) { return; }
    mitmHalfCache.set(key, entry);
    mitmHalfCacheStateCount += states.length;
};

const doMitmTargetsCover = (cachedTargets, requestedTargets) =>
    requestedTargets.every((target, index) => cachedTargets[index] >= target);

const canProjectMitmHalfEntry = (entry, baseKey, baseHash, vectorSchema) =>
    entry.baseHash === baseHash && entry.baseKey === baseKey &&
    doMitmTargetsCover(entry.skillTargets, vectorSchema.skillTargets) &&
    doMitmTargetsCover(entry.setTargets, vectorSchema.setTargets) &&
    doMitmTargetsCover(entry.groupTargets, vectorSchema.groupTargets);

const projectMitmHalfStates = (states, vectorSchema) => {
    const projectedByKey = new Map();
    states.forEach(state => {
        const projected = {
            ...state,
            skillVector: Uint16Array.from(state.skillVector, (level, index) =>
                Math.min(level, vectorSchema.skillTargets[index])
            ),
            setVector: Uint8Array.from(state.setVector, (level, index) =>
                Math.min(level, vectorSchema.setTargets[index])
            ),
            groupVector: Uint8Array.from(state.groupVector, (level, index) =>
                Math.min(level, vectorSchema.groupTargets[index])
            )
        };
        const key = getMitmStateKey(projected);
        if (!projectedByKey.has(key)) { projectedByKey.set(key, projected); }
    });
    return [...projectedByKey.values()];
};

export const canDecorationSlotsCoverTotalDeficit = (
    skills, armorSlots, weaponSlots, desiredSkills, decos
) => {
    const missingSkills = Object.fromEntries(Object.entries(desiredSkills)
        .map(([skillName, targetLevel]) => [
            skillName,
            Math.max(0, targetLevel - (skills[skillName] || 0))
        ])
        .filter(([, missingLevel]) => missingLevel > 0));
    const totalMissing = Object.values(missingSkills).reduce((total, level) => total + level, 0);
    if (!totalMissing) { return true; }

    const getSlotCapacity = (slotType, slotSize, skillNames) => Object.values(decos || {}).reduce(
        (best, [decoType, decoSkills, decoSize]) => {
            if (decoType !== slotType || decoSize > slotSize) { return best; }
            const usefulPoints = skillNames.reduce((total, skillName) =>
                total + Math.min(missingSkills[skillName], decoSkills?.[skillName] || 0), 0
            );
            return Math.max(best, usefulPoints);
        },
        0
    );
    const canCoverSkillSubset = skillNames => {
        const required = skillNames.reduce((total, skillName) => total + missingSkills[skillName], 0);
        const maximumCapacity = armorSlots.reduce(
            (total, slotSize) => total + getSlotCapacity('armor', slotSize, skillNames), 0
        ) + weaponSlots.reduce(
            (total, slotSize) => total + getSlotCapacity('weapon', slotSize, skillNames), 0
        );
        return maximumCapacity >= required;
    };
    const missingNames = Object.keys(missingSkills);
    if (!canCoverSkillSubset(missingNames)) { return false; }
    for (let left = 0; left < missingNames.length; left++) {
        for (let right = left + 1; right < missingNames.length; right++) {
            if (!canCoverSkillSubset([missingNames[left], missingNames[right]])) { return false; }
        }
    }
    return true;
};

const canMitmReachDesiredSkills = (skills, armorSlots, weaponSlots, desiredSkills, decos) => {
    const eachSkillReachable = Object.entries(desiredSkills).every(([skillName, targetLevel]) => {
        const missingLevel = targetLevel - (skills[skillName] || 0);
        if (missingLevel <= 0) { return true; }

        let bestArmorPotential = 0;
        let bestWeaponPotential = 0;
        Object.values(decos || {}).forEach(([decoType, decoSkills, decoSize]) => {
            const level = decoSkills?.[skillName] || 0;
            if (!level) { return; }
            const compatibleSlots = decoType === 'weapon' ? weaponSlots : armorSlots;
            const potential = level * compatibleSlots.filter(slotSize => slotSize >= decoSize).length;
            if (decoType === 'weapon') {
                bestWeaponPotential = Math.max(bestWeaponPotential, potential);
            } else {
                bestArmorPotential = Math.max(bestArmorPotential, potential);
            }
        });
        return bestArmorPotential + bestWeaponPotential >= missingLevel;
    });
    return eachSkillReachable && canDecorationSlotsCoverTotalDeficit(
        skills, armorSlots, weaponSlots, desiredSkills, decos
    );
};

const getMitmFeasibilityKey = (skills, armorSlots, weaponSlots, desiredSkills) => JSON.stringify({
    skills: Object.entries(desiredSkills).map(([name, level]) => [name, Math.min(level, skills[name] || 0)]),
    armorSlots: getMitmSlotKey(armorSlots),
    weaponSlots: getMitmSlotKey(weaponSlots)
});

const buildMitmHalf = async(
    slotsToBuild, candidateLists, vectorSchema, cancelToken, profile
) => {
    let states = [{
        pieces: {},
        names: new Set(),
        skillVector: new Uint16Array(vectorSchema.skillNames.length),
        setVector: new Uint8Array(vectorSchema.setNames.length),
        groupVector: new Uint8Array(vectorSchema.groupNames.length),
        slots: [],
        weaponSlots: [],
        setBonusCounts: {},
        groupBonusCounts: {},
        preserveBonusDiversity: vectorSchema.preserveBonusDiversity
    }];

    for (const slot of slotsToBuild) {
        const nextByKey = new Map();
        let operations = 0;
        let generatedStates = 0;
        for (const state of states) {
            for (const [name, piece] of candidateLists[slot]) {
                if (name !== 'None' && state.names.has(name)) { continue; }
                const next = {
                    pieces: { ...state.pieces, [slot]: [name, piece] },
                    names: new Set(state.names),
                    skillVector: addMapToMitmVector(
                        state.skillVector, _x.skills(piece),
                        vectorSchema.skillIndex, vectorSchema.skillTargets
                    ),
                    setVector: addNamesToMitmVector(
                        state.setVector, _x.setSkills(piece),
                        vectorSchema.setIndex, vectorSchema.setTargets
                    ),
                    groupVector: addNamesToMitmVector(
                        state.groupVector, _x.groupSkills(piece),
                        vectorSchema.groupIndex, vectorSchema.groupTargets
                    ),
                    slots: state.slots.concat(_x.slots(piece) || []),
                    weaponSlots: state.weaponSlots.concat(
                        slot === 'talisman' ? _x.weaponSlots(piece) : []
                    ),
                    setBonusCounts: vectorSchema.preserveBonusDiversity ?
                        addBonusCounts(
                            state.setBonusCounts, _x.setSkills(piece), vectorSchema.discoverySetNames
                        ) : {},
                    groupBonusCounts: vectorSchema.preserveBonusDiversity ?
                        addBonusCounts(
                            state.groupBonusCounts, _x.groupSkills(piece), vectorSchema.discoveryGroupNames
                        ) : {},
                    preserveBonusDiversity: vectorSchema.preserveBonusDiversity
                };
                if (name !== 'None') { next.names.add(name); }
                const key = getMitmStateKey(next);
                if (!nextByKey.has(key)) { nextByKey.set(key, next); }
                profile.nodes++;
                generatedStates++;
                operations++;
                if (operations % 64 === 0 && cancelToken?.current) { return []; }
                if (operations % 1000 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    if (cancelToken?.current) { return []; }
                }
            }
        }
        profile.generatedHalfStates = (profile.generatedHalfStates || 0) + generatedStates;
        profile.compactedHalfStates = (profile.compactedHalfStates || 0) +
            generatedStates - nextByKey.size;
        states = [...nextByKey.values()];
    }
    return states;
};

const getOrBuildMitmHalf = async(
    slotsToBuild, candidateLists, vectorSchema, cancelToken, profile
) => {
    const { baseKey, baseHash, cacheKey } = getMitmHalfCacheKeys(
        slotsToBuild, candidateLists, vectorSchema
    );
    const cachedEntry = mitmHalfCache.get(cacheKey);
    if (cachedEntry?.baseKey === baseKey) {
        mitmHalfCache.delete(cacheKey);
        mitmHalfCache.set(cacheKey, cachedEntry);
        profile.halfCacheHits = (profile.halfCacheHits || 0) + 1;
        profile.halfCacheStatesReused = (profile.halfCacheStatesReused || 0) +
            cachedEntry.states.length;
        return cachedEntry.states;
    }
    const projectionSource = [...mitmHalfCache.values()]
        .filter(entry => canProjectMitmHalfEntry(entry, baseKey, baseHash, vectorSchema))
        .sort((left, right) => left.states.length - right.states.length)[0];
    if (projectionSource) {
        const states = projectMitmHalfStates(projectionSource.states, vectorSchema);
        const entry = {
            baseKey,
            baseHash,
            states,
            skillTargets: vectorSchema.skillTargets,
            setTargets: vectorSchema.setTargets,
            groupTargets: vectorSchema.groupTargets
        };
        cacheMitmHalf(cacheKey, entry);
        profile.halfProjectionCacheHits = (profile.halfProjectionCacheHits || 0) + 1;
        profile.halfCacheStatesReused = (profile.halfCacheStatesReused || 0) +
            projectionSource.states.length;
        profile.halfProjectionStatesCompacted =
            (profile.halfProjectionStatesCompacted || 0) + projectionSource.states.length - states.length;
        return states;
    }
    profile.halfCacheMisses = (profile.halfCacheMisses || 0) + 1;
    const states = await buildMitmHalf(
        slotsToBuild, candidateLists, vectorSchema, cancelToken, profile
    );
    if (!cancelToken?.current) {
        cacheMitmHalf(cacheKey, {
            baseKey,
            baseHash,
            states,
            skillTargets: vectorSchema.skillTargets,
            setTargets: vectorSchema.setTargets,
            groupTargets: vectorSchema.groupTargets
        });
    }
    return states;
};

const rollCombosMeetInMiddle = async(
    gear, desiredSkills, setSkills, groupSkills, limit, findOne = false, cancelToken = undefined,
    optimizationGoal = 'efficient', profile = createOptimizerProfile('mitm'), partialResultFunc = null,
    preparedCandidateLists = null
) => {
    if (!gear) { return []; }
    profile.engine = 'mitm';
    const armorSlots = getArmorTypeList();
    const requiredSetPoints = Object.fromEntries(Object.entries(setSkills).map(([name, level]) => [
        name, Math.max(0, level * 2 - (gear.setSkillBonus === name ? 1 : 0))
    ]));
    const requiredGroupPoints = Object.fromEntries(Object.keys(groupSkills).map(name => [
        name, Math.max(0, 3 - (gear.groupSkillBonus === name ? 1 : 0))
    ]));
    const discoverySetNames = new Set(gear.bonusDiscoverySetNames || []);
    const discoveryGroupNames = new Set(gear.bonusDiscoveryGroupNames || []);
    const discoveryBonuses = gear.bonusDiscovery ? {
        setNames: discoverySetNames,
        groupNames: discoveryGroupNames
    } : null;
    const discoveredSetNames = new Set();
    const discoveredGroupNames = new Set();
    const allDiscoveryTargets = [
        ...[...discoverySetNames].map(name => ({
            name,
            type: 'set',
            threshold: SET_SKILL_DB[name]?.[2]?.[0] || 2
        })),
        ...[...discoveryGroupNames].map(name => ({
            name,
            type: 'group',
            threshold: GROUP_SKILL_DB[name]?.[2] || 3
        }))
    ];
    const directedDiscoveryTarget = allDiscoveryTargets.find(target =>
        target.type === gear.bonusDiscoveryTargetType &&
        target.name === gear.bonusDiscoveryTargetName
    );
    if (directedDiscoveryTarget) {
        const targetLevel = Math.max(1, Number(gear.bonusDiscoveryTargetLevel || 1));
        directedDiscoveryTarget.threshold = directedDiscoveryTarget.type === 'set' ?
            Math.max(0, targetLevel * 2 - (gear.setSkillBonus === directedDiscoveryTarget.name ? 1 : 0)) :
            Math.max(0, 3 - (gear.groupSkillBonus === directedDiscoveryTarget.name ? 1 : 0));
    }
    const discoveryTargets = directedDiscoveryTarget ?
        [directedDiscoveryTarget] : allDiscoveryTargets;
    const allDiscoveryBonusesFound = () => discoveryTargets.every(target =>
        target.type === 'set' ?
            discoveredSetNames.has(target.name) : discoveredGroupNames.has(target.name)
    );
    const isDiscoveryTargetPending = target => target.type === 'set' ?
        !discoveredSetNames.has(target.name) : !discoveredGroupNames.has(target.name);
    const getDiscoveryPoints = (state, target) => target.type === 'set' ?
        state.setBonusCounts?.[target.name] || 0 :
        state.groupBonusCounts?.[target.name] || 0;
    const equivalentMembersByPiece = new Map();
    const candidateLists = Object.fromEntries(armorSlots.map(slot => {
        const sortedCandidates = preparedCandidateLists?.[slot] || getSortedCandidateList(
            gear, slot, desiredSkills, optimizationGoal, profile
        );
        if (preparedCandidateLists?.[slot]) {
            profile.candidateListReuseHits = (profile.candidateListReuseHits || 0) + 1;
        }
        if (slot === 'talisman') {
            sortedCandidates.forEach(entry => equivalentMembersByPiece.set(entry[1], [entry]));
            return [slot, sortedCandidates];
        }
        const grouped = groupEquivalentArmorCandidates(
            sortedCandidates, desiredSkills, requiredSetPoints, requiredGroupPoints,
            discoveryBonuses
        );
        grouped.membersByPiece.forEach((members, piece) => {
            equivalentMembersByPiece.set(piece, members);
            if (members.length > 1) {
                profile.equivalentGroupCount = (profile.equivalentGroupCount || 0) + 1;
                profile.equivalentCandidateCount = (profile.equivalentCandidateCount || 0) +
                    members.length - 1;
            }
        });
        return [slot, grouped.representatives];
    }));

    const leftSlotOrder = orderMitmSlotsByRestriction(['head', 'chest', 'arms'], candidateLists);
    const rightSlotOrder = orderMitmSlotsByRestriction(['waist', 'legs', 'talisman'], candidateLists);
    const vectorSchema = createMitmVectorSchema(
        desiredSkills, requiredSetPoints, requiredGroupPoints, discoveryBonuses
    );
    profile.leftSlotOrder = leftSlotOrder;
    profile.rightSlotOrder = rightSlotOrder;
    const leftStates = await getOrBuildMitmHalf(
        leftSlotOrder, candidateLists, vectorSchema, cancelToken, profile
    );
    const rightStates = await getOrBuildMitmHalf(
        rightSlotOrder, candidateLists, vectorSchema, cancelToken, profile
    );
    profile.leftStates = leftStates.length;
    profile.rightStates = rightStates.length;
    leftStates.sort((a, b) => getMitmCoverageScore(b) - getMitmCoverageScore(a));
    const rightBuckets = new Map();
    rightStates.forEach(state => {
        const key = getMitmBonusKey(state);
        const bucket = rightBuckets.get(key) || {
            setVector: state.setVector,
            groupVector: state.groupVector,
            states: []
        };
        bucket.states.push(state);
        rightBuckets.set(key, bucket);
    });
    const orderedRightBuckets = [...rightBuckets.values()];
    orderedRightBuckets.forEach(bucket => {
        bucket.states.sort((a, b) => getMitmCoverageScore(b) - getMitmCoverageScore(a));
        if (gear.bonusDiscovery) {
            bucket.discoveryStates = new Map(discoveryTargets.map(target => {
                const byMinimum = Array.from({ length: target.threshold + 1 }, (_, needed) =>
                    needed === 0 ? bucket.states : bucket.states.filter(state =>
                        getDiscoveryPoints(state, target) >= needed
                    )
                );
                return [`${target.type}:${target.name}`, byMinimum];
            }));
        }
    });
    const getDiscoveryRightStates = (left, bucket) => {
        const lists = discoveryTargets.filter(isDiscoveryTargetPending).map(target => {
            const needed = Math.max(0, target.threshold - getDiscoveryPoints(left, target));
            return bucket.discoveryStates.get(`${target.type}:${target.name}`)?.[needed] || [];
        }).filter(list => list.length);
        if (!lists.length) { return []; }

        const interleaved = [];
        const seen = new Set();
        const maxLength = Math.max(...lists.map(list => list.length));
        for (let index = 0; index < maxLength; index++) {
            lists.forEach(list => {
                const state = list[index];
                if (state && !seen.has(state)) {
                    seen.add(state);
                    interleaved.push(state);
                }
            });
        }
        return interleaved;
    };
    profile.rightBonusBuckets = orderedRightBuckets.length;
    const results = [];
    const decorationStateCache = new Map();
    let infeasibleFrontier = [];
    const emittedPartialThresholds = new Set();
    let checked = 0;
    let traversed = 0;
    for (const left of leftStates) {
        for (const bucket of orderedRightBuckets) {
            const setsSatisfied = vectorSchema.setTargets.every(
                (points, index) => left.setVector[index] + bucket.setVector[index] >= points
            );
            if (!setsSatisfied) {
                profile.pruned += bucket.states.length;
                continue;
            }
            const groupsSatisfied = vectorSchema.groupTargets.every(
                (points, index) => left.groupVector[index] + bucket.groupVector[index] >= points
            );
            if (!groupsSatisfied) {
                profile.pruned += bucket.states.length;
                continue;
            }

            const candidateRightStates = gear.bonusDiscovery ?
                getDiscoveryRightStates(left, bucket) : bucket.states;
            for (const right of candidateRightStates) {
                traversed++;
                if (traversed % 64 === 0 && cancelToken?.current) { return results; }
                if (gear.bonusDiscovery && traversed % 5000 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    if (cancelToken?.current) { return results; }
                }
                if ([...left.names].some(name => right.names.has(name))) { continue; }

                const combinedSkillVector = sumMitmVectors(
                    left.skillVector, right.skillVector, vectorSchema.skillTargets
                );
                const combinedSkills = mitmVectorToMap(combinedSkillVector, vectorSchema.skillNames);
                const combinedArmorSlots = [...left.slots, ...right.slots];
                const combinedWeaponSlots = [].concat(
                    gear.weaponSlots || [], left.weaponSlots, right.weaponSlots
                );
                if (!canMitmReachDesiredSkills(
                    combinedSkills, combinedArmorSlots, combinedWeaponSlots, desiredSkills, gear.decos
                )) {
                    profile.pruned++;
                    profile.skillBoundPruned = (profile.skillBoundPruned || 0) + 1;
                    continue;
                }
                const feasibilityKey = getMitmFeasibilityKey(
                    combinedSkills, combinedArmorSlots, combinedWeaponSlots, desiredSkills
                );
                if (decorationStateCache.has(feasibilityKey) && !decorationStateCache.get(feasibilityKey)) {
                    profile.pruned++;
                    profile.feasibilityCacheHits = (profile.feasibilityCacheHits || 0) + 1;
                    continue;
                }
                const dominanceState = {
                    skillVector: combinedSkillVector,
                    armorSlots: combinedArmorSlots,
                    weaponSlots: combinedWeaponSlots,
                    sortedArmorSlots: getMitmSortedSlots(combinedArmorSlots),
                    sortedWeaponSlots: getMitmSortedSlots(combinedWeaponSlots)
                };
                if (infeasibleFrontier.some(state => doesMitmStateDominate(state, dominanceState))) {
                    profile.pruned++;
                    profile.dominancePruned = (profile.dominancePruned || 0) + 1;
                    continue;
                }

                const pieces = { ...left.pieces, ...right.pieces };
                const fullSet = armorCombo(
                    formatArmorC(pieces.head), formatArmorC(pieces.chest), formatArmorC(pieces.arms),
                    formatArmorC(pieces.waist), formatArmorC(pieces.legs), formatArmorC(pieces.talisman),
                    gear.weaponSlots, gear.setSkillBonus, gear.groupSkillBonus
                );
                profile.leaves++;
                const cachedDecorationState = decorationStateCache.get(feasibilityKey);
                let result;
                if (cachedDecorationState) {
                    const decoSkills = getRequestedDecoSkillsFromNames(
                        cachedDecorationState.decoNames, desiredSkills
                    );
                    result = {
                        armorNames: fullSet.names,
                        slots: fullSet.slots,
                        weaponSlots: fullSet.weaponSlots,
                        decoNames: cachedDecorationState.decoNames.slice(),
                        requiredDecoNames: cachedDecorationState.requiredDecoNames.slice(),
                        autoDecoNames: cachedDecorationState.autoDecoNames.slice(),
                        baseSkills: fullSet.skills,
                        skills: mergeSumMaps([fullSet.skills, decoSkills]),
                        setSkills: fullSet.setSkills,
                        groupSkills: fullSet.groupSkills,
                        talismanData: fullSet.talismanData,
                        freeSlots: cachedDecorationState.freeSlots.slice(),
                        freeWeaponSlots: cachedDecorationState.freeWeaponSlots.slice()
                    };
                    profile.feasibilityCacheHits = (profile.feasibilityCacheHits || 0) + 1;
                } else {
                    if (cancelToken?.current) { return results; }
                    profile.decorationSolverCalls = (profile.decorationSolverCalls || 0) + 1;
                    result = test(fullSet, gear.decos, desiredSkills, gear);
                    if (!result) {
                        infeasibleFrontier = addToMitmInfeasibleFrontier(
                            infeasibleFrontier, dominanceState
                        );
                        profile.infeasibleFrontierSize = infeasibleFrontier.length;
                    }
                    decorationStateCache.set(feasibilityKey, result ? {
                        decoNames: result.decoNames.slice(),
                        requiredDecoNames: result.requiredDecoNames.slice(),
                        autoDecoNames: result.autoDecoNames.slice(),
                        freeSlots: result.freeSlots.slice(),
                        freeWeaponSlots: result.freeWeaponSlots.slice()
                    } : null);
                }
                if (result) {
                    const remainingResultCapacity = Math.max(1, limit - Math.min(results.length, limit));
                    const expandedPieceSets = expandEquivalentPieceSets(
                        pieces, equivalentMembersByPiece, remainingResultCapacity
                    );
                    for (const expandedPieces of expandedPieceSets) {
                        const expandedSet = armorCombo(
                            formatArmorC(expandedPieces.head), formatArmorC(expandedPieces.chest),
                            formatArmorC(expandedPieces.arms), formatArmorC(expandedPieces.waist),
                            formatArmorC(expandedPieces.legs), formatArmorC(expandedPieces.talisman),
                            gear.weaponSlots, gear.setSkillBonus, gear.groupSkillBonus
                        );
                        const decoSkills = getRequestedDecoSkillsFromNames(
                            result.decoNames, desiredSkills
                        );
                        const expandedResult = {
                            ...result,
                            armorNames: expandedSet.names,
                            slots: expandedSet.slots,
                            weaponSlots: expandedSet.weaponSlots,
                            baseSkills: expandedSet.skills,
                            skills: mergeSumMaps([expandedSet.skills, decoSkills]),
                            setSkills: expandedSet.setSkills,
                            groupSkills: expandedSet.groupSkills,
                            talismanData: expandedSet.talismanData
                        };
                        const newSetNames = [...discoverySetNames].filter(skillName => {
                            if (discoveredSetNames.has(skillName)) { return false; }
                            const target = discoveryTargets.find(candidate =>
                                candidate.type === 'set' && candidate.name === skillName
                            );
                            const threshold = target?.threshold || SET_SKILL_DB[skillName]?.[2]?.[0] || 2;
                            return (expandedSet.setSkills?.[skillName] || 0) >= threshold;
                        });
                        const newGroupNames = [...discoveryGroupNames].filter(skillName => {
                            if (discoveredGroupNames.has(skillName)) { return false; }
                            const target = discoveryTargets.find(candidate =>
                                candidate.type === 'group' && candidate.name === skillName
                            );
                            const threshold = target?.threshold || GROUP_SKILL_DB[skillName]?.[2] || 3;
                            return (expandedSet.groupSkills?.[skillName] || 0) >= threshold;
                        });
                        if (gear.bonusDiscovery && !newSetNames.length && !newGroupNames.length) {
                            continue;
                        }
                        expandedResult.id = stringToId(
                            `${expandedResult.armorNames.join(',')}_${expandedResult.decoNames.join(',')}`
                        );
                        results.push(expandedResult);
                        newSetNames.forEach(name => discoveredSetNames.add(name));
                        newGroupNames.forEach(name => discoveredGroupNames.add(name));
                        profile.expandedEquivalentResults = (profile.expandedEquivalentResults || 0) + 1;
                        [20, 50].forEach(threshold => {
                            if (results.length >= threshold && limit > threshold && partialResultFunc &&
                                !emittedPartialThresholds.has(threshold)) {
                                emittedPartialThresholds.add(threshold);
                                partialResultFunc(results.slice());
                            }
                        });
                        const normalLimitReached = !gear.bonusDiscovery && results.length >= limit;
                        const discoveryComplete = gear.bonusDiscovery && allDiscoveryBonusesFound();
                        if (findOne || normalLimitReached || discoveryComplete) {
                            return results;
                        }
                    }
                }
                checked++;
                const cancellationInterval = gear.bonusDiscovery ? 25 : 250;
                if (checked % cancellationInterval === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    if (cancelToken?.current) { return results; }
                }
            }
        }
    }
    return results;
};

export const test = (armorSet, decos, desiredSkills, params = {}) => {
    const have = {};
    const need = {};
    let done = true;
    for (const [skillName, level] of Object.entries(desiredSkills)) {
        have[skillName] = armorSet.skills[skillName] || 0;
        need[skillName] = level - have[skillName];
        if (need[skillName] > 0) { done = false; }
    }
    if (done) {
        return {
            armorNames: armorSet.names,
            slots: armorSet.slots,
            weaponSlots: armorSet.weaponSlots,
            decoNames: [],
            requiredDecoNames: [],
            autoDecoNames: [],
            baseSkills: armorSet.skills,
            skills: armorSet.skills,
            setSkills: armorSet.setSkills,
            groupSkills: armorSet.groupSkills,
            talismanData: armorSet.talismanData,
            freeSlots: armorSet.slots,
            freeWeaponSlots: armorSet.weaponSlots,
            // defense: armorSet.defense
        };
    }

    const decosUsed = getDecosToFulfillSkills(
        decos, desiredSkills, armorSet.slots, armorSet.weaponSlots, armorSet.skills, params
    );

    if (decosUsed) {
        const decosSkillsMap = getRequestedDecoSkillsFromNames(decosUsed.decoNames, desiredSkills);
        const combinedSkills = mergeSumMaps([armorSet.skills, decosSkillsMap]);

        return {
            armorNames: armorSet.names,
            slots: armorSet.slots,
            weaponSlots: armorSet.weaponSlots,
            decoNames: decosUsed.decoNames,
            requiredDecoNames: decosUsed.decoNames,
            autoDecoNames: [],
            baseSkills: armorSet.skills,
            skills: combinedSkills,
            setSkills: armorSet.setSkills,
            groupSkills: armorSet.groupSkills,
            talismanData: armorSet.talismanData,
            freeSlots: decosUsed.freeSlots,
            freeWeaponSlots: decosUsed.freeWeaponSlots,
            // defense: armorSet.defense
        };
    }

    return null;
};

const getMaxSkillLevelsFromResults = (results, allSkills, params = {}) => {
    const soFar = {};
    for (const res of results) {
        for (const [name, level] of Object.entries(res.skills)) {
            soFar[name] = Math.max(soFar[name] || 0, level);
            soFar[name] = Math.min(soFar[name], SKILL_DB[name]); // limit skill level max
        }
        for (const [name, level] of Object.entries(res.setSkills)) {
            soFar[name] = Math.max(soFar[name] || 0, level);
        }
        for (const [name, level] of Object.entries(res.groupSkills)) {
            soFar[name] = Math.max(soFar[name] || 0, level);
        }

        // if result has free slots, add skill levels from decos
        if (res.freeSlots.length > 0) {
            for (const [name, level] of Object.entries(allSkills)) {
                if (isSetSkillName(name) || isGroupSkillName(name)) {
                    continue;
                }
                if (isOffElementAttackSkill(name, params)) {
                    continue;
                }
                const neededLevel = level - (soFar[name] || 0);
                if (neededLevel === 0) { continue; }
                const bestDecos = getBestDecos({ [name]: level });
                if (isEmpty(bestDecos)) { continue; }
                const bestDeco = Object.values(bestDecos)?.[0];
                const slotSize = bestDeco[2];
                const skillLevel = bestDeco[1][name];
                const slotsWeUsing = res.freeSlots.filter(x => x >= slotSize);
                const newLevel = slotsWeUsing.length * skillLevel;
                soFar[name] = Math.max(newLevel, soFar[name] || 0);
                soFar[name] = Math.min(soFar[name], SKILL_DB[name]); // limit skill level max
            }
        }
    }

    return soFar;
};

const resultSignature = result => [
    result.armorNames.join("|"),
    [...result.decoNames].sort().join("|"),
    [...result.freeSlots].sort((a, b) => b - a).join("|"),
    [...result.freeWeaponSlots].sort((a, b) => b - a).join("|")
].join("::");

const getResultTalismanData = result => {
    const talismanName = result?.armorNames?.[5];
    return talismanName ? result?.talismanData?.[talismanName] : null;
};

export const collapseFlexibleTalismanResults = (results, desiredSkills = {}) => {
    const groups = new Map();
    results.forEach((result, resultIndex) => {
        const talismanData = getResultTalismanData(result);
        const talismanSkills = talismanData?.[1] || talismanData?.skills || {};
        const requestedTalismanSkills = Object.fromEntries(
            Object.entries(talismanSkills).filter(([skillName]) => desiredSkills[skillName])
        );
        const optionalTalismanSkills = Object.fromEntries(
            Object.entries(talismanSkills).filter(([skillName]) => !desiredSkills[skillName])
        );
        const slots = talismanData?.[3] || talismanData?.slots || [];
        const weaponSlots = talismanData?.[8] || talismanData?.weaponSlots || [];
        const hasOptionalSkills = Object.keys(optionalTalismanSkills).length > 0;
        const effectiveSkills = Object.assign({}, result.skills || {});
        Object.entries(optionalTalismanSkills).forEach(([skillName, level]) => {
            const remaining = (effectiveSkills[skillName] || 0) - level;
            if (remaining > 0) {
                effectiveSkills[skillName] = remaining;
            } else {
                delete effectiveSkills[skillName];
            }
        });
        const key = JSON.stringify({
            // Results without a flexible talisman must remain independent builds.
            standalone: hasOptionalSkills ? null : resultIndex,
            armor: result.armorNames?.slice(0, 5),
            effectiveSkills: Object.entries(effectiveSkills).sort(([a], [b]) => a.localeCompare(b)),
            slots,
            weaponSlots,
            freeSlots: [].concat(result.freeSlots || []).sort((a, b) => b - a),
            freeWeaponSlots: [].concat(result.freeWeaponSlots || []).sort((a, b) => b - a),
            setSkills: result.setSkills,
            groupSkills: result.groupSkills,
            dps: Number(result.damageProfile?.expected_dps || 0).toFixed(6)
        });
        const group = groups.get(key) || [];
        group.push({ result, requestedTalismanSkills, optionalTalismanSkills });
        groups.set(key, group);
    });

    const freeSlotScore = result => [].concat(
        result.freeSlots || [],
        result.freeWeaponSlots || []
    ).reduce((total, slotSize) => total + 4 ** slotSize, 0);

    return [...groups.values()].map(group => {
        group.sort((a, b) => freeSlotScore(b.result) - freeSlotScore(a.result));
        const flexOptions = {};
        group.forEach(({ optionalTalismanSkills }) => {
            Object.entries(optionalTalismanSkills).forEach(([skillName, level]) => {
                flexOptions[skillName] = Math.max(flexOptions[skillName] || 0, level);
            });
        });
        if (!Object.keys(flexOptions).length) { return group[0].result; }

        const removeFlexibleSkills = skills => {
            const cleaned = { ...skills };
            Object.entries(group[0].optionalTalismanSkills).forEach(([skillName, level]) => {
                const remaining = (cleaned[skillName] || 0) - level;
                if (remaining > 0) {
                    cleaned[skillName] = remaining;
                } else {
                    delete cleaned[skillName];
                }
            });
            return cleaned;
        };
        return {
            ...group[0].result,
            skills: removeFlexibleSkills(group[0].result.skills),
            baseSkills: removeFlexibleSkills(group[0].result.baseSkills),
            // Keep the concrete variants out of the table, but available as proven
            // starting points when the user selects one of the Flex recommendations.
            recommendationSeedResults: group.map(({ result }) => result),
            talismanFlex: {
                requestedSkills: group[0].requestedTalismanSkills,
                options: flexOptions,
                variantCount: group.length
            }
        };
    });
};

export const selectBonusDiscoveryWitnesses = (
    results, setNames = [], groupNames = []
) => {
    const bestByBonus = new Map();
    const consider = (result, skillName, level) => {
        if (!level) { return; }
        const current = bestByBonus.get(skillName);
        if (!current || level > current.level) {
            bestByBonus.set(skillName, { level, result });
        }
    };

    results.forEach(result => {
        setNames.forEach(skillName => consider(
            result, skillName, result.setSkills?.[skillName] || 0
        ));
        groupNames.forEach(skillName => consider(
            result, skillName, result.groupSkills?.[skillName] || 0
        ));
    });

    return Array.from(new Map(
        [...bestByBonus.values()].map(({ result }) => [result.id, result])
    ).values());
};

export const mergeUniqueResultGroups = resultGroups => Array.from(new Map(
    resultGroups.flat().map(result => [resultSignature(result), result])
).values());

const preparePartialResults = (rolls, params) => {
    let prepared = rolls.map(roll => ({
        ...roll,
        armorNames: [...roll.armorNames],
        slots: [...roll.slots],
        weaponSlots: [...roll.weaponSlots],
        decoNames: [...roll.decoNames],
        requiredDecoNames: [...roll.requiredDecoNames],
        autoDecoNames: [...roll.autoDecoNames],
        baseSkills: { ...roll.baseSkills },
        skills: { ...roll.skills },
        setSkills: { ...roll.setSkills },
        groupSkills: { ...roll.groupSkills },
        freeSlots: [...roll.freeSlots],
        freeWeaponSlots: [...roll.freeWeaponSlots]
    }));
    if (!isEmpty(params.slotFilters)) {
        const desiredSlots = Object.entries(params.slotFilters)
            .flatMap(([num, count]) => Array(count).fill(Number(num)))
            .sort((a, b) => b - a);
        prepared = prepared.filter(roll => {
            const freeSlots = [...roll.freeSlots].sort((a, b) => b - a);
            return desiredSlots.every((wanted, index) => freeSlots[index] >= wanted);
        });
    }
    prepared = prepared.map(roll => {
        const enrichedRoll = {
            ...roll,
            conditions: params.conditions || {},
            weaponBaseRaw: params.weaponBaseRaw,
            weaponBaseAffinity: params.weaponBaseAffinity,
            weaponType: params.weaponType,
            weaponElementType: params.weaponElementType,
            weaponElementValue: params.weaponElementValue,
            weaponSharpness: params.weaponSharpness,
            setSkillBonus: params.setSkillBonus || '',
            groupSkillBonus: params.groupSkillBonus || ''
        };
        const damageProfile = buildDamageProfile(enrichedRoll);
        return { ...enrichedRoll, damageProfile, tags: damageProfile.tags };
    });
    return collapseFlexibleTalismanResults(
        reorder(rankBuildsByDamage(prepared, params.optimizationGoal || 'efficient')),
        params.skills
    ).slice(0, params.limit);
};

export const extendPriorResults = (priorResults, params, decos = currentDecorations) => {
    if (!Array.isArray(priorResults) || !priorResults.length) { return []; }

    return priorResults.flatMap(priorResult => {
        const hasRequiredSetSkills = Object.entries(params.setSkills || {}).every(
            ([skillName, level]) => (priorResult.setSkills?.[skillName] || 0) >= level
        );
        const hasRequiredGroupSkills = Object.entries(params.groupSkills || {}).every(
            ([skillName, level]) => (priorResult.groupSkills?.[skillName] || 0) >= level
        );
        if (!hasRequiredSetSkills || !hasRequiredGroupSkills) { return []; }

        const extension = test({
            names: priorResult.armorNames,
            slots: priorResult.freeSlots || [],
            weaponSlots: priorResult.freeWeaponSlots || [],
            skills: priorResult.skills || {},
            setSkills: priorResult.setSkills || {},
            groupSkills: priorResult.groupSkills || {},
            talismanData: priorResult.talismanData || {}
        }, decos, params.skills || {}, params);
        if (!extension) { return []; }

        return [{
            ...priorResult,
            decoNames: [].concat(priorResult.decoNames || [], extension.decoNames || []),
            requiredDecoNames: [].concat(
                priorResult.requiredDecoNames || priorResult.decoNames || [],
                extension.requiredDecoNames || extension.decoNames || []
            ),
            freeSlots: extension.freeSlots,
            freeWeaponSlots: extension.freeWeaponSlots,
            skills: extension.skills,
            talismanData: priorResult.talismanData || extension.talismanData
        }];
    });
};

export const getAddableSkills = async parameters => {
    const params = getSearchParameters(parameters);
    const exhaustive = params.exhaustive;

    currentSlotFilters = { ...params.slotFilters };
    params.slotFilters = {};
    const priorResults = Array.isArray(params.priorResults) && params.priorResults.length ?
        params.priorResults :
        await search(parameters);
    const armorSkillsList = getArmorSkillNames();

    if (DEBUG) { console.log("beginning skill iterations..."); }
    const trimmedSkills = Object.fromEntries(
        Object.entries(SKILL_DB).filter(([name]) => armorSkillsList.includes(name))
    );
    const trimmedSetSkills = Object.fromEntries(
        Object.entries(SET_SKILL_DB).map(x => [x[0], 2])
    );
    const trimmedGroupSkills = Object.fromEntries(
        Object.entries(GROUP_SKILL_DB).map(x => [x[0], 1])
    );
    const combinedSkills = { ...trimmedSkills, ...trimmedSetSkills, ...trimmedGroupSkills };
    const totalSkills = Object.keys(combinedSkills).length;

    const skillsCanAdd = getMaxSkillLevelsFromResults(priorResults, combinedSkills, params);

    if (DEBUG) {
        console.log(`skillsCanAdd:\n${Object.entries(skillsCanAdd).filter(x => x[1]).map(x => `\t${x[0]}: ${x[1]}`).join("\n")}`);
    }

    for (const [name, level] of Object.entries(combinedSkills)) {
        const myLevel = skillsCanAdd[name];
        if (myLevel) {
            combinedSkills[name] = level - myLevel;
            if (params.addMoreFunc) { params.addMoreFunc(name, myLevel); }
        }
    }

    let counter = totalSkills - Object.values(combinedSkills).filter(x => x).length, lastProgress = 0;

    for (const [skillName, maxSkillLevel] of Object.entries(combinedSkills)) {
        // visual progress updating
        const percentDone = counter++ / totalSkills * 100;
        if (params.updateProgressFunc) {
            const rounded = Math.round(percentDone);
            if (rounded > lastProgress) {
                lastProgress = rounded;
                params.updateProgressFunc(rounded);
            }
        }
        if (counter % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (DEBUG) {
            console.log(`getMoreSkills Progress: ${percentDone.toFixed(2)}%...`);
        }

        // early exit check (if user presses "cancel")
        if (params.cancelToken?.current) {
            console.log("getMoreSkills() cancelled, exiting early");
            return skillsCanAdd;
        }

        const existingSkillLevel = skillsCanAdd[skillName] ?? 0;
        if (existingSkillLevel >= maxSkillLevel) { continue; }

        // const levelsToTry = numberTuple(maxSkillLevel, Math.max(1, existingSkillLevel));
        const levelsToTry = getSkillTestOrderBinary(maxSkillLevel, existingSkillLevel);
        console.log(`${skillName}: ${levelsToTry.join(', ')}`);

        for (const level of levelsToTry) {
            if (level <= skillsCanAdd[skillName] ?? 0) { continue; }
            // const good = isSkillInResults(priorResults, skillName, level);
            // if (good) {
            //     if (DEBUG) { console.log(`-+ ${skillName} ${level}: yes`); }
            //     skillsCanAdd[skillName] = level;
            //     if (params.addMoreFunc) { params.addMoreFunc(skillName, level); }
            //     if (level > 1) { break; }
            //     continue;
            // } else if (level === 1) {
            //     if (DEBUG) { console.log(`-+ ${skillName} ${level}: no`); }
            // }

            if (!exhaustive) { continue; }

            let skills = { ...params.skills };
            let setSkills = { ...params.setSkills };
            let groupSkills = { ...params.groupSkills };
            if (isSetSkillName(skillName)) {
                setSkills = { ...setSkills, [skillName]: level };
            } else if (isGroupSkillName(skillName)) {
                groupSkills = { ...groupSkills, [skillName]: level };
            } else {
                skills = { ...skills, [skillName]: level };
            }

            const rolls = await search({
                ...params,
                skills,
                setSkills,
                groupSkills,
                findOne: true
            });

            const found = rolls.length > 0;
            if (found) {
                if (DEBUG) { console.log(`-- ${skillName} ${level}: yes`); }
                skillsCanAdd[skillName] = level;
                if (params.addMoreFunc) { params.addMoreFunc(skillName, level); }
            }
        }
    }

    return skillsCanAdd;
};

export const search = async parameters => {
    const searchStartedAt = performance.now();
    let stageStartedAt = searchStartedAt;
    const params = getSearchParameters(parameters);
    const profile = createOptimizerProfile("search");
    recordOptimizerStage(profile, "normalizeParams", stageStartedAt);

    stageStartedAt = performance.now();
    const cacheKey = buildSearchCacheKey(params);
    recordOptimizerStage(profile, "cacheKey", stageStartedAt);

    stageStartedAt = performance.now();
    const cachedSearch = getCachedSearchResult(cacheKey);
    recordOptimizerStage(profile, "cacheLookup", stageStartedAt);
    if (cachedSearch) {
        profile.engine = "cache";
        profile.cacheHit = true;
        profile.runtimeMs = performance.now() - searchStartedAt;
        finishOptimizerProfile(profile, cachedSearch);
        return cachedSearch;
    }
    const maxComboSearchMs = params.maxSearchMs || MAX_COMBO_SEARCH_MS;
    const searchDeadline = createDeadlineToken({
        budgetMs: maxComboSearchMs,
        cancelToken: params.cancelToken
    });
    profile.searchBudgetMs = maxComboSearchMs;

    stageStartedAt = performance.now();
    configureSearchDecorations(params);
    recordOptimizerStage(profile, "decoInventory", stageStartedAt);

    stageStartedAt = performance.now();
    const seededRolls = extendPriorResults(params.priorResults, params, currentDecorations);
    profile.priorResults = params.priorResults.length;
    profile.priorExtensions = seededRolls.length;
    recordOptimizerStage(profile, "priorResultExtension", stageStartedAt);

    stageStartedAt = performance.now();
    const searchGearCacheKey = buildSearchGearCacheKey(params);
    const cachedGear = searchGearCache.get(searchGearCacheKey);
    const gear = cachedGear ? { ...cachedGear } : buildSearchGear(params);
    if (cachedGear) {
        searchGearCache.delete(searchGearCacheKey);
        searchGearCache.set(searchGearCacheKey, cachedGear);
        profile.candidatePrepCacheHits = (profile.candidatePrepCacheHits || 0) + 1;
    } else {
        cacheSearchGear(searchGearCacheKey, gear);
    }
    gear.bonusDiscovery = params.bonusDiscovery;
    gear.bonusDiscoverySetNames = params.bonusDiscoverySetNames;
    gear.bonusDiscoveryGroupNames = params.bonusDiscoveryGroupNames;
    gear.bonusDiscoveryTargetType = params.bonusDiscoveryTargetType;
    gear.bonusDiscoveryTargetName = params.bonusDiscoveryTargetName;
    gear.bonusDiscoveryTargetLevel = params.bonusDiscoveryTargetLevel;
    // Exact recommendation proofs only need one feasible witness. In this mode,
    // defense, resistances, and unrelated bonuses cannot affect feasibility, so
    // they must not prevent otherwise exact dominance pruning.
    gear.feasibilityOnly = Boolean(params.findOne);
    gear.relevantSetNames = Object.keys(params.setSkills || {}).concat(
        params.bonusDiscoveryTargetType === 'set' && params.bonusDiscoveryTargetName ?
            [params.bonusDiscoveryTargetName] : []
    );
    gear.relevantGroupNames = Object.keys(params.groupSkills || {}).concat(
        params.bonusDiscoveryTargetType === 'group' && params.bonusDiscoveryTargetName ?
            [params.bonusDiscoveryTargetName] : []
    );
    recordOptimizerStage(profile, "candidatePrep", stageStartedAt);
    if (searchDeadline.current) {
        profile.timedOut = searchDeadline.timedOut;
        profile.cancelled = Boolean(params.cancelToken?.current);
        profile.runtimeMs = performance.now() - searchStartedAt;
        profile.timeoutOverrunMs = profile.timedOut ?
            Math.max(0, profile.runtimeMs - maxComboSearchMs) : 0;
        finishOptimizerProfile(profile, []);
        return [];
    }

    stageStartedAt = performance.now();
    const proofBonusSignature = JSON.stringify([
        gear.relevantSetNames || [], gear.relevantGroupNames || []
    ]);
    const feasibilityCacheKey = params.findOne ?
        `${searchGearCacheKey}::feasibility-proof:${proofBonusSignature}` : searchGearCacheKey;
    const cachedFeasibility = searchFeasibilityCache.get(feasibilityCacheKey);
    const feasibility = cachedFeasibility || validateSearchFeasibility(
        gear, params.skills, params.setSkills, params.groupSkills, params.optimizationGoal, profile
    );
    if (cachedFeasibility) {
        profile.searchFeasibilityCacheHits = (profile.searchFeasibilityCacheHits || 0) + 1;
    } else {
        searchFeasibilityCache.set(feasibilityCacheKey, feasibility);
    }
    recordOptimizerStage(profile, "feasibilityCheck", stageStartedAt);
    if (!feasibility.possible) {
        profile.impossible = true;
        profile.impossibleReasons = feasibility.reasons;
        profile.runtimeMs = performance.now() - searchStartedAt;
        cacheSearchResult(cacheKey, []);
        finishOptimizerProfile(profile, []);
        return [];
    }

    const comboFunc = rollCombosMeetInMiddle;
    const engineName = "mitm";
    profile.engine = engineName;
    const searchLimit = params.findOne ? params.limit : Math.max(params.limit, Math.min(params.limit * 3, 60));
    let searchTimedOut = false;
    const runComboSearch = async(searchGear, setSkills, groupSkills, stageName, timeBudget = maxComboSearchMs) => {
        const comboStartTime = performance.now();
        const effectiveCancelToken = createDeadlineToken({
            budgetMs: timeBudget,
            cancelToken: searchDeadline
        });
        const searchRolls = await comboFunc(
            searchGear, params.skills, setSkills, groupSkills, searchLimit,
            params.findOne, effectiveCancelToken, params.optimizationGoal, profile,
            params.partialResultFunc ? partialRolls => params.partialResultFunc(
                preparePartialResults(partialRolls, params), { ...profile, partial: true }
            ) : null,
            feasibility.candidateLists
        );
        // Refresh the token after the combo returns in case it completed between
        // cooperative checks and the exact deadline.
        const stopped = effectiveCancelToken.current;
        const timedOut = stopped && (effectiveCancelToken.timedOut || searchDeadline.timedOut);
        recordOptimizerStage(profile, stageName, comboStartTime);
        if (timedOut) {
            searchTimedOut = true;
        }

        return searchRolls;
    };

    const searchVariants = [
        {
            label: 'base',
            gear,
            setSkills: params.setSkills,
            groupSkills: params.groupSkills
        }
    ];
    const comboBudget = seededRolls.length ? Math.min(maxComboSearchMs, 3000) : maxComboSearchMs;
    const variantTimeBudget = Math.max(100, Math.floor(comboBudget / searchVariants.length));
    const resultGroups = seededRolls.length ? [seededRolls] : [];
    for (const variant of searchVariants) {
        stageStartedAt = performance.now();
        const variantRolls = await runComboSearch(
            variant.gear,
            variant.setSkills,
            variant.groupSkills,
            variant.label === 'base' ? "comboSearch" : "seedComboSearch",
            variantTimeBudget
        );
        resultGroups.push(variantRolls);
    }
    let rolls = mergeUniqueResultGroups(resultGroups);
    profile.engine = engineName;
    profile.timedOut = searchTimedOut;
    profile.partial = searchTimedOut && rolls.length > 0;
    profile.cancelled = Boolean(params.cancelToken?.current);

    // lazily handle slotFilters filtering here
    stageStartedAt = performance.now();
    if (!isEmpty(params.slotFilters)) {
        const desiredSlots = Object.entries(params.slotFilters)
            .flatMap(([num, count]) => Array(count).fill(Number(num)))
            .sort((a, b) => b - a);
        const filteredRolls = [];
        for (const roll of rolls) {
            const rollFree = roll.freeSlots.sort((a, b) => b - a);
            if (rollFree.length < desiredSlots.length) { continue; } // not enough slots
            let skip = false;
            for (let i = 0; i < desiredSlots.length; i++) {
                const wantSlot = desiredSlots[i];
                const haveSlot = rollFree[i];
                if (wantSlot > haveSlot) {
                    skip = true;
                    break;
                }
            }
            if (skip) { continue; }
            filteredRolls.push(roll);
        }
        rolls = filteredRolls;
    }
    recordOptimizerStage(profile, "slotFiltering", stageStartedAt);

    stageStartedAt = performance.now();
    if (!params.findOne) {
        freeThree = [];
        freeTwo = [];
        freeOne = [];
        for (const roll of rolls) {
            const remaining = getInclusiveRemainingSlots(roll.freeSlots, currentSlotFilters);
            if (remaining) {
                freeThree = Math.max(freeThree, remaining[3]);
                freeTwo = Math.max(freeTwo, remaining[2]);
                freeOne = Math.max(freeOne, remaining[1]);
            }
        }
    }
    recordOptimizerStage(profile, "freeSlotSummary", stageStartedAt);

    stageStartedAt = performance.now();
    rolls = rolls.map(roll => {
        const enrichedRoll = {
            ...roll,
            skills: roll.skills || params.skills || {},
            setSkills: roll.setSkills || params.setSkills || {},
            groupSkills: roll.groupSkills || params.groupSkills || {},
            conditions: roll.conditions || params.conditions || {},
            weaponBaseRaw: roll.weaponBaseRaw ?? params.weaponBaseRaw ?? 0,
            weaponBaseAffinity: roll.weaponBaseAffinity ?? params.weaponBaseAffinity ?? 0,
            weaponType: roll.weaponType ?? params.weaponType ?? 'other',
            weaponElementType: roll.weaponElementType ?? params.weaponElementType ?? 'None',
            weaponElementValue: roll.weaponElementValue ?? params.weaponElementValue ?? 0,
            weaponSharpness: roll.weaponSharpness ?? params.weaponSharpness ?? 'White',
            setSkillBonus: roll.setSkillBonus ?? params.setSkillBonus ?? '',
            groupSkillBonus: roll.groupSkillBonus ?? params.groupSkillBonus ?? ''
        };
        const damageProfile = buildDamageProfile(enrichedRoll);
        return {
            ...enrichedRoll,
            damageProfile,
            tags: damageProfile.tags
        };
    });
    recordOptimizerStage(profile, "damageScoring", stageStartedAt);

    stageStartedAt = performance.now();
    const rankedRolls = rankBuildsByDamage(rolls, params.optimizationGoal || 'efficient');
    const orderedRolls = collapseFlexibleTalismanResults(reorder(rankedRolls), params.skills);
    rolls = params.bonusDiscovery ? selectBonusDiscoveryWitnesses(
        orderedRolls,
        params.bonusDiscoverySetNames,
        params.bonusDiscoveryGroupNames
    ) : orderedRolls.slice(0, params.limit);
    recordOptimizerStage(profile, "rankAndReorder", stageStartedAt);

    stageStartedAt = performance.now();
    if (!profile.timedOut && !profile.cancelled) {
        cacheSearchResult(cacheKey, rolls);
    }
    recordOptimizerStage(profile, "cacheWrite", stageStartedAt);

    profile.runtimeMs = performance.now() - searchStartedAt;
    profile.timeoutOverrunMs = profile.timedOut ?
        Math.max(0, profile.runtimeMs - maxComboSearchMs) : 0;
    finishOptimizerProfile(profile, rolls);

    return rolls;
};

export const searchAndSpeed = async(parameters, useCached = false) => {
    const params = getSearchParameters(parameters);
    const cacheKey = buildSearchCacheKey(params);
    if (useCached) {
        const cachedSearch = getCachedSearchResult(cacheKey);
        if (cachedSearch) {
            const profile = createOptimizerProfile("cache");
            profile.cacheHit = true;
            finishOptimizerProfile(profile, cachedSearch);
            return { results: cachedSearch, seconds: 0, profile };
        }
    }

    const startTime = performance.now();

    await new Promise(resolve => setTimeout(resolve, 0)); // allow UI update before blocking
    const results = await search(parameters);
    const endTime = performance.now();
    const seconds = (endTime - startTime) / 1000;

    cached = { results, seconds };

    return { ...cached, profile: lastOptimizerProfile };
};

export const moreAndSpeed = async parameters => {
    const startTime = performance.now();
    const results = await new Promise(resolve => {
        setTimeout(() => {
            resolve(getAddableSkills(parameters));
        }, 0);
    });
    const endTime = performance.now();
    const seconds = (endTime - startTime) / 1000;

    return {
        results,
        seconds,
    };
};

export const runAllTests = () => {
    for (const [testName, theTest] of Object.entries(allTests)) {
        search(theTest).then(results => {
            console.log(`%c${testName}: ${results.length}`, "color: aqua");
        });
    }
};
