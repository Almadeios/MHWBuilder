import { useState, useEffect, useRef } from "react";
import SkillsPicker from "../components/SkillsPicker";
import { searchAndSpeed } from "../util/logic";
import SKILLS from '../data/compact/skills.json';
import GROUP_SKILLS from '../data/compact/group-skills.json';
import SET_SKILLS from '../data/compact/set-skills.json';
import SKILLS_DB from '../data/detailed/skills.json';
import SET_SKILLS_DB from '../data/detailed/set-skills.json';
import GROUP_SKILLS_DB from '../data/detailed/group-skills.json';
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
import { filterConditionsForSkills, getConditionOptionsForSkills } from "../util/damageScoring";

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

    const [isGenerating, setIsGenerating] = useState(false);
    const [showConditions, setShowConditions] = useState(false);

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

    const prepareSearch = ({ resetElapsed = true } = {}) => {
        if (resetElapsed) {
            setElapsedSeconds(-1);
        }
        setMoreResults({});
        setMoreSlots({});
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
            cancelToken: cancelledRef
        });

        return params;
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
        // Find multiple results but cap at 20 valid builds
        params.limit = 20;
        params.findOne = false;
        // console.log('params', params);
        const cache = searchAndSpeed(params, same);
        cache.then(ret => {
            setElapsedSeconds(ret.seconds);
            setResults(ret.results);
            setIsGenerating(false);
        }).catch(err => {
            console.error("Error during searchAndSpeed:", err);
        });
    };

    const getMoreSkills = () => {
        const started = performance.now();
        const nextMoreResults = {};
        const nextMoreSlots = {};
        const searchedSkills = fields.skills || {};
        const slotFilters = fields.slotFilters || {};

        results.forEach(result => {
            const skills = result.skills || {};
            const setSkills = result.setSkills || {};
            const groupSkills = result.groupSkills || {};
            const resultSkills = {
                ...skills,
                ...setSkills,
                ...groupSkills
            };

            Object.entries(resultSkills).forEach(([skillName, level]) => {
                if (level > (searchedSkills[skillName] || 0)) {
                    nextMoreResults[skillName] = Math.max(nextMoreResults[skillName] || 0, level);
                }
            });

            const remainingSlots = getInclusiveRemainingSlots(result.freeSlots || [], slotFilters);
            if (remainingSlots) {
                [1, 2, 3].forEach(slotSize => {
                    nextMoreSlots[slotSize] = Math.max(nextMoreSlots[slotSize] || 0, remainingSlots[slotSize] || 0);
                });
            }
        });

        setMoreResults(nextMoreResults);
        setMoreSlots(nextMoreSlots);
        setMoreElapsedSeconds((performance.now() - started) / 1000);
        setShowMore(true);
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
        let skillIcon = skill.icon;
        const isASetSkill = isSetSkill(skill);
        const isAGroupSkill = isGroupSkill(skill);
        if (!skillIcon) {
            skillIcon = isASetSkill ? 'set' : 'group';
        }

        const maxLevel = getMaxLevel(skillName);
        let displayName = skillName;
        if (fields.showGroupSkillNames && (isAGroupSkill || isASetSkill)) {
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

    const renderMoreResults = () => {
        const time = moreElapsedSeconds > -1 ? `(${moreElapsedSeconds.toFixed(2)} seconds)` : '';

        const freeSlots = Object.fromEntries(
            Object.entries(moreSlots).filter(([, amount]) => amount > 0)
        );
        const hasMoreSkills = !isEmpty(moreResults);
        const hasMoreSlots = !isEmpty(freeSlots);
        const displayStr = hasMoreSkills || hasMoreSlots ?
            `Extras already present in the current results ${time}:` :
            `No extras found in the current results ${time}.`;

        return <div className="more-results">
            <div style={{ marginTop: '1em', marginBottom: '0.5em' }}>{displayStr}</div>
            <div className="more-skills">
                {!isEmpty(freeSlots) && <div className="chosen-slot-filters">
                    {Object.entries(freeSlots).map(x => {
                        const gradientStyle = generateStyle("#c5abc5");
                        const slotSize = x[0];
                        const amount = x[1];

                        return <div className={`skills-search-bubble slot-filter more slot-gradient`}
                            style={gradientStyle} key={slotSize} onClick={() => addSlotFilter(slotSize, amount)}
                            title={`Specify how many ${slotSize} slot decos you want to be able to fit into the free slots`}>
                            <img className="skills-search-bubble-icon" src={`images/slot${slotSize}.png`} alt={slotSize} />
                            <div className="skill-level-edit">
                                <div className={`skills-search-bubble-text`}>
                                    {`${slotSize} Slot Deco Filter`}
                                </div>
                                {<div style={{ fontSize: '16px', marginLeft: '0px', fontWeight: 'bold' }}>{amount}</div>}
                            </div>
                        </div>;
                    })}
                </div>}
                {Object.entries(moreResults).map(sk => {
                    const skillName = sk[0];
                    const maxLevel = sk[1];

                    const skill = SKILLS_DB[skillName] ||
                        SET_SKILLS_DB[skillName] ||
                        GROUP_SKILLS_DB[skillName];
                    let skillIcon = skill.icon;
                    const isASetSkill = isSetSkill(skill);
                    const isAGroupSkill = isGroupSkill(skill);
                    if (!skillIcon) {
                        skillIcon = isASetSkill ? 'set' : 'group';
                    }

                    let displayName = skillName;
                    if (fields.showGroupSkillNames && (isAGroupSkill || isASetSkill)) {
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
                        {<div style={{ fontSize: '16px', marginLeft: '-3px', fontWeight: 'bold' }}>{maxLevel}</div>}
                    </div>;

                    const gradientStyle = generateStyle("#b4dff1");
                    return <div className={`skills-search-bubble more skill-gradient`}
                        onClick={() => addSkill(skillName, maxLevel)}
                        style={gradientStyle} key={skillName}
                        title={description}>
                        {iconImg}
                        {bubbleDiv}
                    </div>;
                })}
            </div>
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
                <Button variant="outlined" disabled={isGenerating} onClick={() => getMoreSkills()}>Extra Skills</Button>
                {isGenerating && <Button sx={{ cursor: 'pointer' }} variant="outlined" color="error" onClick={() => {
                    cancelledRef.current = true;
                }}>Cancel</Button>}
            </div>
            {isGenerating && <LoadingBar className="loading-bar" value={loadProgress}
                variant={loadProgress ? 'determinate' : 'indeterminate'} />}
            <Results results={results} elapsedSeconds={elapsedSeconds} />
            {showMore && renderMoreResults()}
        </div>
    );
};

export default Search;
