import { useState, useEffect, useRef } from "react";
import SkillsPicker from "../components/SkillsPicker";
import SKILLS from '../data/compact/skills.json';
import GROUP_SKILLS from '../data/compact/group-skills.json';
import SET_SKILLS from '../data/compact/set-skills.json';
import SKILLS_DB from '../data/detailed/skills.json';
import SET_SKILLS_DB from '../data/detailed/set-skills.json';
import GROUP_SKILLS_DB from '../data/detailed/group-skills.json';
import DECORATIONS from '../data/compact/decoration.json';
import {
    getSearchUrl, generateStyle,
    generateWikiString, getMaxLevel, getSkillPopup,
    isGroupSkill, isSetSkill,
    copyTextToClipboard
} from "../util/util";
import ArrowRight from '@mui/icons-material/ArrowForwardIos';
import ArrowLeft from '@mui/icons-material/ArrowBackIos';
import Delete from '@mui/icons-material/DeleteForever';
import { styled } from '@mui/material/styles';
import { getInclusiveRemainingSlots, getSearchParameters, isEmpty } from "../util/tools";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Results from "./Results";
import { DEBUG } from "../util/constants";
import { useStorage } from "../hooks/StorageContext";
import { useSearchWorker } from "../hooks/useSearchWorker";
import { useBonusExplorer } from "../hooks/useBonusExplorer";
import { ELEMENT_SKILL_TABLES, filterConditionsForSkills, getConditionOptionsForSkills } from "../util/damageScoring";
import DamageConditions from './DamageConditions';
import WeaponSearchControls from './WeaponSearchControls';
import { SearchOutcome, SearchProgress } from './SearchStatus';

const ArrowL = styled(ArrowLeft)`
    width: 16px !important;
`;
const ArrowR = styled(ArrowRight)`
    width: 16px !important;
`;
const DeleteIcon = styled(Delete)`
    color: crimson;
    width: 20px;
`;

const Search = () => {
    const { fields, updateField, updateMultipleFields } = useStorage();
    const [results, setResults] = useState([]);
    const [moreResults, setMoreResults] = useState({}); // skill name: level
    const [moreSlots, setMoreSlots] = useState({});
    const [showMore, setShowMore] = useState(false);
    const cancelledRef = useRef(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(-1);
    const [moreElapsedSeconds, setMoreElapsedSeconds] = useState(-1);
    const [loadProgress, setLoadProgress] = useState(0);
    const [optimizerProfile, setOptimizerProfile] = useState(null);
    const [searchError, setSearchError] = useState('');
    const recommendationSeedResultsRef = useRef([]);
    const bonusSearchedSkillsRef = useRef({});
    const [bonusRoutes, setBonusRoutes] = useState([]);

    const [isGenerating, setIsGenerating] = useState(false);
    const [showConditions, setShowConditions] = useState(false);
    const customDecorationMap = Object.fromEntries((fields.customDecorations || [])
        .map(deco => [deco.name, [deco.type, deco.skills || {}, Number(deco.size || 1)]]));
    const availableDecorations = { ...DECORATIONS, ...customDecorationMap };

    useEffect(() => {
        if (!isEmpty(moreResults)) {
            setShowMore(true);
        }
    }, [moreResults]);

    useEffect(() => {
        if (!isGenerating) {
            setLoadProgress(0);
        }
    }, [isGenerating]);

    const {
        isExploring: isExploringBonuses,
        progress: improvementProgress,
        progressPercent: bonusProgress,
        reset: resetBonusExploration,
        start: startBonusExploration,
        stop: stopBonusExploration
    } = useBonusExplorer({
        onElapsed: seconds => {
            setMoreElapsedSeconds(seconds);
            setShowMore(true);
        },
        onResult: message => applyBonusResultMessage(message)
    });

    const { start: startSearchWorker, cancel: cancelSearchWorker } = useSearchWorker({
        onPartial: partial => {
            setElapsedSeconds(partial.seconds);
            setResults(partial.results);
            setOptimizerProfile(partial.profile || { engine: 'mitm', partial: true });
        },
        onDone: ret => {
            setElapsedSeconds(ret.seconds);
            setResults(ret.results);
            setOptimizerProfile(ret.profile || null);
        },
        onError: error => {
            console.error("Search worker failed:", error.message, error.stack);
            setSearchError(error.message);
            setElapsedSeconds(0);
        },
        onStateChange: state => {
            setIsGenerating(['queued', 'running', 'streaming'].includes(state.status));
        }
    });

    const prepareSearch = ({ resetElapsed = true } = {}) => {
        resetBonusExploration();
        setBonusRoutes([]);
        if (resetElapsed) {
            setElapsedSeconds(-1);
        }
        setMoreResults({});
        setMoreSlots({});
        setOptimizerProfile(null);
        setSearchError('');
        setIsGenerating(true);

        cancelledRef.current = false;
        const justSkills = Object.fromEntries(
            Object.entries(fields.skills).filter(x => SKILLS[x[0]]).map(x => [x[0], x[1]])
        );
        const justSetSkills = Object.fromEntries(
            Object.entries(fields.skills).filter(x => SET_SKILLS[x[0]]).map(x => [x[0], x[1]])
        );
        const justGroupSkills = Object.fromEntries(
            Object.entries(fields.skills).filter(x => GROUP_SKILLS[x[0]]).map(x => [x[0], x[1]])
        );
        const filteredConditions = filterConditionsForSkills(fields.conditions, fields.skills);

        if (DEBUG) {
            const wiki = generateWikiString(
                justSkills, justSetSkills, justGroupSkills,
                fields.slotFilters
            );

            console.log(`https://mhwilds.wiki-db.com/sim/#skills=${wiki}&fee=1`);
        }

        const params = getSearchParameters({
            skills: justSkills,
            setSkills: justSetSkills,
            conditions: filteredConditions,
            groupSkills: justGroupSkills,
            slotFilters: fields.slotFilters,
            weaponSlots: fields.weaponSlots,
            weaponBaseRaw: fields.weaponBaseRaw,
            weaponBaseAffinity: fields.weaponBaseAffinity,
            weaponType: fields.weaponType,
            weaponElementType: fields.weaponElementType,
            weaponElementValue: fields.weaponElementValue,
            weaponSharpness: fields.weaponSharpness,
            optimizationGoal: fields.optimizationGoal,
            setSkillBonus: fields.setSkillBonus,
            groupSkillBonus: fields.groupSkillBonus,
            customTalismans: fields.customTalismans,
            useOnlyOwnedTalismans: fields.useOnlyOwnedTalismans,
            mandatoryArmor: fields.mandatoryArmor,
            blacklistedArmor: fields.blacklistedArmor,
            blacklistedArmorTypes: fields.blacklistedArmorTypes,
            decoMods: fields.decoInventory,
            customDecorations: fields.customDecorations,
            priorResults: recommendationSeedResultsRef.current,
            cancelToken: cancelledRef
        });

        return params;
    };

    const reloadLatestVersion = () => {
        const url = new URL(window.location.href);
        url.searchParams.set('_refresh', Date.now().toString());
        window.location.replace(url.toString());
    };

    const getResults = event => {
        if (event.ctrlKey) {
            const url = getSearchUrl(fields.skills, fields.slotFilters);
            copyTextToClipboard(url, () => {
                window.snackbar.createSnackbar(`Copied search url to the clipboard`, {
                    timeout: 3000
                });
            });
            return;
        }

        const params = prepareSearch();

        // check if we search is a repeat from last search
        const paramStr = [
            Object.entries(fields.skills).map(x => `${x[0]}-${x[1]}`).sort().join("."),
            Object.entries(params.slotFilters).map(x => `${x[0]}-${x[1]}`).sort().join("."),
            [...params.blacklistedArmor].sort().join("."),
            [...params.blacklistedArmorTypes].sort().join("."),
            [...params.mandatoryArmor].sort().join("."),
            [...params.weaponSlots].sort().join("."),
            params.weaponBaseRaw,
            params.weaponBaseAffinity,
            params.weaponType,
            params.weaponElementType,
            params.weaponElementValue,
            params.weaponSharpness,
            params.optimizationGoal,
            params.setSkillBonus,
            params.groupSkillBonus,
            JSON.stringify(params.customTalismans),
            JSON.stringify(params.customDecorations),
            params.useOnlyOwnedTalismans,
            Object.entries(params.decoMods).map(x => `${x[0]}-${x[1]}`).sort().join(".")
        ].join(",");
        let fromTheSto = localStorage.getItem('paramStr');
        if (fromTheSto) {
            fromTheSto = JSON.parse(fromTheSto);
        }
        const same = paramStr === fromTheSto || false;
        updateField('paramStr', paramStr);

        setShowMore(false);
        updateField('searchedSkills', fields.skills);
        updateField('lastParams', params);
        // Find multiple results but cap at 100 valid builds
        params.limit = 100;
        params.findOne = false;
        // console.log('params', params);
        const workerParams = { ...params };
        delete workerParams.cancelToken;
        startSearchWorker(workerParams, same);
        recommendationSeedResultsRef.current = [];
    };

    const isOffElementSkill = skillName => {
        const elementSkill = ELEMENT_SKILL_TABLES[skillName];
        const selectedElement = fields.weaponElementType || 'None';
        return elementSkill && (selectedElement === 'None' || elementSkill.elementType !== selectedElement);
    };

    const canUseDecoForCurrentElement = decoSkills => {
        return !Object.keys(decoSkills || {}).some(isOffElementSkill);
    };

    const addSocketableSkill = (
        nextMoreResults, skillName, level, slotType, searchedLevel = 0, sourceResult = null
    ) => {
        const current = nextMoreResults[skillName] || { level: 0, addedLevel: 0, slotTypes: [] };
        const nextLevel = Math.max(current.level || 0, level);
        let seedResults = current.seedResults || [];
        if (sourceResult && level > (current.level || 0)) {
            seedResults = [sourceResult];
        } else if (sourceResult && level === nextLevel) {
            seedResults = Array.from(new Set([].concat(seedResults, sourceResult)));
        }
        nextMoreResults[skillName] = {
            level: nextLevel,
            addedLevel: Math.max(current.addedLevel || 0, Math.max(0, nextLevel - searchedLevel)),
            slotTypes: current.slotTypes.includes(slotType) ?
                current.slotTypes :
                [...current.slotTypes, slotType],
            seedResults
        };
    };

    const getSetSkillLevelFromPoints = (skillName, points) => {
        const thresholds = SET_SKILLS[skillName]?.[2] || [];
        return thresholds.reduce((level, threshold) => points >= threshold ? level + 1 : level, 0);
    };

    const getGroupSkillLevelFromPoints = (skillName, points) => {
        const threshold = GROUP_SKILLS[skillName]?.[2] || 3;
        return points >= threshold ? 1 : 0;
    };

    const collectBonusSelectorSkills = (result, searchedSetSkills, searchedGroupSkills, nextMoreResults) => {
        if (!fields.setSkillBonus) {
            Object.entries(result.setSkillPoints || {}).forEach(([skillName, points]) => {
                if (!SET_SKILLS[skillName]) { return; }

                const searchedLevel = searchedSetSkills[skillName] || 0;
                const currentLevel = getSetSkillLevelFromPoints(skillName, points);
                const nextLevel = getSetSkillLevelFromPoints(skillName, points + 1);
                if (nextLevel <= currentLevel || nextLevel <= searchedLevel) { return; }

                addSocketableSkill(nextMoreResults, skillName, nextLevel, 'set-bonus', searchedLevel);
            });
        }

        if (!fields.groupSkillBonus) {
            Object.entries(result.groupSkillPoints || {}).forEach(([skillName, points]) => {
                if (!GROUP_SKILLS[skillName]) { return; }

                const searchedLevel = searchedGroupSkills[skillName] || 0;
                const currentLevel = getGroupSkillLevelFromPoints(skillName, points);
                const nextLevel = getGroupSkillLevelFromPoints(skillName, points + 1);
                if (nextLevel <= currentLevel || nextLevel <= searchedLevel) { return; }

                addSocketableSkill(nextMoreResults, skillName, nextLevel, 'group-bonus', searchedLevel);
            });
        }
    };

    const collectPresentBonusSkills = (result, searchedSetSkills, searchedGroupSkills, nextMoreResults) => {
        Object.entries(result.setSkills || {}).forEach(([skillName, level]) => {
            if (!SET_SKILLS[skillName]) { return; }

            const searchedLevel = searchedSetSkills[skillName] || 0;
            if (level <= searchedLevel) { return; }

            addSocketableSkill(nextMoreResults, skillName, level, 'present-set-bonus', searchedLevel);
        });

        Object.entries(result.groupSkills || {}).forEach(([skillName, level]) => {
            if (!GROUP_SKILLS[skillName]) { return; }

            const searchedLevel = searchedGroupSkills[skillName] || 0;
            if (level <= searchedLevel) { return; }

            addSocketableSkill(nextMoreResults, skillName, level, 'present-group-bonus', searchedLevel);
        });
    };

    const mergeSocketableSkills = (target, source) => {
        Object.entries(source).forEach(([skillName, skillInfo]) => {
            const current = target[skillName] || { level: 0, addedLevel: 0, slotTypes: [] };
            target[skillName] = {
                level: Math.max(current.level || 0, skillInfo.level || 0),
                addedLevel: Math.max(current.addedLevel || 0, skillInfo.addedLevel || 0),
                slotTypes: Array.from(new Set([
                    ...current.slotTypes || [],
                    ...skillInfo.slotTypes || []
                ])),
                seedResults: Array.from(new Set([
                    ...current.seedResults || [],
                    ...skillInfo.seedResults || []
                ]))
            };
        });
    };

    const getMaximumDecoPoints = (slotsBySize, candidates, usedDecos, decoInventory) => {
        const slots = Object.entries(slotsBySize || {})
            .flatMap(([size, amount]) => Array(amount).fill(Number(size)))
            .sort((a, b) => b - a);
        if (!slots.length || !candidates.length) { return 0; }

        const limits = candidates.map(candidate => {
            if (!Object.prototype.hasOwnProperty.call(decoInventory, candidate.name)) { return slots.length; }
            return Math.max(0, decoInventory[candidate.name] - (usedDecos[candidate.name] || 0));
        });
        const memo = new Map();
        const visit = (slotIndex, remaining) => {
            if (slotIndex >= slots.length) { return 0; }
            const key = `${slotIndex}:${remaining.join(',')}`;
            if (memo.has(key)) { return memo.get(key); }

            let best = visit(slotIndex + 1, remaining);
            candidates.forEach((candidate, index) => {
                if (remaining[index] <= 0 || candidate.size > slots[slotIndex]) { return; }
                const nextRemaining = [...remaining];
                nextRemaining[index]--;
                best = Math.max(best, candidate.level + visit(slotIndex + 1, nextRemaining));
            });
            memo.set(key, best);
            return best;
        };

        return visit(0, limits);
    };

    const collectSocketableSkills = (result, freeSlots, searchedSkills, nextMoreResults) => {
        const currentSkills = result.skills || {};
        const decoInventory = fields.decoInventory || {};
        const usedDecos = (result.decoNames || []).reduce((counts, decoName) => ({
            ...counts,
            [decoName]: (counts[decoName] || 0) + 1
        }), {});
        const candidatesBySkill = {};

        Object.entries(availableDecorations).forEach(([decoName, [decoType, decoSkills, decoSize]]) => {
            if (!canUseDecoForCurrentElement(decoSkills)) { return; }
            Object.entries(decoSkills).forEach(([skillName, level]) => {
                if (!SKILLS[skillName] || isOffElementSkill(skillName)) { return; }
                candidatesBySkill[skillName] ??= { armor: [], weapon: [] };
                candidatesBySkill[skillName][decoType].push({
                    name: decoName,
                    size: decoSize,
                    level
                });
            });
        });

        Object.entries(candidatesBySkill).forEach(([skillName, candidates]) => {
            const searchedLevel = searchedSkills[skillName] || 0;
            const currentLevel = currentSkills[skillName] || searchedLevel;
            const armorPoints = getMaximumDecoPoints(
                freeSlots.armor, candidates.armor, usedDecos, decoInventory
            );
            const weaponPoints = getMaximumDecoPoints(
                freeSlots.weapon, candidates.weapon, usedDecos, decoInventory
            );
            const level = Math.min(SKILLS[skillName], currentLevel + armorPoints + weaponPoints);
            if (level <= searchedLevel) { return; }
            if (armorPoints > 0) {
                addSocketableSkill(nextMoreResults, skillName, level, 'armor', searchedLevel, result);
            }
            if (weaponPoints > 0) {
                addSocketableSkill(nextMoreResults, skillName, level, 'weapon', searchedLevel, result);
            }
        });
    };

    const collectFlexibleRequiredWeaponBonuses = (result, searchedSkills, nextMoreResults) => {
        const decoInventory = fields.decoInventory || {};
        const requiredDecoNames = result.requiredDecoNames || result.decoNames || [];

        requiredDecoNames.forEach(requiredDecoName => {
            const requiredDeco = availableDecorations[requiredDecoName];
            if (!requiredDeco || requiredDeco[0] !== 'weapon') { return; }

            const [, requiredDecoSkills, requiredDecoSize] = requiredDeco;
            const requiredSkillPortion = Object.fromEntries(
                Object.entries(requiredDecoSkills).filter(([skillName]) => searchedSkills[skillName])
            );
            if (isEmpty(requiredSkillPortion)) { return; }

            const bonusLevelsFromThisSlot = {};
            Object.entries(availableDecorations).forEach(([candidateName, [decoType, candidateSkills, candidateSize]]) => {
                if (decoType !== 'weapon' || candidateSize > requiredDecoSize) { return; }
                if (Object.prototype.hasOwnProperty.call(decoInventory, candidateName) && decoInventory[candidateName] <= 0) {
                    return;
                }

                const coversRequiredSkills = Object.entries(requiredSkillPortion).every(([skillName, level]) => {
                    return (candidateSkills[skillName] || 0) >= level;
                });
                if (!coversRequiredSkills) { return; }

                Object.entries(candidateSkills).forEach(([skillName, level]) => {
                    if (!SKILLS[skillName] || requiredSkillPortion[skillName] || searchedSkills[skillName]) { return; }
                    bonusLevelsFromThisSlot[skillName] = Math.max(bonusLevelsFromThisSlot[skillName] || 0, level);
                });
            });

            Object.entries(bonusLevelsFromThisSlot).forEach(([skillName, level]) => {
                const currentPossibleLevel = nextMoreResults[skillName]?.level || result.skills?.[skillName] || 0;
                const combinedLevel = Math.min(SKILLS[skillName], currentPossibleLevel + level);
                addSocketableSkill(
                    nextMoreResults, skillName, combinedLevel, 'weapon',
                    searchedSkills[skillName] || 0, result
                );
            });
        });
    };

    const getNormalSkillTargets = skills => Object.fromEntries(
        Object.entries(skills || {}).filter(([skillName]) => SKILLS[skillName])
    );

    const getSetSkillTargets = skills => Object.fromEntries(
        Object.entries(skills || {}).filter(([skillName]) => SET_SKILLS[skillName])
    );

    const getGroupSkillTargets = skills => Object.fromEntries(
        Object.entries(skills || {}).filter(([skillName]) => GROUP_SKILLS[skillName])
    );

    const getMoreSkills = () => {
        const started = performance.now();
        if (!results.length) {
            setMoreResults({});
            setMoreSlots({});
            setMoreElapsedSeconds((performance.now() - started) / 1000);
            setShowMore(true);
            return;
        }

        const nextMoreResults = {};
        const nextMoreSlots = {
            armor: {},
            weapon: {},
            usedWeaponDecos: {},
            totalWeaponSlots: 0
        };
        const searchedSkills = getNormalSkillTargets(fields.skills);
        const searchedSetSkills = getSetSkillTargets(fields.skills);
        const searchedGroupSkills = getGroupSkillTargets(fields.skills);
        const slotFilters = fields.slotFilters || {};

        results.forEach(result => {
            const weaponDecoCounts = {};
            (result.decoNames || []).forEach(decoName => {
                if (DECORATIONS[decoName]?.[0] !== 'weapon') { return; }
                weaponDecoCounts[decoName] = (weaponDecoCounts[decoName] || 0) + 1;
            });
            Object.entries(weaponDecoCounts).forEach(([decoName, count]) => {
                nextMoreSlots.usedWeaponDecos[decoName] = Math.max(
                    nextMoreSlots.usedWeaponDecos[decoName] || 0,
                    count
                );
            });
            const usedWeaponSlotCount = Object.values(weaponDecoCounts).reduce((total, count) => total + count, 0);
            nextMoreSlots.totalWeaponSlots = Math.max(
                nextMoreSlots.totalWeaponSlots || 0,
                usedWeaponSlotCount + (result.freeWeaponSlots || []).length
            );

            const remainingSlots = getInclusiveRemainingSlots(result.freeSlots || [], slotFilters);
            const resultFreeSlots = { armor: {}, weapon: {} };
            if (remainingSlots) {
                [1, 2, 3].forEach(slotSize => {
                    nextMoreSlots.armor[slotSize] = Math.max(
                        nextMoreSlots.armor[slotSize] || 0,
                        remainingSlots[slotSize] || 0
                    );
                    resultFreeSlots.armor[slotSize] = remainingSlots[slotSize] || 0;
                });
            }

            const remainingWeaponSlots = getInclusiveRemainingSlots(result.freeWeaponSlots || [], {});
            if (remainingWeaponSlots) {
                [1, 2, 3].forEach(slotSize => {
                    nextMoreSlots.weapon[slotSize] = Math.max(
                        nextMoreSlots.weapon[slotSize] || 0,
                        remainingWeaponSlots[slotSize] || 0
                    );
                    resultFreeSlots.weapon[slotSize] = remainingWeaponSlots[slotSize] || 0;
                });
            }

            const resultMoreResults = {};
            collectSocketableSkills(result, resultFreeSlots, searchedSkills, resultMoreResults);
            collectFlexibleRequiredWeaponBonuses(result, searchedSkills, resultMoreResults);
            collectBonusSelectorSkills(result, searchedSetSkills, searchedGroupSkills, resultMoreResults);
            collectPresentBonusSkills(result, searchedSetSkills, searchedGroupSkills, resultMoreResults);
            Object.entries(result.talismanFlex?.options || {}).forEach(([skillName, level]) => {
                const flexSources = [result].concat(result.recommendationSeedResults || []);
                const compatibleSlotTypes = new Set(
                    Object.values(DECORATIONS)
                        .filter(([, decoSkills]) => decoSkills?.[skillName])
                        .map(([decoType]) => decoType === 'weapon' ? 'weapon' : 'armor')
                );
                // Charm alternatives belong in the existing decoration categories.
                // Armor is the safe fallback for a skill without a known decoration.
                if (!compatibleSlotTypes.size) { compatibleSlotTypes.add('armor'); }
                compatibleSlotTypes.forEach(slotType => {
                    flexSources.forEach(sourceResult => addSocketableSkill(
                        resultMoreResults, skillName, level, slotType,
                        searchedSkills[skillName] || 0, sourceResult
                    ));
                });
            });
            mergeSocketableSkills(nextMoreResults, resultMoreResults);
        });

        setMoreResults({ ...nextMoreResults });
        setMoreSlots(nextMoreSlots);
        setMoreElapsedSeconds((performance.now() - started) / 1000);
        setShowMore(true);
    };

    const applyBonusResultMessage = message => {
        const searchedSkills = bonusSearchedSkillsRef.current;
        if (message.candidate.sourceType === 'skill') {
            setMoreResults(current => {
                const next = { ...current };
                (message.seedResults || [null]).forEach(sourceResult => addSocketableSkill(
                    next, message.candidate.skillName, message.candidate.level, 'armor',
                    searchedSkills[message.candidate.skillName] || 0, sourceResult
                ));
                return next;
            });
        } else {
            setBonusRoutes(current => {
                const route = {
                    ...message.candidate,
                    seedResults: message.seedResults || []
                };
                const existingIndex = current.findIndex(candidate =>
                    candidate.skillName === route.skillName
                );
                if (existingIndex < 0) { return [...current, route]; }
                const next = [...current];
                next[existingIndex] = route.level >= next[existingIndex].level ?
                    route : next[existingIndex];
                return next;
            });
        }
        setShowMore(true);
    };

    const exploreBonusPaths = () => {
        if (!results.length || isExploringBonuses) { return; }

        const searchedSkills = getNormalSkillTargets(fields.skills);
        bonusSearchedSkillsRef.current = searchedSkills;
        const searchedSetSkills = getSetSkillTargets(fields.skills);
        const searchedGroupSkills = getGroupSkillTargets(fields.skills);
        const params = getSearchParameters({
            skills: searchedSkills,
            setSkills: searchedSetSkills,
            groupSkills: searchedGroupSkills,
            slotFilters: fields.slotFilters,
            weaponSlots: fields.weaponSlots,
            weaponBaseRaw: fields.weaponBaseRaw,
            weaponBaseAffinity: fields.weaponBaseAffinity,
            weaponType: fields.weaponType,
            weaponElementType: fields.weaponElementType,
            weaponElementValue: fields.weaponElementValue,
            weaponSharpness: fields.weaponSharpness,
            optimizationGoal: fields.optimizationGoal,
            conditions: fields.conditions,
            setSkillBonus: fields.setSkillBonus,
            groupSkillBonus: fields.groupSkillBonus,
            customTalismans: fields.customTalismans,
            useOnlyOwnedTalismans: fields.useOnlyOwnedTalismans,
            mandatoryArmor: fields.mandatoryArmor,
            blacklistedArmor: fields.blacklistedArmor,
            blacklistedArmorTypes: fields.blacklistedArmorTypes,
            decoMods: fields.decoInventory,
            priorResults: results
        });
        startBonusExploration(params);
    };

    const findImprovements = () => {
        getMoreSkills();
        setBonusRoutes([]);
        exploreBonusPaths();
    };

    const addSkill = (skillName, level) => {
        const tempSkills = { ...fields.skills };
        tempSkills[skillName] = level || SKILLS[skillName] || 1;
        updateField('skills', tempSkills);
    };

    const addSlotFilter = (slot, level = 1) => {
        const tempSlotFilters = { ...fields.slotFilters };
        tempSlotFilters[slot] = level;
        updateField('slotFilters', tempSlotFilters);
    };

    const removeSkill = skillName => {
        const tempSkills = { ...fields.skills };
        delete tempSkills[skillName];
        updateMultipleFields({
            skills: tempSkills,
            conditions: filterConditionsForSkills(fields.conditions, tempSkills)
        });
    };

    const conditionOptions = getConditionOptionsForSkills(fields.skills);

    const renderConditionsPanel = () => {
        if (conditionOptions.length === 0) {
            return null;
        }

        return <Accordion
            expanded={showConditions}
            onChange={() => setShowConditions(!showConditions)}
            sx={{ marginTop: '0.75em' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                Conditions
            </AccordionSummary>
            <AccordionDetails>
                <DamageConditions
                    skills={fields.skills}
                    conditions={fields.conditions}
                    onChange={conditions => updateField('conditions', conditions)}
                />
            </AccordionDetails>
        </Accordion>;
    };

    const removeSlot = slotSize => {
        const tempSlots = { ...fields.slotFilters };
        delete tempSlots[slotSize];
        updateField('slotFilters', tempSlots);
    };

    const levelMod = (name, amount, maxLevel) => {
        const tSkills = { ...fields.skills };
        const currentLevel = fields.skills[name] || 0;
        tSkills[name] = currentLevel + amount;
        if (tSkills[name] > maxLevel || tSkills[name] === 0) {
            return;
        }

        updateField('skills', tSkills);
    };

    const slotLevelMod = (size, amount) => {
        const maxAmountOfSlots = 18; // 3 per armor piece (not that we currently have armor that can reach this)
        const tSlots = { ...fields.slotFilters };
        const currentLevel = tSlots[size] || 0;
        tSlots[size] = currentLevel + amount;
        if (tSlots[size] > maxAmountOfSlots || tSlots[size] === 0) {
            return;
        }

        updateField('slotFilters', tSlots);
    };

    const getArrowStyle = condition => {
        return condition ? {} : { opacity: 0.5 };
    };

    const renderChosenSkill = (skillName, level) => {
        const skill = SKILLS_DB[skillName] ||
            SET_SKILLS_DB[skillName] ||
            GROUP_SKILLS_DB[skillName];
        let skillIcon = skill?.icon;
        const isASetSkill = skill ? isSetSkill(skill) : Boolean(SET_SKILLS[skillName]);
        const isAGroupSkill = skill ? isGroupSkill(skill) : Boolean(GROUP_SKILLS[skillName]);
        if (!skillIcon) {
            skillIcon = isASetSkill ? 'set' : 'group';
        }

        const maxLevel = getMaxLevel(skillName);
        let displayName = skillName;
        if (skill?.skill && fields.showGroupSkillNames && (isAGroupSkill || isASetSkill)) {
            displayName = skill.skill;
        }

        const description = getSkillPopup(skill);
        const nameDiv = <div className={`skills-search-bubble-text`} style={{ marginRight: '4px' }}>
            {displayName}
        </div>;
        const iconImg = skillIcon ?
            <img className="skills-search-bubble-icon" src={`images/icons/${skillIcon}.png`} alt={skillIcon} /> :
            null;

        const bubbleDiv = <div className="skill-level-edit">
            {nameDiv}
            <ArrowL onClick={() => levelMod(skillName, -1, maxLevel)} style={getArrowStyle(level > 1)} />
            {<div style={{ fontSize: '16px', marginLeft: '-3px' }}>{level}</div>}
            <ArrowR onClick={() => levelMod(skillName, 1, maxLevel)} style={getArrowStyle(level < maxLevel)} />
            <DeleteIcon className="delete-icon" title="Remove skill" onClick={() => removeSkill(skillName)} />
        </div>;

        const gradientStyle = generateStyle("#6ba6fd");
        return <div className={`skills-search-bubble skill-gradient`} style={gradientStyle} key={skillName}
            title={description}>
            {iconImg}
            {bubbleDiv}
        </div>;
    };

    const renderSlotFilters = () => {
        const gradientStyle = generateStyle("#c5abc5");

        return <div className="chosen-slot-filters">
            {Object.entries(fields.slotFilters).map(x => {
                const slotSize = x[0];
                const amount = x[1];

                return <div className={`skills-search-bubble slot-filter slot-gradient`} style={gradientStyle} key={slotSize}
                    title={`Specify how many ${slotSize} slot decos you want to be able to fit into the free slots`}>
                    <img className="skills-search-bubble-icon darken" src={`images/slot${slotSize}.png`} alt={slotSize} />
                    <div className="skill-level-edit">
                        <div className={`skills-search-bubble-text`}>
                            {`${slotSize} Slot Deco Filter`}
                        </div>
                        <ArrowL onClick={() => slotLevelMod(slotSize, -1)} style={getArrowStyle(amount > 1)} />
                        {<div style={{ fontSize: '16px', marginLeft: '-3px' }}>{amount}</div>}
                        <ArrowR onClick={() => slotLevelMod(slotSize, 1)} style={getArrowStyle(amount < 18)} />
                        <DeleteIcon className="delete-icon" title="Remove skill" onClick={() => removeSlot(slotSize)} />
                    </div>
                </div>;
            })}
        </div>;
    };

    const renderChosenSkills = () => {
        const gradientStyle = generateStyle("#d14848");
        return <div className="chosen-skills">
            {!isEmpty(fields.slotFilters) && renderSlotFilters()}
            {Object.entries(fields.skills).map(x => renderChosenSkill(x[0], x[1]))}
            {(!isEmpty(fields.skills) || !isEmpty(fields.slotFilters)) &&
                <div className="skills-search-bubble clear-all clear-gradient" onClick={() => {
                    updateMultipleFields({
                        skills: {},
                        slotFilters: {}
                    });
                }}
                    style={gradientStyle}
                    title="Clear all chosen skills">
                    Clear All
                </div>}
        </div>;
    };

    const normalizeMoreSlots = slots => {
        if (slots?.armor || slots?.weapon) {
            return {
                armor: slots.armor || {},
                weapon: slots.weapon || {},
                usedWeaponDecos: slots.usedWeaponDecos || {},
                totalWeaponSlots: slots.totalWeaponSlots || 0
            };
        }

        return {
            armor: slots || {},
            weapon: {},
            usedWeaponDecos: {},
            totalWeaponSlots: 0
        };
    };

    const formatDecoSkills = decoName => {
        return Object.entries(availableDecorations[decoName]?.[1] || {})
            .map(([skillName, level]) => `${skillName} ${level}`)
            .join(' / ');
    };

    const renderSlotOptionGroup = (slotType, slotSize, amount) => {
        if (!amount) { return null; }

        const slotLabel = slotType === 'weapon' ? 'Weapon' : 'Armor';
        const canFilter = slotType === 'armor';
        const gradientStyle = generateStyle(slotType === 'weapon' ? "#9ed9df" : "#c5abc5");

        return <div className={`skills-search-bubble slot-filter more slot-gradient`}
            style={gradientStyle}
            key={`${slotType}-${slotSize}`}
            onClick={canFilter ? () => addSlotFilter(slotSize, amount) : undefined}
            title={canFilter ?
                `Require ${amount} open armor slot(s) of size ${slotSize} or better` :
                `Open weapon slot(s) of size ${slotSize}`}>
            <img className="skills-search-bubble-icon" src={`images/slot${slotSize}.png`} alt={slotSize} />
            <div className="skill-level-edit">
                <div className={`skills-search-bubble-text`}>
                    {`${slotLabel} Slot ${slotSize}`}
                </div>
                <div style={{ fontSize: '16px', marginLeft: '0px', fontWeight: 'bold' }}>{amount}</div>
            </div>
        </div>;
    };

    const renderMoreResults = () => {
        const alphabeticalEntries = object => Object.entries(object || {})
            .sort(([a], [b]) => a.localeCompare(b));
        const time = moreElapsedSeconds > -1 ? `(${moreElapsedSeconds.toFixed(2)} seconds)` : '';

        const freeSlotsByType = normalizeMoreSlots(moreSlots);
        const freeSlots = {
            armor: Object.fromEntries(Object.entries(freeSlotsByType.armor).filter(([, amount]) => amount > 0)),
            weapon: Object.fromEntries(Object.entries(freeSlotsByType.weapon).filter(([, amount]) => amount > 0))
        };
        const usedWeaponDecos = freeSlotsByType.usedWeaponDecos || {};
        const freeWeaponSlotCount = Object.values(freeSlots.weapon).reduce((total, amount) => total + amount, 0);
        const filteredMoreResults = Object.fromEntries(
            Object.entries(moreResults).filter(([skillName]) => {
                const elementSkill = ELEMENT_SKILL_TABLES[skillName];
                return !elementSkill ||
                    (fields.weaponElementType || 'None') !== 'None' &&
                        elementSkill.elementType === fields.weaponElementType;
            })
        );
        const armorSkillResults = Object.fromEntries(
            Object.entries(filteredMoreResults).filter(([, skillInfo]) => skillInfo.slotTypes?.includes('armor'))
        );
        const weaponSkillResults = Object.fromEntries(
            Object.entries(filteredMoreResults).filter(([, skillInfo]) => skillInfo.slotTypes?.includes('weapon'))
        );
        const setBonusSkillResults = Object.fromEntries(
            Object.entries(filteredMoreResults).filter(([, skillInfo]) => skillInfo.slotTypes?.includes('set-bonus'))
        );
        const groupBonusSkillResults = Object.fromEntries(
            Object.entries(filteredMoreResults).filter(([, skillInfo]) => skillInfo.slotTypes?.includes('group-bonus'))
        );
        const presentSetBonusSkillResults = Object.fromEntries(
            Object.entries(filteredMoreResults).filter(([, skillInfo]) =>
                skillInfo.slotTypes?.includes('present-set-bonus')
            )
        );
        const presentGroupBonusSkillResults = Object.fromEntries(
            Object.entries(filteredMoreResults).filter(([, skillInfo]) =>
                skillInfo.slotTypes?.includes('present-group-bonus')
            )
        );
        const searchSetBonusSkillResults = Object.fromEntries(
            Object.entries(filteredMoreResults).filter(([, skillInfo]) =>
                skillInfo.slotTypes?.includes('search-set-bonus')
            )
        );
        const searchGroupBonusSkillResults = Object.fromEntries(
            Object.entries(filteredMoreResults).filter(([, skillInfo]) =>
                skillInfo.slotTypes?.includes('search-group-bonus')
            )
        );
        const setPathSkillResults = {};
        mergeSocketableSkills(setPathSkillResults, searchSetBonusSkillResults);
        mergeSocketableSkills(setPathSkillResults, setBonusSkillResults);
        mergeSocketableSkills(setPathSkillResults, presentSetBonusSkillResults);
        const groupPathSkillResults = {};
        mergeSocketableSkills(groupPathSkillResults, searchGroupBonusSkillResults);
        mergeSocketableSkills(groupPathSkillResults, groupBonusSkillResults);
        mergeSocketableSkills(groupPathSkillResults, presentGroupBonusSkillResults);
        const bonusImprovements = {};
        [...Object.entries(setPathSkillResults), ...Object.entries(groupPathSkillResults)]
            .forEach(([skillName, skillInfo]) => {
                const level = Math.max(bonusImprovements[skillName]?.level || 0, skillInfo.level || 0);
                bonusImprovements[skillName] = { ...skillInfo, level, addedLevel: level };
            });
        bonusRoutes.forEach(candidate => {
            const level = Math.max(bonusImprovements[candidate.skillName]?.level || 0, candidate.level);
            bonusImprovements[candidate.skillName] = {
                level,
                addedLevel: level,
                slotTypes: [candidate.sourceType],
                seedResults: candidate.seedResults || []
            };
        });
        const hasAddableSkills = !isEmpty(weaponSkillResults) || !isEmpty(armorSkillResults);
        const hasBonusImprovements = !isEmpty(bonusImprovements);
        const hasArmorSlots = !isEmpty(freeSlots.armor);
        const hasWeaponSlots = !isEmpty(freeSlots.weapon);
        const hasMoreSlots = hasArmorSlots || hasWeaponSlots;
        const displayStr = hasAddableSkills || hasBonusImprovements || hasMoreSlots ?
            `Available improvements ${time}:` :
            `No extras found in the current results ${time}.`;
        const renderMoreSkillBubble = ([skillName, skillInfo], descriptionLine, gradientColor) => {
            const maxLevel = skillInfo.level;
            const displayLevel = skillInfo.addedLevel || maxLevel;

            const skill = SKILLS_DB[skillName] ||
                SET_SKILLS_DB[skillName] ||
                GROUP_SKILLS_DB[skillName];
            let skillIcon = skill?.icon;
            const isASetSkill = skill ? isSetSkill(skill) : Boolean(SET_SKILLS[skillName]);
            const isAGroupSkill = skill ? isGroupSkill(skill) : Boolean(GROUP_SKILLS[skillName]);
            if (!skillIcon) {
                skillIcon = isASetSkill ? 'set' : 'group';
            }

            let displayName = skillName;
            if (skill?.skill && fields.showGroupSkillNames && (isAGroupSkill || isASetSkill)) {
                displayName = skill.skill;
            }

            const description = [
                getSkillPopup(skill),
                descriptionLine
            ].join('\n\n');
            const nameDiv = <div className={`skills-search-bubble-text`} style={{ marginRight: '4px' }}>
                {displayName}
            </div>;
            const iconImg = skillIcon ?
                <img className="skills-search-bubble-icon" src={`images/icons/${skillIcon}.png`} alt={skillIcon} /> :
                null;

            const bubbleDiv = <div className="skill-level-edit">
                {nameDiv}
                {<div style={{ fontSize: '16px', marginLeft: '-3px', fontWeight: 'bold' }}>{displayLevel}</div>}
            </div>;

            const gradientStyle = generateStyle(gradientColor);
            return <div className={`skills-search-bubble more skill-gradient`}
                onClick={() => {
                    recommendationSeedResultsRef.current = skillInfo.seedResults?.length ?
                        skillInfo.seedResults :
                        results.flatMap(result => [result].concat(result.recommendationSeedResults || []));
                    addSkill(skillName, maxLevel);
                }}
                style={{
                    ...gradientStyle,
                    alignSelf: 'flex-start',
                    minHeight: 'unset',
                    height: 'auto',
                    padding: '4px 8px'
                }} key={skillName}
                title={description}>
                {iconImg}
                {bubbleDiv}
            </div>;
        };

        return <div className="more-results">
            <div style={{ marginTop: '1em', marginBottom: '0.5em' }}>{displayStr}</div>
            {hasMoreSlots && <div style={{ marginBottom: '0.65em' }}>
                <div style={{ color: '#d2c4b8', fontWeight: 700, marginBottom: '0.25em' }}>Free slots:</div>
                {freeSlotsByType.totalWeaponSlots > 0 && <div style={{ color: '#d2c4b8', marginBottom: '0.4em' }}>
                    Weapon slots, including charm weapon slots: {freeWeaponSlotCount}/{freeSlotsByType.totalWeaponSlots} free.
                </div>}
                {hasArmorSlots && !hasWeaponSlots && <div style={{ color: '#d2c4b8', marginBottom: '0.4em' }}>
                    Only armor slots are open here. Attack Boost is a weapon jewel, so it needs open weapon slots.
                </div>}
                {!hasWeaponSlots && !isEmpty(usedWeaponDecos) && <div style={{ color: '#d2c4b8', marginBottom: '0.4em' }}>
                    Weapon slots are already used by:{' '}
                    {alphabeticalEntries(usedWeaponDecos).map(([decoName, amount], index, arr) => {
                        const suffix = index < arr.length - 1 ? ', ' : '';
                        return <span key={decoName} title={decoName}>
                            {formatDecoSkills(decoName)} x{amount}{suffix}
                        </span>;
                    })}
                </div>}
                <div className="more-skills" style={{ alignItems: 'flex-start' }}>
                    {Object.entries(freeSlots.weapon).map(([slotSize, amount]) =>
                        renderSlotOptionGroup('weapon', slotSize, amount)
                    )}
                    {Object.entries(freeSlots.armor).map(([slotSize, amount]) =>
                        renderSlotOptionGroup('armor', slotSize, amount)
                    )}
                </div>
            </div>}
            {hasAddableSkills && <div>
                <div style={{ color: '#d2c4b8', fontWeight: 700, marginBottom: '0.25em' }}>
                    Skills that can be added:
                </div>
                {!isEmpty(weaponSkillResults) && <div style={{ marginBottom: '0.45em' }}>
                    <div style={{ color: '#9ee8f0', fontWeight: 700, marginBottom: '0.2em' }}>Weapon-slot skills:</div>
                    <div className="more-skills" style={{ alignItems: 'flex-start' }}>
                        {alphabeticalEntries(weaponSkillResults).map(sk =>
                            renderMoreSkillBubble(
                                sk,
                                `A compatible weapon decoration can fit in an open slot. Click to add it to the search.`,
                                "#9ed9df"
                            )
                        )}
                    </div>
                </div>}
                {!isEmpty(armorSkillResults) && <div>
                    <div style={{ color: '#d2c4b8', fontWeight: 700, marginBottom: '0.2em' }}>Armor-slot skills:</div>
                    <div className="more-skills" style={{ alignItems: 'flex-start' }}>
                        {alphabeticalEntries(armorSkillResults).map(sk =>
                            renderMoreSkillBubble(
                                sk,
                                `A compatible armor decoration can fit in an open slot. Click to add it to the search.`,
                                "#b4dff1"
                            )
                        )}
                    </div>
                </div>}
            </div>}
            {isExploringBonuses && <div style={{ color: '#9ee8f0', marginTop: '0.8em' }}>
                Exploring skill and bonus recommendations
                {improvementProgress.total > 0 ?
                    ` — ${[
                        `${improvementProgress.completed}/${improvementProgress.total}`,
                        `${improvementProgress.found} found`,
                        improvementProgress.initial ?
                            `${improvementProgress.feasible}/${improvementProgress.initial} viable` : null,
                        improvementProgress.timedOut ?
                            `${improvementProgress.timedOut} timed out` : null
                    ].filter(Boolean).join(' · ')}` :
                    '…'}
            </div>}
            {!isExploringBonuses && improvementProgress.status === 'partial' &&
                <div style={{ color: '#f0c49e', marginTop: '0.8em' }}>
                    Partial exploration: {improvementProgress.timedOut} directed checks timed out.
                    Displayed recommendations are verified; unresolved checks already received an automatic retry.
                </div>}
            {!isExploringBonuses && improvementProgress.status === 'cancelled' &&
                <div style={{ color: '#f0c49e', marginTop: '0.8em' }}>
                    Exploration cancelled. Recommendations found before cancellation were preserved.
                </div>}
            {hasBonusImprovements && <div style={{ marginTop: '1em' }}>
                <div style={{ color: '#f0c49e', fontWeight: 700, marginBottom: '0.4em' }}>
                    Bonus improvements{improvementProgress.status === 'complete' ? ' — complete' : ''}:
                </div>
                <div style={{ color: '#d2c4b8', marginBottom: '0.45em' }}>
                    Orange recommendations are Set Bonuses; blue recommendations are Group Skills.
                    Click one to add it to the search.
                </div>
                <div className="more-skills" style={{ alignItems: 'flex-start' }}>
                    {alphabeticalEntries(bonusImprovements).map(sk => renderMoreSkillBubble(
                        sk,
                        `A valid build exists with this bonus. Click to add it to the search.`,
                        SET_SKILLS[sk[0]] ? '#f0c49e' : '#9ee8f0'
                    ))}
                </div>
            </div>}
        </div>;
    };

return (
        <div className="search">
            {renderChosenSkills()}
            <SkillsPicker addSkill={addSkill} addSlotFilter={addSlotFilter}
                showGroupSkillNames={fields.showGroupSkillNames}
                chosenSkillNames={Object.keys(fields.skills)} />
            {renderConditionsPanel()}
            <div className="button-holder" style={{ alignItems: 'flex-end' }}>
                <WeaponSearchControls fields={fields} updateField={updateField} />
                <Button variant="contained" disabled={isGenerating} onClick={getResults}>Search</Button>
                <Button variant="text" size="small" onClick={reloadLatestVersion}>
                    Refresh App
                </Button>
                {isExploringBonuses && <Button variant="outlined" color="error"
                    onClick={stopBonusExploration}>Cancel Skill Search</Button>}
                {isGenerating && <Button sx={{ cursor: 'pointer' }} variant="outlined" color="error" onClick={() => {
                    cancelledRef.current = true;
                    cancelSearchWorker();
                    if (results.length > 0) {
                        setOptimizerProfile(current => Object.assign({}, current || { engine: 'mitm' }, {
                            partial: false,
                            cancelled: true
                        }));
                    }
                }}>Cancel</Button>}
            </div>
            <SearchProgress
                bonusProgress={bonusProgress}
                isExploringBonuses={isExploringBonuses}
                isGenerating={isGenerating}
                loadProgress={loadProgress}
            />
            <Results results={results} elapsedSeconds={elapsedSeconds} optimizerProfile={optimizerProfile} />
            <SearchOutcome
                isExploringBonuses={isExploringBonuses}
                onExploreRecommendations={findImprovements}
                onReload={reloadLatestVersion}
                resultsPresent={results.length > 0}
                searchError={searchError}
                showMore={showMore}
            />
            {showMore && renderMoreResults()}
        </div>
    );
};

export default Search;
