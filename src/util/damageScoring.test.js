import {
  buildDamageProfile,
  filterConditionsForSkills,
  getConditionOptionsForSkills,
  recalculateResultDamage,
  rankBuildsByDamage
} from './damageScoring';

describe('damage scoring', () => {
  it('scores offensive builds higher than utility-focused ones', () => {
    const offensiveRoll = {
      skills: { 'Attack Boost': 5, 'Agitator': 5, 'Weakness Exploit': 3 },
      setSkills: {},
      groupSkills: {}
    };

    const utilityRoll = {
      skills: { 'Evade Window': 1, 'Marathon Runner': 3 },
      setSkills: {},
      groupSkills: {}
    };

    const offensiveProfile = buildDamageProfile(offensiveRoll);
    const utilityProfile = buildDamageProfile(utilityRoll);

    expect(offensiveProfile.expected_dps).toBeGreaterThan(utilityProfile.expected_dps);
    expect(offensiveProfile.tags).toContain('Raw-Stacked');
    const ranked = rankBuildsByDamage([utilityRoll, offensiveRoll]);
    expect(ranked[0]).toBe(offensiveRoll);
  });

  it('uses the verified raw and affinity tables from section 11', () => {
    const roll = {
      skills: { 'Attack Boost': 5, 'Critical Boost': 5, 'Critical Eye': 5, 'Weakness Exploit': 5, 'Maximum Might': 3 },
      conditions: { weak_point: true, full_stamina: true },
      weaponBaseAffinity: 0,
      weaponBaseRaw: 300,
      weaponSharpness: 'White'
    };

    const profile = buildDamageProfile(roll);

    expect(profile.breakdown.raw.flatRaw).toBe(9);
    expect(profile.breakdown.raw.rawPercentBonus).toBe(0.04);
    expect(profile.breakdown.affinity.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: 'Critical Eye', contribution: 20 }),
        expect.objectContaining({ skill: 'Weakness Exploit', contribution: 30 }),
        expect.objectContaining({ skill: 'Maximum Might', contribution: 30 })
      ])
    );
    expect(profile.breakdown.affinity.final).toBe(80);
    expect(profile.final_crit_multiplier).toBe(1.4);
  });

  it('switches ranking by optimization goal', () => {
    const rawRoll = {
      skills: { 'Attack Boost': 5 },
      weaponBaseRaw: 300,
      weaponBaseAffinity: 0,
      weaponSharpness: 'White'
    };
    const affinityRoll = {
      skills: { 'Critical Boost': 3, 'Weakness Exploit': 3 },
      weaponBaseRaw: 200,
      weaponBaseAffinity: 80,
      weaponSharpness: 'White'
    };

    const rawRanked = rankBuildsByDamage([affinityRoll, rawRoll], 'highest_raw');
    const affinityRanked = rankBuildsByDamage([rawRoll, affinityRoll], 'highest_affinity');

    expect(rawRanked[0]).toBe(rawRoll);
    expect(affinityRanked[0]).toBe(affinityRoll);
  });

  it('labels condition-gated contributions in the breakdown', () => {
    const roll = {
      skills: { 'Weakness Exploit': 5, Agitator: 5 },
      conditions: { weak_point: true, monster_enraged: true },
      weaponBaseAffinity: 0,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    };

    const profile = buildDamageProfile(roll);

    expect(profile.breakdown.affinity.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Weakness Exploit', condition: 'weak_point', conditionLabel: 'Attacking Weak Point', contribution: 30 }),
      expect.objectContaining({ skill: 'Agitator', condition: 'monster_enraged', conditionLabel: 'Monster Enraged', contribution: 15 })
    ]));
  });

  it('includes set and group skill bonuses in the affinity breakdown', () => {
    const roll = {
      skills: { 'Attack Boost': 2 },
      setSkills: { 'Critical Eye': 3 },
      groupSkills: { 'Weakness Exploit': 2 },
      weaponBaseAffinity: 0,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    };

    const profile = buildDamageProfile(roll);

    expect(profile.breakdown.affinity.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Critical Eye', contribution: 12, active: true })
    ]));
    expect(profile.breakdown.affinity.contributions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Weakness Exploit' })
    ]));
  });

  it('does not count flat raw condition skills as affinity', () => {
    const roll = {
      skills: { 'Peak Performance': 5 },
      conditions: { full_health: true },
      weaponBaseAffinity: 15,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    };

    const profile = buildDamageProfile(roll);

    expect(profile.breakdown.affinity.final).toBe(15);
    expect(profile.breakdown.affinity.contributions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Peak Performance' })
    ]));
    expect(profile.breakdown.raw.flatRaw).toBe(20);
    expect(profile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Peak Performance', condition: 'full_health', flat: 20, active: true })
    ]));
  });

  it('gates conditional flat raw bonuses behind their condition', () => {
    const inactiveProfile = buildDamageProfile({
      skills: { 'Peak Performance': 5, Resentment: 5 },
      conditions: { full_health: false, red_health: false },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });
    const activeProfile = buildDamageProfile({
      skills: { 'Peak Performance': 5, Resentment: 5 },
      conditions: { full_health: true, red_health: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(inactiveProfile.breakdown.raw.flatRaw).toBe(0);
    expect(activeProfile.breakdown.raw.flatRaw).toBe(45);
  });

  it('supports condition skills with both affinity and flat raw effects', () => {
    const roll = {
      skills: { Foray: 5, Agitator: 5 },
      conditions: { monster_poisoned_or_paralyzed: true, monster_enraged: true },
      weaponBaseAffinity: 0,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    };

    const profile = buildDamageProfile(roll);

    expect(profile.breakdown.affinity.final).toBe(35);
    expect(profile.breakdown.raw.flatRaw).toBe(35);
    expect(profile.breakdown.affinity.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Foray', contribution: 20, active: true }),
      expect.objectContaining({ skill: 'Agitator', contribution: 15, active: true })
    ]));
  });

  it('models Weakness Exploit weak point and wound as separate condition bonuses', () => {
    const woundOnlyProfile = buildDamageProfile({
      skills: { 'Weakness Exploit': 5 },
      conditions: { wound: true },
      weaponBaseAffinity: 0,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });
    const weakPointAndWoundProfile = buildDamageProfile({
      skills: { 'Weakness Exploit': 5 },
      conditions: { weak_point: true, wound: true },
      weaponBaseAffinity: 0,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(woundOnlyProfile.breakdown.affinity.final).toBe(20);
    expect(weakPointAndWoundProfile.breakdown.affinity.final).toBe(50);
    expect(weakPointAndWoundProfile.breakdown.affinity.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ condition: 'weak_point', contribution: 30 }),
      expect.objectContaining({ condition: 'wound', contribution: 20 })
    ]));
  });

  it('adds Black Eclipse affinity and raw through cured Antivirus synergy', () => {
    const profile = buildDamageProfile({
      skills: { Antivirus: 3 },
      setSkills: { "Gore Magala's Tyranny": 4 },
      conditions: { frenzy_cured: true },
      weaponBaseAffinity: 0,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.affinity.final).toBe(25);
    expect(profile.breakdown.raw.flatRaw).toBe(15);
    expect(profile.breakdown.affinity.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Antivirus', contribution: 10 }),
      expect.objectContaining({ skill: 'Black Eclipse I', contribution: 15 })
    ]));
    expect(profile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Black Eclipse II', flat: 15 })
    ]));
    expect(profile.breakdown.unmodeledSkills).not.toContain("Gore Magala's Tyranny");
  });

  it('gates Latent Power affinity behind its active condition', () => {
    const inactiveProfile = buildDamageProfile({
      skills: { 'Latent Power': 5 },
      conditions: { latent_power_active: false },
      weaponBaseAffinity: 0,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });
    const activeProfile = buildDamageProfile({
      skills: { 'Latent Power': 5 },
      conditions: { latent_power_active: true },
      weaponBaseAffinity: 0,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(inactiveProfile.breakdown.affinity.final).toBe(0);
    expect(inactiveProfile.breakdown.affinity.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Latent Power', condition: 'latent_power_active', contribution: 0, active: false })
    ]));
    expect(activeProfile.breakdown.affinity.final).toBe(50);
    expect(activeProfile.breakdown.affinity.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Latent Power', condition: 'latent_power_active', contribution: 50, active: true })
    ]));
  });

  it('does not show stale inactive conditional entries when conditions are not selected', () => {
    const profile = buildDamageProfile({
      skills: { 'Critical Eye': 5, Antivirus: 3, 'Latent Power': 5 },
      conditions: {},
      weaponBaseAffinity: 0,
      weaponBaseRaw: 260,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.affinity.final).toBe(20);
    expect(profile.breakdown.affinity.contributions).toEqual([
      expect.objectContaining({ skill: 'Critical Eye', contribution: 20, active: true })
    ]);
  });

  it('models Offensive Guard as conditional post raw percent', () => {
    const inactiveProfile = buildDamageProfile({
      skills: { 'Offensive Guard': 3 },
      conditions: { offensive_guard_active: false },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });
    const activeProfile = buildDamageProfile({
      skills: { 'Offensive Guard': 3 },
      conditions: { offensive_guard_active: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(inactiveProfile.breakdown.raw.postRawPercentBonus).toBe(0);
    expect(activeProfile.breakdown.raw.postRawPercentBonus).toBe(0.15);
    expect(activeProfile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Offensive Guard', postRawPercent: 0.15, active: true })
    ]));
  });

  it('models matching elemental attack skills', () => {
    const profile = buildDamageProfile({
      skills: { 'Fire Attack': 3, 'Dragon Attack': 3 },
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.element.flatElement).toBe(60);
    expect(profile.breakdown.element.elementPercentBonus).toBe(0.20);
    expect(profile.breakdown.element.effectiveElement).toBe(420);
    expect(profile.breakdown.element.skillContributions).toEqual([
      expect.objectContaining({ skill: 'Fire Attack', flat: 60, elementPercent: 0.20 })
    ]);
  });

  it('always shows permanent raw condition options', () => {
    const options = getConditionOptionsForSkills({});

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'powercharm', displayLabel: 'Powercharm' }),
      expect.objectContaining({ id: 'food_attack_up', displayLabel: 'Food Attack Up' })
    ]));
  });

  it('models Powercharm as status flat raw and food as status-excluded raw', () => {
    const profile = buildDamageProfile({
      skills: {},
      conditions: { powercharm: true, food_attack_up: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.raw.flatRaw).toBe(6);
    expect(profile.breakdown.raw.statusExcludedRawFlat).toBe(5);
    expect(profile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Powercharm', flat: 6, active: true }),
      expect.objectContaining({ skill: 'Food Attack Up', flat: 5, statusExcluded: true, active: true })
    ]));
  });

  it('applies food raw after percentages with the pre-trigger Guts attack bonus', () => {
    const profile = buildDamageProfile({
      skills: { 'Attack Boost': 5, Agitator: 5, Burst: 4 },
      setSkills: { "Ebony Odogaron's Power": 2, "Jin Dahaad's Revolt": 1 },
      setSkillPoints: { "Ebony Odogaron's Power": 4, "Jin Dahaad's Revolt": 2 },
      groupSkills: { "Lord's Soul": 1 },
      groupSkillPoints: { "Lord's Soul": 3 },
      conditions: {
        powercharm: true,
        food_attack_up: true,
        monster_enraged: true,
        burst_active: true,
        binding_counter_active: true
      },
      weaponBaseRaw: 257,
      weaponType: 'other',
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.raw.flatRaw).toBe(78);
    expect(profile.breakdown.raw.statusExcludedRawFlat).toBe(5);
    expect(profile.breakdown.raw.rawPercentBonus).toBe(0.09);
    expect(profile.breakdown.raw.postRawPercentBonus).toBe(0);
    expect(profile.breakdown.raw.postMultiplierRawFlat).toBe(20);
    expect(profile.breakdown.raw.effectiveRaw).toBeCloseTo(378.13);
  });

  it('preserves permanent raw conditions when filtering stale skill conditions', () => {
    const filtered = filterConditionsForSkills({
      powercharm: true,
      food_attack_up: true,
      frenzy_cured: true
    }, {});

    expect(filtered).toEqual({
      powercharm: true,
      food_attack_up: true
    });
  });

  it('models Burst Boost raw while Burst is active', () => {
    const inactiveProfile = buildDamageProfile({
      skills: {},
      setSkills: { "Ebony Odogaron's Power": 2 },
      setSkillPoints: { "Ebony Odogaron's Power": 4 },
      conditions: { burst_active: false },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });
    const activeProfile = buildDamageProfile({
      skills: {},
      setSkills: { "Ebony Odogaron's Power": 2 },
      setSkillPoints: { "Ebony Odogaron's Power": 4 },
      conditions: { burst_active: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(inactiveProfile.breakdown.raw.flatRaw).toBe(0);
    expect(activeProfile.breakdown.raw.flatRaw).toBe(18);
    expect(activeProfile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Burst Boost II', flat: 18, active: true })
    ]));
  });

  it("models Xu Wu's Vigor as conditional Protein Fiend raw", () => {
    const inactiveProfile = buildDamageProfile({
      skills: {},
      setSkills: { "Xu Wu's Vigor": 2 },
      setSkillPoints: { "Xu Wu's Vigor": 4 },
      conditions: { meat_item_used: false },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });
    const activeProfile = buildDamageProfile({
      skills: {},
      setSkills: { "Xu Wu's Vigor": 2 },
      setSkillPoints: { "Xu Wu's Vigor": 4 },
      conditions: { meat_item_used: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(inactiveProfile.breakdown.raw.flatRaw).toBe(0);
    expect(activeProfile.breakdown.raw.flatRaw).toBe(30);
    expect(activeProfile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Protein Fiend II', flat: 30, active: true })
    ]));
    expect(activeProfile.breakdown.unmodeledSkills).not.toContain("Xu Wu's Vigor");
  });

  it("shows Xu Wu's Vigor condition when the set bonus is selected", () => {
    const options = getConditionOptionsForSkills({ "Xu Wu's Vigor": 1 });

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'meat_item_used', displayLabel: 'Meat Item Used' })
    ]));
  });

  it("models Jin Dahaad's Revolt as conditional Binding Counter raw", () => {
    const inactiveProfile = buildDamageProfile({
      skills: {},
      setSkills: { "Jin Dahaad's Revolt": 2 },
      setSkillPoints: { "Jin Dahaad's Revolt": 4 },
      conditions: { binding_counter_active: false },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });
    const activeProfile = buildDamageProfile({
      skills: {},
      setSkills: { "Jin Dahaad's Revolt": 2 },
      setSkillPoints: { "Jin Dahaad's Revolt": 4 },
      conditions: { binding_counter_active: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(inactiveProfile.breakdown.raw.flatRaw).toBe(0);
    expect(activeProfile.breakdown.raw.flatRaw).toBe(50);
    expect(activeProfile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Binding Counter II', flat: 50, active: true })
    ]));
    expect(activeProfile.breakdown.unmodeledSkills).not.toContain("Jin Dahaad's Revolt");
  });

  it('models Gogmapocalypse as conditional Mutual Hostility element', () => {
    const inactiveProfile = buildDamageProfile({
      skills: {},
      setSkills: { Gogmapocalypse: 2 },
      setSkillPoints: { Gogmapocalypse: 4 },
      conditions: { monster_enraged: false },
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });
    const activeProfile = buildDamageProfile({
      skills: {},
      setSkills: { Gogmapocalypse: 2 },
      setSkillPoints: { Gogmapocalypse: 4 },
      conditions: { monster_enraged: true },
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });

    expect(inactiveProfile.breakdown.element.flatElement).toBe(0);
    expect(inactiveProfile.breakdown.element.elementPercentBonus).toBe(0);
    expect(activeProfile.breakdown.element.flatElement).toBe(40);
    expect(activeProfile.breakdown.element.elementPercentBonus).toBe(0.30);
    expect(activeProfile.breakdown.element.effectiveElement).toBe(430);
    expect(activeProfile.breakdown.element.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Mutual Hostility II', flat: 40, elementPercent: 0.30, active: true })
    ]));
    expect(activeProfile.breakdown.unmodeledSkills).not.toContain('Gogmapocalypse');
  });

  it('models Coalescence element multipliers by weapon type while active', () => {
    const lightProfile = buildDamageProfile({
      skills: { Coalescence: 3 },
      conditions: { coalescence_active: true },
      weaponType: 'other',
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });
    const heavyProfile = buildDamageProfile({
      skills: { Coalescence: 3 },
      conditions: { coalescence_active: true },
      weaponType: 'hammer_gunlance_switch_axe_charge_blade',
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });
    const inactiveProfile = buildDamageProfile({
      skills: { Coalescence: 3 },
      conditions: { coalescence_active: false },
      weaponType: 'great_sword_hunting_horn',
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });

    expect(lightProfile.breakdown.element.elementPercentBonus).toBe(0.15);
    expect(lightProfile.breakdown.element.effectiveElement).toBeCloseTo(345);
    expect(heavyProfile.breakdown.element.elementPercentBonus).toBe(0.30);
    expect(heavyProfile.breakdown.element.effectiveElement).toBe(390);
    expect(inactiveProfile.breakdown.element.elementPercentBonus).toBe(0);
    expect(inactiveProfile.breakdown.unmodeledSkills).not.toContain('Coalescence');
    expect(getConditionOptionsForSkills({ Coalescence: 1 })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'coalescence_active', displayLabel: 'Coalescence Active' })
    ]));
  });

  it('matches the six verified ranged attack-status values from the game', () => {
    const getStatus = ({ burst = false, adrenaline = false, agitator = false } = {}) => {
      const skills = {
        'Attack Boost': 1,
        ...(burst ? { Burst: 1 } : {}),
        ...(adrenaline ? { 'Adrenaline Rush': 1 } : {}),
        ...(agitator ? { Agitator: 5 } : {})
      };
      const conditions = {
        powercharm: true,
        food_attack_up: true,
        ...(burst ? { burst_active: true } : {}),
        ...(adrenaline ? { adrenaline_rush_active: true } : {}),
        ...(agitator ? { monster_enraged: true } : {})
      };
      const profile = buildDamageProfile({
        skills,
        setSkills: burst ? { "Ebony Odogaron's Power": 1 } : {},
        setSkillPoints: burst ? { "Ebony Odogaron's Power": 2 } : {},
        groupSkills: { "Lord's Soul": 1 },
        groupSkillPoints: { "Lord's Soul": 3 },
        conditions,
        weaponBaseRaw: 257,
        weaponType: 'ranged',
        weaponSharpness: 'White'
      });
      return profile.breakdown.raw.attackStatus;
    };

    expect(getStatus()).toBe(283);
    expect(getStatus({ burst: true })).toBe(297);
    expect(getStatus({ agitator: true })).toBe(303);
    expect(getStatus({ burst: true, adrenaline: true })).toBe(307);
    expect(getStatus({ burst: true, agitator: true })).toBe(317);
    expect(getStatus({ burst: true, adrenaline: true, agitator: true })).toBe(327);
  });

  it('recalculates an existing result immediately when conditions change', () => {
    const result = {
      skills: { 'Attack Boost': 1, Agitator: 5 },
      groupSkills: { "Lord's Soul": 1 },
      groupSkillPoints: { "Lord's Soul": 3 },
      weaponBaseRaw: 257,
      weaponType: 'ranged',
      weaponSharpness: 'White'
    };
    const inactive = recalculateResultDamage(result, {
      powercharm: true,
      food_attack_up: true
    });
    const active = recalculateResultDamage(result, {
      powercharm: true,
      food_attack_up: true,
      monster_enraged: true
    });

    expect(inactive.damageProfile.breakdown.raw.attackStatus).toBe(283);
    expect(active.damageProfile.breakdown.raw.attackStatus).toBe(303);
    expect(active.conditions.monster_enraged).toBe(true);
    expect(result.conditions).toBeUndefined();
  });

  it('models confirmed attack-specific damage multipliers', () => {
    const airborne = buildDamageProfile({
      skills: { Airborne: 1 },
      conditions: { airborne_attack: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'Yellow'
    });
    const normalShot = buildDamageProfile({
      skills: { 'Normal Shots': 1 },
      conditions: { normal_shot: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'Yellow'
    });
    const piercingShot = buildDamageProfile({
      skills: { 'Piercing Shots': 1 },
      conditions: { piercing_shot: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'Yellow'
    });
    const spreadShot = buildDamageProfile({
      skills: { 'Spread/Power Shots': 1 },
      conditions: { spread_power_shot: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'Yellow'
    });
    const rapidFireShot = buildDamageProfile({
      skills: { 'Rapid Fire Up': 1 },
      conditions: { rapid_fire_shot: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'Yellow'
    });

    expect(airborne.breakdown.raw.effectiveRaw).toBeCloseTo(220);
    expect(normalShot.breakdown.raw.effectiveRaw).toBeCloseTo(210);
    expect(piercingShot.breakdown.raw.effectiveRaw).toBeCloseTo(210);
    expect(spreadShot.breakdown.raw.effectiveRaw).toBeCloseTo(210);
    expect(rapidFireShot.breakdown.raw.effectiveRaw).toBeCloseTo(210);
    expect(airborne.breakdown.unmodeledSkills).not.toContain('Airborne');
    expect(normalShot.breakdown.unmodeledSkills).not.toContain('Normal Shots');
    expect(rapidFireShot.breakdown.unmodeledSkills).not.toContain('Rapid Fire Up');
    expect(getConditionOptionsForSkills({ 'Rapid Fire Up': 1 })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'rapid_fire_shot' })
    ]));
  });

  it('models Tetrad Shot affinity and bonus-shot raw separately', () => {
    const profile = buildDamageProfile({
      skills: { 'Tetrad Shot': 3 },
      conditions: { tetrad_affinity_active: true, tetrad_bonus_shot: true },
      weaponBaseRaw: 200,
      weaponBaseAffinity: 0,
      weaponSharpness: 'Yellow'
    });

    expect(profile.breakdown.raw.flatRaw).toBe(10);
    expect(profile.final_affinity).toBe(12);
    expect(profile.breakdown.unmodeledSkills).not.toContain('Tetrad Shot');
    expect(getConditionOptionsForSkills({ 'Tetrad Shot': 3 })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'tetrad_affinity_active' }),
      expect.objectContaining({ id: 'tetrad_bonus_shot' })
    ]));
  });

  it('multiplies independent elemental percentages before adding flat element', () => {
    const profile = buildDamageProfile({
      skills: { 'Dragon Attack': 3, Coalescence: 3, Burst: 5 },
      setSkills: { Gogmapocalypse: 1 },
      setSkillPoints: { Gogmapocalypse: 2 },
      conditions: {
        burst_active: true,
        coalescence_active: true,
        monster_enraged: true
      },
      weaponType: 'hammer_gunlance_switch_axe_charge_blade',
      weaponElementType: 'Dragon',
      weaponElementValue: 630,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.element.flatElement).toBe(220);
    expect(profile.breakdown.element.elementPercentMultipliers).toEqual([1.20, 1.30, 1.20]);
    expect(profile.breakdown.element.elementPercentMultiplier).toBeCloseTo(1.872);
    expect(profile.breakdown.element.effectiveElement).toBeCloseTo(1399.36);
  });

  it('caps element at the higher of 2.3x base or base plus 400', () => {
    const profile = buildDamageProfile({
      skills: { 'Dragon Attack': 3, Coalescence: 3, Burst: 5 },
      setSkills: { Gogmapocalypse: 2 },
      setSkillPoints: { Gogmapocalypse: 4 },
      conditions: {
        burst_active: true,
        coalescence_active: true,
        monster_enraged: true
      },
      weaponType: 'hammer_gunlance_switch_axe_charge_blade',
      weaponElementType: 'Dragon',
      weaponElementValue: 630,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.element.uncappedElement).toBeCloseTo(1517.64);
    expect(profile.breakdown.element.elementCap).toBeCloseTo(1449);
    expect(profile.breakdown.element.capApplied).toBe(true);
    expect(profile.breakdown.element.effectiveElement).toBeCloseTo(1449);
  });

  it('uses base plus 400 when it is higher than 2.3x base', () => {
    const profile = buildDamageProfile({
      skills: { 'Fire Attack': 3, Coalescence: 3 },
      conditions: { coalescence_active: true },
      weaponType: 'hammer_gunlance_switch_axe_charge_blade',
      weaponElementType: 'Fire',
      weaponElementValue: 200,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.element.elementCap).toBe(600);
    expect(profile.breakdown.element.capApplied).toBe(false);
  });

  it('models Convert Element dragon attack while active', () => {
    const profile = buildDamageProfile({
      skills: { 'Convert Element': 3 },
      conditions: { convert_element_active: true },
      weaponElementType: 'Dragon',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.element.flatElement).toBe(180);
    expect(profile.breakdown.element.effectiveElement).toBe(480);
    expect(profile.breakdown.unmodeledSkills).not.toContain('Convert Element');
  });

  it.each([
    ['great_sword_hunting_horn', 100],
    ['hammer_gunlance_switch_axe_charge_blade', 60],
    ['other', 60],
    ['dual_blades', 50],
    ['ranged', 50]
  ])('models Elemental Absorption level 3 for %s', (weaponType, expectedFlat) => {
    const profile = buildDamageProfile({
      skills: { 'Elemental Absorption': 3 },
      conditions: { elemental_absorption_active: true },
      weaponType,
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });

    const contribution = profile.breakdown.element.skillContributions.find(
      item => item.skill === 'Elemental Absorption'
    );
    expect(profile.breakdown.element.flatElement).toBe(expectedFlat);
    expect(contribution).toEqual(expect.objectContaining({
      durationSeconds: 120,
      cooldownSeconds: 60,
      active: true
    }));
    expect(profile.breakdown.unmodeledSkills).not.toContain('Elemental Absorption');
  });

  it("models Rathalos's Flare as a separate expected fire proc", () => {
    const levelOne = buildDamageProfile({
      setSkills: { "Rathalos's Flare": 1 },
      setSkillPoints: { "Rathalos's Flare": 2 },
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });
    const levelTwo = buildDamageProfile({
      setSkills: { "Rathalos's Flare": 2 },
      setSkillPoints: { "Rathalos's Flare": 4 },
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponSharpness: 'White'
    });

    expect(levelOne.breakdown.element.effectiveElement).toBe(300);
    expect(levelOne.proc_dps).toBeCloseTo(26.4);
    expect(levelTwo.proc_dps).toBeCloseTo(52.8);
    expect(levelTwo.breakdown.procs.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        skill: 'Scorcher II',
        fixedDamage: 40,
        fireDamage: 120,
        activationRate: 0.33
      })
    ]));
    expect(levelTwo.breakdown.procs.contributions[0].expectedDamage).toBeCloseTo(52.8);
    expect(levelTwo.breakdown.unmodeledSkills).not.toContain("Rathalos's Flare");
  });

  it('models Heroics and Ambush as conditional attack multipliers', () => {
    const profile = buildDamageProfile({
      skills: { Heroics: 5, Ambush: 3 },
      conditions: { heroics_active: true, ambush_active: true },
      weaponBaseRaw: 100,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.raw.rawPercentBonus).toBe(0.30);
    expect(profile.breakdown.raw.postRawPercentBonus).toBe(0.15);
    expect(profile.breakdown.raw.effectiveRaw).toBeCloseTo(149.5);
    expect(profile.breakdown.unmodeledSkills).not.toEqual(expect.arrayContaining(['Heroics', 'Ambush']));
  });

  it('models Powerhouse and Azure Bolt behind their activation conditions', () => {
    const profile = buildDamageProfile({
      setSkills: { "Doshaguma's Might": 2, "Leviathan's Fury": 2 },
      setSkillPoints: { "Doshaguma's Might": 4, "Leviathan's Fury": 4 },
      conditions: { powerhouse_active: true, azure_bolt_active: true },
      weaponBaseRaw: 100,
      weaponBaseAffinity: 0,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.raw.flatRaw).toBe(25);
    expect(profile.final_affinity).toBe(15);
    expect(profile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Powerhouse II', flat: 25, active: true })
    ]));
    expect(profile.breakdown.affinity.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Azure Bolt II', contribution: 15, active: true })
    ]));
    expect(getConditionOptionsForSkills({
      "Doshaguma's Might": 1,
      "Leviathan's Fury": 1
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'powerhouse_active' }),
      expect.objectContaining({ id: 'azure_bolt_active' })
    ]));
  });

  it('shows set bonus conditions for Binding Counter and Mutual Hostility', () => {
    const options = getConditionOptionsForSkills({
      "Jin Dahaad's Revolt": 1,
      Gogmapocalypse: 1
    });

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'binding_counter_active', displayLabel: 'Binding Counter Active' }),
      expect.objectContaining({ id: 'monster_enraged', displayLabel: 'Monster Enraged' })
    ]));
  });

  it("applies Lord's Soul Guts attack increase until Guts triggers", () => {
    const profile = buildDamageProfile({
      skills: {},
      groupSkills: { "Lord's Soul": 1 },
      groupSkillPoints: { "Lord's Soul": 3 },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.raw.rawPercentBonus).toBe(0.05);
    expect(profile.breakdown.raw.postRawPercentBonus).toBe(0);
    expect(profile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        skill: 'Guts (Tenacity)',
        sourceSkill: "Lord's Soul",
        rawPercent: 0.05,
        active: true
      })
    ]));

    const afterGuts = buildDamageProfile({
      skills: {},
      groupSkills: { "Lord's Soul": 1 },
      groupSkillPoints: { "Lord's Soul": 3 },
      conditions: { guts_triggered: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(afterGuts.breakdown.raw.postRawPercentBonus).toBe(0);
    expect(afterGuts.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Guts (Tenacity)', rawPercent: 0, active: false })
    ]));
  });

  it('matches the supplied War Cry I attack status capture', () => {
    const profile = buildDamageProfile({
      skills: {
        Agitator: 5,
        Counterstrike: 3,
        'Offensive Guard': 3,
        Burst: 1
      },
      setSkills: { "Jin Dahaad's Revolt": 1, "Blangonga's Spirit": 1 },
      setSkillPoints: { "Jin Dahaad's Revolt": 2, "Blangonga's Spirit": 2 },
      groupSkills: { "Lord's Soul": 1 },
      groupSkillPoints: { "Lord's Soul": 3 },
      conditions: {
        powercharm: true,
        food_attack_up: true,
        monster_enraged: true,
        counterstrike_active: true,
        offensive_guard_active: true,
        burst_active: true,
        binding_counter_active: true,
        war_cry_active: true
      },
      weaponBaseRaw: 257,
      weaponSharpness: 'Yellow'
    });

    expect(profile.breakdown.raw.flatRaw).toBe(76);
    expect(profile.breakdown.raw.rawPercentBonus).toBe(0.05);
    expect(profile.breakdown.raw.postRawPercentBonus).toBe(0.15);
    expect(profile.breakdown.raw.postMultiplierRawFlat).toBe(16);
    expect(profile.breakdown.raw.effectiveRaw).toBeCloseTo(413.7275);
  });

  it('models War Cry II as six post-multiplier true raw', () => {
    const profile = buildDamageProfile({
      setSkills: { "Blangonga's Spirit": 2 },
      setSkillPoints: { "Blangonga's Spirit": 4 },
      conditions: { war_cry_active: true },
      weaponBaseRaw: 200,
      weaponSharpness: 'Yellow'
    });

    expect(profile.breakdown.raw.postMultiplierRawFlat).toBe(6);
    expect(profile.breakdown.raw.effectiveRaw).toBe(206);
    expect(profile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'War Cry II', flat: 6 })
    ]));
  });

  it('models Burst raw and element by weapon type while active', () => {
    const otherProfile = buildDamageProfile({
      skills: { Burst: 5 },
      conditions: { burst_active: true },
      weaponType: 'other',
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });
    const greatSwordProfile = buildDamageProfile({
      skills: { Burst: 5 },
      conditions: { burst_active: true },
      weaponType: 'great_sword_hunting_horn',
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });
    const rangedProfile = buildDamageProfile({
      skills: { Burst: 5 },
      conditions: { burst_active: true },
      weaponType: 'ranged',
      weaponElementType: 'Fire',
      weaponElementValue: 300,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(otherProfile.breakdown.raw.flatRaw).toBe(0);
    expect(otherProfile.breakdown.raw.postMultiplierRawFlat).toBe(18);
    expect(otherProfile.breakdown.element.flatElement).toBe(140);
    expect(greatSwordProfile.breakdown.raw.flatRaw).toBe(0);
    expect(greatSwordProfile.breakdown.raw.postMultiplierRawFlat).toBe(18);
    expect(greatSwordProfile.breakdown.element.flatElement).toBe(200);
    expect(rangedProfile.breakdown.raw.flatRaw).toBe(0);
    expect(rangedProfile.breakdown.raw.postMultiplierRawFlat).toBe(10);
    expect(rangedProfile.breakdown.element.flatElement).toBe(120);
  });

  it('uses base crit weighting for positive affinity without Critical Boost', () => {
    const profile = buildDamageProfile({
      skills: {},
      weaponBaseAffinity: 80,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.raw.critExpectation).toBeCloseTo(1.2);
    expect(profile.final_crit_multiplier).toBe(1.25);
  });

  it('uses Critical Boost weighting for positive affinity', () => {
    const profile = buildDamageProfile({
      skills: { 'Critical Boost': 3 },
      weaponBaseAffinity: 95,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.raw.critExpectation).toBeCloseTo(1.323);
    expect(profile.final_crit_multiplier).toBe(1.34);
  });

  it('models negative affinity as critical failures', () => {
    const profile = buildDamageProfile({
      skills: { 'Critical Boost': 5 },
      weaponBaseAffinity: -30,
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.affinity.final).toBe(-30);
    expect(profile.breakdown.raw.critExpectation).toBeCloseTo(0.925);
    expect(profile.final_crit_multiplier).toBe(1.4);
  });
});
