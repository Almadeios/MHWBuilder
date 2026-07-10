import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import SKILLS from '../data/detailed/skills.json';
import SET_SKILLS from '../data/detailed/set-skills.json';
import GROUP_SKILLS from '../data/detailed/group-skills.json';
import TextField from '@mui/material/TextField';
import { getSkillPopup, isGroupSkill, isSetSkill } from '../util/util';
import Image from '@mui/icons-material/Image';
import HideImage from '@mui/icons-material/HideImage';
import Expand from '@mui/icons-material/Expand';
import Minimize from '@mui/icons-material/CloseFullscreen';
import styled from 'styled-components';
import { IconButton } from '@mui/material';
import INTERNAL_BLACKLIST from '../data/internal-blacklist.json';

const ImageIcon = styled(Image)`
    width: 24px;
    color: blueviolet;
`;
const AntiImageIcon = styled(HideImage)`
    width: 24px;
    color: sienna;
`;
const ExpandIcon = styled(Expand)`
    width: 24px;
    color: black;
`;
const MinimizeIcon = styled(Minimize)`
    width: 24px;
    color: black;
`;

const INTERNAL_BLACKMAP = Object.fromEntries(INTERNAL_BLACKLIST.map(x => [x, true]));
const ICON_GROUP_ORDER = [
    'attack', 'power', 'set', 'group', 'defense', 'stamina', 'recovery', 'item',
    'explore', 'meditate', 'crit', 'elemental', 'sharpness', 'ammo'
];
const ICON_GROUP_LABELS = {
    attack: 'Attack',
    crit: 'Affinity / Crit',
    elemental: 'Element / Status',
    sharpness: 'Sharpness',
    ammo: 'Ammo / Ranged',
    stamina: 'Stamina',
    recovery: 'Recovery',
    defense: 'Defense',
    item: 'Items',
    explore: 'Exploration',
    meditate: 'Utility',
    power: 'Power',
    set: 'Set Bonuses',
    group: 'Group Skills',
    misc: 'Other'
};
const GROUP_COLUMN_COUNT = 2;

const getIconRank = icon => {
    const rank = ICON_GROUP_ORDER.indexOf(icon);
    return rank === -1 ? ICON_GROUP_ORDER.length : rank;
};

const SkillsPicker = ({ addSkill, addSlotFilter, showGroupSkillNames, chosenSkillNames }) => {
    const [searchText, setSearchText] = useState('');
    const [foundSkillNames, setFoundSkillNames] = useState([]);
    const [allSkills, setAllSkills] = useState([]);
    const [showIcons, setShowIcons] = useState(true);
    const [hideBlur, setHideBlur] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const combinedSkills = () => {
        const combo = Object.entries({ ...SKILLS, ...SET_SKILLS, ...GROUP_SKILLS })
            .filter(x => !INTERNAL_BLACKMAP[x[0]]).map(y => {
            const x = y[1];
            const isAGroupSkill = isGroupSkill(x);
            const isASetSkill = isSetSkill(x);

            let iconName = x.icon;
            const name = y[0];
            let displayName = name;
            if (isAGroupSkill || isASetSkill) {
                iconName = isAGroupSkill ? "group" : "set";
                if (showGroupSkillNames) {
                    displayName = x.skill;
                }
            }

            return {
                name,
                displayName,
                groupSkill: x.skill,
                description: x.description,
                levels: x.levels,
                maxLevel: x.levels?.length || 1,
                icon: iconName,
                iconGroup: iconName || 'misc'
            };
        }).sort((a, b) => {
            return getIconRank(a.iconGroup) - getIconRank(b.iconGroup) ||
                a.displayName.localeCompare(b.displayName);
        });
        return combo;
    };

    useEffect(() => {
        const all = combinedSkills();
        setAllSkills(all);
    }, [showGroupSkillNames]);

    useEffect(() => {
        const all = combinedSkills();

        if (searchText) {
            const foundSkills = all.filter(x => x.displayName.toLowerCase().includes(searchText.toLowerCase()));
            const foundNames = new Set(foundSkills.map(x => x.displayName.toLowerCase()).sort());
            setFoundSkillNames(Array.from(foundNames));

            all.sort((a, b) => {
                const aFound = foundNames.has(a.displayName.toLowerCase()) ? -1 : 1;
                const bFound = foundNames.has(b.displayName.toLowerCase()) ? -1 : 1;

                return aFound - bFound ||
                    getIconRank(a.iconGroup) - getIconRank(b.iconGroup) ||
                    a.displayName.localeCompare(b.displayName);
            });
        }

        const scroller = document.getElementById('skills-search');
        if (scroller) {
            scroller.scrollTop = 0;
        }
        setAllSkills(all);
    }, [searchText]);

    const renderSkills = (skills, useGroups = true) => {
        const chosen = (chosenSkillNames || []).map(x => x.toLowerCase());
        const visibleSkills = skills.filter(x => !chosen.includes(x.name.toLowerCase()));
        if (searchText || !useGroups) {
            return visibleSkills.map(renderSkill);
        }

        const groupedSkills = visibleSkills.reduce((groups, skill) => {
            const groupName = skill.iconGroup || 'misc';
            groups[groupName] = groups[groupName] || [];
            groups[groupName].push(skill);
            return groups;
        }, {});

        const sortedGroups = Object.entries(groupedSkills)
            .sort(([a], [b]) => getIconRank(a) - getIconRank(b) || a.localeCompare(b))
            .map(([groupName, groupSkills]) => {
                return <div key={groupName} className="skill-picker-group">
                    <div className="skill-picker-group-title">
                        {showIcons && groupName !== 'misc' && <img
                            className="skills-search-bubble-icon"
                            src={`images/icons/${groupName}.png`}
                            alt={groupName}
                        />}
                        <span>{ICON_GROUP_LABELS[groupName] || groupName}</span>
                    </div>
                    <div className="skill-picker-group-skills">
                        {groupSkills.map(renderSkill)}
                    </div>
                </div>;
            });

        const columns = Array.from({ length: GROUP_COLUMN_COUNT }, () => []);
        sortedGroups.forEach((group, index) => {
            columns[index % GROUP_COLUMN_COUNT].push(group);
        });

        return <div className="skill-picker-group-columns">
            {columns.map((columnGroups, index) => {
                return <div className="skill-picker-group-column" key={`skill-group-column-${index}`}>
                    {columnGroups}
                </div>;
            })}
        </div>;
    };

    const renderSkill = skill => {
        const highlighted = searchText ? foundSkillNames.includes(skill.displayName.toLowerCase()) : false;
        const blurred = searchText ? !foundSkillNames.includes(skill.displayName.toLowerCase()) : false;
        const highlightClass = highlighted ? "highlighted" : "";
        const whichBlur = hideBlur ? "blurred-gone" : "blurred";
        const blurredClass = blurred ? whichBlur : "";
        const description = getSkillPopup(skill.name);
        const nameDiv = <div className={`skills-search-bubble-text ${highlightClass}-text`}>
            {skill.displayName}
        </div>;
        const iconImg = skill.icon ?
            <img className="skills-search-bubble-icon" src={`images/icons/${skill.icon}.png`} alt={skill.icon} /> :
            null;

        return <div className={`skills-search-bubble underline ${highlightClass} ${blurredClass}`}
            title={description} onClick={() => addSkill(skill.name)} key={skill.name}>
            {showIcons && iconImg}
            {nameDiv}
        </div>;
    };

    return <div className="skills-picker">
        <div style={{ display: "flex", gap: '8px' }}>
            <TextField id="skill-name-search" label="Search Skills" variant="outlined" size="small"
                className="skills-search-textfield" autoFocus
                onChange={ev => setSearchText(ev.target.value)} value={searchText} />
            {showIcons && <IconButton title="Hide Icons" onClick={() => setShowIcons(!showIcons)}><AntiImageIcon /></IconButton>}
            {!showIcons && <IconButton title="Show Icons" onClick={() => setShowIcons(!showIcons)}>
                <ImageIcon className="image-icon" /></IconButton>}
            {!expanded && <IconButton title="Expand Skills Box" onClick={() => setExpanded(!expanded)}><ExpandIcon /></IconButton>}
            {expanded && <IconButton title="Minimize Skills Box"
                onClick={() => setExpanded(!expanded)}><MinimizeIcon /></IconButton>}
        </div>

        <div id="skills-search" className={
            expanded ? `skills-search ${searchText ? '' : 'grouped'}` : "skills-search-mini"
        }>
            {renderSkills(allSkills, expanded)}
            <div className={searchText || !expanded ? "slots-filter" : "slots-filter skill-picker-slot-group"}>
                {[1, 2, 3].map(x => {
                    const highlighted = searchText && `${x} slot deco filter`.includes(searchText.toLowerCase());
                    const highlightClass = highlighted ? "highlighted" : "";
                    const blurred = searchText && !highlighted;
                    const whichBlur = hideBlur ? "blurred-gone" : "blurred";
                    const blurredClass = blurred ? whichBlur : "";

                    return <div key={`slot-filter-${x}`}
                        className={`skills-search-bubble underline ${highlightClass} ${blurredClass} slot-filter`}
                        title={`Specify how many ${x} slot decos you want to be able to fit into the free slots`}
                        onClick={() => addSlotFilter(x)}>
                        {showIcons && <img
                            className="skills-search-bubble-icon" src={`images/slot${x}.png`} alt={x} />}
                        <div className={`skills-search-bubble-text`}>
                            {`${x} Slot Deco Filter`}
                        </div>
                    </div>;
                })}
            </div>
        </div>
    </div>;
};
SkillsPicker.propTypes = {
    addSkill: PropTypes.func.isRequired,
    addSlotFilter: PropTypes.func.isRequired,
    showGroupSkillNames: PropTypes.bool,
    chosenSkillNames: PropTypes.array,
};
export default SkillsPicker;
