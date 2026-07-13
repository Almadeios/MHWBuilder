export const ARMOR_TYPES = ['head', 'chest', 'arms', 'waist', 'legs'];

const ARMOR_VARIANTS = {
    alpha: 'Alpha',
    beta: 'Beta',
    gamma: 'Gamma',
    'α': 'Alpha',
    'β': 'Beta',
    'γ': 'Gamma'
};

export const normalizeArmorName = value => String(value || '').trim().replace(
    /(?:\s+)(Alpha|Beta|Gamma|α|β|γ)(\+)?$/iu,
    (match, variant, plus = '') => ` ${ARMOR_VARIANTS[variant.toLocaleLowerCase()] || variant}${plus}`
);

const toInteger = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const normalizeNamedLevels = value => Object.fromEntries(
    Object.entries(value || {})
        .map(([name, level]) => [String(name).trim(), Math.max(1, toInteger(level, 1))])
        .filter(([name]) => name)
        .sort(([left], [right]) => left.localeCompare(right))
);

const normalizeNames = value => [...new Set((value || [])
    .map(name => String(name).trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));

export const normalizeArmorRecord = input => ({
    name: normalizeArmorName(input?.name),
    type: ARMOR_TYPES.includes(input?.type) ? input.type : 'head',
    rarity: Math.max(1, toInteger(input?.rarity, 1)),
    rank: ['low', 'high', 'master'].includes(input?.rank) ? input.rank : 'high',
    defense: Math.max(0, toInteger(input?.defense)),
    slots: (input?.slots || []).map(slot => toInteger(slot)).filter(slot => slot >= 1 && slot <= 4),
    resistances: {
        fire: toInteger(input?.resistances?.fire),
        water: toInteger(input?.resistances?.water),
        thunder: toInteger(input?.resistances?.thunder),
        ice: toInteger(input?.resistances?.ice),
        dragon: toInteger(input?.resistances?.dragon)
    },
    skills: normalizeNamedLevels(input?.skills),
    setSkills: normalizeNames(input?.setSkills),
    groupSkills: normalizeNames(input?.groupSkills),
    description: String(input?.description || '').trim()
});

export const validateArmorRecord = (input, reference = {}) => {
    const record = normalizeArmorRecord(input);
    const errors = [];
    const warnings = [];
    if (!record.name) { errors.push('Armor name is required.'); }
    if (record.slots.length > 3) { errors.push('Armor cannot contain more than three slots.'); }
    if (record.rarity > 99) { warnings.push('Rarity is unusually high.'); }
    if (!Object.keys(record.skills).length) { warnings.push('No equipment skills were entered.'); }
    if ((reference.armorNames || []).includes(record.name)) {
        warnings.push('An armor piece with this exact name already exists.');
    }
    Object.keys(record.skills).forEach(skillName => {
        if (Array.isArray(reference.skills) && !reference.skills.includes(skillName)) {
            warnings.push(`New skill: ${skillName}`);
        }
    });
    record.setSkills.forEach(skillName => {
        if (Array.isArray(reference.setSkills) && !reference.setSkills.includes(skillName)) {
            warnings.push(`New Set Bonus: ${skillName}`);
        }
    });
    record.groupSkills.forEach(skillName => {
        if (Array.isArray(reference.groupSkills) && !reference.groupSkills.includes(skillName)) {
            warnings.push(`New Group Skill: ${skillName}`);
        }
    });
    return { record, errors, warnings, valid: errors.length === 0 };
};

export const buildCompactArmorEntry = input => {
    const record = normalizeArmorRecord(input);
    return [
        record.type,
        record.skills,
        record.groupSkills,
        record.slots,
        record.defense,
        [
            record.resistances.fire,
            record.resistances.water,
            record.resistances.thunder,
            record.resistances.ice,
            record.resistances.dragon
        ],
        record.rank,
        record.setSkills
    ];
};

export const buildDetailedArmorEntry = input => {
    const record = normalizeArmorRecord(input);
    return {
        defense: record.defense,
        description: record.description,
        dragonResistance: record.resistances.dragon,
        fireResistance: record.resistances.fire,
        groupSkill: record.groupSkills,
        iceResistance: record.resistances.ice,
        rank: record.rank,
        rarity: record.rarity,
        setSkill: record.setSkills,
        skills: record.skills,
        slots: record.slots,
        thunderResistance: record.resistances.thunder,
        type: record.type,
        waterResistance: record.resistances.water
    };
};

export const buildArmorImport = input => {
    const record = normalizeArmorRecord(input);
    return {
        targetFiles: {
            compact: `src/data/compact/${record.type}.json`,
            detailed: `src/data/detailed/${record.type}.json`
        },
        compact: { [record.name]: buildCompactArmorEntry(record) },
        detailed: { [record.name]: buildDetailedArmorEntry(record) }
    };
};
