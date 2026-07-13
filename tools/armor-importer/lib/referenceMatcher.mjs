import { normalizeArmorName } from './armorRecord.mjs';

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const editDistance = (left, right) => {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
        const current = [leftIndex];
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
            current[rightIndex] = Math.min(
                current[rightIndex - 1] + 1,
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + Number(left[leftIndex - 1] !== right[rightIndex - 1])
            );
        }
        previous.splice(0, previous.length, ...current);
    }
    return previous[right.length];
};

export const matchKnownName = (value, candidates = []) => {
    const canonicalValue = normalizeArmorName(value);
    const normalizedValue = normalize(canonicalValue);
    if (!normalizedValue) { return value; }
    const exact = candidates.find(candidate => normalize(candidate) === normalizedValue);
    if (exact) { return exact; }
    const ranked = candidates.map(candidate => {
        const normalizedCandidate = normalize(candidate);
        const distance = editDistance(normalizedValue, normalizedCandidate);
        return { candidate, distance, ratio: distance / Math.max(normalizedValue.length, normalizedCandidate.length, 1) };
    }).sort((left, right) => left.ratio - right.ratio || left.distance - right.distance);
    return ranked[0]?.distance <= 3 && ranked[0]?.ratio <= 0.16 ? ranked[0].candidate : canonicalValue;
};

export const reconcileDraftReferences = (draft, reference = {}) => {
    const skillNames = Object.fromEntries(Object.keys(draft.skills || {}).map(name => [
        name, matchKnownName(name, reference.skills)
    ]));
    const matchedArmorName = matchKnownName(draft.name, reference.armorNames);
    const verifiedSlots = !draft.slots?.length && reference.armorSlots?.[matchedArmorName];
    return {
        ...draft,
        name: matchedArmorName,
        slots: verifiedSlots ? [...verifiedSlots] : draft.slots,
        skills: Object.fromEntries(Object.entries(draft.skills || {}).map(([name, level]) => [
            skillNames[name], level
        ])),
        setSkills: (draft.setSkills || []).map(name => matchKnownName(name, reference.setSkills)),
        groupSkills: (draft.groupSkills || []).map(name => matchKnownName(name, reference.groupSkills)),
        _importer: draft._importer ? {
            ...draft._importer,
            ...(verifiedSlots ? { slotsSource: 'existing-record-validation' } : {}),
            reviewRequired: (draft._importer.reviewRequired || []).map(field => {
                if (!field.startsWith('skills.')) { return field; }
                const originalName = field.slice('skills.'.length);
                return `skills.${skillNames[originalName] || matchKnownName(originalName, reference.skills)}`;
            })
        } : draft._importer
    };
};
