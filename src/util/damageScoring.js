const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const CONDITION_LABELS = {
  monster_enraged: 'Monster Enraged',
  weak_point: 'Attacking Weak Point',
  wound: 'Attacking Wound',
  weak_point_and_wound: 'Attacking Wound',
  full_health: 'Full Health',
  red_health: 'Red / Recoverable Health',
  full_stamina: 'Full Stamina',
  latent_power_active: 'Latent Power Active',
  frenzy_cured: 'Frenzy Cured',
  adrenaline_rush_active: 'Adrenaline Rush Active',
  counterstrike_active: 'Counterstrike Active',
  monster_poisoned_or_paralyzed: 'Monster Poisoned or Paralyzed',
  offensive_guard_active: 'Offensive Guard Active',
  draw_attack: 'Draw Attack',
  burst_active: 'Burst Active',
  coalescence_active: 'Coalescence Active',
  heroics_active: 'Heroics Active (HP 35% or Lower)',
  ambush_active: 'Ambush Active',
  powerhouse_active: 'Powerhouse Active',
  azure_bolt_active: 'Azure Bolt Active',
  meat_item_used: 'Meat Item Used',
  binding_counter_active: 'Binding Counter Active',
  war_cry_active: 'War Cry Active',
  guts_triggered: 'Guts Triggered (Attack Bonus Ended)',
  airborne_attack: 'Airborne Attack',
  normal_shot: 'Normal Shot',
  piercing_shot: 'Piercing Shot',
  spread_power_shot: 'Spread / Power Shot',
  rapid_fire_shot: 'LBG Rapid Fire Shot',
  tetrad_affinity_active: 'Tetrad: 4th Shot or Later',
  tetrad_bonus_shot: 'Tetrad: 4th or 6th Shot',
  convert_element_active: 'Convert Element Active',
  elemental_absorption_active: 'Elemental Absorption Active',
  powercharm: 'Powercharm',
  food_attack_up: 'Food Attack Up'
};

const PERMANENT_CONDITION_OPTIONS = [
  { id: 'powercharm', displayLabel: CONDITION_LABELS.powercharm },
  { id: 'food_attack_up', displayLabel: CONDITION_LABELS.food_attack_up }
];

const PERMANENT_RAW_CONDITIONS = {
  powercharm: { skill: 'Powercharm', value: 6 }
};

const PERMANENT_STATUS_EXCLUDED_RAW_CONDITIONS = {
  food_attack_up: { skill: 'Food Attack Up', value: 8 }
};

export const CONDITION_SKILL_TABLES = {
  'Weakness Exploit': {
    weak_point: { field: 'affinity', values: [5, 10, 15, 20, 30] },
    wound: { field: 'affinity', values: [0, 0, 5, 10, 20] }
  },
  Agitator: {
    monster_enraged: [
      { field: 'affinity', values: [3, 5, 7, 10, 15] },
      { field: 'flat_raw', values: [4, 8, 12, 16, 20] }
    ]
  },
  Antivirus: {
    frenzy_cured: { field: 'affinity', values: [3, 6, 10] }
  },
  'Maximum Might': {
    full_stamina: { field: 'affinity', values: [10, 20, 30] }
  },
  'Latent Power': {
    latent_power_active: { field: 'affinity', values: [10, 20, 30, 40, 50] }
  },
  'Peak Performance': {
    full_health: { field: 'flat_raw', values: [3, 6, 10, 15, 20] }
  },
  Resentment: {
    red_health: { field: 'flat_raw', values: [5, 10, 15, 20, 25] }
  },
  'Adrenaline Rush': {
    adrenaline_rush_active: { field: 'flat_raw', values: [10, 15, 20, 25, 30] }
  },
  Counterstrike: {
    counterstrike_active: { field: 'flat_raw', values: [10, 15, 25] }
  },
  Foray: {
    monster_poisoned_or_paralyzed: [
      { field: 'affinity', values: [0, 5, 10, 15, 20] },
      { field: 'flat_raw', values: [6, 8, 10, 12, 15] }
    ]
  },
  'Offensive Guard': {
    offensive_guard_active: { field: 'post_raw_percent', values: [0.05, 0.10, 0.15] }
  },
  'Critical Draw': {
    draw_attack: { field: 'affinity', values: [50, 75, 100] }
  },
  Burst: {
    burst_active: []
  },
  Coalescence: {
    coalescence_active: []
  },
  Heroics: {
    heroics_active: { field: 'raw_percent', values: [0, 0.05, 0.05, 0.10, 0.30] }
  },
  Ambush: {
    ambush_active: { field: 'post_raw_percent', values: [0.05, 0.10, 0.15] }
  },
  Airborne: {
    airborne_attack: { field: 'raw_percent', values: [0.10] }
  },
  'Normal Shots': {
    normal_shot: { field: 'post_raw_percent', values: [0.05] }
  },
  'Piercing Shots': {
    piercing_shot: { field: 'post_raw_percent', values: [0.05] }
  },
  'Spread/Power Shots': {
    spread_power_shot: { field: 'post_raw_percent', values: [0.05] }
  },
  'Rapid Fire Up': {
    rapid_fire_shot: { field: 'post_raw_percent', values: [0.05] }
  },
  'Tetrad Shot': {
    tetrad_affinity_active: { field: 'affinity', values: [8, 10, 12] },
    tetrad_bonus_shot: { field: 'flat_raw', values: [3, 6, 10] }
  },
  'Convert Element': {
    convert_element_active: []
  },
  'Elemental Absorption': {
    elemental_absorption_active: []
  }
};

const SET_SKILL_THRESHOLDS = {
  "Gore Magala's Tyranny": [2, 4],
  "Ebony Odogaron's Power": [2, 4],
  "Xu Wu's Vigor": [2, 4],
  "Jin Dahaad's Revolt": [2, 4],
  Gogmapocalypse: [2, 4],
  "Rathalos's Flare": [2, 4],
  "Doshaguma's Might": [2, 4],
  "Leviathan's Fury": [2, 4],
  "Blangonga's Spirit": [2, 4]
};

const BLACK_ECLIPSE_SKILL = "Gore Magala's Tyranny";
const BURST_BOOST_SKILL = "Ebony Odogaron's Power";
const PROTEIN_FIEND_SKILL = "Xu Wu's Vigor";
const BINDING_COUNTER_SKILL = "Jin Dahaad's Revolt";
const MUTUAL_HOSTILITY_SKILL = 'Gogmapocalypse';
const SCORCHER_SKILL = "Rathalos's Flare";
const POWERHOUSE_SKILL = "Doshaguma's Might";
const AZURE_BOLT_SKILL = "Leviathan's Fury";
const WAR_CRY_SKILL = "Blangonga's Spirit";
const LORDS_SOUL_SKILL = "Lord's Soul";

const RAW_SKILL_TABLES = {
  'Attack Boost': {
    flat: [3, 5, 7, 8, 9],
    rawPercent: [0, 0, 0, 0.02, 0.04]
  }
};

export const ELEMENT_SKILL_TABLES = {
  'Fire Attack': { elementType: 'Fire', flat: [40, 50, 60], elementPercent: [0, 0.10, 0.20] },
  'Water Attack': { elementType: 'Water', flat: [40, 50, 60], elementPercent: [0, 0.10, 0.20] },
  'Thunder Attack': { elementType: 'Thunder', flat: [40, 50, 60], elementPercent: [0, 0.10, 0.20] },
  'Ice Attack': { elementType: 'Ice', flat: [40, 50, 60], elementPercent: [0, 0.10, 0.20] },
  'Dragon Attack': { elementType: 'Dragon', flat: [40, 50, 60], elementPercent: [0, 0.10, 0.20] }
};

const BURST_TABLES = {
  great_sword_hunting_horn: {
    raw: [10, 12, 14, 16, 18],
    element: [80, 100, 120, 160, 200]
  },
  dual_blades: {
    raw: [8, 10, 12, 15, 18],
    element: [40, 60, 80, 100, 120]
  },
  ranged: {
    raw: [6, 7, 8, 9, 10],
    element: [40, 60, 80, 100, 120]
  },
  other: {
    raw: [8, 10, 12, 15, 18],
    element: [60, 80, 100, 120, 140]
  }
};

const getBurstTable = weaponType => BURST_TABLES[weaponType] || BURST_TABLES.other;

const HEAVY_COALESCENCE_WEAPON_TYPES = new Set([
  'great_sword_hunting_horn',
  'hammer_gunlance_switch_axe_charge_blade'
]);

const estimateCoalescenceContribution = (skills = {}, conditions = {}, weaponType = 'other') => {
  const level = skills.Coalescence || 0;
  if (!level) { return []; }
  const active = isConditionActive(conditions, 'coalescence_active');
  const values = HEAVY_COALESCENCE_WEAPON_TYPES.has(weaponType) ? [0.10, 0.20, 0.30] : [0.05, 0.10, 0.15];
  return [{
    skill: 'Coalescence',
    condition: 'coalescence_active',
    conditionLabel: CONDITION_LABELS.coalescence_active,
    flat: 0,
    elementPercent: active ? getSkillValue(values, level) : 0,
    active
  }];
};

const ELEMENTAL_ABSORPTION_TABLES = {
  great_sword_hunting_horn: [50, 80, 100],
  dual_blades: [30, 40, 50],
  ranged: [30, 40, 50],
  other: [40, 50, 60]
};

const estimateActivationElementContributions = (
  skills = {},
  conditions = {},
  weaponType = 'other',
  weaponElementType = 'None'
) => {
  const contributions = [];
  const convertElementLevel = skills['Convert Element'] || 0;
  const convertElementActive = isConditionActive(conditions, 'convert_element_active');
  if (convertElementLevel && weaponElementType === 'Dragon') {
    contributions.push({
      skill: 'Convert Element',
      condition: 'convert_element_active',
      conditionLabel: CONDITION_LABELS.convert_element_active,
      flat: convertElementActive ? getSkillValue([80, 120, 180], convertElementLevel) : 0,
      elementPercent: 0,
      active: convertElementActive
    });
  }

  const absorptionLevel = skills['Elemental Absorption'] || 0;
  const absorptionActive = isConditionActive(conditions, 'elemental_absorption_active');
  if (absorptionLevel && weaponElementType !== 'None') {
    const table = ELEMENTAL_ABSORPTION_TABLES[weaponType] || ELEMENTAL_ABSORPTION_TABLES.other;
    contributions.push({
      skill: 'Elemental Absorption',
      condition: 'elemental_absorption_active',
      conditionLabel: CONDITION_LABELS.elemental_absorption_active,
      flat: absorptionActive ? getSkillValue(table, absorptionLevel) : 0,
      elementPercent: 0,
      durationSeconds: 120,
      cooldownSeconds: 60,
      active: absorptionActive
    });
  }

  return contributions;
};

const AFFINITY_SKILL_TABLES = {
  'Critical Eye': [4, 8, 12, 16, 20]
};

const CRIT_SKILL_TABLES = {
  'Critical Boost': [1.28, 1.31, 1.34, 1.37, 1.40]
};

const BASE_CRIT_MULTIPLIER = 1.25;
const NEGATIVE_CRIT_MULTIPLIER = 0.75;

export const getConditionOptionsForSkills = (skills = {}) => {
  const selectedSkills = Object.keys(skills || {});
  const options = [...PERMANENT_CONDITION_OPTIONS];

  Object.entries(CONDITION_SKILL_TABLES).reduce((conditionOptions, [skillName, conditionMap]) => {
    if (!selectedSkills.includes(skillName)) {
      return conditionOptions;
    }

    Object.keys(conditionMap).forEach(conditionId => {
      if (!conditionOptions.some(option => option.id === conditionId)) {
        conditionOptions.push({
          id: conditionId,
          displayLabel: CONDITION_LABELS[conditionId] || conditionId
        });
      }
    });

    return conditionOptions;
  }, options);

  if (selectedSkills.includes(BLACK_ECLIPSE_SKILL) && !options.some(option => option.id === 'frenzy_cured')) {
    options.push({
      id: 'frenzy_cured',
      displayLabel: CONDITION_LABELS.frenzy_cured
    });
  }
  if (selectedSkills.includes(BURST_BOOST_SKILL) && !options.some(option => option.id === 'burst_active')) {
    options.push({
      id: 'burst_active',
      displayLabel: CONDITION_LABELS.burst_active
    });
  }
  if (selectedSkills.includes(PROTEIN_FIEND_SKILL) && !options.some(option => option.id === 'meat_item_used')) {
    options.push({
      id: 'meat_item_used',
      displayLabel: CONDITION_LABELS.meat_item_used
    });
  }
  if (selectedSkills.includes(BINDING_COUNTER_SKILL) && !options.some(option => option.id === 'binding_counter_active')) {
    options.push({
      id: 'binding_counter_active',
      displayLabel: CONDITION_LABELS.binding_counter_active
    });
  }
  if (selectedSkills.includes(MUTUAL_HOSTILITY_SKILL) && !options.some(option => option.id === 'monster_enraged')) {
    options.push({
      id: 'monster_enraged',
      displayLabel: CONDITION_LABELS.monster_enraged
    });
  }
  if (selectedSkills.includes(POWERHOUSE_SKILL) && !options.some(option => option.id === 'powerhouse_active')) {
    options.push({ id: 'powerhouse_active', displayLabel: CONDITION_LABELS.powerhouse_active });
  }
  if (selectedSkills.includes(AZURE_BOLT_SKILL) && !options.some(option => option.id === 'azure_bolt_active')) {
    options.push({ id: 'azure_bolt_active', displayLabel: CONDITION_LABELS.azure_bolt_active });
  }
  if (selectedSkills.includes(WAR_CRY_SKILL) && !options.some(option => option.id === 'war_cry_active')) {
    options.push({ id: 'war_cry_active', displayLabel: CONDITION_LABELS.war_cry_active });
  }
  if (selectedSkills.includes(LORDS_SOUL_SKILL) && !options.some(option => option.id === 'guts_triggered')) {
    options.push({ id: 'guts_triggered', displayLabel: CONDITION_LABELS.guts_triggered });
  }

  return options;
};

export const filterConditionsForSkills = (conditions = {}, skills = {}) => {
  const allowedConditionIds = new Set(getConditionOptionsForSkills(skills).map(option => option.id));
  return Object.entries(conditions || {}).reduce((nextConditions, [conditionId, value]) => {
    const normalizedConditionId = conditionId === 'weak_point_and_wound' ? 'wound' : conditionId;
    if (allowedConditionIds.has(normalizedConditionId)) {
      nextConditions[normalizedConditionId] = value;
    }
    return nextConditions;
  }, {});
};

const getSkillValue = (values, level) => {
  if (!Array.isArray(values) || !level) {
    return 0;
  }

  const index = Math.min(level, values.length) - 1;
  return values[index] ?? 0;
};

const getConditionEffects = entry => {
  if (Array.isArray(entry)) {
    return entry;
  }

  return entry ? [entry] : [];
};

const isConditionActive = (conditions = {}, conditionId) => {
  if (conditionId === 'wound') {
    return Boolean(conditions.wound || conditions.weak_point_and_wound);
  }

  return Boolean(conditions?.[conditionId]);
};

const hasConditionState = (conditions = {}, conditionId) => {
  if (conditionId === 'wound') {
    return Object.prototype.hasOwnProperty.call(conditions, 'wound') ||
      Object.prototype.hasOwnProperty.call(conditions, 'weak_point_and_wound');
  }

  return Object.prototype.hasOwnProperty.call(conditions, conditionId);
};

const getSetSkillLevel = (setSkills = {}, skillName) => {
  const points = setSkills?.[skillName] || 0;
  const thresholds = SET_SKILL_THRESHOLDS[skillName];
  if (!thresholds) {
    return points;
  }

  return thresholds.reduce((level, threshold) => points >= threshold ? level + 1 : level, 0);
};

const getGroupSkillLevel = (groupSkills = {}, skillName) => {
  const value = groupSkills?.[skillName] || 0;
  if (skillName === LORDS_SOUL_SKILL) {
    return value >= 3 ? 1 : value;
  }

  return value;
};

const getConditionalContributions = (skills = {}, conditions = {}, field) => {
  return Object.entries(CONDITION_SKILL_TABLES).reduce((contribs, [skillName, conditionMap]) => {
    const level = skills[skillName] || 0;
    if (!level) {
      return contribs;
    }

    Object.entries(conditionMap).forEach(([conditionId, entry]) => {
      getConditionEffects(entry)
        .filter(effect => effect.field === field)
        .forEach(effect => {
          const active = isConditionActive(conditions, conditionId);
          const value = getSkillValue(effect.values, level);
          if (value && (active || hasConditionState(conditions, conditionId))) {
            contribs.push({
              skill: skillName,
              condition: conditionId,
              conditionLabel: CONDITION_LABELS[conditionId] || conditionId,
              contribution: active ? value : 0,
              active,
              field
            });
          }
        });
    });
    return contribs;
  }, []);
};

const getPermanentRawContributions = (conditions = {}) => {
  return Object.entries(PERMANENT_RAW_CONDITIONS).reduce((contribs, [conditionId, table]) => {
    if (isConditionActive(conditions, conditionId)) {
      contribs.push({
        skill: table.skill,
        condition: conditionId,
        conditionLabel: CONDITION_LABELS[conditionId],
        contribution: table.value,
        active: true,
        field: 'flat_raw'
      });
    }

    return contribs;
  }, []);
};

const getPermanentStatusExcludedRawContributions = (conditions = {}) => {
  return Object.entries(PERMANENT_STATUS_EXCLUDED_RAW_CONDITIONS).reduce((contribs, [conditionId, table]) => {
    if (isConditionActive(conditions, conditionId)) {
      contribs.push({
        skill: table.skill,
        condition: conditionId,
        conditionLabel: CONDITION_LABELS[conditionId],
        contribution: table.value,
        active: true,
        field: 'status_excluded_flat_raw'
      });
    }

    return contribs;
  }, []);
};

const estimateSetSkillDamageContribution = (skills = {}, setSkills = {}, conditions = {}) => {
  const contributions = [];
  const blackEclipseLevel = getSetSkillLevel(setSkills, BLACK_ECLIPSE_SKILL);
  const burstBoostLevel = getSetSkillLevel(setSkills, BURST_BOOST_SKILL);
  const proteinFiendLevel = getSetSkillLevel(setSkills, PROTEIN_FIEND_SKILL);
  const bindingCounterLevel = getSetSkillLevel(setSkills, BINDING_COUNTER_SKILL);
  const mutualHostilityLevel = getSetSkillLevel(setSkills, MUTUAL_HOSTILITY_SKILL);
  const scorcherLevel = getSetSkillLevel(setSkills, SCORCHER_SKILL);
  const powerhouseLevel = getSetSkillLevel(setSkills, POWERHOUSE_SKILL);
  const azureBoltLevel = getSetSkillLevel(setSkills, AZURE_BOLT_SKILL);
  const warCryLevel = getSetSkillLevel(setSkills, WAR_CRY_SKILL);
  const antivirusLevel = skills.Antivirus || 0;
  const frenzyCured = isConditionActive(conditions, 'frenzy_cured');
  const burstActive = isConditionActive(conditions, 'burst_active');
  const meatItemUsed = isConditionActive(conditions, 'meat_item_used');
  const bindingCounterActive = isConditionActive(conditions, 'binding_counter_active');
  const monsterEnraged = isConditionActive(conditions, 'monster_enraged');
  const powerhouseActive = isConditionActive(conditions, 'powerhouse_active');
  const azureBoltActive = isConditionActive(conditions, 'azure_bolt_active');
  const warCryActive = isConditionActive(conditions, 'war_cry_active');

  if (blackEclipseLevel >= 1 && antivirusLevel) {
    contributions.push({
      skill: 'Black Eclipse I',
      sourceSkill: BLACK_ECLIPSE_SKILL,
      condition: 'frenzy_cured',
      conditionLabel: CONDITION_LABELS.frenzy_cured,
      contribution: frenzyCured ? 15 : 0,
      active: frenzyCured,
      field: 'affinity'
    });
  }

  if (blackEclipseLevel >= 2 && antivirusLevel) {
    contributions.push({
      skill: 'Black Eclipse II',
      sourceSkill: BLACK_ECLIPSE_SKILL,
      condition: 'frenzy_cured',
      conditionLabel: CONDITION_LABELS.frenzy_cured,
      contribution: frenzyCured ? 15 : 0,
      active: frenzyCured,
      field: 'flat_raw'
    });
  }

  if (burstBoostLevel >= 1) {
    contributions.push({
      skill: burstBoostLevel >= 2 ? 'Burst Boost II' : 'Burst Boost I',
      sourceSkill: BURST_BOOST_SKILL,
      condition: 'burst_active',
      conditionLabel: CONDITION_LABELS.burst_active,
      contribution: burstActive ? [8, 18][burstBoostLevel - 1] : 0,
      active: burstActive,
      field: 'flat_raw'
    });
  }

  if (proteinFiendLevel >= 1) {
    contributions.push({
      skill: proteinFiendLevel >= 2 ? 'Protein Fiend II' : 'Protein Fiend I',
      sourceSkill: PROTEIN_FIEND_SKILL,
      condition: 'meat_item_used',
      conditionLabel: CONDITION_LABELS.meat_item_used,
      contribution: meatItemUsed ? [15, 30][proteinFiendLevel - 1] : 0,
      active: meatItemUsed,
      field: 'flat_raw'
    });
  }

  if (bindingCounterLevel >= 1) {
    contributions.push({
      skill: bindingCounterLevel >= 2 ? 'Binding Counter II' : 'Binding Counter I',
      sourceSkill: BINDING_COUNTER_SKILL,
      condition: 'binding_counter_active',
      conditionLabel: CONDITION_LABELS.binding_counter_active,
      contribution: bindingCounterActive ? [25, 50][bindingCounterLevel - 1] : 0,
      active: bindingCounterActive,
      field: 'flat_raw'
    });
  }

  if (mutualHostilityLevel >= 1) {
    contributions.push({
      skill: mutualHostilityLevel >= 2 ? 'Mutual Hostility II' : 'Mutual Hostility I',
      sourceSkill: MUTUAL_HOSTILITY_SKILL,
      condition: 'monster_enraged',
      conditionLabel: CONDITION_LABELS.monster_enraged,
      contribution: monsterEnraged ? [20, 40][mutualHostilityLevel - 1] : 0,
      elementPercent: monsterEnraged ? [0.20, 0.30][mutualHostilityLevel - 1] : 0,
      active: monsterEnraged,
      field: 'element'
    });
  }

  if (scorcherLevel >= 1) {
    const fixedDamage = [20, 40][scorcherLevel - 1];
    const fireDamage = [60, 120][scorcherLevel - 1];
    const activationRate = 0.33;
    contributions.push({
      skill: scorcherLevel >= 2 ? 'Scorcher II' : 'Scorcher I',
      sourceSkill: SCORCHER_SKILL,
      fixedDamage,
      fireDamage,
      activationRate,
      expectedDamage: (fixedDamage + fireDamage) * activationRate,
      active: true,
      field: 'proc_damage'
    });
  }

  if (powerhouseLevel >= 1) {
    contributions.push({
      skill: powerhouseLevel >= 2 ? 'Powerhouse II' : 'Powerhouse I',
      sourceSkill: POWERHOUSE_SKILL,
      condition: 'powerhouse_active',
      conditionLabel: CONDITION_LABELS.powerhouse_active,
      contribution: powerhouseActive ? [10, 25][powerhouseLevel - 1] : 0,
      active: powerhouseActive,
      field: 'flat_raw'
    });
  }

  if (azureBoltLevel >= 1) {
    contributions.push({
      skill: azureBoltLevel >= 2 ? 'Azure Bolt II' : 'Azure Bolt I',
      sourceSkill: AZURE_BOLT_SKILL,
      condition: 'azure_bolt_active',
      conditionLabel: CONDITION_LABELS.azure_bolt_active,
      contribution: azureBoltActive ? 15 : 0,
      active: azureBoltActive,
      field: 'affinity'
    });
  }

  if (warCryLevel >= 1) {
    contributions.push({
      skill: warCryLevel >= 2 ? 'War Cry II' : 'War Cry I',
      sourceSkill: WAR_CRY_SKILL,
      condition: 'war_cry_active',
      conditionLabel: CONDITION_LABELS.war_cry_active,
      contribution: warCryActive ? [3, 6][warCryLevel - 1] : 0,
      durationSeconds: 60,
      active: warCryActive,
      field: 'post_multiplier_flat_raw'
    });
  }

  return contributions;
};

const estimateGroupSkillDamageContribution = (groupSkills = {}, conditions = {}) => {
  const lordsSoulLevel = getGroupSkillLevel(groupSkills, LORDS_SOUL_SKILL);
  if (!lordsSoulLevel) {
    return [];
  }

  const gutsTriggered = isConditionActive(conditions, 'guts_triggered');
  return [{
    skill: 'Guts (Tenacity)',
    sourceSkill: LORDS_SOUL_SKILL,
    level: lordsSoulLevel,
    condition: 'guts_triggered',
    conditionLabel: CONDITION_LABELS.guts_triggered,
    contribution: gutsTriggered ? 0 : 0.05,
    active: !gutsTriggered,
    field: 'post_raw_percent'
  }];
};

const estimateBurstContributions = (skills = {}, conditions = {}, weaponType = 'other') => {
  const level = skills.Burst || 0;
  const burstActive = isConditionActive(conditions, 'burst_active');
  const shouldShow = burstActive || hasConditionState(conditions, 'burst_active');
  if (!level || !shouldShow) {
    return { raw: [], element: [] };
  }

  const table = getBurstTable(weaponType);
  const active = burstActive;
  const rawValue = getSkillValue(table.raw, level);
  const elementValue = getSkillValue(table.element, level);

  return {
    raw: rawValue ? [{
      skill: 'Burst',
      level,
      condition: 'burst_active',
      conditionLabel: CONDITION_LABELS.burst_active,
      contribution: active ? rawValue : 0,
      active,
      field: 'flat_raw'
    }] : [],
    element: elementValue ? [{
      skill: 'Burst',
      level,
      condition: 'burst_active',
      conditionLabel: CONDITION_LABELS.burst_active,
      flat: active ? elementValue : 0,
      elementPercent: 0,
      active
    }] : []
  };
};

const estimateElementSkillContribution = (skills = {}, weaponElementType = 'None', burstElementContributions = []) => {
  const elementSkillContributions = Object.entries(ELEMENT_SKILL_TABLES).reduce((contribs, [skillName, table]) => {
    const level = skills[skillName] || 0;
    if (!level || table.elementType !== weaponElementType) {
      return contribs;
    }

    const flat = getSkillValue(table.flat, level);
    const elementPercent = getSkillValue(table.elementPercent, level);
    if (flat || elementPercent) {
      contribs.push({
        skill: skillName,
        flat,
        elementPercent,
        active: true
      });
    }

    return contribs;
  }, []);

  return [
    ...elementSkillContributions,
    ...burstElementContributions
  ];
};

const estimateSkillDamageContribution = (skills = {}, conditions = {}, setSkills = {}, groupSkills = {}, weaponType = 'other') => {
  const setSkillContributions = estimateSetSkillDamageContribution(skills, setSkills, conditions);
  const groupSkillContributions = estimateGroupSkillDamageContribution(groupSkills, conditions);
  const burstContributions = estimateBurstContributions(skills, conditions, weaponType);
  const coalescenceElementContributions = estimateCoalescenceContribution(skills, conditions, weaponType);
  const setRawContributions = setSkillContributions.filter(item => item.field === 'flat_raw');
  const setRawPercentContributions = setSkillContributions.filter(item => item.field === 'raw_percent');
  const setPostRawPercentContributions = setSkillContributions.filter(item => item.field === 'post_raw_percent');
  const setPostMultiplierRawContributions = setSkillContributions
    .filter(item => item.field === 'post_multiplier_flat_raw');
  const setAffinityContributions = setSkillContributions.filter(item => item.field === 'affinity');
  const procContributions = setSkillContributions.filter(item => item.field === 'proc_damage');
  const setElementContributions = setSkillContributions
    .filter(item => item.field === 'element')
    .map(item => ({
      skill: item.skill,
      sourceSkill: item.sourceSkill,
      condition: item.condition,
      conditionLabel: item.conditionLabel,
      flat: item.contribution,
      elementPercent: item.elementPercent || 0,
      active: item.active
    }));
  const groupPostRawPercentContributions = groupSkillContributions.filter(item => item.field === 'post_raw_percent');
  const unconditionalRawContributions = Object.entries(RAW_SKILL_TABLES).reduce((contribs, [skillName, table]) => {
    const value = getSkillValue(table.flat || [], skills[skillName] || 0);
    if (value) {
      contribs.push({ skill: skillName, contribution: value, active: true, field: 'flat_raw' });
    }
    return contribs;
  }, []);

  const conditionalRawContributions = getConditionalContributions(skills, conditions, 'flat_raw');
  const permanentRawContributions = getPermanentRawContributions(conditions);
  const permanentStatusExcludedRawContributions = getPermanentStatusExcludedRawContributions(conditions);
  const burstRawContributions = burstContributions.raw;
  const conditionalRawPercentContributions = getConditionalContributions(skills, conditions, 'raw_percent');
  const conditionalPostRawPercentContributions = getConditionalContributions(skills, conditions, 'post_raw_percent');
  const rawFlat = unconditionalRawContributions.reduce((total, item) => total + item.contribution, 0) +
    permanentRawContributions.reduce((total, item) => total + item.contribution, 0) +
    conditionalRawContributions.reduce((total, item) => total + item.contribution, 0) +
    setRawContributions.reduce((total, item) => total + item.contribution, 0);

  const rawPercent = Object.entries(RAW_SKILL_TABLES).reduce((total, [skillName, table]) => {
    return total + getSkillValue(table.rawPercent || [], skills[skillName] || 0);
  }, 0) +
    conditionalRawPercentContributions.reduce((total, item) => total + item.contribution, 0) +
    setRawPercentContributions.reduce((total, item) => total + item.contribution, 0);

  const postRawPercent = conditionalPostRawPercentContributions.reduce((total, item) => total + item.contribution, 0) +
    setPostRawPercentContributions.reduce((total, item) => total + item.contribution, 0) +
    groupPostRawPercentContributions.reduce((total, item) => total + item.contribution, 0);
  const postMultiplierRawFlat = permanentStatusExcludedRawContributions
    .reduce((total, item) => total + item.contribution, 0) +
    burstRawContributions.reduce((total, item) => total + item.contribution, 0) +
    setPostMultiplierRawContributions.reduce((total, item) => total + item.contribution, 0);

  const unconditionalRawBreakdown = Object.entries(RAW_SKILL_TABLES).filter(([skillName]) => skills[skillName]).map(([skillName, table]) => ({
    skill: skillName,
    flat: getSkillValue(table.flat || [], skills[skillName] || 0),
    rawPercent: table.rawPercent ? getSkillValue(table.rawPercent, skills[skillName] || 0) : 0,
    active: true
  }));

  const conditionalRawBreakdown = conditionalRawContributions.map(item => ({
    skill: item.skill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: item.contribution,
    rawPercent: 0,
    active: item.active
  }));

  const permanentRawBreakdown = permanentRawContributions.map(item => ({
    skill: item.skill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: item.contribution,
    rawPercent: 0,
    active: item.active
  }));

  const permanentStatusExcludedRawBreakdown = permanentStatusExcludedRawContributions.map(item => ({
    skill: item.skill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: item.contribution,
    rawPercent: 0,
    postRawPercent: 0,
    statusExcluded: true,
    active: item.active
  }));

  const burstRawBreakdown = burstRawContributions.map(item => ({
    skill: item.skill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: item.contribution,
    postMultiplierFlat: item.contribution,
    rawPercent: 0,
    active: item.active
  }));

  const conditionalRawPercentBreakdown = conditionalRawPercentContributions.map(item => ({
    skill: item.skill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: 0,
    rawPercent: item.contribution,
    active: item.active
  }));

  const conditionalPostRawPercentBreakdown = conditionalPostRawPercentContributions.map(item => ({
    skill: item.skill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: 0,
    rawPercent: 0,
    postRawPercent: item.contribution,
    active: item.active
  }));

  const setRawBreakdown = setRawContributions.map(item => ({
    skill: item.skill,
    sourceSkill: item.sourceSkill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: item.contribution,
    rawPercent: 0,
    active: item.active
  }));

  const setRawPercentBreakdown = setRawPercentContributions.map(item => ({
    skill: item.skill,
    sourceSkill: item.sourceSkill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: 0,
    rawPercent: item.contribution,
    active: item.active
  }));

  const setPostRawPercentBreakdown = setPostRawPercentContributions.map(item => ({
    skill: item.skill,
    sourceSkill: item.sourceSkill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: 0,
    rawPercent: 0,
    postRawPercent: item.contribution,
    active: item.active
  }));

  const setPostMultiplierRawBreakdown = setPostMultiplierRawContributions.map(item => ({
    skill: item.skill,
    sourceSkill: item.sourceSkill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: item.contribution,
    postMultiplierFlat: item.contribution,
    active: item.active
  }));

  const groupPostRawPercentBreakdown = groupPostRawPercentContributions.map(item => ({
    skill: item.skill,
    sourceSkill: item.sourceSkill,
    condition: item.condition,
    conditionLabel: item.conditionLabel,
    flat: 0,
    rawPercent: 0,
    postRawPercent: item.contribution,
    active: item.active
  }));

  const rawContributions = [
    ...unconditionalRawBreakdown,
    ...permanentRawBreakdown,
    ...permanentStatusExcludedRawBreakdown,
    ...conditionalRawBreakdown,
    ...burstRawBreakdown,
    ...conditionalRawPercentBreakdown,
    ...conditionalPostRawPercentBreakdown,
    ...setRawBreakdown,
    ...setRawPercentBreakdown,
    ...setPostRawPercentBreakdown,
    ...setPostMultiplierRawBreakdown,
    ...groupPostRawPercentBreakdown
  ];

  const affinityContributions = [
    ...Object.entries(AFFINITY_SKILL_TABLES).reduce((contribs, [skillName, values]) => {
      const level = skills[skillName] || 0;
      const value = getSkillValue(values, level);
      if (value) {
        contribs.push({ skill: skillName, contribution: value, active: true });
      }
      return contribs;
    }, []),
    ...getConditionalContributions(skills, conditions, 'affinity'),
    ...setAffinityContributions
  ];

  const critMultiplier = Object.entries(CRIT_SKILL_TABLES).reduce((multiplier, [skillName, values]) => {
    return getSkillValue(values, skills[skillName] || 0) || multiplier;
  }, BASE_CRIT_MULTIPLIER);

  return {
    rawFlat,
    statusExcludedRawFlat: permanentStatusExcludedRawContributions.reduce((total, item) => total + item.contribution, 0),
    postMultiplierRawFlat,
    rawPercent,
    postRawPercent,
    affinity: affinityContributions.reduce((total, item) => total + item.contribution, 0),
    critMultiplier,
    utility: (skills['Evade Window'] || 0) * 2 + (skills['Marathon Runner'] || 0) * 1,
    rawContributions,
    burstElementContributions: burstContributions.element,
    coalescenceElementContributions,
    procContributions,
    setElementContributions,
    conditionalRawContributions: [
      ...permanentRawContributions,
      ...permanentStatusExcludedRawContributions,
      ...conditionalRawContributions
    ],
    affinityContributions,
    unmodeledSkills: Object.keys(skills || {}).filter(skill => ![
      ...Object.keys(RAW_SKILL_TABLES),
      ...Object.keys(AFFINITY_SKILL_TABLES),
      ...Object.keys(ELEMENT_SKILL_TABLES),
      ...Object.keys(CONDITION_SKILL_TABLES),
      ...Object.keys(CRIT_SKILL_TABLES),
      ...Object.keys(setSkills || {}),
      ...Object.keys(groupSkills || {}),
      'Evade Window',
      'Marathon Runner'
    ].includes(skill))
  };
};

const getSortScore = (profile, goal = 'highest_dps') => {
  switch (goal) {
    case 'highest_raw':
      return profile.raw_dps;
    case 'highest_element':
      return profile.element_dps;
    case 'highest_affinity':
      return profile.final_affinity;
    case 'balanced':
      return profile.expected_dps - profile.final_affinity * 0.2;
    case 'highest_dps':
    default:
      return profile.expected_dps;
  }
};

export const buildDamageProfile = roll => {
  const combinedSkills = {
    ...roll?.skills,
    ...roll?.setSkills,
    ...roll?.groupSkills
  };
  const skillContribution = estimateSkillDamageContribution(
    combinedSkills,
    roll?.conditions || {},
    roll?.setSkillPoints || roll?.setSkills || {},
    roll?.groupSkillPoints || roll?.groupSkills || {},
    roll?.weaponType || 'other'
  );
  const affinity = clamp((roll?.weaponBaseAffinity || 0) + skillContribution.affinity, -100, 100);
  const baseRaw = Number(roll?.weaponBaseRaw || 0);
  const sharpnessMultiplier = {
    Red: 0.5,
    Orange: 0.75,
    Yellow: 1,
    Green: 1.05,
    Blue: 1.2,
    White: 1.32,
    Purple: 1.39
  }[roll?.weaponSharpness || 'White'] || 1;
  const elementSharpnessMultiplier = sharpnessMultiplier > 1 ? sharpnessMultiplier * 0.85 : 0.75;
  const elementValue = Number(roll?.weaponElementValue || 0);
  const activationElementContributions = estimateActivationElementContributions(
    combinedSkills,
    roll?.conditions || {},
    roll?.weaponType || 'other',
    roll?.weaponElementType || 'None'
  );
  const elementContributions = estimateElementSkillContribution(
    combinedSkills,
    roll?.weaponElementType || 'None',
    [
      ...skillContribution.burstElementContributions,
      ...skillContribution.coalescenceElementContributions,
      ...skillContribution.setElementContributions,
      ...activationElementContributions
    ]
  );
  const elementFlat = elementContributions.reduce((total, item) => total + item.flat, 0);
  const elementPercent = elementContributions.reduce((total, item) => total + item.elementPercent, 0);
  const elementPercentMultipliers = elementContributions
    .filter(item => item.elementPercent)
    .map(item => 1 + item.elementPercent);
  const elementPercentMultiplier = elementPercentMultipliers.reduce(
    (total, multiplier) => total * multiplier,
    1
  );
  const uncappedElement = elementValue * elementPercentMultiplier + elementFlat;
  const elementCap = elementValue > 0 ? Math.max(elementValue * 2.3, elementValue + 400) : 0;
  const effectiveElement = elementValue > 0 ? Math.min(uncappedElement, elementCap) : 0;
  const effectiveRaw = (baseRaw * (1 + skillContribution.rawPercent) + skillContribution.rawFlat) *
    (1 + skillContribution.postRawPercent) + skillContribution.postMultiplierRawFlat;
  const critExpectation = affinity >= 0 ?
    1 + affinity / 100 * (skillContribution.critMultiplier - 1) :
    1 + Math.abs(affinity) / 100 * (NEGATIVE_CRIT_MULTIPLIER - 1);
  const rawScore = effectiveRaw * sharpnessMultiplier * critExpectation;
  const elementScore = effectiveElement > 0 && roll?.weaponElementType !== 'None' ?
    effectiveElement * elementSharpnessMultiplier : 0;
  const procScore = skillContribution.procContributions.reduce((total, item) => total + item.expectedDamage, 0);
  const expectedDps = rawScore + elementScore + procScore;
  const rawDps = rawScore;
  const elementDps = elementScore;

  const tags = [];
  if (affinity >= 100) {
    tags.push('Crit-Capped');
  } else if (affinity >= 70) {
    tags.push('Crit-Focused');
  }

  if (rawDps / expectedDps >= 0.8) {
    tags.push('Raw-Stacked');
  }
  if (elementDps / expectedDps >= 0.25 && elementDps / expectedDps <= 0.6) {
    tags.push('Elemental Hybrid');
  }
  if (elementDps / expectedDps > 0.6) {
    tags.push('Elemental-Focused');
  }

  const conditionSensitiveEntries = skillContribution.affinityContributions.filter(item => item.condition);
  const rawConditionSensitiveEntries = skillContribution.conditionalRawContributions.filter(item => item.condition);
  const setConditionSensitiveEntries = [
    ...skillContribution.affinityContributions,
    ...skillContribution.rawContributions,
    ...skillContribution.setElementContributions
  ].filter(item => item.sourceSkill && item.condition);
  const allConditionSensitiveEntries = [
    ...conditionSensitiveEntries,
    ...rawConditionSensitiveEntries,
    ...setConditionSensitiveEntries,
    ...skillContribution.coalescenceElementContributions.filter(item => item.condition),
    ...activationElementContributions.filter(item => item.condition)
  ];

  return {
    expected_dps: expectedDps,
    raw_dps: rawDps,
    element_dps: elementDps,
    proc_dps: procScore,
    final_affinity: affinity,
    final_crit_multiplier: skillContribution.critMultiplier,
    final_sharpness: 'White',
    tags,
    condition_dependent: allConditionSensitiveEntries.length > 0,
    condition_sensitivity: allConditionSensitiveEntries.reduce((acc, item) => {
      if (item.condition) {
        acc[item.skill] = item.conditionLabel || item.condition;
      }
      return acc;
    }, {}),
    breakdown: {
      raw: {
        base: baseRaw,
        sharpnessMultiplier,
        effectiveRaw,
        critExpectation,
        flatRaw: skillContribution.rawFlat,
        statusExcludedRawFlat: skillContribution.statusExcludedRawFlat,
        postMultiplierRawFlat: skillContribution.postMultiplierRawFlat,
        rawPercentBonus: skillContribution.rawPercent,
        postRawPercentBonus: skillContribution.postRawPercent,
        skillContributions: skillContribution.rawContributions
      },
      element: {
        base: elementValue,
        flatElement: elementFlat,
        elementPercentBonus: elementPercent,
        elementPercentMultiplier,
        elementPercentMultipliers,
        uncappedElement,
        elementCap,
        capApplied: uncappedElement > elementCap,
        effectiveElement,
        sharpnessMultiplier: elementSharpnessMultiplier,
        skillContributions: elementContributions
      },
      affinity: {
        base: roll?.weaponBaseAffinity || 0,
        contributions: skillContribution.affinityContributions,
        final: affinity
      },
      procs: {
        expectedDamage: procScore,
        contributions: skillContribution.procContributions
      },
      unmodeledSkills: skillContribution.unmodeledSkills
    }
  };
};

export const rankBuildsByDamage = (rolls, goal = 'highest_dps') => {
  return [...rolls].sort((a, b) => {
    const profileA = buildDamageProfile(a);
    const profileB = buildDamageProfile(b);
    if (goal === 'efficient') {
      const slotValue = roll => [].concat(
        roll?.freeSlots || [],
        roll?.freeWeaponSlots || []
      ).reduce((total, size) => total + 4 ** size, 0);
      const slotDiff = slotValue(b) - slotValue(a);
      const decoDiff = (a?.requiredDecoNames?.length || 0) - (b?.requiredDecoNames?.length || 0);
      return slotDiff || decoDiff || profileB.expected_dps - profileA.expected_dps;
    }
    const scoreDiff = getSortScore(profileB, goal) - getSortScore(profileA, goal);
    return scoreDiff || profileB.expected_dps - profileA.expected_dps || Object.keys(b?.skills || {}).length - Object.keys(a?.skills || {}).length;
  });
};
