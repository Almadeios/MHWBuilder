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
import LinearProgress from '@mui/material/LinearProgress';
import ArrowRight from '@mui/icons-material/ArrowForwardIos';
import ArrowLeft from '@mui/icons-material/ArrowBackIos';
import Delete from '@mui/icons-material/DeleteForever';
import styled from "styled-components";
import { getInclusiveRemainingSlots, getSearchParameters, isEmpty } from "../util/tools";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button,
    Checkbox,
    FormControlLabel,
    MenuItem,
    TextField
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Results from "./Results";
import { DEBUG } from "../util/constants";
import { useStorage } from "../hooks/StorageContext";
import { ELEMENT_SKILL_TABLES, filterConditionsForSkills, getConditionOptionsForSkills } from "../util/damageScoring";

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

const LoadingBar = styled(LinearProgress)`
    margin-top: 1em;
`;

const WEAPON_SLOT_OPTIONS = [];
const SHARPNESS_OPTIONS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'White', 'Purple'];
const WEAPON_TYPE_OPTIONS = [
    { value: 'other', label: 'Other' },
  { value: 'great_sword_hunting_horn', label: 'GS / HH' },
  { value: 'hammer_gunlance_switch_axe_charge_blade', label: 'Hammer / GL / SA / CB' },
    { value: 'dual_blades', label: 'Dual Blades' },
    { value: 'ranged', label: 'Ranged' }
];
const ELEMENT_OPTIONS = ['None', 'Fire', 'Water', 'Thunder', 'Ice', 'Dragon', 'Poison', 'Sleep', 'Paralysis', 'Blast'];
const OPTIMIZATION_GOALS = [
    { value: 'highest_dps', label: 'Highest DPS' },
    { value: 'highest_raw', label: 'Highest Raw' },
    { value: 'highest_element', label: 'Highest Element' },
    { value: 'highest_affinity', label: 'Highest Affinity' },
    { value: 'balanced', label: 'Balanced' }
];
for (let a = 0; a <= 3; a++) {
    for (let b = 0; b <= a; b++) {
        for (let c = 0; c <= b; c++) {
            WEAPON_SLOT_OPTIONS.push([a, b, c]);
        }
    }
}

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
    const bonusWorkerRef = useRef(null);
    const searchWorkerRef = useRef(null);
    const bonusStartedAtRef = useRef(0);
    const [isExploringBonuses, setIsExploringBonuses] = useState(false);
    const [bonusProgress, setBonusProgress] = useState(0);
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

    useEffect(() => () => {
        bonusWorkerRef.current?.terminate();
        searchWorkerRef.current?.terminate();
    }, []);

    const prepareSearch = ({ resetElapsed = true } = {}) => {
        bonusWorkerRef.current?.terminate();
        bonusWorkerRef.current = null;
        setIsExploringBonuses(false);
        setBonusProgress(0);
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
        searchWorkerRef.current?.terminate();
        const worker = new Worker(new URL('../workers/search.worker.js', import.meta.url));
        searchWorkerRef.current = worker;
        const workerParams = { ...params };
        delete workerParams.cancelToken;

        worker.onmessage = eventData => {
            if (eventData.data.type === 'error') {
                console.error("Search worker failed:", eventData.data.message, eventData.data.stack);
                setSearchError(eventData.data.message || 'Search worker failed.');
                setElapsedSeconds(0);
                setIsGenerating(false);
                searchWorkerRef.current = null;
                worker.terminate();
                return;
            }
            if (eventData.data.type !== 'done') { return; }
            const ret = eventData.data.response;
            setElapsedSeconds(ret.seconds);
            setResults(ret.results);
            setOptimizerProfile(ret.profile || null);
            setIsGenerating(false);
            searchWorkerRef.current = null;
            worker.terminate();
        };
        worker.onerror = error => {
            console.error("Search worker failed:", error);
            setSearchError(error?.message || 'Search worker failed to start.');
            setElapsedSeconds(0);
            setIsGenerating(false);
            searchWorkerRef.current = null;
            worker.terminate();
        };
        worker.postMessage({ params: workerParams, useCached: same });
    };

    const isOffElementSkill = skillName => {
        const elementSkill = ELEMENT_SKILL_TABLES[skillName];
        const selectedElement = fields.weaponElementType || 'None';
        return elementSkill && (selectedElement === 'None' || elementSkill.elementType !== selectedElement);
    };

    const canUseDecoForCurrentElement = decoSkills => {
        return !Object.keys(decoSkills || {}).some(isOffElementSkill);
    };

    const addSocketableSkill = (nextMoreResults, skillName, level, slotType, searchedLevel = 0) => {
        const current = nextMoreResults[skillName] || { level: 0, addedLevel: 0, slotTypes: [] };
        const nextLevel = Math.max(current.level || 0, level);
        nextMoreResults[skillName] = {
            level: nextLevel,
            addedLevel: Math.max(current.addedLevel || 0, Math.max(0, nextLevel - searchedLevel)),
            slotTypes: current.slotTypes.includes(slotType) ?
                current.slotTypes :
                [...current.slotTypes, slotType]
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
                addSocketableSkill(nextMoreResults, skillName, level, 'armor', searchedLevel);
            }
            if (weaponPoints > 0) {
                addSocketableSkill(nextMoreResults, skillName, level, 'weapon', searchedLevel);
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
                addSocketableSkill(nextMoreResults, skillName, combinedLevel, 'weapon', searchedSkills[skillName] || 0);
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
            mergeSocketableSkills(nextMoreResults, resultMoreResults);
        });

        setMoreResults({ ...nextMoreResults });
        setMoreSlots(nextMoreSlots);
        setMoreElapsedSeconds((performance.now() - started) / 1000);
        setShowMore(true);
    };

    const stopBonusExploration = () => {
        bonusWorkerRef.current?.terminate();
        bonusWorkerRef.current = null;
        setIsExploringBonuses(false);
        setBonusProgress(0);
    };

    const exploreBonusPaths = () => {
        if (!results.length || isExploringBonuses) { return; }

        const searchedSkills = getNormalSkillTargets(fields.skills);
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
            decoMods: fields.decoInventory
        });
        const worker = new Worker(new URL('../workers/bonusExplorer.worker.js', import.meta.url));
        bonusWorkerRef.current = worker;
        bonusStartedAtRef.current = performance.now();
        setIsExploringBonuses(true);
        setBonusProgress(0);

        worker.onmessage = event => {
            const message = event.data;
            if (message.type === 'result') {
                setBonusRoutes(current => [...current, message.candidate]);
                setShowMore(true);
            } else if (message.type === 'progress') {
                setBonusProgress(message.total ? message.completed / message.total * 100 : 100);
            } else if (message.type === 'done') {
                setMoreElapsedSeconds((performance.now() - bonusStartedAtRef.current) / 1000);
                stopBonusExploration();
            } else if (message.type === 'candidate-error' && DEBUG) {
                console.warn(`Bonus exploration failed for ${message.skillName}: ${message.message}`);
            }
        };
        worker.onerror = error => {
            console.error('Bonus exploration worker failed:', error);
            stopBonusExploration();
        };
        worker.postMessage(params);
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

    const updateWeaponSlots = value => {
        const slots = value.split("-").map(Number).filter(Boolean).sort((a, b) => b - a);
        updateField('weaponSlots', slots);
    };

    const updateWeaponNumber = (field, value) => {
        const parsed = Number(value);
        updateField(field, Number.isFinite(parsed) ? parsed : 0);
    };

    const updateSetSkillBonus = value => {
        updateField('setSkillBonus', value);
    };

    const updateGroupSkillBonus = value => {
        updateField('groupSkillBonus', value);
    };

    const toggleCondition = conditionId => {
        const nextConditions = { ...fields.conditions };
        const currentValue = conditionId === 'wound' ?
            Boolean(nextConditions.wound || nextConditions.weak_point_and_wound) :
            Boolean(nextConditions[conditionId]);
        nextConditions[conditionId] = !currentValue;
        if (conditionId === 'wound') {
            delete nextConditions.weak_point_and_wound;
        }
        updateField('conditions', nextConditions);
    };

    const isConditionChecked = conditionId => {
        if (conditionId === 'wound') {
            return Boolean(fields.conditions?.wound || fields.conditions?.weak_point_and_wound);
        }

        return Boolean(fields.conditions?.[conditionId]);
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
                {conditionOptions.map(condition =>
                    <FormControlLabel
                        key={condition.id}
                        control={<Checkbox
                            checked={isConditionChecked(condition.id)}
                            onChange={() => toggleCondition(condition.id)}
                        />}
                        label={condition.displayLabel}
                    />
                )}
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

    const renderWeaponSlots = () => {
        const value = [0, 0, 0];
        (fields.weaponSlots || []).forEach((slot, index) => {
            value[index] = slot;
        });
        const slotValue = value.join("-");

        return <TextField
            select
            size="small"
            label="Weapon Slots"
            value={slotValue}
            onChange={ev => updateWeaponSlots(ev.target.value)}
            sx={{ minWidth: '130px' }}
            title="Weapon decoration slots available on your weapon">
            {WEAPON_SLOT_OPTIONS.map(option => {
                const optionValue = option.join("-");
                return <MenuItem key={optionValue} value={optionValue}>{optionValue}</MenuItem>;
            })}
        </TextField>;
    };

    const renderWeaponInputs = () => {
        return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
            <TextField
                select
                size="small"
                label="Goal"
                value={fields.optimizationGoal || 'highest_dps'}
                onChange={ev => updateField('optimizationGoal', ev.target.value)}
                sx={{ minWidth: '150px' }}
                title="How to rank the resulting builds"
            >
                {OPTIMIZATION_GOALS.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <TextField
                select
                size="small"
                label="Weapon Type"
                value={fields.weaponType || 'other'}
                onChange={ev => updateField('weaponType', ev.target.value)}
                sx={{ minWidth: '125px' }}
                title="Used for Burst raw and element values"
            >
                {WEAPON_TYPE_OPTIONS.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <TextField
                size="small"
                label="Base Raw"
                type="number"
                value={fields.weaponBaseRaw ?? 0}
                onChange={ev => updateWeaponNumber('weaponBaseRaw', ev.target.value)}
                sx={{ minWidth: '110px' }}
                title="Weapon base attack"
            />
            <TextField
                size="small"
                label="Base Affinity"
                type="number"
                value={fields.weaponBaseAffinity ?? 0}
                onChange={ev => updateWeaponNumber('weaponBaseAffinity', ev.target.value)}
                sx={{ minWidth: '125px' }}
                title="Weapon base affinity"
            />
            <TextField
                select
                size="small"
                label="Element"
                value={fields.weaponElementType || 'None'}
                onChange={ev => updateField('weaponElementType', ev.target.value)}
                sx={{ minWidth: '110px' }}
                title="Weapon element type"
            >
                {ELEMENT_OPTIONS.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
            </TextField>
            <TextField
                size="small"
                label="Element Value"
                type="number"
                value={fields.weaponElementValue ?? 0}
                onChange={ev => updateWeaponNumber('weaponElementValue', ev.target.value)}
                sx={{ minWidth: '120px' }}
                title="Weapon element damage"
            />
            <TextField
                select
                size="small"
                label="Sharpness"
                value={fields.weaponSharpness || 'White'}
                onChange={ev => updateField('weaponSharpness', ev.target.value)}
                sx={{ minWidth: '110px' }}
                title="Current sharpness color"
            >
                {SHARPNESS_OPTIONS.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
            </TextField>
        </div>;
    };

    const renderSkillBonusSelect = (label, value, update, options) => {
        return <TextField
            select
            size="small"
            label={label}
            value={value || ''}
            onChange={ev => update(ev.target.value)}
            sx={{ minWidth: '190px' }}
            title={`Adds 1 point toward the selected ${label.toLowerCase()} requirement`}>
            <MenuItem value="">None</MenuItem>
            {Object.keys(options).sort().map(name => {
                return <MenuItem key={name} value={name}>{name}</MenuItem>;
            })}
        </TextField>;
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
                slotTypes: [candidate.sourceType]
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
                onClick={() => addSkill(skillName, maxLevel)}
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
                    {Object.entries(usedWeaponDecos).map(([decoName, amount], index, arr) => {
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
                        {Object.entries(weaponSkillResults).map(sk =>
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
                        {Object.entries(armorSkillResults).map(sk =>
                            renderMoreSkillBubble(
                                sk,
                                `A compatible armor decoration can fit in an open slot. Click to add it to the search.`,
                                "#b4dff1"
                            )
                        )}
                    </div>
                </div>}
            </div>}
            {(isExploringBonuses || hasBonusImprovements) && <div style={{ marginTop: '1em' }}>
                <div style={{ color: '#f0c49e', fontWeight: 700, marginBottom: '0.4em' }}>
                    Bonus improvements
                    {isExploringBonuses ? ` — exploring ${Math.round(bonusProgress)}%` : ''}:
                </div>
                <div style={{ color: '#d2c4b8', marginBottom: '0.45em' }}>
                    Orange recommendations are Set Bonuses; blue recommendations are Group Skills.
                    Click one to add it to the search.
                </div>
                <div className="more-skills" style={{ alignItems: 'flex-start' }}>
                    {Object.entries(bonusImprovements).map(sk => renderMoreSkillBubble(
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
                {renderWeaponSlots()}
                {renderWeaponInputs()}
                {renderSkillBonusSelect(
                    'Group Skill +1', fields.groupSkillBonus, updateGroupSkillBonus, GROUP_SKILLS
                )}
                {renderSkillBonusSelect(
                    'Set Bonus +1', fields.setSkillBonus, updateSetSkillBonus, SET_SKILLS
                )}
                <Button variant="contained" disabled={isGenerating} onClick={getResults}>Search</Button>
                <Button variant="text" size="small" onClick={reloadLatestVersion}>
                    Refresh App
                </Button>
                {isExploringBonuses && <Button variant="outlined" color="error"
                    onClick={stopBonusExploration}>Cancel Bonus Search</Button>}
                {isGenerating && <Button sx={{ cursor: 'pointer' }} variant="outlined" color="error" onClick={() => {
                    cancelledRef.current = true;
                    searchWorkerRef.current?.terminate();
                    searchWorkerRef.current = null;
                    setIsGenerating(false);
                }}>Cancel</Button>}
            </div>
            {isGenerating && <LoadingBar className="loading-bar" value={loadProgress}
                variant={loadProgress ? 'determinate' : 'indeterminate'} />}
            {isExploringBonuses && <LoadingBar className="loading-bar" value={bonusProgress}
                variant={bonusProgress ? 'determinate' : 'indeterminate'} />}
            <Results results={results} elapsedSeconds={elapsedSeconds} optimizerProfile={optimizerProfile} />
            {results.length > 0 && !showMore && !isExploringBonuses && <div
                className="bonus-recommendation-prompt"
            >
                <div>
                    <strong>Want bonus recommendations?</strong>
                    <div>
                        Check which extra skills, Set Bonuses, Group Skills, and free slots are compatible
                        with these results. You do not need to select a bonus first.
                    </div>
                </div>
                <Button variant="contained" size="small" onClick={findImprovements}>
                    Explore Recommendations
                </Button>
            </div>}
            {searchError && <div className="warn" style={{ marginTop: '0.75em' }}>
                <div>Search failed: {searchError}</div>
                <div style={{ marginTop: '0.5em' }}>
                    If the app was recently updated, your browser may still be using an older version.
                </div>
                <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    onClick={reloadLatestVersion}
                    sx={{ marginTop: '0.5em' }}
                >
                    Load latest version
                </Button>
            </div>}
            {showMore && renderMoreResults()}
        </div>
    );
};

export default Search;
