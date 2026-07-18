import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { generateTalismans } from '../util/talismanGenerator';
import {
    armorNameFormat, armorSetToCalculatorJSON, copyTextToClipboard, formatSkillsDiff,
    generateWikiString, getArmorDefenseFromName, getArmorDefenseFromNames,
    getArmorFromNames, getDecosFromNames,
    getSetUrl,
    getSkillDiff, getSkillPopup, isGroupSkillName,
    isSetSkillName
} from '../util/util';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import SKILLS from '../data/detailed/skills.json';
import SET_SKILLS_COMPACT from '../data/compact/set-skills.json';
import { isEmpty } from '../util/tools';
import Pin from '@mui/icons-material/PushPin';
import Unpin from '@mui/icons-material/PushPinOutlined';
import Exclude from '@mui/icons-material/Block';
import Undo from '@mui/icons-material/Undo';
import ArmorSvgWrapper from './ArmorSvgWrapper';
import { useStorage } from '../hooks/StorageContext';
import { useWindowWidth } from '../hooks/useWindowWidth';
import {
    filterConditionsForSkills, getConditionOptionsForSkills, recalculateResultDamage
} from '../util/damageScoring';
import DamageConditions from './DamageConditions';
import OptimizerProfile from './OptimizerProfile';
import ResultTable from './ResultTable';
import SelectedBuildPanel from './SelectedBuildPanel';
export const iconCommon = `
    width: 24px;
    height: 24px;
    transform: translateY(-2px);
    cursor: pointer;

    &:hover {
        background-color: lightgray;
        border-radius: 20px;
    }
`;

const PinIcon = styled(Pin)`
    ${iconCommon}
    color: #4747c5;
`;
const UnpinIcon = styled(Unpin)`
    ${iconCommon}
    color: blue;
`;
const ExcludeIcon = styled(Exclude)`
    ${iconCommon}
    color: crimson;
    margin-left: 4px;
    margin-right: 4px;
`;
const UndoExcludeIcon = styled(Undo)`
    ${iconCommon}
    color: forestgreen;
    margin-left: 4px;
    margin-right: 4px;
`;
const Results = ({
    elapsedSeconds, optimizerProfile, onSaveSet, results, save
}) => {
    const { fields, updateField, pinArmor, excludeArmor, saveArmorSet, setId, setSetId } = useStorage();
    const [selectedResult, setSelectedResult] = useState();
    const [rIndex, setRIndex] = useState(0);
    const [rArr, setRArr] = useState([]);
    const width = useWindowWidth();
    const isMobile = !fields.forceDesktop && width < 640;
    const liveResults = useMemo(() => results.map(result => recalculateResultDamage(
        result,
        save ? result.conditions || {} : fields.conditions || {}
    )), [fields.conditions, results, save]);

    useEffect(() => {
        if (!save) {
            setSelectedResult(undefined);
        } else if (setId) {
            const instantResult = results.filter(x => x.id === setId)[0];
            if (instantResult) {
                setSelectedResult(instantResult);
            }
            setSetId(undefined);
        }
    }, [results]);

    useEffect(() => {
        if (!selectedResult) { return; }
        const updatedResult = liveResults.find(result => result.id === selectedResult.id);
        if (updatedResult) { setSelectedResult(updatedResult); }
    }, [liveResults]);

    useEffect(() => {
        if (!selectedResult) {
            setRArr([]);
            setRIndex(0);
        }
    }, [selectedResult]);

    const saveSet = () => {
        const tempSets = saveArmorSet({
            ...selectedResult,
            searchedSkills: fields.skills
        });
        if (tempSets) {
            updateField('savedSets', tempSets);

            // only close selected result window on set removal if on saved sets page
            if (save && !tempSets.filter(x => x.id === selectedResult.id)[0]) {
                setSelectedResult(undefined);
            }
        }

        if (onSaveSet) {
            onSaveSet();
        }
    };

    const updateSetName = name => {
        if (!selectedResult) { return; }
        const tempSavedSets = (
            fields.savedSets || []
        ).filter(x => x.id !== selectedResult.id);
        const tempSelectedResult = { ...selectedResult, name };
        tempSavedSets.push(tempSelectedResult);
        updateField('savedSets', tempSavedSets);
        setSelectedResult(tempSelectedResult);
    };

    const renderDefense = result => {
        const defense = getArmorDefenseFromNames(result.armorNames);

        return <div className="defense">
            {`${defense.upgraded} (${defense.base} base)`}
        </div>;
    };

    const renderSlots = result => {
        // const numFours = result.freeSlots.filter(x => x === 4);
        const numThrees = result.freeSlots.filter(x => x === 3).length;
        const numTwos = result.freeSlots.filter(x => x === 2).length;
        const numOnes = result.freeSlots.filter(x => x === 1).length;
        const zeroStyle = { opacity: 0.4, filter: 'blur(0.5px)' };

        return <div style={{ display: 'inline-flex', gap: '7px' }} key={result.id}>
            <div className="slot-holder">
                <img className="slot-img" style={!numThrees && zeroStyle || {}} src={`images/slot3.png`} />
                <div className="slot-num">{numThrees}</div>
            </div>
            <div className="slot-holder">
                <img className="slot-img" style={!numTwos && zeroStyle || {}} src={`images/slot2.png`} />
                <div className="slot-num">{numTwos}</div>
            </div>
            <div className="slot-holder">
                <img className="slot-img" style={!numOnes && zeroStyle || {}} src={`images/slot1.png`} />
                <div className="slot-num">{numOnes}</div>
            </div>
        </div>;
    };

    const updateSavedResultConditions = (result, conditions) => {
        const resultSkills = {
            ...result.skills || {},
            ...result.setSkills || {},
            ...result.groupSkills || {}
        };
        const filteredConditions = filterConditionsForSkills(conditions, resultSkills);
        const updatedSets = (fields.savedSets || []).map(savedSet =>
            savedSet.id === result.id ? { ...savedSet, conditions: filteredConditions } : savedSet
        );
        updateField('savedSets', updatedSets);
    };

    const getCompactTalismanName = name => {
        if (!name) { return ''; }
        if (name.startsWith('Golden Age Charm')) {
            return 'Golden Age Charm';
        }

        return armorNameFormat(name);
    };

    const getTalismanDataForResult = result => {
        const talismanName = result?.armorNames?.[5];
        if (!talismanName) { return null; }

        const talismanLookup = result.talismanData || {};
        const resolvedTalismanData = talismanLookup[talismanName] || talismanLookup[talismanName?.toLowerCase()];
        if (resolvedTalismanData) { return resolvedTalismanData; }

        const matchingCustomTalisman = (fields.customTalismans || []).find(talisman => talisman.name === talismanName);
        if (matchingCustomTalisman) {
            return {
                skills: matchingCustomTalisman.skills || {},
                slots: matchingCustomTalisman.slots || [],
                weaponSlots: matchingCustomTalisman.weaponSlots || []
            };
        }

        const desiredSkills = fields.skills || result.searchedSkills || {};
        if (Object.keys(desiredSkills).length) {
            return generateTalismans(desiredSkills)[talismanName] || null;
        }

        return null;
    };

    const renderCompactTalisman = result => {
        const talismanName = result?.armorNames?.[5];
        const talismanData = getTalismanDataForResult(result);
        const skills = result.talismanFlex?.requestedSkills || talismanData?.skills || talismanData?.[1] || {};
        const slots = talismanData?.slots || talismanData?.[3] || [];
        const weaponSlots = talismanData?.weaponSlots || talismanData?.[8] || [];
        const skillTextParts = Object.entries(skills)
            .map(([skillName, level]) => `${skillName} ${level}`);
        if (result.talismanFlex) { skillTextParts.push('Flex'); }
        const skillText = skillTextParts.join(' / ');
        const rarityPrefix = talismanName?.match(/^RARE\[\d+\]/)?.[0];
        const compactName = result.talismanFlex ?
            `${rarityPrefix ? `${rarityPrefix} ` : ''}Flexible Charm` :
            getCompactTalismanName(talismanName);

        return <div style={{ display: 'grid', gap: '3px', minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{compactName}</div>
            {skillText && <div style={{ color: '#b8d7ff', fontSize: '12px', whiteSpace: 'normal' }}>
                {skillText}
            </div>}
            {(slots.length > 0 || weaponSlots.length > 0) && renderArmorSlots(slots, weaponSlots)}
        </div>;
    };

    const cycleSelectedResult = amount => {
        if (!selectedResult) { return; }
        const next = rArr[rIndex + amount];
        if (!next) { return; }
        setRIndex(rIndex + amount);
        setSelectedResult(next);
    };

    const wikiSearch = () => {
        if (!selectedResult) { return; }
        const wiki = generateWikiString(
            selectedResult.skills, selectedResult.setSkills, selectedResult.groupSkills,
            fields.slotFilters
        );

        // god the wiki site is so shit without an adblock
        window.open(`https://mhwilds.wiki-db.com/sim/#skills=${wiki}&fee=1`, "_blank");
    };

    const renderDecos = (decos, label = null) => {
        if (decos.length === 0) {
            return label ? null : <Typography>No decorations required</Typography>;
        }

        return <div className="decos-selected">
            {label && <span style={{ color: '#d2c4b8', fontWeight: 700, alignSelf: 'center' }}>{label}</span>}
            {decos.map(deco => {
                const skillIcons = deco.skillNames.map(x => SKILLS[x].icon);
                const singleIcon = skillIcons[0]; // todo: change this should armor decos ever have more than 1 skill each

                return <div key={deco.key} className="deco" style={{ cursor: 'help' }}
                    title={deco.altText} onClick={() => updateField('showDecoSkillNames', !fields.showDecoSkillNames)}>
                    <img className="deco-img" src={`images/slot${deco.slotSize}.png`} />
                    <div>
                        <span className="deco-name">{deco.name}</span>
                        <span className="deco-amount">x{deco.amount}</span>
                    </div>
                    <img className="deco-icon" src={`images/icons/${singleIcon}.png`} />
                </div>;
            })}
        </div>;
    };

    const renderArmorSlots = (armorSlots = [], weaponSlots = []) => {
        const armorIcons = (armorSlots || []).map((size, index) => {
            return <img key={`armor-${index}`} className="armor-slot" src={`images/slot${size}.png`} alt={`armor slot ${size}`} />;
        });
        const weaponIcons = (weaponSlots || []).map((size, index) => {
            return <div key={`weapon-${index}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <img className="armor-slot" src={`images/slot${size}.png`} alt={`weapon slot ${size}`} />
            </div>;
        });

        return <div className="armor-slots" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            {weaponIcons.length > 0 && <span
                title="Talisman weapon decoration slots"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    marginLeft: armorIcons.length ? '5px' : 0,
                    padding: '1px 4px',
                    border: '1px solid rgba(128, 214, 224, 0.35)',
                    borderRadius: '4px',
                    background: 'rgba(74, 144, 156, 0.14)'
                }}>
                <span style={{
                    color: '#9ee8f0',
                    fontSize: '10px',
                    fontWeight: 700,
                    lineHeight: 1,
                    textTransform: 'uppercase'
                }}>
                    Weapon
                </span>
                {weaponIcons}
            </span>}
            {armorIcons}
        </div>;
    };

    const renderSkill = (skM, j, arr, searchedSkills, showLevelMods = false) => {
        const sk = skM.name ? skM : { name: skM[0], level: skM[1] };
        const comma = j < arr.length - 1;
        const want = searchedSkills?.[sk.name] || 0;
        const isWantedSkill = Boolean(want);
        let wantedCls = !isWantedSkill ? 'wanted' : '';
        if (searchedSkills === undefined) {
            wantedCls = '';
        }
        let levelModSpan = null;
        if (showLevelMods && isWantedSkill && want < sk.level) {
            levelModSpan = <span className="wanted left-space">{`(+${sk.level - want} over target)`}</span>;
        }
        const title = getSkillPopup(sk.name);
        const setTag = isGroupSkillName(sk.name) ? 'set-names set-color' : '';
        const groupTag = isSetSkillName(sk.name) ? 'set-names group-color' : '';
        const tag = setTag || groupTag || '';

        return <div key={sk.name} className={`result-skill ${tag}`} title={title}>
            <span className={`${wantedCls} sk-name`}>{`${sk.name} `}</span>
            <span className={`${wantedCls}`}>{`Lv. ${sk.level}`}{levelModSpan}</span>
            {comma && ', '}
        </div>;
    };

    const getActivatedSetSkillLevel = (skillName, points) => {
        const thresholds = SET_SKILLS_COMPACT[skillName]?.[2];
        if (!Array.isArray(thresholds)) {
            return points;
        }

        return thresholds.reduce((level, threshold) => points >= threshold ? level + 1 : level, 0);
    };

    const getMinimumSetPointsForLevel = (skillName, level) => {
        const thresholds = SET_SKILLS_COMPACT[skillName]?.[2];
        if (!Array.isArray(thresholds)) {
            return level;
        }

        return thresholds[Math.max(0, Math.min(level, thresholds.length) - 1)] || 0;
    };

    const renderSetSkill = ([skillName, points], j, arr) => {
        const level = getActivatedSetSkillLevel(skillName, points);
        if (!level) {
            return null;
        }

        const thresholds = SET_SKILLS_COMPACT[skillName]?.[2];
        const thresholdText = Array.isArray(thresholds) ?
            ` (${points}/${thresholds[thresholds.length - 1]} points)` :
            '';
        const comma = j < arr.length - 1;
        const title = getSkillPopup(skillName);
        const displayName = fields.showGroupSkillNames && SET_SKILLS_COMPACT[skillName] ?
            SET_SKILLS_COMPACT[skillName][0] :
            skillName;

        return <div key={skillName} className="result-skill set-names group-color" title={title}>
            <span className="sk-name">{`${displayName} `}</span>
            <span>{`Lv. ${level}${thresholdText}`}</span>
            {comma && ', '}
        </div>;
    };

    const formatContributionName = contribution => {
        return contribution.level ? `${contribution.skill} Lv. ${contribution.level}` : contribution.skill;
    };

    const formatConditionSuffix = contribution => {
        const conditionLabel = contribution.conditionLabel || contribution.condition;
        if (!conditionLabel || conditionLabel === contribution.skill) {
            return '';
        }

        return ` (${conditionLabel})`;
    };

    const formatRawContribution = contribution => {
        const name = formatContributionName(contribution);
        const condition = contribution.condition ? formatConditionSuffix(contribution) : '';
        if (contribution.active === false) {
            return `${name}${condition}: inactive`;
        }

        const flat = contribution.flat ? `+${contribution.flat}` : '';
        const percent = contribution.rawPercent ? `+${(contribution.rawPercent * 100).toFixed(0)}%` : '';
        const postPercent = contribution.postRawPercent ? `post +${(contribution.postRawPercent * 100).toFixed(0)}%` : '';
        return `${name}${condition}: ${[flat, percent, postPercent].filter(Boolean).join(', ')}`;
    };

    const formatAffinityContribution = contribution => {
        const condition = contribution.condition ? formatConditionSuffix(contribution) : '';
        return `${contribution.skill}${condition}: +${contribution.contribution}`;
    };

    const formatElementContribution = contribution => {
        const name = formatContributionName(contribution);
        const condition = contribution.condition ? formatConditionSuffix(contribution) : '';
        if (contribution.active === false) {
            return `${name}${condition}: inactive`;
        }

        const flat = contribution.flat ? `+${contribution.flat}` : '';
        const percent = contribution.elementPercent ? `+${(contribution.elementPercent * 100).toFixed(0)}%` : '';
        const timing = contribution.durationSeconds ?
            `${contribution.durationSeconds}s, cooldown ${contribution.cooldownSeconds}s` : '';
        return `${name}${condition}: ${[flat, percent, timing].filter(Boolean).join(', ')}`;
    };

    const compactList = (items, formatter, limit = 4) => {
        const formatted = items.map(formatter);
        if (formatted.length <= limit) {
            return formatted;
        }

        return [...formatted.slice(0, limit), `+${formatted.length - limit} more`];
    };

    const renderBreakdownLine = (label, value, details = null) => {
        return <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span style={{ color: '#d2c4b8', fontWeight: 700 }}>{label}:</span>
            <span>{value}</span>
            {details && <span style={{ color: '#9fb2a4' }}>{details}</span>}
        </div>;
    };

    const renderContributionLine = (label, items, formatter, limit = 4) => {
        if (!items?.length) {
            return null;
        }

        const fullText = items.map(formatter).join(' | ');
        return <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', alignItems: 'center' }} title={fullText}>
            <span style={{ color: '#d2c4b8', fontWeight: 700 }}>{label}:</span>
            {compactList(items, formatter, limit).map(text =>
                <span key={text} style={{
                    border: '1px solid rgba(140, 255, 158, 0.28)',
                    borderRadius: '4px',
                    padding: '1px 5px',
                    whiteSpace: 'nowrap'
                }}>
                    {text}
                </span>
            )}
        </div>;
    };

    const formatFixed = (value, digits = 1, fallback = 'N/A') => {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue.toFixed(digits) : fallback;
    };

    const renderDamageBreakdown = (breakdown, result, activeAffinityContributions, activeAffinityTotal) => {
        if (!breakdown?.raw || !breakdown?.element || !breakdown?.affinity || !result?.damageProfile) {
            return null;
        }

        const rawPercentMultiplier = 1 + (breakdown.raw.rawPercentBonus || 0);
        const postRawPercentMultiplier = 1 + (breakdown.raw.postRawPercentBonus || 0);
        const elementPercentMultipliers = breakdown.element.elementPercentMultipliers?.length ?
            breakdown.element.elementPercentMultipliers :
            [breakdown.element.elementPercentMultiplier || 1];
        const elementMultiplierFormula = elementPercentMultipliers
            .map(multiplier => formatFixed(multiplier, 2))
            .join(' x ');
        const rawFormula = `(${breakdown.raw.base ?? 'N/A'} x ${formatFixed(rawPercentMultiplier, 2)} + ` +
            `${breakdown.raw.flatRaw ?? 0}) x ${formatFixed(postRawPercentMultiplier, 2)} ` +
            `${breakdown.raw.postMultiplierRawFlat ? `+ ${breakdown.raw.postMultiplierRawFlat} ` : ''}= ` +
            `${formatFixed(breakdown.raw.attackStatus ?? breakdown.raw.effectiveRaw)}`;
        const rawFinal = `x sharp ${formatFixed(breakdown.raw.sharpnessMultiplier, 2)} x crit ` +
            `${formatFixed(breakdown.raw.critExpectation, 3)} = ${formatFixed(result.damageProfile.raw_dps)}`;
        const elementFormula = `(${breakdown.element.base ?? 'N/A'} x ${elementMultiplierFormula}) + ` +
            `${breakdown.element.flatElement ?? 0} = ` +
            `${formatFixed(breakdown.element.uncappedElement ?? breakdown.element.effectiveElement)}`;
        const elementCapDetails = breakdown.element.capApplied ?
            `capped from ${formatFixed(breakdown.element.uncappedElement)} at ` +
                `${formatFixed(breakdown.element.elementCap)}` :
            null;
        const elementFinal = `x sharp ${formatFixed(breakdown.element.sharpnessMultiplier, 2)} = ` +
            `${formatFixed(result.damageProfile.element_dps)}`;

        return <div className="set-skills" style={{ marginTop: '0.75em' }}>
            <span className="set-label">Damage:</span>
            <div className="set-names wanted" style={{
                display: 'grid',
                gap: '0.35em',
                marginTop: '0.25em',
                maxWidth: '1180px'
            }}>
                <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap', color: '#b8e7ff' }}>
                    <span>DPS {formatFixed(result.damageProfile.expected_dps)}</span>
                    <span>Raw {formatFixed(result.damageProfile.raw_dps)}</span>
                    <span>Element {formatFixed(result.damageProfile.element_dps)}</span>
                    {result.damageProfile.proc_dps > 0 &&
                        <span>Procs {formatFixed(result.damageProfile.proc_dps)}</span>}
                    <span>Affinity {breakdown.affinity.final ?? 'N/A'}%</span>
                </div>
                {renderBreakdownLine('Raw', rawFormula, rawFinal)}
                {renderContributionLine('Raw boosts', breakdown.raw.skillContributions, formatRawContribution, 5)}
                {renderBreakdownLine(
                    'Element',
                    elementFormula,
                    `${elementCapDetails ? `${elementCapDetails}; ` : ''}${elementFinal}`
                )}
                {renderContributionLine('Element boosts', breakdown.element.skillContributions, formatElementContribution, 4)}
                {breakdown.procs?.contributions?.map(proc => renderBreakdownLine(
                    proc.skill,
                    `${proc.fixedDamage} fixed + ${proc.fireDamage} fire per proc`,
                    `${Math.round(proc.activationRate * 100)}% activation = ${formatFixed(proc.expectedDamage)} expected`
                ))}
                {renderBreakdownLine(
                    'Affinity',
                    `${breakdown.affinity.base}% + ${activeAffinityTotal}% = ${breakdown.affinity.final}%`
                )}
                {renderContributionLine('Affinity boosts', activeAffinityContributions, formatAffinityContribution, 4)}
                {breakdown.unmodeledSkills?.length ?
                    renderBreakdownLine('Unmodeled', breakdown.unmodeledSkills.join(', ')) :
                    null}
            </div>
        </div>;
    };

    const renderArmor = (armorSet, result) => {
        const armorTypeMap = ["head", "chest", "arms", "waist", "legs", "talisman"];
        const searchedSkills = fields.skills || result.searchedSkills || {};

        return <div className="armor-holder">
            {armorSet.map((armor, i) => {
                const defense = getArmorDefenseFromName(armor.name);
                const type = armorTypeMap[i];
                const isBlacklisted = fields.blacklistedArmor.includes(armor.name);
                const isMandatory = fields.mandatoryArmor.includes(armor.name);
                // const isTypeBlacklisted = blacklistedArmorTypes.includes(armorTypeMap[i]);
                const pinFunc = () => pinArmor(armor.name, type);
                const disabled = armor.name.toLowerCase() === "none";
                const excludeFunc = () => excludeArmor(armor.name);
                const cls = disabled ? 'disabled' : '';

                return <div className="armor-piece" key={type}>
                    {isMandatory ? <UnpinIcon className={cls || 'pin-icon'} title="Un-pin" onClick={pinFunc} /> :
                        <PinIcon className={cls || 'pin-icon'} title="Pin" onClick={pinFunc} />}
                    {isBlacklisted ? <UndoExcludeIcon className={cls || 'blacklist-icon'} title="Undo Exclude"
                        onClick={excludeFunc} /> : <ExcludeIcon className={cls || 'blacklist-icon'}
                            title="Exclude" onClick={excludeFunc} />}
                    <ArmorSvgWrapper type={type} rarity={armor.rarity} />
                    <span className="armor-name">{armorNameFormat(armor.name)}</span>
                    {type !== "talisman" && !isMobile && <div className="def-holder">
                        <img className="armor-def-img" src={`images/defense-up.png`} />
                        <div className="def-value">{defense?.upgraded || 0}</div>
                    </div>}
                    {!isMobile && renderArmorSlots(armor.slots, armor.weaponSlots)}
                    {!isMobile && <span className="armor-skills">
                        {Object.entries(armor.skills).map((sk, j, arr) => renderSkill(sk, j, arr, searchedSkills))}
                    </span>}
                </div>;
            })}
        </div>;
    };

    const renderSelectedResult = () => {
        const hasSelectedResult = Boolean(selectedResult);
        const theName = (fields.savedSets || []).filter(x => x.id === selectedResult?.id)[0]?.name;
        const mySetName = theName || "Unnamed Set";
        let details = null;
        let summary = null;
        let all = null;
        let setEffects = null;
        let groupSkills = null;
        let extraSkillsDiv = null;
        let conditionControls = null;
        let freeSlots = null;
        let defenseTotal = null;
        if (selectedResult) {
            const requiredDecoNames = selectedResult.requiredDecoNames || selectedResult.decoNames || [];
            const autoDecoNames = selectedResult.autoDecoNames || [];
            const customDecoMap = Object.fromEntries((fields.customDecorations || [])
                .map(deco => [deco.name, [deco.type, deco.skills || {}, Number(deco.size || 1)]]));
            const requiredDecos = getDecosFromNames(
                requiredDecoNames, fields.showDecoSkillNames, customDecoMap
            );
            const autoDecos = getDecosFromNames(autoDecoNames, fields.showDecoSkillNames, customDecoMap);
            const armorNames = selectedResult.armorNames || [];
            const talismanName = armorNames[5];
            const talismanLookup = selectedResult.talismanData || {};
            let resolvedTalismanData = talismanLookup[talismanName] || talismanLookup[talismanName?.toLowerCase()];

            if (!resolvedTalismanData) {
                const matchingCustomTalisman = (fields.customTalismans || []).find(talisman => talisman.name === talismanName);
                if (matchingCustomTalisman) {
                    resolvedTalismanData = {
                        name: matchingCustomTalisman.name,
                        skills: matchingCustomTalisman.skills || {},
                        slots: matchingCustomTalisman.slots || [],
                        weaponSlots: matchingCustomTalisman.weaponSlots || []
                    };
                }
            }

            if (resolvedTalismanData && selectedResult.talismanFlex) {
                if (Array.isArray(resolvedTalismanData)) {
                    resolvedTalismanData = [...resolvedTalismanData];
                    resolvedTalismanData[1] = {
                        ...selectedResult.talismanFlex.requestedSkills,
                        Flex: 1
                    };
                } else {
                    resolvedTalismanData = {
                        ...resolvedTalismanData,
                        skills: {
                            ...selectedResult.talismanFlex.requestedSkills,
                            Flex: 1
                        }
                    };
                }
            }

            if (!resolvedTalismanData) {
                const desiredSkills = fields.skills || selectedResult.searchedSkills || {};
                if (Object.keys(desiredSkills).length) {
                    const generatedTalismans = generateTalismans(desiredSkills);
                    resolvedTalismanData = generatedTalismans[talismanName];
                }
            }

            const armor = getArmorFromNames(armorNames, {
                ...talismanLookup,
                ...resolvedTalismanData ? { [talismanName]: resolvedTalismanData } : {}
            });
            const defense = getArmorDefenseFromNames(armorNames);

            summary = autoDecos.length ?
                <>
                    {renderDecos(requiredDecos, 'Required:')}
                    {renderDecos(autoDecos, 'Auto-filled:')}
                </> :
                renderDecos(requiredDecos);
            details = renderArmor(armor, selectedResult);
            const extras = fields.skills || selectedResult.searchedSkills;
            const extraSkills = extras ? getSkillDiff(extras, {
                ...selectedResult.skills,
                ...selectedResult.setSkills,
                ...selectedResult.groupSkills
            }) : {};
            const setExist = !isEmpty(selectedResult.setSkills);
            const groupExist = !isEmpty(selectedResult.groupSkills);
            const extraExist = !isEmpty(extraSkills);
            // setSpacer = setExist || groupExist ? <div style={{ marginTop: '1em' }}></div> : setSpacer;

            defenseTotal = <div className="def-total-holder">
                <span className="set-label" style={{ transform: 'translateY(-2px)' }}>Defense:</span>
                <img className="armor-def-img" src={`images/defense-up.png`} />
                <div className="def-value">{defense.upgraded}</div>
                <div className="def-value base">({defense.base} base)</div>
            </div>;

            const breakdown = selectedResult?.damageProfile?.breakdown;
            const activeSetSkills = Object.entries(selectedResult.setSkills)
                .map(([skillName, level]) => {
                    const points = selectedResult.setSkillPoints?.[skillName] ??
                        getMinimumSetPointsForLevel(skillName, level);
                    return [skillName, points, level];
                })
                .filter(([, , level]) => level > 0);
            const activeAffinityContributions = (breakdown?.affinity?.contributions || [])
                .filter(contribution => contribution.active !== false && contribution.contribution);
            const activeAffinityTotal = activeAffinityContributions.reduce((total, contribution) => {
                return total + contribution.contribution;
            }, 0);
            const affinityBreakdown = renderDamageBreakdown(
                breakdown,
                selectedResult,
                activeAffinityContributions,
                activeAffinityTotal
            );
            const selectedSkills = {
                ...selectedResult.skills,
                ...selectedResult.setSkills,
                ...selectedResult.groupSkills
            };
            if (save && getConditionOptionsForSkills(selectedSkills).length) {
                conditionControls = <div className="set-skills" style={{ marginTop: '0.75em' }}>
                    <span className="set-label">Damage Conditions:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        <DamageConditions
                            skills={selectedSkills}
                            conditions={selectedResult.conditions || {}}
                            onChange={conditions =>
                                updateSavedResultConditions(selectedResult, conditions)
                            }
                        />
                    </div>
                </div>;
            }

            all = <div className="all-skills">
                {Object.entries(selectedResult.skills).map(x => {
                    return { name: x[0], level: x[1] };
                }).map((sk, j, arr) => renderSkill(sk, j, arr, fields.skills, true))}
            </div>;

            if (setExist && activeSetSkills.length) {
                setEffects = <div className="set-skills">
                    <span className="set-label">Set Skills:</span>
                    {activeSetSkills.map(([skillName, points], j, arr) => renderSetSkill([skillName, points], j, arr))}
                </div>;
            }
            if (affinityBreakdown) {
                setEffects = <>
                    {setEffects}
                    {affinityBreakdown}
                </>;
            }
            if (groupExist) {
                groupSkills = <div className="set-skills">
                    <span className="set-label">Group Skills:</span>
                    {Object.entries(selectedResult.groupSkills).map(x => {
                        return { name: x[0], level: x[1] };
                    }).map(renderSkill)}
                </div>;
            }
            if (extraExist) {
                const extraMagic = formatSkillsDiff(extraSkills, fields.showGroupSkillNames, '+');
                extraSkillsDiv = <div className="group-skills">
                    <span className="set-label"
                        title="Bonus skill levels you didn't search for">Extra Skills:</span>
                    <span className="set-names wanted">{extraMagic}</span>
                </div>;
            }

            freeSlots = renderSlots(selectedResult);
        }

        const savedVar = save ? results : fields.savedSets;

        const isSaved = selectedResult &&
            (savedVar || []).filter(x => x.id === selectedResult.id)[0];

        const queueUpSkills = useSearchedSkills => {
            if (!selectedResult) { return; }

            const mySkills = useSearchedSkills ? selectedResult.searchedSkills : {
                ...selectedResult.skills, ...selectedResult.setSkills, ...selectedResult.groupSkills
            };

            if (!isEmpty(mySkills)) {
                updateField('skills', mySkills);
                window.snackbar.createSnackbar(`Added skills to search tab`, {
                    timeout: 3000
                });
            }
        };

        const shareSet = () => {
            if (!selectedResult) { return; }

            const url = getSetUrl(selectedResult.armorNames, selectedResult.decoNames, selectedResult?.name);
            copyTextToClipboard(url, () => {
                window.snackbar.createSnackbar(`Copied armor set ${selectedResult?.name || ""} url to clipboard!`, {
                    timeout: 3000
                });
            });
        };

        const exportToCalculator = () => {
            if (!selectedResult) { return; }

            const data = armorSetToCalculatorJSON(selectedResult);
            copyTextToClipboard(JSON.stringify(data), () => {
                window.snackbar.createSnackbar(`Copied calculator export data to clipboard!`, {
                    timeout: 3000
                });
            });
        };

        return <SelectedBuildPanel
            allSkills={all}
            canGoNext={Boolean(rArr[rIndex + 1])}
            canGoPrevious={Boolean(rArr[rIndex - 1])}
            conditionControls={conditionControls}
            defenseTotal={defenseTotal}
            extraSkills={extraSkillsDiv}
            freeSlots={freeSlots}
            groupSkills={groupSkills}
            hasSelection={hasSelectedResult}
            isSaved={Boolean(isSaved)}
            name={mySetName}
            onClose={() => setSelectedResult(undefined)}
            onExport={exportToCalculator}
            onNext={() => cycleSelectedResult(1)}
            onPrevious={() => cycleSelectedResult(-1)}
            onQueueSkills={queueUpSkills}
            onRename={updateSetName}
            onSave={saveSet}
            onShare={shareSet}
            onWikiSearch={wikiSearch}
            resultCount={results.length}
            save={save}
            setEffects={setEffects}
            showAll={fields.showAll}
            showCalculatorExport={fields.showCalcExport}
            showExtra={fields.showExtra}
            summary={summary}
        >
            {details}
        </SelectedBuildPanel>;
    };
    elapsedSeconds = elapsedSeconds ?? -1;
    const skillsList = Object.entries(fields.skills || {}).map(([k, v]) => [`${k} Lv. ${v}`]);
    const activeSearchParts = [...skillsList];
    if ((fields.weaponSlots || []).length) {
        activeSearchParts.push(`Weapon Slots ${fields.weaponSlots.join("-")}`);
    }
    if (fields.groupSkillBonus) {
        activeSearchParts.push(`Group Skill +1 ${fields.groupSkillBonus}`);
    }
    if (fields.setSkillBonus) {
        activeSearchParts.push(`Set Bonus +1 ${fields.setSkillBonus}`);
    }

    const searchList = activeSearchParts.join(", ");
    const resultCountText = results.length.toLocaleString('en', { useGrouping: true });
    const timedOutWithoutResults = optimizerProfile?.timedOut && results.length === 0;
    const impossibleWithoutResults = optimizerProfile?.impossible && results.length === 0;
    let resultStatusText = `${resultCountText} hits in ${elapsedSeconds.toFixed(2)} seconds`;
    if (optimizerProfile?.partial) {
        resultStatusText = `${resultCountText} hits so far in ${elapsedSeconds.toFixed(2)} seconds`;
    }
    if (optimizerProfile?.cancelled) {
        resultStatusText = `search cancelled with ${resultCountText} partial hits`;
    }
    if (timedOutWithoutResults) {
        resultStatusText = `timed out before finding results in ${elapsedSeconds.toFixed(2)} seconds`;
    }
    if (impossibleWithoutResults) {
        resultStatusText = `combination is not possible (${elapsedSeconds.toFixed(2)} seconds)`;
    }
    const displayStr = `Results for ${searchList} (${resultStatusText}):`;
    const displayStrEmpty = `No skills specified. Showing best slotted armor combos (${resultStatusText}):`;
    const someArmorBlacklisted = fields.blacklistedArmor.length > 0;
    const someArmorMandatory = fields.mandatoryArmor.filter(x => x).length > 0;
    const someTypesBlacklisted = fields.blacklistedArmorTypes.length > 0;
    const shouldNotify = someArmorBlacklisted || someArmorMandatory || someTypesBlacklisted;

    return <div className="results">
        {renderSelectedResult()}
        {elapsedSeconds >= 0 && <div style={{ marginBottom: '0.5em' }}>
            {shouldNotify && <span className="warn">Some armor is pinned/blacklisted - </span>}
            {!isEmpty(fields.slotFilters) && <span className="notice">Deco filters active - </span>}
            {searchList ? displayStr : displayStrEmpty}
            <OptimizerProfile profile={optimizerProfile} />
            {optimizerProfile?.seed && <div className="notice">
                Search was guided by {optimizerProfile.seed} because it produced valid results faster.
                {' '}Add it from Extra Skills if you want to make that bonus an explicit requirement.
            </div>}
            {timedOutWithoutResults && <div className="warn">
                Search stopped before the optimizer could prove this build is impossible.
                {' '}Try reducing requirements or rerun after changing one filter.
            </div>}
            {impossibleWithoutResults && <div className="warn">
                Combination is not possible.
                {(optimizerProfile.impossibleReasons || []).map(reason => <div key={reason}>{reason}</div>)}
            </div>}
            {shouldNotify && results.length === 0 && <div className="warn">
                Current pinned or blacklisted armor can eliminate otherwise valid sets.
            </div>}
        </div>}
        <ResultTable
            isMobile={isMobile}
            onSelect={(result, index, visibleResults) => {
                if (!result) {
                    setSelectedResult(undefined);
                    return;
                }
                setRArr(visibleResults);
                setRIndex(index);
                setSelectedResult(result);
            }}
            optimizationGoal={fields.optimizationGoal}
            renderCompactTalisman={renderCompactTalisman}
            renderDefense={renderDefense}
            renderSlots={renderSlots}
            results={liveResults}
            save={save}
            savedSets={fields.savedSets || []}
            selectedResultId={selectedResult?.id}
        />
    </div>;
};

Results.propTypes = {
    results: PropTypes.array.isRequired,
    elapsedSeconds: PropTypes.number,
    optimizerProfile: PropTypes.object,
    onSaveSet: PropTypes.func,
    save: PropTypes.bool, // if true, on saved sets page
};
export default Results;
