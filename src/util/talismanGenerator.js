import RULES from "../data/talisman-generator/rules.json";
import SKILL_DB from "../data/compact/skills.json";

const MAX_GENERATED_PER_TEMPLATE = 250;

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

const formatSlots = (armorSlots, weaponSlots) => {
    const slots = [
        ...weaponSlots.map(slot => `W${slot}`),
        ...armorSlots.map(String)
    ];
    return slots.length ? slots.join("-") : "none";
};

const buildName = (rarity, skills, armorSlots, weaponSlots) => {
    const skillText = Object.entries(skills)
        .map(([name, level]) => `${name} ${level}`)
        .join(" / ");
    return `${rarity} ${skillText} / slots ${formatSlots(armorSlots, weaponSlots)}`;
};

const chooseRelevantEntries = (entries, desiredSkills, usedSkills) => {
    const desired = entries.filter(entry => desiredSkills[entry.skill] && !usedSkills.has(entry.skill));
    if (desired.length) { return desired; }
    return entries.filter(entry => !usedSkills.has(entry.skill)).slice(0, 1);
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
            for (const slotCombo of template.slotCombos || []) {
                const { armorSlots, weaponSlots } = splitSlotCombo(slotCombo);
                const name = buildName(template.rarity, skills, armorSlots, weaponSlots);
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
    }

    return generated;
};
