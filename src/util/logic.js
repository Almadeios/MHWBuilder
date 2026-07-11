import TALISMANS from "../data/compact/talisman.json";
import DECO_INVENTORY from "../data/user/deco-inventory.json";
import DECORATIONS from "../data/compact/decoration.json";
import SKILL_DB from "../data/compact/skills.json";
import SET_SKILL_DB from '../data/compact/set-skills.json';
import GROUP_SKILL_DB from '../data/compact/group-skills.json';
import {
    canArmorFulfillSkill,
    cartesianProduct,
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
    DFS,
    DFS_DEBUG,
    OPTIMIZER_PROFILE,
    USE_NEW_ENGINE,
    VALIDATE_NEW_ENGINE
} from "./constants";
import { allTests } from "../test/tests";
import { getArmorTypeList, isGroupSkillName, isSetSkillName, stringToId } from "./util";
import INTERNAL_BLACKLIST from '../data/internal-blacklist.json';
import { _x } from "./armorAccessor";
import { generateTalismans } from "./talismanGenerator";
import { buildDamageProfile, ELEMENT_SKILL_TABLES, rankBuildsByDamage } from "./damageScoring";

const INTERNAL_BLACKMAP = Object.fromEntries(INTERNAL_BLACKLIST.map(x => [x, true]));

let totalPossibleCombinations = 0;
let decoInventory = { ...DECO_INVENTORY };
let currentDecorations = { ...DECORATIONS };

// getting lazier..
let currentSlotFilters = {};
export let freeThree = [];
export let freeTwo = [];
export let freeOne = [];
export let cached;
export let lastOptimizerProfile = null;

const searchCache = new Map();
const MAX_SEARCH_CACHE_ENTRIES = 50;
const SEARCH_CACHE_VERSION = 12;
const MAX_COMBO_SEARCH_MS = 12000;
const talismanScoreCache = new Map();
const MAX_TALISMAN_SCORE_CACHE_ENTRIES = 2000;
const GENERATED_TALISMAN_CANDIDATE_LIMIT = 300;
const OPPORTUNISTIC_SET_SKILL_ORDER = [
    "Jin Dahaad's Revolt",
    "Ebony Odogaron's Power",
    "Gore Magala's Tyranny",
    "Fulgur Anjanath's Will",
    "Gogmapocalypse",
    "Xu Wu's Vigor"
];

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
        optimizationGoal: params.optimizationGoal || 'highest_dps',
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
        rank: params.rank || "high"
    };

    return JSON.stringify(normalizedParams);
};

const cacheSearchResult = (key, results) => {
    if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
    }

    searchCache.set(key, results);
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
    impossibleReasons: [],
    totalPossibleCombinations: 0
});

const recordOptimizerStage = (profile, stageName, startedAt) => {
    profile.stages[stageName] = (profile.stages[stageName] || 0) + performance.now() - startedAt;
};

const finishOptimizerProfile = (profile, results) => {
    profile.results = results.length;
    profile.totalPossibleCombinations = totalPossibleCombinations;
    lastOptimizerProfile = profile;
    if (DEBUG && OPTIMIZER_PROFILE) {
        console.log(
            `[optimizer:${profile.engine}] ${profile.runtimeMs.toFixed(1)}ms, ` +
            `${profile.nodes.toLocaleString()} nodes, ${profile.pruned.toLocaleString()} pruned, ` +
            `${profile.leaves.toLocaleString()} leaves, ${profile.results.toLocaleString()} results`
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
        Object.entries(getJsonFromType("armor")).filter(([name, _]) => !INTERNAL_BLACKMAP[name])
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
        for (const [skillName, statData] of Object.entries(data)) {
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
        .filter(([k, v]) => isInSets(v, setSkills) || isInGroups(v, groupSkills))
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
                const [groupiesGrouped, _] = groupArmorIntoSets(data, setSkills, groupSkills);

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
            for (const [groupName, groupData] of Object.entries(data)) {
                for (const [skillName, statData] of Object.entries(groupData)) {
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

const getDecoFillStateKey = (skillsNeeded, slotPool, weaponSlotPool, usedDecosCount) => {
    const needs = Object.entries(skillsNeeded)
        .filter(([, level]) => level > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([skillName, level]) => `${skillName}:${level}`)
        .join("|");
    const counts = Object.entries(usedDecosCount)
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([decoName, count]) => `${decoName}:${count}`)
        .join("|");

    return `${needs}::a${slotPool.join(",")}::w${weaponSlotPool.join(",")}::${counts}`;
};

const getDecoCandidateList = decos => Object.entries(decos).map(([decoName, data]) => {
    const [decoType, decoSkills, decoSlot] = data;
    return { decoName, decoType, decoSkills, decoSlot };
});

const getDecosToFulfillSkillsSearch = (
    decos, skillsNeeded, slotsAvailable, weaponSlotsAvailable, usedDecosCount = {}, params = {}, desiredSkills = {}
) => {
    const candidates = getDecoCandidateList(decos);
    const memo = new Set();
    const maxDepth = slotsAvailable.length + weaponSlotsAvailable.length;

    const visit = (remainingSkills, slotPool, weaponSlotPool, usedDecos, counts, depth) => {
        const unmetSkills = Object.entries(remainingSkills).filter(([, level]) => level > 0);
        if (!unmetSkills.length) {
            return {
                decoNames: usedDecos,
                freeSlots: slotPool,
                freeWeaponSlots: weaponSlotPool
            };
        }
        if (depth >= maxDepth) { return null; }

        const stateKey = getDecoFillStateKey(remainingSkills, slotPool, weaponSlotPool, counts);
        if (memo.has(stateKey)) { return null; }
        memo.add(stateKey);

        const sortedUnmetSkills = unmetSkills
            .map(([skillName, level]) => {
                const availableOptions = candidates.filter(candidate => {
                    if (!(skillName in candidate.decoSkills)) { return false; }
                    if ((counts[candidate.decoName] || 0) >= (decoInventory[candidate.decoName] || 0)) { return false; }
                    if (hasBlockedOffElementAttackSkill(candidate.decoSkills, params, desiredSkills)) { return false; }
                    const pool = candidate.decoType === "weapon" ? weaponSlotPool : slotPool;
                    return pool.some(slot => slot >= candidate.decoSlot);
                }).length;
                return { skillName, level, availableOptions };
            })
            .sort((a, b) => a.availableOptions - b.availableOptions || b.level - a.level);

        const targetSkill = sortedUnmetSkills[0]?.skillName;
        if (!targetSkill || sortedUnmetSkills[0].availableOptions === 0) { return null; }

        const sortedCandidates = candidates
            .filter(candidate => targetSkill in candidate.decoSkills)
            .filter(candidate => (counts[candidate.decoName] || 0) < (decoInventory[candidate.decoName] || 0))
            .filter(candidate => !hasBlockedOffElementAttackSkill(candidate.decoSkills, params, desiredSkills))
            .map(candidate => ({
                ...candidate,
                usefulPoints: getUsefulDecoPoints(candidate.decoSkills, remainingSkills)
            }))
            .filter(candidate => candidate.usefulPoints > 0)
            .sort((a, b) => {
                if (b.usefulPoints !== a.usefulPoints) { return b.usefulPoints - a.usefulPoints; }
                return a.decoSlot - b.decoSlot;
            });

        for (const candidate of sortedCandidates) {
            const pool = candidate.decoType === "weapon" ? weaponSlotPool : slotPool;
            const slotIndexes = pool
                .map((slot, index) => ({ slot, index }))
                .filter(({ slot }) => slot >= candidate.decoSlot)
                .sort((a, b) => a.slot - b.slot);

            for (const { index } of slotIndexes) {
                const nextSlots = [...slotPool];
                const nextWeaponSlots = [...weaponSlotPool];
                const targetPool = candidate.decoType === "weapon" ? nextWeaponSlots : nextSlots;
                targetPool.splice(index, 1);

                const nextSkills = { ...remainingSkills };
                for (const [skillName, level] of Object.entries(candidate.decoSkills)) {
                    if (nextSkills[skillName] === undefined) { continue; }
                    nextSkills[skillName] = Math.max(0, nextSkills[skillName] - level);
                }

                const nextCounts = {
                    ...counts,
                    [candidate.decoName]: (counts[candidate.decoName] || 0) + 1
                };
                const result = visit(
                    nextSkills,
                    nextSlots,
                    nextWeaponSlots,
                    [...usedDecos, candidate.decoName],
                    nextCounts,
                    depth + 1
                );
                if (result) { return result; }
            }
        }

        return null;
    };

    return visit(
        skillsNeeded,
        [...slotsAvailable].sort((a, b) => a - b),
        [...weaponSlotsAvailable].sort((a, b) => a - b),
        [],
        usedDecosCount,
        0
    );
};

const getDecosToFulfillSkillsGreedy = (
    decos, skillsNeeded, slotsAvailable, weaponSlotsAvailable, startingUsedDecosCount = {}, params = {}, desiredSkills = {}
) => {
    // Sort slots in ascending order to fill smallest first
    const slotPool = [...slotsAvailable].sort((a, b) => a - b);
    const weaponSlotPool = [...weaponSlotsAvailable].sort((a, b) => a - b);

    // Sort decorations: satisfy requested skills first. Bonus skills are offered as extras, not auto-selected.
    const sortedDecos = Object.entries(decos).sort((a, b) => {
        const [_, __, slotA] = a[1];
        const [___, ____, slotB] = b[1];
        const usefulSkillA = getUsefulDecoPoints(a[1][1], skillsNeeded);
        const usefulSkillB = getUsefulDecoPoints(b[1][1], skillsNeeded);
        if (usefulSkillB !== usefulSkillA) { return usefulSkillB - usefulSkillA; }
        return slotA - slotB;
    });

    const usedDecos = [];
    const usedDecosCount = { ...startingUsedDecosCount };
    for (const [skill, neededPoints] of Object.entries(skillsNeeded)) {
        let remaining = neededPoints;
        while (remaining > 0) {
            let foundMatch = false;

            for (const [decoName, [decoType, decoSkills, decoSlot]] of sortedDecos) {
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

                        remaining -= decoSkills[skill];
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
    ) || getDecosToFulfillSkillsSearch(
        decos, skillsNeeded, slotsAvailable, weaponSlotsAvailable, {}, params, desiredSkills
    );
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

    let pre = [], post = [];
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

    pre = [...pre, ...post];
    const excludeIds = new Set(pre.map(obj => obj.id));

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

    return [...pre, ...longestSlots];
};

const RAW_SEARCH_SKILL_WEIGHTS = {
    'Attack Boost': 4,
    Agitator: 4,
    Burst: 4,
    'Peak Performance': 3,
    Resentment: 3,
    'Adrenaline Rush': 3,
    Counterstrike: 3,
    Foray: 3,
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
    const currentProfile = getDamageProfileForSkills(currentSkills, params);
    const nextProfile = getDamageProfileForSkills(nextSkills, params);
    const targetScore = Object.entries(addedSkills).reduce((total, [skillName, level]) => {
        const targetLevel = params.skills?.[skillName] || 0;
        const missingLevel = Math.max(0, targetLevel - (currentSkills[skillName] || 0));
        return total + Math.min(level, missingLevel) * getSearchSkillWeight(skillName, params.optimizationGoal) * 1000;
    }, 0);

    return {
        score: targetScore + Math.max(0, (nextProfile.expected_dps || 0) - (currentProfile.expected_dps || 0)),
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

    return targetCoverage * 100000 + weightedCoverage * 1000 + socketValue;
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
    const coverageCandidates = generatedTalismans
        .sort((a, b) => {
            const coverageCompare = scoreTalismanRequiredCoverage(b[1], params) -
                scoreTalismanRequiredCoverage(a[1], params);
            if (coverageCompare !== 0) { return coverageCompare; }
            return b[0].localeCompare(a[0]);
        })
        .slice(0, coverageCandidateLimit);
    const damageCandidates = generatedTalismans
        .sort((a, b) => {
            const scoreCompare = scoreTalismanForDamageCached(b[1], params) - scoreTalismanForDamageCached(a[1], params);
            if (scoreCompare !== 0) { return scoreCompare; }
            return b[0].localeCompare(a[0]);
        })
        .slice(0, damageCandidateLimit);
    const generatedCandidates = Array.from(new Map([...coverageCandidates, ...damageCandidates]));

    gear.talisman = Object.fromEntries([...fixedTalismans, ...generatedCandidates].sort((a, b) => {
        const scoreCompare = scoreTalismanForDamageCached(b[1], params) - scoreTalismanForDamageCached(a[1], params);
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

const getPieceBonusSignature = piece => {
    const setSkillNames = _x.setSkills(piece) || [];
    const groupSkillNames = _x.groupSkills(piece) || [];
    return [
        ...setSkillNames,
        "|",
        ...groupSkillNames
    ].join(";");
};

const getDominanceSkillLevel = (piece, skillName) => {
    return _x.skills(piece)?.[skillName] || 0;
};

const doesPieceDominate = (challenger, target, desiredSkillNames) => {
    if (getPieceBonusSignature(challenger) !== getPieceBonusSignature(target)) {
        return false;
    }
    if (!dominatesNumberArray(normalizeSlotsForDominance(_x.slots(challenger)), normalizeSlotsForDominance(_x.slots(target)))) {
        return false;
    }
    if ((_x.defense(challenger) || 0) < (_x.defense(target) || 0)) {
        return false;
    }
    if (!dominatesNumberArray(_x.resists(challenger), _x.resists(target))) {
        return false;
    }

    return desiredSkillNames.every(skillName => {
        return getDominanceSkillLevel(challenger, skillName) >= getDominanceSkillLevel(target, skillName);
    });
};

const pruneDominatedCandidateList = (candidateEntries, desiredSkills) => {
    const desiredSkillNames = Object.keys(desiredSkills || {});
    if (candidateEntries.length < 2) { return candidateEntries; }

    const kept = [];
    for (const entry of candidateEntries) {
        const [, piece] = entry;
        if (kept.some(([, keptPiece]) => doesPieceDominate(keptPiece, piece, desiredSkillNames))) {
            continue;
        }

        for (let index = kept.length - 1; index >= 0; index--) {
            if (doesPieceDominate(piece, kept[index][1], desiredSkillNames)) {
                kept.splice(index, 1);
            }
        }
        kept.push(entry);
    }

    return kept;
};

const getSortedCandidateList = (gear, slot, desiredSkills, optimizationGoal = 'highest_dps') => {
    if (slot === "talisman") {
        return Object.entries(gear[slot]);
    }

    return pruneDominatedCandidateList(
        sortPiecesForSearch(gear[slot], desiredSkills, optimizationGoal),
        desiredSkills
    );
};

const buildSearchGear = (params, setSkills = params.setSkills, groupSkills = params.groupSkills) => {
    let gear = speed(
        getBestArmor, params.skills, setSkills, groupSkills,
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

const getOpportunisticSetSkillSeeds = params => {
    if (params.findOne || params.setSkills?.["Jin Dahaad's Revolt"] || Object.keys(params.skills || {}).length < 8) {
        return [];
    }

    return OPPORTUNISTIC_SET_SKILL_ORDER
        .filter(skillName => !params.setSkills?.[skillName])
        .map(skillName => ({
            label: skillName,
            setSkills: { ...params.setSkills, [skillName]: 1 },
            groupSkills: params.groupSkills
        }));
};

const buildSuffixAvailability = (candidateLists, armorSlots, requiredNames, getNames) => {
    const availability = Object.fromEntries(
        requiredNames.map(name => [name, Array(armorSlots.length + 1).fill(0)])
    );

    for (let index = armorSlots.length - 1; index >= 0; index--) {
        const slot = armorSlots[index];
        for (const name of requiredNames) {
            const slotCanProvide = candidateLists[slot].some(([, piece]) => (getNames(piece) || []).includes(name)) ? 1 : 0;
            availability[name][index] = availability[name][index + 1] + slotCanProvide;
        }
    }

    return availability;
};

const getPieceSkillPotential = (slot, piece, skillName, decos, baseWeaponSlots = []) => {
    let points = piece[1]?.[skillName] || 0;
    const armorSlots = piece[3] || [];
    const weaponSlots = slot === "talisman" ? [...baseWeaponSlots, ..._x.weaponSlots(piece)] : [];

    for (const deco of Object.values(decos)) {
        const validSlots = deco[0] === "weapon" ? weaponSlots : armorSlots;
        const decoSkillLevel = deco[1]?.[skillName];
        if (decoSkillLevel && validSlots.length) {
            points += decoSkillLevel * validSlots.filter(slotSize => slotSize >= deco[2]).length;
            break;
        }
    }

    return points;
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

    for (const slot of armorSlots) {
        for (const [, piece] of candidateLists[slot]) {
            if (piecePotentialMap.has(piece)) { continue; }
            piecePotentialMap.set(piece, Object.fromEntries(
                skillNames.map(skillName => [
                    skillName,
                    getPieceSkillPotential(slot, piece, skillName, decos, baseWeaponSlots)
                ])
            ));
        }
    }

    return piecePotentialMap;
};

export const validateSearchFeasibility = (gear, desiredSkills = {}, setSkills = {}, groupSkills = {}) => {
    const armorSlots = getArmorTypeList();
    const candidateLists = Object.fromEntries(
        armorSlots.map(slot => [slot, getSortedCandidateList(gear, slot, desiredSkills)])
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

    return { possible: reasons.length === 0, reasons };
};

const rollCombosDfs = async(
    gear, desiredSkills, setSkills, groupSkills, limit, findOne = false, cancelToken = undefined,
    optimizationGoal = 'highest_dps',
    profile = createOptimizerProfile("dfs")
) => {
    const results = [];
    const armorSlots = getArmorTypeList();

    const candidateLists = Object.fromEntries(
        armorSlots.map(slot => [slot, getSortedCandidateList(gear, slot, desiredSkills, optimizationGoal)])
    );
    const searchOrder = [...armorSlots].sort((a, b) => candidateLists[a].length - candidateLists[b].length);

    // Calculate total possible combinations
    totalPossibleCombinations = armorSlots
        .map(slot => candidateLists[slot].length)
        .reduce((total, count) => total * count, 1);
    if (CHOSEN_ARMOR_DEBUG) {
        console.log(`possible: ${totalPossibleCombinations.toLocaleString()}`);
    }

    const requiredSetPoints = {};
    const requiredGroupPoints = {};
    for (const [name, level] of Object.entries(setSkills)) {
        requiredSetPoints[name] = Math.max(0, level * 2 - (gear.setSkillBonus === name ? 1 : 0));
    }
    for (const name of Object.keys(groupSkills)) {
        requiredGroupPoints[name] = Math.max(0, 3 - (gear.groupSkillBonus === name ? 1 : 0));
    }
    const requiredSetNames = Object.keys(setSkills);
    const requiredGroupNames = Object.keys(groupSkills);
    const setSuffixAvailability = buildSuffixAvailability(candidateLists, searchOrder, requiredSetNames, _x.setSkills);
    const groupSuffixAvailability = buildSuffixAvailability(candidateLists, searchOrder, requiredGroupNames, _x.groupSkills);
    const {
        potential: skillPotentialSuffix,
        piecePotentialMap
    } = buildSkillPotentialSuffix(
        candidateLists, searchOrder, desiredSkills, gear.decos, gear.weaponSlots
    );

    let counter = 1, inc = 1, allCounter = 0;

    // Precompute best-case future values for skill projection
    const dfs = async(index, currentArmor, usedNames, setCounts, groupCounts, skillPotentialCounts) => {
        profile.nodes++;
        allCounter++;
        if (index === searchOrder.length) {
            profile.leaves++;
            const fullSet = armorCombo(
                formatArmorC(currentArmor.head),
                formatArmorC(currentArmor.chest),
                formatArmorC(currentArmor.arms),
                formatArmorC(currentArmor.waist),
                formatArmorC(currentArmor.legs),
                formatArmorC(currentArmor.talisman),
                gear.weaponSlots,
                gear.setSkillBonus,
                gear.groupSkillBonus
            );

            const result = test(fullSet, gear.decos, desiredSkills, gear);
            if (result) {
                // dangerous assumption that decoNames are sorted
                result.id = stringToId(`${result.armorNames.join(",")}_${result.decoNames.join(",")}`);
                result._id = inc;
                inc++;
                results.push(result);
                if (findOne || results.length >= limit) { return true; }
            }

            counter++;
            return false;
        }

        // delay to let UI not look like it's frozen
        if (allCounter % 500 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (cancelToken && cancelToken.current) {
            console.warn('rollCombosDfs() cancel pressed, returning early');
            return true;
        }

        const slot = searchOrder[index];
        for (const [name, piece] of candidateLists[slot]) {
            if (usedNames.has(name) && name !== "None") { continue; } // None exception since None name is not unique
            currentArmor[slot] = [name, piece];
            usedNames.add(name);

            // Track set/group skill counts
            const addedSetCounts = {};
            const addedGroupCounts = {};
            const addedSkillPotentials = {};

            const mySetSkillNames = _x.setSkills(piece);
            const myGroupSkillNames = _x.groupSkills(piece);

            if (mySetSkillNames) {
                for (const mySetSkillName of mySetSkillNames) {
                    if (mySetSkillName && setSkills[mySetSkillName]) { // if piece has set skill
                        setCounts[mySetSkillName] = (setCounts[mySetSkillName] || 0) + 1;
                        addedSetCounts[mySetSkillName] = (addedSetCounts[mySetSkillName] || 0) + 1;
                    }
                }
            }

            if (myGroupSkillNames) {
                for (const myGroupSkillName of myGroupSkillNames) {
                    if (myGroupSkillName && groupSkills[myGroupSkillName]) {
                        groupCounts[myGroupSkillName] = (groupCounts[myGroupSkillName] || 0) + 1;
                        addedGroupCounts[myGroupSkillName] = (addedGroupCounts[myGroupSkillName] || 0) + 1;
                    }
                }
            }
            for (const skillName of Object.keys(desiredSkills)) {
                const addedPotential = piecePotentialMap.get(piece)?.[skillName] || 0;
                if (addedPotential) {
                    skillPotentialCounts[skillName] = (skillPotentialCounts[skillName] || 0) + addedPotential;
                    addedSkillPotentials[skillName] = addedPotential;
                }
            }
            let shouldContinue = true;

            // Prune early based on set/group skill future feasibility
            const remainingSlots = searchOrder.length - (index + 1);
            for (const skill of requiredSetNames) {
                const current = setCounts[skill] || 0;
                const needed = requiredSetPoints[skill] - current;
                if (needed > remainingSlots || current + setSuffixAvailability[skill][index + 1] < requiredSetPoints[skill]) {
                    profile.pruned++;
                    shouldContinue = false;
                    break;
                }
            }
            for (const skill of requiredGroupNames) {
                const current = groupCounts[skill] || 0;
                const needed = requiredGroupPoints[skill] - current;
                if (needed > remainingSlots || current + groupSuffixAvailability[skill][index + 1] < requiredGroupPoints[skill]) {
                    profile.pruned++;
                    shouldContinue = false;
                    break;
                }
            }

            if (DFS_DEBUG) {
                const armorStrForDebug = Object.entries(currentArmor).map(x => { // debug only, remove later
                    const type = x[0];
                    const armorName = x[1][0];
                    const armorData = x[1][1];
                    return `${type.toUpperCase()} ${armorName}: ${JSON.stringify(armorData[1])} ${JSON.stringify(armorData[3])}`;
                }).join('\n');
                console.log(`${armorStrForDebug}`);
            }

            // Check projected skill feasibility
            for (const [skillName, level] of Object.entries(desiredSkills)) {
                const maxPossibleLevel = (skillPotentialCounts[skillName] || 0) +
                    skillPotentialSuffix[skillName][index + 1];
                if (maxPossibleLevel < level) {
                    profile.pruned++;
                    shouldContinue = false;

                    if (DFS_DEBUG) {
                        console.log(`\tFAIL - ${skillName} Lv. ${level}, backtracking..`); // debug only, remove later
                    }
                    break;
                } else if (DFS_DEBUG) { // debug only, remove later
                    console.log(`\tPASS - ${skillName} Lv. ${level}, continuing..`);
                }
            }

            if (shouldContinue) {
                const done = await dfs(index + 1, currentArmor, usedNames, setCounts, groupCounts, skillPotentialCounts);
                if (done) { return true; }
            }

            usedNames.delete(name);
            delete currentArmor[slot];
            for (const skill of Object.keys(addedSetCounts)) { setCounts[skill] -= addedSetCounts[skill]; }
            for (const skill of Object.keys(addedGroupCounts)) { groupCounts[skill] -= addedGroupCounts[skill]; }
            for (const skill of Object.keys(addedSkillPotentials)) {
                skillPotentialCounts[skill] -= addedSkillPotentials[skill];
                if (skillPotentialCounts[skill] <= 0) { delete skillPotentialCounts[skill]; }
            }
        }

        return false;
    };

    await dfs(0, {}, new Set(), {}, {}, {});
    return results;
};

class OptimizerState {
    constructor(gear) {
        this.gear = gear;
        this.armorSlots = getArmorTypeList();
        this.currentArmor = {};
        this.usedNames = new Set();
        this.skills = {};
        this.slots = [];
        this.talismanWeaponSlots = [];
        this.setCounts = {};
        this.groupCounts = {};
    }

    canUse(name) {
        return name === "None" || !this.usedNames.has(name);
    }

    add(slot, name, piece) {
        this.currentArmor[slot] = [name, piece];
        this.usedNames.add(name);

        for (const [skillName, level] of Object.entries(piece[1] || {})) {
            this.skills[skillName] = (this.skills[skillName] || 0) + level;
        }

        for (const slotSize of piece[3] || []) {
            this.slots.push(slotSize);
        }

        if (slot === "talisman") {
            this.talismanWeaponSlots.push(..._x.weaponSlots(piece));
        } else {
            for (const setName of _x.setSkills(piece)) {
                this.setCounts[setName] = (this.setCounts[setName] || 0) + 1;
            }
            for (const groupName of _x.groupSkills(piece)) {
                this.groupCounts[groupName] = (this.groupCounts[groupName] || 0) + 1;
            }
        }
    }

    remove(slot, name, piece) {
        delete this.currentArmor[slot];
        this.usedNames.delete(name);

        for (const [skillName, level] of Object.entries(piece[1] || {})) {
            this.skills[skillName] -= level;
            if (this.skills[skillName] <= 0) { delete this.skills[skillName]; }
        }

        for (const slotSize of piece[3] || []) {
            const index = this.slots.lastIndexOf(slotSize);
            if (index !== -1) { this.slots.splice(index, 1); }
        }

        if (slot === "talisman") {
            for (const slotSize of _x.weaponSlots(piece)) {
                const index = this.talismanWeaponSlots.lastIndexOf(slotSize);
                if (index !== -1) { this.talismanWeaponSlots.splice(index, 1); }
            }
        } else {
            for (const setName of _x.setSkills(piece)) {
                this.setCounts[setName] -= 1;
                if (this.setCounts[setName] <= 0) { delete this.setCounts[setName]; }
            }
            for (const groupName of _x.groupSkills(piece)) {
                this.groupCounts[groupName] -= 1;
                if (this.groupCounts[groupName] <= 0) { delete this.groupCounts[groupName]; }
            }
        }
    }

    buildArmorSet() {
        const setSkillBonus = this.gear.setSkillBonus ? { [this.gear.setSkillBonus]: 1 } : {};
        const groupSkillBonus = this.gear.groupSkillBonus ? { [this.gear.groupSkillBonus]: 1 } : {};

        return {
            names: this.armorSlots.map(slot => this.currentArmor[slot][0]),
            skills: Object.fromEntries(Object.entries(this.skills).sort((a, b) => b[1] - a[1])),
            slots: [...this.slots],
            weaponSlots: [...this.gear.weaponSlots, ...this.talismanWeaponSlots],
            setSkills: mergeSumMaps([setSkillBonus, this.setCounts]),
            groupSkills: mergeSumMaps([groupSkillBonus, this.groupCounts]),
            defense: this.armorSlots
                .filter(slot => slot !== "talisman")
                .map(slot => this.currentArmor[slot][1][4])
        };
    }
}

const rollCombosNewEngine = async(
    gear, desiredSkills, setSkills, groupSkills, limit, findOne = false, cancelToken = undefined,
    optimizationGoal = 'highest_dps',
    profile = createOptimizerProfile("new-engine")
) => {
    if (!gear) {
        console.warn("rollCombosNewEngine(): gear is null, something went wrong");
        return [];
    }

    const results = [];
    const state = new OptimizerState(gear);
    const armorSlots = state.armorSlots;
    const candidateLists = Object.fromEntries(
        armorSlots.map(slot => [slot, getSortedCandidateList(gear, slot, desiredSkills, optimizationGoal)])
    );
    const searchOrder = [...armorSlots].sort((a, b) => candidateLists[a].length - candidateLists[b].length);

    totalPossibleCombinations = armorSlots
        .map(slot => candidateLists[slot].length)
        .reduce((total, count) => total * count, 1);
    if (CHOSEN_ARMOR_DEBUG) {
        console.log(`possible: ${totalPossibleCombinations.toLocaleString()}`);
    }

    const requiredSetPoints = {};
    const requiredGroupPoints = {};
    for (const [name, level] of Object.entries(setSkills)) {
        requiredSetPoints[name] = Math.max(0, level * 2 - (gear.setSkillBonus === name ? 1 : 0));
    }
    for (const name of Object.keys(groupSkills)) {
        requiredGroupPoints[name] = Math.max(0, 3 - (gear.groupSkillBonus === name ? 1 : 0));
    }

    let inc = 1, allCounter = 0;

    const dfs = async index => {
        profile.nodes++;
        allCounter++;

        if (allCounter % 500 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (cancelToken && cancelToken.current) {
            console.warn('rollCombosNewEngine() cancel pressed, returning early');
            return true;
        }

        if (index === searchOrder.length) {
            profile.leaves++;
            const fullSet = state.buildArmorSet();
            const result = test(fullSet, gear.decos, desiredSkills, gear);
            if (result) {
                result.id = stringToId(`${result.armorNames.join(",")}_${result.decoNames.join(",")}`);
                result._id = inc;
                inc++;
                results.push(result);
                if (findOne || results.length >= limit) { return true; }
            }
            return false;
        }

        const slot = searchOrder[index];
        for (const [name, piece] of candidateLists[slot]) {
            if (!state.canUse(name)) { continue; }

            state.add(slot, name, piece);
            let shouldContinue = true;
            const remainingSlots = searchOrder.length - (index + 1);

            for (const skill of Object.keys(setSkills)) {
                const needed = requiredSetPoints[skill] - (state.setCounts[skill] || 0);
                if (needed > remainingSlots) {
                    profile.pruned++;
                    shouldContinue = false;
                    break;
                }
            }
            for (const skill of Object.keys(groupSkills)) {
                const needed = requiredGroupPoints[skill] - (state.groupCounts[skill] || 0);
                if (needed > remainingSlots) {
                    profile.pruned++;
                    shouldContinue = false;
                    break;
                }
            }

            for (const [skillName, level] of Object.entries(desiredSkills)) {
                if (!canArmorFulfillSkill(state.currentArmor, gear, gear.decos, skillName, level)) {
                    profile.pruned++;
                    shouldContinue = false;
                    break;
                }
            }

            if (shouldContinue) {
                const done = await dfs(index + 1);
                if (done) { return true; }
            }

            state.remove(slot, name, piece);
        }

        return false;
    };

    await dfs(0);
    return results;
};

const rollCombos = async(
    gear, skills, setSkills, groupSkills, limit, findOne = false, cancelToken = undefined,
    optimizationGoal = 'highest_dps',
    profile = createOptimizerProfile("cartesian")
) => {
    profile.optimizationGoal = optimizationGoal;
    if (!gear) {
        console.warn("rollCombos(): gear is null, something went wrong");
        return [];
    }

    let counter = 0, inc = 0, allCounter = 0;
    const ret = [];

    // Convert gear categories into arrays for efficient iteration
    const headList = Object.entries(gear.head);
    const chestList = Object.entries(gear.chest);
    const armsList = Object.entries(gear.arms);
    const waistList = Object.entries(gear.waist);
    const legsList = Object.entries(gear.legs);
    const talismanList = Object.entries(gear.talisman);

    // Calculate total possible combinations
    totalPossibleCombinations =
        headList.length * chestList.length * armsList.length *
        waistList.length * legsList.length * talismanList.length;
    if (CHOSEN_ARMOR_DEBUG) {
        console.log(`possible: ${totalPossibleCombinations.toLocaleString()}`);
    }

    const setSkillsCheck = new Set(Object.keys(setSkills));
    const groupSkillsCheck = new Set(Object.keys(groupSkills));
    const requiredSetPoints = Object.fromEntries(
        Object.entries(setSkills).map(([name, level]) => [
            name,
            Math.max(0, level * 2 - (gear.setSkillBonus === name ? 1 : 0))
        ])
    );
    const requiredGroupPoints = Object.fromEntries(
        Object.keys(groupSkills).map(name => [
            name,
            Math.max(0, 3 - (gear.groupSkillBonus === name ? 1 : 0))
        ])
    );

    // Use cartesianProduct to generate all combinations in the same order as Python's itertools.product
    const allCombos = cartesianProduct(headList, chestList, armsList, waistList, legsList, talismanList);

    for (const combo of allCombos) {
        profile.nodes++;
        profile.leaves++;
        allCounter++;
        if (counter >= limit) {
            console.warn("rollCombos() - limit reached, exiting");
            return ret;
        }

        if (allCounter % 1000 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (cancelToken && cancelToken.current) {
            console.warn('rollCombos() cancel pressed, returning early');
            return ret;
        }

        if (setSkillsCheck.size > 0 || groupSkillsCheck.size > 0) {
            const piecesFromSet = {};
            const piecesFromGroup = {};

            for (const piece of combo.slice(0, -1)) { // Ignore talisman for set/group skills
                const armorData = piece[1];
                const setNames = _x.setSkills(armorData);
                const groupNames = _x.groupSkills(armorData);

                for (const setName of setNames) {
                    if (setSkillsCheck.has(setName)) {
                        piecesFromSet[setName] = (piecesFromSet[setName] || 0) + 1;
                    }
                }
                for (const groupName of groupNames) {
                    if (groupSkillsCheck.has(groupName)) {
                        piecesFromGroup[groupName] = (piecesFromGroup[groupName] || 0) + 1;
                    }
                }
            }

            if ([...setSkillsCheck].some(skill => (piecesFromSet[skill] || 0) < requiredSetPoints[skill])) {
                profile.pruned++;
                continue;
            }

            if ([...groupSkillsCheck].some(skill => (piecesFromGroup[skill] || 0) < requiredGroupPoints[skill])) {
                profile.pruned++;
                continue;
            }
        }

        const testSet = armorCombo(
            ...combo.map(piece => formatArmorC(piece)),
            gear.weaponSlots,
            gear.setSkillBonus,
            gear.groupSkillBonus
        );

        const result = test(testSet, gear.decos, skills, gear);
        if (result) {
            result.id = counter + 1;
            result._id = inc + 1;
            inc += 1;
            ret.push(result);
            if (findOne) { return ret; }
        }

        counter += 1;
    }

    return ret;
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

const warnIfEngineMismatch = (oldResults, newResults) => {
    const oldSet = new Set(oldResults.map(resultSignature));
    const newSet = new Set(newResults.map(resultSignature));
    const onlyOld = [...oldSet].filter(key => !newSet.has(key));
    const onlyNew = [...newSet].filter(key => !oldSet.has(key));

    if (onlyOld.length || onlyNew.length) {
        console.warn("Optimizer engine mismatch", {
            oldCount: oldResults.length,
            newCount: newResults.length,
            onlyOld: onlyOld.slice(0, 5),
            onlyNew: onlyNew.slice(0, 5)
        });
    }
};

export const getAddableSkills = async parameters => {
    const params = getSearchParameters(parameters);
    const exhaustive = params.exhaustive;

    currentSlotFilters = { ...params.slotFilters };
    params.slotFilters = {};
    const priorResults = Array.isArray(params.priorResults) && params.priorResults.length
        ? params.priorResults
        : await search(parameters);
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
        if (DEBUG && DFS_DEBUG) {
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
    const cachedSearch = searchCache.get(cacheKey);
    recordOptimizerStage(profile, "cacheLookup", stageStartedAt);
    if (cachedSearch) {
        profile.engine = "cache";
        profile.cacheHit = true;
        profile.runtimeMs = performance.now() - searchStartedAt;
        finishOptimizerProfile(profile, cachedSearch);
        return cachedSearch;
    }

    stageStartedAt = performance.now();
    const customDecorationMap = customDecorationsToCompact(params.customDecorations);
    currentDecorations = { ...DECORATIONS, ...customDecorationMap };
    decoInventory = { ...DECO_INVENTORY };
    for (const deco of params.customDecorations || []) {
        if (deco?.name) {
            decoInventory[deco.name] = Math.max(0, Number(deco.amount ?? 99));
        }
    }

    // limit decos to what user has specified they have
    for (const [decoName, decoAmount] of Object.entries(params.decoMods)) {
        if (Object.prototype.hasOwnProperty.call(decoInventory, decoName)) {
            decoInventory[decoName] = decoAmount;
        }
    }
    recordOptimizerStage(profile, "decoInventory", stageStartedAt);

    stageStartedAt = performance.now();
    let gear = buildSearchGear(params);
    recordOptimizerStage(profile, "candidatePrep", stageStartedAt);

    stageStartedAt = performance.now();
    const feasibility = validateSearchFeasibility(gear, params.skills, params.setSkills, params.groupSkills);
    recordOptimizerStage(profile, "feasibilityCheck", stageStartedAt);
    if (!feasibility.possible) {
        profile.impossible = true;
        profile.impossibleReasons = feasibility.reasons;
        profile.runtimeMs = performance.now() - searchStartedAt;
        finishOptimizerProfile(profile, []);
        return [];
    }

    let comboFunc = USE_NEW_ENGINE ? rollCombosNewEngine : rollCombosDfs;
    if (!USE_NEW_ENGINE && !DFS) {
        comboFunc = rollCombos;
    }

    let engineName = "dfs";
    if (USE_NEW_ENGINE) {
        engineName = "new-engine";
    } else if (!DFS) {
        engineName = "cartesian";
    }
    profile.engine = engineName;
    const searchLimit = params.findOne ? params.limit : Math.max(params.limit, Math.min(params.limit * 3, 60));
    const maxComboSearchMs = params.maxSearchMs || MAX_COMBO_SEARCH_MS;
    let searchTimedOut = false;
    const runComboSearch = async(searchGear, setSkills, groupSkills, stageName) => {
        const comboStartTime = performance.now();
        const effectiveCancelToken = { current: false };
        let localTimedOut = false;
        const timeoutId = setTimeout(() => {
            effectiveCancelToken.current = true;
            localTimedOut = true;
        }, maxComboSearchMs);
        const searchRolls = await comboFunc(
            searchGear, params.skills, setSkills, groupSkills, searchLimit,
            params.findOne, effectiveCancelToken, params.optimizationGoal, profile
        );
        clearTimeout(timeoutId);
        recordOptimizerStage(profile, stageName, comboStartTime);
        if (localTimedOut && !searchRolls.length) {
            searchTimedOut = true;
        }

        return searchRolls;
    };

    let rolls = [];
    const opportunisticSeeds = getOpportunisticSetSkillSeeds(params);
    for (const seed of opportunisticSeeds) {
        stageStartedAt = performance.now();
        const seededGear = buildSearchGear(params, seed.setSkills, seed.groupSkills);
        recordOptimizerStage(profile, "seedCandidatePrep", stageStartedAt);
        const seededRolls = await runComboSearch(seededGear, seed.setSkills, seed.groupSkills, "seedComboSearch");
        if (seededRolls.length) {
            profile.engine = `${engineName}+seeded`;
            profile.seed = seed.label;
            rolls = seededRolls;
            break;
        }
    }

    if (!rolls.length) {
        rolls = await runComboSearch(gear, params.setSkills, params.groupSkills, "comboSearch");
    }
    profile.timedOut = !rolls.length && searchTimedOut;

    if (VALIDATE_NEW_ENGINE && !profile.timedOut) {
        stageStartedAt = performance.now();
        const validateProfile = createOptimizerProfile(USE_NEW_ENGINE ? "dfs-validate" : "new-engine-validate");
        const validateFunc = USE_NEW_ENGINE ? rollCombosDfs : rollCombosNewEngine;
        const validationRolls = await validateFunc(
            gear, params.skills, params.setSkills, params.groupSkills, searchLimit,
            params.findOne, { current: false }, params.optimizationGoal, validateProfile
        );
        warnIfEngineMismatch(USE_NEW_ENGINE ? validationRolls : rolls, USE_NEW_ENGINE ? rolls : validationRolls);
        recordOptimizerStage(profile, "engineValidation", stageStartedAt);
    }

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
            weaponSharpness: roll.weaponSharpness ?? params.weaponSharpness ?? 'White'
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
    const rankedRolls = rankBuildsByDamage(rolls, params.optimizationGoal || 'highest_dps');
    rolls = reorder(rankedRolls).slice(0, params.limit);
    recordOptimizerStage(profile, "rankAndReorder", stageStartedAt);

    stageStartedAt = performance.now();
    if (!profile.timedOut) {
        cacheSearchResult(cacheKey, rolls);
    }
    recordOptimizerStage(profile, "cacheWrite", stageStartedAt);

    profile.runtimeMs = performance.now() - searchStartedAt;
    finishOptimizerProfile(profile, rolls);

    return rolls;
};

export const searchAndSpeed = async(parameters, useCached = false) => {
    const params = getSearchParameters(parameters);
    const cacheKey = buildSearchCacheKey(params);
    if (useCached) {
        const cachedSearch = searchCache.get(cacheKey);
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
