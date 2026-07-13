import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildArmorImport, buildCompactArmorEntry, buildDetailedArmorEntry, normalizeArmorRecord,
    validateArmorRecord
} from '../lib/armorRecord.mjs';

const reySandhelm = {
    name: 'Rey Sandhelm Gamma',
    type: 'head',
    rarity: 8,
    rank: 'high',
    defense: 68,
    slots: [3],
    resistances: { fire: 0, water: -2, thunder: 4, ice: -3, dragon: 0 },
    skills: { 'Weakness Exploit': 1, 'Maximum Might': 1, 'Stamina Surge': 1 },
    setSkills: ["Rey Dau's Voltage"],
    groupSkills: ["Lord's Soul"]
};

test('builds the compact armor schema used by the optimizer', () => {
    assert.deepEqual(buildCompactArmorEntry(reySandhelm), [
        'head',
        { 'Maximum Might': 1, 'Stamina Surge': 1, 'Weakness Exploit': 1 },
        ["Lord's Soul"],
        [3],
        68,
        [0, -2, 4, -3, 0],
        'high',
        ["Rey Dau's Voltage"]
    ]);
});

test('builds the detailed armor schema used by the interface', () => {
    assert.deepEqual(buildDetailedArmorEntry(reySandhelm), {
        defense: 68,
        description: '',
        dragonResistance: 0,
        fireResistance: 0,
        groupSkill: ["Lord's Soul"],
        iceResistance: -3,
        rank: 'high',
        rarity: 8,
        setSkill: ["Rey Dau's Voltage"],
        skills: { 'Maximum Might': 1, 'Stamina Surge': 1, 'Weakness Exploit': 1 },
        slots: [3],
        thunderResistance: 4,
        type: 'head',
        waterResistance: -2
    });
});

test('reports new references and exact-name duplicates before applying', () => {
    const result = validateArmorRecord(reySandhelm, {
        skills: ['Weakness Exploit', 'Maximum Might'],
        setSkills: [],
        groupSkills: ["Lord's Soul"],
        armorNames: ['Rey Sandhelm Gamma']
    });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.includes('New skill: Stamina Surge'));
    assert.ok(result.warnings.includes("New Set Bonus: Rey Dau's Voltage"));
    assert.ok(result.warnings.includes('An armor piece with this exact name already exists.'));
});

test('targets the matching compact and detailed armor files', () => {
    const output = buildArmorImport(reySandhelm);
    assert.equal(output.targetFiles.compact, 'src/data/compact/head.json');
    assert.equal(output.targetFiles.detailed, 'src/data/detailed/head.json');
});

test('stores Greek and written armor variants using canonical database names', () => {
    assert.equal(normalizeArmorRecord({ name: 'Test Helm α' }).name, 'Test Helm Alpha');
    assert.equal(normalizeArmorRecord({ name: 'Test Mail β+' }).name, 'Test Mail Beta+');
    assert.equal(normalizeArmorRecord({ name: 'Test Greaves gamma' }).name, 'Test Greaves Gamma');
});
