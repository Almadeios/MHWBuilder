import SKILLS from '../data/compact/skills.json';

export const MAX_CUSTOM_TALISMANS = 100;
export const MAX_TALISMAN_NAME_LENGTH = 60;

const normalizeSlots = slots => Array.isArray(slots) ? slots
  .map(Number)
  .filter(slot => Number.isInteger(slot) && slot >= 1 && slot <= 4)
  .slice(0, 3)
  .sort((a, b) => b - a) : [];

const normalizeSkills = skills => {
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) { return {}; }

  return Object.fromEntries(Object.entries(skills)
    .filter(([name, level]) => SKILLS[name] && Number.isInteger(Number(level)) && Number(level) >= 1)
    .slice(0, 3)
    .map(([name, level]) => [name, Math.min(Number(level), 7)]));
};

export const getCustomTalismanKey = talisman => {
  const skills = Object.entries(talisman.skills || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, level]) => `${name}:${level}`)
    .join('|');
  const armorSlots = normalizeSlots(talisman.slots).join(',');
  const weaponSlots = normalizeSlots(talisman.weaponSlots).join(',');
  return `${skills}::a${armorSlots}::w${weaponSlots}`;
};

export const normalizeCustomTalismans = value => {
  if (!Array.isArray(value)) { return []; }

  const seen = new Set();
  const normalized = [];
  value.slice(0, MAX_CUSTOM_TALISMANS * 2).forEach((talisman, index) => {
    if (!talisman || typeof talisman !== 'object' || Array.isArray(talisman)) { return; }
    const skills = normalizeSkills(talisman.skills);
    if (Object.keys(skills).length === 0) { return; }

    const clean = {
      id: String(talisman.id || `restored-${index}`).slice(0, 80),
      name: String(talisman.name || `Custom Talisman ${index + 1}`)
        .trim()
        .slice(0, MAX_TALISMAN_NAME_LENGTH),
      skills,
      slots: normalizeSlots(talisman.slots),
      weaponSlots: normalizeSlots(talisman.weaponSlots)
    };
    const key = getCustomTalismanKey(clean);
    if (seen.has(key) || normalized.length >= MAX_CUSTOM_TALISMANS) { return; }
    seen.add(key);
    normalized.push(clean);
  });

  return normalized;
};
