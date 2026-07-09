import {
  buildDamageProfile,
  filterConditionsForSkills,
  getConditionOptionsForSkills,
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
    expect(profile.breakdown.raw.statusExcludedRawFlat).toBe(8);
    expect(profile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Powercharm', flat: 6, active: true }),
      expect.objectContaining({ skill: 'Food Attack Up', flat: 8, statusExcluded: true, active: true })
    ]));
  });

  it('matches the 378 attack status raw category ordering', () => {
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

    expect(profile.breakdown.raw.rawPercentBonus).toBe(0.04);
    expect(profile.breakdown.raw.flatRaw).toBe(93);
    expect(profile.breakdown.raw.statusExcludedRawFlat).toBe(8);
    expect(profile.breakdown.raw.postRawPercentBonus).toBe(0.05);
    expect(profile.breakdown.raw.effectiveRaw).toBeCloseTo(378.294);
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

  it("models Lord's Soul as post raw percent", () => {
    const profile = buildDamageProfile({
      skills: {},
      groupSkills: { "Lord's Soul": 1 },
      groupSkillPoints: { "Lord's Soul": 3 },
      weaponBaseRaw: 200,
      weaponSharpness: 'White'
    });

    expect(profile.breakdown.raw.postRawPercentBonus).toBe(0.05);
    expect(profile.breakdown.raw.skillContributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'Guts (Tenacity)', postRawPercent: 0.05 })
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

    expect(otherProfile.breakdown.raw.flatRaw).toBe(18);
    expect(otherProfile.breakdown.element.flatElement).toBe(140);
    expect(greatSwordProfile.breakdown.raw.flatRaw).toBe(18);
    expect(greatSwordProfile.breakdown.element.flatElement).toBe(200);
    expect(rangedProfile.breakdown.raw.flatRaw).toBe(10);
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
