import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { generateTalismans } from '../util/talismanGenerator';
import {
    armorNameFormat, armorSetToCalculatorJSON, copyTextToClipboard, formatSkillsDiff,
    generateWikiString, getArmorDefenseFromName, getArmorDefenseFromNames,
    getArmorFromNames, getDecosFromNames,
    getSetUrl,
    getSkillDiff, getSkillPopup, isGroupSkillName,
    isSetSkillName, paginate
} from '../util/util';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell, { tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import { styled } from '@mui/material/styles';
import TablePagination from '@mui/material/TablePagination';
import TablePaginationActions from './TablePaginationActions';
import Swap from '@mui/icons-material/Sync';
import { Button, IconButton, TextField } from '@mui/material';
import SKILLS from '../data/detailed/skills.json';
import SET_SKILLS_COMPACT from '../data/compact/set-skills.json';
import { isEmpty } from '../util/tools';
import Pin from '@mui/icons-material/PushPin';
import Unpin from '@mui/icons-material/PushPinOutlined';
import Exclude from '@mui/icons-material/Block';
import Undo from '@mui/icons-material/Undo';
import Edit from '@mui/icons-material/DriveFileRenameOutline';
import Close from '@mui/icons-material/DisabledByDefaultRounded';
import ArmorSvgWrapper from './ArmorSvgWrapper';
import { useStorage } from '../hooks/StorageContext';
import ArrowForward from '@mui/icons-material/ArrowForwardRounded';
import ArrowBack from '@mui/icons-material/ArrowBackRounded';
import { useWindowWidth } from '../hooks/useWindowWidth';

const StyledTableCell = styled(TableCell)(({ theme }) => ({
    [`&.${tableCellClasses.head}`]: {
        backgroundColor: theme.palette.common.black,
        color: theme.palette.common.white,
    },
    [`&.${tableCellClasses.body}`]: {
        fontSize: 14,
    },
    '@media (prefers-color-scheme: dark)': {
        [`&.${tableCellClasses.head}`]: {
            backgroundColor: '#141414',
            color: '#e8ebed',
        },
        [`&.${tableCellClasses.body}`]: {
            fontSize: 14,
            borderColor: '#1b1919',
            color: '#d5d6cd'
        }
    }
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
    '&:nth-of-type(odd)': {
        backgroundColor: theme.palette.action.hover,
    },
    // hide last border
    '&:last-child td, &:last-child th': {
        border: 0,
    },
    '&:hover': {
        backgroundColor: 'lightblue',
    },

    // Dark mode overrides
    '@media (prefers-color-scheme: dark)': {
        "backgroundColor": '#333',
        '&:nth-of-type(odd)': {
            backgroundColor: '#2c2b2b',
        },
        '&:hover': {
            backgroundColor: '#1a3943', // or whatever dark hover color you like
        }
    },
}));

const PaginationBox = styled(Box)`
  display: flex;
`;
const SwapIcon = styled(Swap)`
    width: 12px;
    color: white;
    cursor: pointer;
    vertical-align: middle;
    margin-left: 6px;
    transform: translateY(-2px) scale(1.2);
`;

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
const EditIcon = styled(Edit)`
    ${iconCommon}
    color: #ff8300;
`;
const CloseIcon = styled(Close)`
    ${iconCommon}
    color: crimson;
`;

const Results = ({
    elapsedSeconds, onSaveSet, results, save
}) => {
    const { fields, updateField, pinArmor, excludeArmor, saveArmorSet, setId, setSetId } = useStorage();
    const [selectedResult, setSelectedResult] = useState();
    const [page, setPage] = useState(-1);
    const [pageSize, setPageSize] = useState(100);
    const [customSlot, setCustomSlot] = useState("slots"); // or defense
    const [editingName, setEditingName] = useState(false);

    const [rIndex, setRIndex] = useState(0);
    const [rArr, setRArr] = useState([]);

    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);
    const [isMouseInside, setIsMouseInside] = useState(false);
    const width = useWindowWidth();
    const isMobile = !fields.forceDesktop && width < 640;

    useEffect(() => {
        const handleKeyDown = event => {
            if (event.ctrlKey) { setIsCtrlPressed(true); }
            if (event.shiftKey) { setIsShiftPressed(true); }
        };

        const handleKeyUp = event => {
            if (!event.ctrlKey) { setIsCtrlPressed(false); }
            if (!event.shiftKey) { setIsShiftPressed(false); }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    useEffect(() => {
        setRArr([]);
        setRIndex(0);
    }, [page]);

    useEffect(() => {
        setPage(0);
    }, [pageSize]);

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
        if (!selectedResult) {
            setEditingName(false);
            setRArr([]);
            setRIndex(0);
        }
    }, [selectedResult]);

    useEffect(() => {
        if (editingName) {
            document.getElementById("edit-name").focus();
        }
    }, [editingName]);

    const swapCustomSlot = () => {
        if (customSlot === "defense") {
            setCustomSlot("slots");
        } else {
            setCustomSlot("defense");
        }
    };

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

    const updateSetName = ev => {
        if (!selectedResult) { return; }
        const tempSavedSets = (
            fields.savedSets || []
        ).filter(x => x.id !== selectedResult.id);
        const name = ev.target.value;
        const tempSelectedResult = { ...selectedResult, name };
        selectedResult.name = name;
        tempSavedSets.push(tempSelectedResult);
        updateField('savedSets', tempSavedSets);
        setEditingName(false);
    };

    const handleEditKeyDown = event => {
        if (event.key === "Enter") {
            event.target.blur();
        }
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

    const renderResult = (result, resultIndex, resultArr) => {
        const highlighted = result.id === selectedResult?.id;
        const armorNames = result.armorNames;
        const savedMatch = fields.savedSets?.filter(x => x.id === result?.id)[0];
        const theName = savedMatch?.name || "Unnamed Set";
        const score = result?.damageProfile?.expected_dps ? result.damageProfile.expected_dps.toFixed(1) : '—';
        const rawValue = result?.damageProfile?.raw_dps?.toFixed(1) ?? '—';
        const elementValue = result?.damageProfile?.element_dps?.toFixed(1) ?? '—';
        const affinityValue = result?.damageProfile?.final_affinity?.toFixed(0) ?? '—';
        const goalLabel = fields.optimizationGoal === 'highest_raw' ? 'Raw' : fields.optimizationGoal === 'highest_element' ? 'Element' : fields.optimizationGoal === 'highest_affinity' ? 'Affinity' : fields.optimizationGoal === 'balanced' ? 'Balanced' : 'DPS';
        let cls = "";
        if (!save && savedMatch) { cls += 'striped'; }
        if (highlighted) { cls += ' row-shine'; }

        return <StyledTableRow key={result.id} className={cls}
            onClick={() => {
                if (selectedResult?.id === result.id) {
                    setSelectedResult(undefined);
                } else {
                    setRArr(resultArr);
                    setRIndex(resultIndex);
                    setSelectedResult(result);
                }
            }}
            sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
            {save && <StyledTableCell align="left">{theName}</StyledTableCell>}
            <StyledTableCell align="left">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {customSlot === "slots" && renderSlots(result)}
                    {customSlot === "defense" && renderDefense(result)}
                    <div style={{ fontSize: '12px', color: '#3b6ea8', fontWeight: 600 }}>
                        {goalLabel}: {score}
                    </div>
                    <div style={{ fontSize: '12px', color: '#4b5563' }}>
                        Raw {rawValue} • Element {elementValue} • Aff {affinityValue}%
                    </div>
                </div>
            </StyledTableCell>
            {isMobile && <StyledTableCell align="left" scope="row">{renderDefense(result)}</StyledTableCell>}
            {!isMobile && <StyledTableCell align="left" scope="row">{armorNameFormat(armorNames[0])}</StyledTableCell>}
            {!isMobile && <StyledTableCell align="left">{armorNameFormat(armorNames[1])}</StyledTableCell>}
            {!isMobile && <StyledTableCell align="left">{armorNameFormat(armorNames[2])}</StyledTableCell>}
            {!isMobile && <StyledTableCell align="left">{armorNameFormat(armorNames[3])}</StyledTableCell>}
            {!isMobile && <StyledTableCell align="left">{armorNameFormat(armorNames[4])}</StyledTableCell>}
            {!isMobile && <StyledTableCell align="left">{armorNameFormat(armorNames[5])}</StyledTableCell>}
        </StyledTableRow>;
    };

    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = event => {
        setPageSize(parseInt(event.target.value, 10));
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

    const renderDecos = decos => {
        if (decos.length === 0) {
            return <Typography>No decorations required</Typography>;
        }

        return <div className="decos-selected">
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
        return `${name}${condition}: ${[flat, percent].filter(Boolean).join(', ')}`;
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

    const renderDamageBreakdown = (breakdown, result, activeAffinityContributions, activeAffinityTotal) => {
        if (!breakdown?.affinity) {
            return null;
        }

        const rawPercentMultiplier = 1 + (breakdown.raw.rawPercentBonus || 0);
        const postRawPercentMultiplier = 1 + (breakdown.raw.postRawPercentBonus || 0);
        const elementPercentMultiplier = 1 + (breakdown.element.elementPercentBonus || 0);
        const rawFormula = `(${breakdown.raw.base} x ${rawPercentMultiplier.toFixed(2)} + ` +
            `${breakdown.raw.flatRaw}) x ${postRawPercentMultiplier.toFixed(2)} = ` +
            `${breakdown.raw.effectiveRaw.toFixed(1)}`;
        const rawFinal = `x sharp ${breakdown.raw.sharpnessMultiplier.toFixed(2)} x crit ` +
            `${breakdown.raw.critExpectation.toFixed(3)} = ${result.damageProfile.raw_dps.toFixed(1)}`;
        const elementFormula = `${breakdown.element.base} + ${breakdown.element.flatElement} x ` +
            `${elementPercentMultiplier.toFixed(2)} = ${breakdown.element.effectiveElement.toFixed(1)}`;
        const elementFinal = `x sharp ${breakdown.element.sharpnessMultiplier.toFixed(2)} = ` +
            `${result.damageProfile.element_dps.toFixed(1)}`;
        const statusExcludedDetails = breakdown.raw.statusExcludedRawFlat ?
            `; +${breakdown.raw.statusExcludedRawFlat} shown separately in-game` :
            '';

        return <div className="set-skills" style={{ marginTop: '0.75em' }}>
            <span className="set-label">Damage:</span>
            <div className="set-names wanted" style={{
                display: 'grid',
                gap: '0.35em',
                marginTop: '0.25em',
                maxWidth: '1180px'
            }}>
                <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap', color: '#b8e7ff' }}>
                    <span>DPS {result.damageProfile.expected_dps.toFixed(1)}</span>
                    <span>Raw {result.damageProfile.raw_dps.toFixed(1)}</span>
                    <span>Element {result.damageProfile.element_dps.toFixed(1)}</span>
                    <span>Affinity {breakdown.affinity.final}%</span>
                </div>
                {renderBreakdownLine('Raw', rawFormula, `${rawFinal}${statusExcludedDetails}`)}
                {renderContributionLine('Raw boosts', breakdown.raw.skillContributions, formatRawContribution, 5)}
                {renderBreakdownLine('Element', elementFormula, elementFinal)}
                {renderContributionLine('Element boosts', breakdown.element.skillContributions, formatElementContribution, 4)}
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
        const pageStr = save ? "Your saved sets will appear below." : "Add skills above and tap 'Search' to get armor sets.";
        const theName = (fields.savedSets || []).filter(x => x.id === selectedResult?.id)[0]?.name;

        const mySetName = theName || "Unnamed Set";
        const nameEl = save ? <Typography className="edit-name" sx={{ cursor: "pointer !important" }}
            onClick={() => setEditingName(true)}
            title="Click to rename set">
            <EditIcon className="edit-icon" />{mySetName}</Typography> : null;
        const editNameEl = <TextField id="edit-name" label="Rename Set"
            onKeyDown={handleEditKeyDown}
            onFocus={e => e.target.select()}
            onBlur={updateSetName} sx={{ transform: 'translateY(-7px)' }}
            variant="standard" defaultValue={mySetName} />;
        let details = <AccordionDetails sx={{ cursor: 'default' }} />;
        let summary = <Typography sx={{ marginLeft: '-1em', fontSize: '20px', fontWeight: 'bold', cursor: 'default' }}>
            {results.length > 0 ? "Click on a set below to see details." : pageStr}
        </Typography>;
        let all = null;
        let setEffects = null;
        let groupSkills = null;
        let extraSkillsDiv = null;
        let freeSlots = null;
        let defenseTotal = null;
        if (selectedResult) {
            const decos = getDecosFromNames(selectedResult.decoNames, fields.showDecoSkillNames);
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

            summary = renderDecos(decos);
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

        const queueUpSkills = () => {
            if (!selectedResult && !selectedResult.searchedSkills) { return; }

            const mySkills = isShiftPressed ? selectedResult.searchedSkills : {
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

        const searchTargetTitle = isShiftPressed ? "Set only skills used to find this set as the search target" :
            "Set all skills from this set as the search target";
        const paperStyle = hasSelectedResult ? "full" : "empty";

        const disabledRight = !rArr[rIndex + 1];
        const disabledLeft = !rArr[rIndex - 1];

        return <div style={{ marginBottom: '1em' }}
            onMouseEnter={() => setIsMouseInside(true)}
            onMouseLeave={() => setIsMouseInside(false)}
        >
            <Accordion expanded={hasSelectedResult} elevation={hasSelectedResult ? 2 : 0}
                className={`result-paper ${paperStyle}`}>
                <AccordionSummary
                    expandIcon={null}
                    aria-controls="panel1-content"
                    id="panel1-header"
                    sx={{ cursor: 'default !important', marginBottom: '1em' }}
                >
                    {editingName && editNameEl}
                    {!editingName && hasSelectedResult && nameEl}
                    {summary}
                </AccordionSummary>
                {fields.showAll && all}
                {details}
                {defenseTotal}
                {setEffects}
                {groupSkills}
                {fields.showExtra && extraSkillsDiv}
                <div className="free-slots-holder">
                    <span className="set-label">Free Slots:</span>
                    <div className="free-holder">{freeSlots}</div>
                </div>
                <Button className="save-set-button" onClick={saveSet}
                    variant="outlined" color={isSaved ? 'error' : 'info'}>
                    {isSaved ? "Remove From Saved Sets" : "Save Armor Set"}
                </Button>
                {save && <Button className="save-set-button" onClick={queueUpSkills}
                    title={searchTargetTitle}
                    variant="outlined" color="info">
                    {isShiftPressed ? "Set as Search Target 🔍" : "Set as Search Target"}
                </Button>}
                {save && <Button className="save-set-button" onClick={shareSet}
                    title={"Copy armor set url to clipboard"}
                    variant="outlined" color="info">
                    Share Set
                </Button>}
                {save && fields.showCalcExport && <Button className="save-set-button export-calc-button"
                    onClick={exportToCalculator}
                    title={"Copy armor set JSON data for mhwilds-calculator to clipboard"}
                    variant="outlined" color="info">
                    🧮 Export
                </Button>}
                {isCtrlPressed && isMouseInside && <Button className="save-set-button"
                    title="Search for these skills on the wiki armor set search instead"
                    onClick={wikiSearch}
                    variant="outlined" color="warning">
                    Search Wiki
                </Button>}
                <div className="result-cyclers">
                    <IconButton className="cycle" title="Previous Result"
                        disabled={disabledLeft} onClick={() => cycleSelectedResult(-1)}><ArrowBack /></IconButton>
                    <IconButton className="cycle" title="Next Result"
                        disabled={disabledRight} onClick={() => cycleSelectedResult(1)}><ArrowForward /></IconButton>
                    <CloseIcon className="close-icon" onClick={() => setSelectedResult(undefined)} />
                </div>
            </Accordion>
        </div>;
    };

    const renderTable = () => {
        const pageOptions = [
            { label: '30', value: 30 },
            { label: '50', value: 50 },
            { label: '100', value: 100 },
            { label: 'All', value: -1 }
        ];

        const svgStyle = { width: '20px', height: '20px', transform: 'translateY(2px)', marginRight: '2px' };

        const armorImages = [
            <ArmorSvgWrapper key="head" type="head" style={svgStyle} />,
            <ArmorSvgWrapper key="chest" type="chest" style={svgStyle} />,
            <ArmorSvgWrapper key="arms" type="arms" style={svgStyle} />,
            <ArmorSvgWrapper key="waist" type="waist" style={svgStyle} />,
            <ArmorSvgWrapper key="legs" type="legs" style={svgStyle} />,
            <ArmorSvgWrapper key="talisman" type="talisman" style={svgStyle} />,
        ];
        const slotImg = <img className="armor-img" src={`images/slot4.png`} />;
        const defImg = <img className="def-icon" src={`images/defense.png`} />;
        // const defUpImg = <img key="talisman" className="armor-img" src={`images/defense-up.png`} />;

        return <Paper id="main1" className="table-paper">
            <TableContainer sx={{ maxHeight: "69vh", overflowY: "auto", width: '100%' }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <StyledTableRow className="table-row">
                            {save && <StyledTableCell component="th" align="left">Name</StyledTableCell>}
                            <StyledTableCell align="left" component="th" style={{ textTransform: "capitalize" }}>
                                {customSlot === "slots" && slotImg}
                                {customSlot === "defense" && defImg}
                                <div style={{ display: 'inline', marginLeft: '4px' }}>{customSlot}</div>
                                {/* {<SwapIcon onClick={swapCustomSlot} />} */}
                            </StyledTableCell>
                            {isMobile && <StyledTableCell align="left" component="th">
                                <span className="fspan">{defImg} Defense</span></StyledTableCell>}
                            {!isMobile && <StyledTableCell align="left" component="th">
                                <span className="fspan">{armorImages[0]} Head</span></StyledTableCell>}
                            {!isMobile && <StyledTableCell align="left" component="th">
                                <span className="fspan">{armorImages[1]} Chest</span></StyledTableCell>}
                            {!isMobile && <StyledTableCell align="left" component="th">
                                <span className="fspan">{armorImages[2]} Arms</span></StyledTableCell>}
                            {!isMobile && <StyledTableCell align="left" component="th">
                                <span className="fspan">{armorImages[3]} Waist</span></StyledTableCell>}
                            {!isMobile && <StyledTableCell align="left" component="th">
                                <span className="fspan">{armorImages[4]} Legs</span></StyledTableCell>}
                            {!isMobile && <StyledTableCell align="left" component="th">
                                <span className="fspan">{armorImages[5]} Talisman</span></StyledTableCell>}
                        </StyledTableRow>
                    </TableHead>
                    <TableBody>
                        {paginate(results, page, pageSize).map((result, index, arr) => renderResult(result, index, arr))}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination
                className="pagination-row"
                component={PaginationBox}
                rowsPerPageOptions={pageOptions}
                colSpan={3}
                count={results.length}
                rowsPerPage={pageSize}
                labelRowsPerPage="" // ideally add words if screen wide enough
                page={page}
                slotProps={{
                    select: {
                        inputProps: {
                            'aria-label': 'rows per page',
                        },
                        native: false,
                        sx: { marginRight: '1em', marginLeft: '0em' },
                        title: "Rows Per Page",
                    }
                }}

                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                ActionsComponent={TablePaginationActions}
            />
        </Paper>;
    };

    elapsedSeconds = elapsedSeconds || -1;
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
    const displayStr = `Results for ${searchList} (${results.length.toLocaleString('en', { useGrouping: true })}` +
        ` hits in ${elapsedSeconds.toFixed(2)} seconds):`;
    const displayStrEmpty = `No skills specified.  ` +
        `Showing best slotted armor combos (${results.length.toLocaleString('en', { useGrouping: true })}` +
        ` hits in ${elapsedSeconds.toFixed(2)} seconds):`;
    const someArmorBlacklisted = fields.blacklistedArmor.length > 0;
    const someArmorMandatory = fields.mandatoryArmor.filter(x => x).length > 0;
    const someTypesBlacklisted = fields.blacklistedArmorTypes.length > 0;
    const shouldNotify = someArmorBlacklisted || someArmorMandatory || someTypesBlacklisted;

    return <div className="results">
        {renderSelectedResult()}
        {elapsedSeconds > 0 && <div style={{ marginBottom: '0.5em' }}>
            {shouldNotify && <span className="warn">Some armor is pinned/blacklisted - </span>}
            {!isEmpty(fields.slotFilters) && <span className="notice">Deco filters active - </span>}
            {searchList ? displayStr : displayStrEmpty}
            {shouldNotify && results.length === 0 && <div className="warn">
                Current pinned or blacklisted armor can eliminate otherwise valid sets.
            </div>}
        </div>}
        {renderTable()}
    </div>;
};

Results.propTypes = {
    results: PropTypes.array.isRequired,
    elapsedSeconds: PropTypes.number,
    onSaveSet: PropTypes.func,
    save: PropTypes.bool, // if true, on saved sets page
};
export default Results;
