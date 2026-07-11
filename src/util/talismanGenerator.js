import RULES from "../data/talisman-generator/rules.json";
import SKILL_DB from "../data/compact/skills.json";

const MAX_GENERATED_PER_TEMPLATE = 250;
const MAX_FILLER_SKILLS_PER_GROUP = 2;
const FILLER_SKILL_PRIORITY = [
    'Attack Boost',
    'Critical Eye',
    'Agitator',
    'Weakness Exploit',
    'Critical Boost',
    'Normal Shots',
    'Piercing Shots',
    'Spread/Power Shots',
    'Rapid Fire Up',
    'Opening Shot',
    'Special Ammo Boost',
    'Ballistics',
    'Burst',
    'Offensive Guard',
    'Critical Element',
    'Critical Status'
];
const FILLER_PRIORITY_INDEX = Object.fromEntries(
    FILLER_SKILL_PRIORITY.map((skillName, index) => [skillName, index])
);
const RARITY_CHARM_NAMES = {
    'RARE[8]': 'Golden Age Charm'
};

const normalizeGroupId = groupId => String(groupId).trim();

const normalizeSkillEntry = entry => {
    if (Array.isArray(entry)) {
        return { skill: entry[0], maxLevel: Number(entry[1]) };
    }
    return {
        skill: entry.skill || entry.name,
        maxLevel: Number(entry.maxLevel || entry.level || entry.max || 1)
    };
};

const getGroupEntries = groupId => {
    return (RULES.groups[normalizeGroupId(groupId)] || [])
        .map(normalizeSkillEntry)
        .filter(entry => entry.skill && entry.maxLevel > 0 && SKILL_DB[entry.skill]);
};

const splitSlotCombo = combo => {
    const armorSlots = [];
    const weaponSlots = [];

    for (const slot of combo) {
        if (!slot || slot === "0") { continue; }
        if (typeof slot === "string" && slot.toUpperCase().startsWith("W")) {
            weaponSlots.push(Number(slot.slice(1)));
            continue;
        }
        armorSlots.push(Number(slot));
    }

    return {
        armorSlots: armorSlots.filter(Boolean).sort((a, b) => b - a),
        weaponSlots: weaponSlots.filter(Boolean).sort((a, b) => b - a)
    };
};

const getSlotComboPriority = combo => {
    const { armorSlots, weaponSlots } = splitSlotCombo(combo);
    const weaponPriority = weaponSlots.length ? 100 + weaponSlots.length : 0;
    const armorPriority = armorSlots.length ? 10 + armorSlots.length : 0;
    return weaponPriority + armorPriority;
};

export const formatSlots = (armorSlots = [], weaponSlots = []) => {
    const armorCounts = { 3: 0, 2: 0, 1: 0 };
    for (const slot of armorSlots) {
        const normalized = Number(slot);
        if (Number.isNaN(normalized)) { continue; }
        if (normalized >= 3) {
            armorCounts[3] += 1;
        } else if (normalized === 2) {
            armorCounts[2] += 1;
        } else if (normalized === 1) {
            armorCounts[1] += 1;
        }
    }

    const slotIcons = [];
    slotIcons.push(...Array(armorCounts[3]).fill('slot3'));
    slotIcons.push(...Array(armorCounts[2]).fill('slot2'));
    slotIcons.push(...Array(armorCounts[1]).fill('slot1'));

    if (weaponSlots.length) {
        slotIcons.push(...weaponSlots.map(slot => `W${slot}`));
    }

    return slotIcons.length ? slotIcons.join(' ') : 'none';
};

const buildName = (rarity, skills) => {
    const skillText = Object.entries(skills)
        .map(([name, level]) => `${name} ${level}`)
        .join(" / ");
    const baseName = RARITY_CHARM_NAMES[rarity] || rarity;
    return `${baseName} ${skillText}`;
};

const chooseRelevantEntries = (entries, desiredSkills, usedSkills) => {
    const desired = entries.filter(entry => desiredSkills[entry.skill] && !usedSkills.has(entry.skill));
    if (desired.length) { return desired; }

    const fillers = entries
        .filter(entry => !usedSkills.has(entry.skill))
        .sort((a, b) => {
            const aPriority = FILLER_PRIORITY_INDEX[a.skill] ?? Number.MAX_SAFE_INTEGER;
            const bPriority = FILLER_PRIORITY_INDEX[b.skill] ?? Number.MAX_SAFE_INTEGER;
            return aPriority - bPriority || b.maxLevel - a.maxLevel || a.skill.localeCompare(b.skill);
        })
        .slice(0, MAX_FILLER_SKILLS_PER_GROUP);
    return [{ skill: null, maxLevel: 0 }, ...fillers];
};

const buildSkillRolls = (groupIds, desiredSkills) => {
    const rolls = [];
    const groups = groupIds.map(getGroupEntries).filter(entries => entries.length);

    const visit = (index, usedSkills, skills) => {
        if (rolls.length >= MAX_GENERATED_PER_TEMPLATE) { return; }
        if (index >= groups.length) {
            if (Object.keys(skills).some(skill => desiredSkills[skill])) {
                rolls.push(skills);
            }
            return;
        }

        for (const entry of chooseRelevantEntries(groups[index], desiredSkills, usedSkills)) {
            if (!entry.skill) {
                visit(index + 1, usedSkills, skills);
                continue;
            }

            const nextUsed = new Set(usedSkills);
            nextUsed.add(entry.skill);
            visit(index + 1, nextUsed, {
                ...skills,
                [entry.skill]: Math.min(entry.maxLevel, SKILL_DB[entry.skill])
            });
        }
    };

    visit(0, new Set(), {});
    return rolls;
};

export const hasTalismanGeneratorRules = () => {
    return RULES.templates.length > 0 && Object.keys(RULES.groups).length > 0;
};

export const generateTalismans = desiredSkills => {
    if (!hasTalismanGeneratorRules() || !desiredSkills || !Object.keys(desiredSkills).length) {
        return {};
    }

    const generated = {};
    for (const template of RULES.templates) {
        const groupIds = template.skillGroups ||
            [template.skill1Group, template.skill2Group, template.skill3Group].filter(x => x && x !== "-");
        const skillRolls = buildSkillRolls(groupIds, desiredSkills);

        for (const skills of skillRolls) {
            const slotCombos = [...template.slotCombos || []].sort((a, b) => getSlotComboPriority(b) - getSlotComboPriority(a));
            const name = buildName(template.rarity, skills);
            const preferredCombo = slotCombos[0];
            if (!preferredCombo) { continue; }

            const { armorSlots, weaponSlots } = splitSlotCombo(preferredCombo);
            generated[name] = [
                "talisman",
                skills,
                [],
                armorSlots,
                0,
                [0, 0, 0, 0, 0],
                "high",
                [],
                weaponSlots
            ];
        }
    }

    return generated;
};
