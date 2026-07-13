import { normalizeArmorName as normalizeCanonicalArmorName } from './armorRecord.mjs';

const cleanLine = value => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeArmorName = value => normalizeCanonicalArmorName(cleanLine(value)
    .replace(/\s+α$/u, ' Alpha')
    .replace(/\s+β$/u, ' Beta')
    .replace(/\s+γ$/u, ' Gamma')
    .replace(/\s+a$/i, ' Alpha')
    .replace(/\s+B$/u, ' Beta')
    .replace(/\s+y$/i, ' Gamma')
    .replace(/\s+[^A-Za-z0-9]+$/u, ' Beta'));

const inferArmorType = name => {
    const lower = name.toLowerCase();
    if (/(helm|helmet|head|mask|crown|cap|hat|headdress|sandhelm)/.test(lower)) { return 'head'; }
    if (/(mail|chest|vest|jacket|garb|hide)/.test(lower)) { return 'chest'; }
    if (/(arms|braces|vambraces|gloves|gauntlets|sleeves)/.test(lower)) { return 'arms'; }
    if (/(waist|coil|belt|faulds|tassets)/.test(lower)) { return 'waist'; }
    if (/(legs|greaves|boots|leggings|feet|geta)/.test(lower)) { return 'legs'; }
    return '';
};

const getNumber = (line, pattern) => {
    const match = line.match(pattern);
    return match ? Number(match[1]) : undefined;
};

const headingText = line => cleanLine(line).replace(/^[^A-Za-z]+/, '')
    .replace(/^[a-z]\s+(?=(?:equipment|set bonus|group)\s)/i, '')
    .replace(/\s+[v>]$/i, '');
const isHeading = line => /^(equipment info|equipment skills|set bonus skills|group skills)$/i.test(headingText(line));
const isControlNoise = line => /^(z|c|«|»|<|>)$/i.test(line) || /^Lv\s*\d+\s*\/\s*\d+/i.test(line);
const isThresholdDescription = line => /^-?\d+\s*[>›:]?/i.test(line) || /\b(I|II)\s*$/i.test(line);

const findArmorName = records => {
    const positioned = records.find(record => record.y >= 65 && record.y <= 110 && record.x >= 30 &&
        !isHeading(record.text) && !isControlNoise(record.text));
    if (positioned) { return normalizeArmorName(positioned.text); }
    const infoIndex = records.findIndex(record => /^equipment info$/i.test(headingText(record.text)));
    const candidates = records.slice(Math.max(0, infoIndex + 1), infoIndex >= 0 ? infoIndex + 7 : 8);
    return normalizeArmorName(candidates.find(record =>
        record.text && !isHeading(record.text) && !isControlNoise(record.text) &&
        !/^(rarity|defense|slots|fire res|water res|thunder res|ice res|dragon res)/i.test(record.text)
    )?.text || '');
};

export const parseArmorOcr = (ocr, sourceImage = '') => {
    const records = (ocr?.lines?.length ? ocr.lines : String(ocr?.text || '').split(/\r?\n/)
        .map(text => ({ text, words: [] }))).map(line => ({
        text: cleanLine(line.text),
        x: Number(line.words?.[0]?.x || 0),
        y: Number(line.words?.[0]?.y || 0)
    })).filter(record => record.text);
    const lines = records.map(record => record.text);
    const name = findArmorName(records);
    const partial = {
        name,
        type: inferArmorType(name),
        rarity: undefined,
        rank: 'high',
        defense: undefined,
        slots: [],
        resistances: {},
        skills: {},
        setSkills: [],
        groupSkills: [],
        sourceImages: sourceImage ? [sourceImage] : [],
        ocrText: lines.join('\n'),
        reviewRequired: []
    };
    const numberBeside = labelPattern => {
        const label = records.find(record => labelPattern.test(record.text));
        if (!label || !label.y) { return undefined; }
        const value = records.find(record => /^-?\d+$/.test(record.text) && record.x > 180 &&
            Math.abs(record.y - label.y) <= 5);
        return value ? Number(value.text) : undefined;
    };
    let section = '';
    for (const line of lines) {
        if (/^equipment skills$/i.test(headingText(line))) { section = 'skills'; continue; }
        if (/^set bonus skills$/i.test(headingText(line))) { section = 'setSkills'; continue; }
        if (/^group skills$/i.test(headingText(line))) { section = 'groupSkills'; continue; }
        const rarity = getNumber(line, /Rarity\s*(\d+)/i);
        const defense = getNumber(line, /Defense\s*(-?\d+)/i) ?? numberBeside(/^Defense$/i);
        if (rarity !== undefined) { partial.rarity = rarity; }
        if (defense !== undefined) { partial.defense = defense; }
        const resistance = line.match(/^(Fire|Water|Thunder|Ice|Dragon)\s+Res(?:\s*(-?\d+))?/i);
        if (resistance) {
            const value = resistance[2] === undefined ?
                numberBeside(new RegExp(`^${resistance[1]}\\s+Res$`, 'i')) : Number(resistance[2]);
            if (value !== undefined) { partial.resistances[resistance[1].toLowerCase()] = value; }
        }
        const explicitSlots = line.match(/^Slots?\s+(?:Lv\.?\s*)?([1-4](?:\s*[-,]\s*[1-4])*)$/i);
        if (explicitSlots) {
            partial.slots = explicitSlots[1].split(/\s*[-,]\s*/).map(Number);
        }
        if (section === 'skills') {
            const skill = line.match(/^(.+?)\s+Lv\.?\s*(\d+)$/i);
            if (skill) { partial.skills[cleanLine(skill[1])] = Number(skill[2]); }
        } else if ((section === 'setSkills' || section === 'groupSkills') &&
            !isHeading(line) && !isThresholdDescription(line) &&
            !/^(rarity|defense|slots|fire res|water res|thunder res|ice res|dragon res|lv)/i.test(line)) {
            const list = partial[section];
            if (!list.includes(line)) { list.push(line); }
        }
    }
    const skillsStart = records.findIndex(record => /^equipment skills$/i.test(headingText(record.text)));
    const skillsEnd = records.findIndex((record, index) => index > skillsStart &&
        /^(set bonus skills|group skills)$/i.test(headingText(record.text)));
    if (skillsStart >= 0) {
        records.slice(skillsStart + 1, skillsEnd >= 0 ? skillsEnd : records.length)
            .filter(record => record.x >= 35 && !/^Lv/i.test(record.text) && !/^\d+$/.test(record.text))
            .forEach(record => {
                const inline = record.text.match(/^(.+?)\s+Lv\.?\s*(\d+)$/i);
                const skillName = cleanLine(inline?.[1] || record.text).replace(/^[^A-Za-z]+/, '');
                if (!skillName) { return; }
                const nearbyLevel = records.find(candidate => /^Lv[.\s]*(?:1|i)$/i.test(candidate.text) &&
                    candidate.x > 180 && Math.abs(candidate.y - record.y) <= 24);
                partial.skills[skillName] = Number(inline?.[2] || nearbyLevel && 1 || 1);
                if (!inline?.[2] && !nearbyLevel) {
                    partial.reviewRequired.push(`skills.${skillName}`);
                }
            });
    }
    return partial;
};

const chooseDefined = (records, field, fallback) =>
    records.map(record => record[field]).find(value => value !== undefined && value !== '') ?? fallback;

export const mergeArmorPartials = records => {
    const names = records.map(record => record.name).filter(Boolean);
    const name = names.sort((left, right) => right.length - left.length)[0] || '';
    const mergeNames = field => [...new Set(records.flatMap(record => record[field] || []))];
    const merged = {
        name,
        type: chooseDefined(records, 'type', inferArmorType(name)),
        rarity: chooseDefined(records, 'rarity', 1),
        rank: chooseDefined(records, 'rank', 'high'),
        defense: chooseDefined(records, 'defense', 0),
        slots: records.map(record => record.slots || []).find(slots => slots.length) || [],
        resistances: Object.assign({}, ...records.map(record => record.resistances || {})),
        skills: Object.assign({}, ...records.map(record => record.skills || {})),
        setSkills: mergeNames('setSkills'),
        groupSkills: mergeNames('groupSkills'),
        description: '',
        _importer: {
            sourceImages: mergeNames('sourceImages'),
            ocrText: records.map(record => record.ocrText).filter(Boolean),
            reviewRequired: mergeNames('reviewRequired'),
            ...(records.some(record => record._importer?.slotsSource === 'existing-record-validation') ?
                { slotsSource: 'existing-record-validation' } : {})
        }
    };
    ['fire', 'water', 'thunder', 'ice', 'dragon'].forEach(resistance => {
        if (merged.resistances[resistance] === undefined) {
            merged._importer.reviewRequired.push(`resistances.${resistance}`);
            merged.resistances[resistance] = 0;
        }
    });
    if (!merged.name) { merged._importer.reviewRequired.push('name'); }
    if (!merged.type) { merged._importer.reviewRequired.push('type'); }
    if (!merged.slots.length) { merged._importer.reviewRequired.push('slots'); }
    if (!Object.keys(merged.skills).length) { merged._importer.reviewRequired.push('skills'); }
    return merged;
};

export const getArmorGroupKey = (partial, sourceImage = '') => {
    if (partial.name) { return partial.name.toLocaleLowerCase(); }
    return sourceImage.replace(/\.[^.]+$/, '').replace(/(?:[_-](?:page|shot|img)?\d+)$/i, '').toLowerCase();
};
