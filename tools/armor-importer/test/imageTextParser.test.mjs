import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeArmorPartials, parseArmorOcr } from '../lib/imageTextParser.mjs';
import { matchKnownName, reconcileDraftReferences } from '../lib/referenceMatcher.mjs';

const statsScreen = {
    text: `Equipment Info
Rey Sandhelm γ
Lv 1/10 Rarity 8
Defense 68
Slots
Fire Res 0
Water Res -2
Thunder Res 4
Ice Res -3
Dragon Res 0
Equipment Skills
Weakness Exploit Lv 1
Maximum Might Lv 1
Stamina Surge Lv 1
Set Bonus Skills
Rey Dau's Voltage
2 Thunderous Roar I
4 Thunderous Roar II`
};

const groupScreen = {
    text: `Equipment Info
Rey Sandhelm γ
Lv 1/10 Rarity 8
Group Skills
Lord's Soul
3 Guts (Tenacity)`
};

test('parses armor statistics and normalizes the gamma variant', () => {
    const parsed = parseArmorOcr(statsScreen, 'rey-sandhelm-1.png');
    assert.equal(parsed.name, 'Rey Sandhelm Gamma');
    assert.equal(parsed.type, 'head');
    assert.equal(parsed.rarity, 8);
    assert.equal(parsed.defense, 68);
    assert.deepEqual(parsed.resistances, { fire: 0, water: -2, thunder: 4, ice: -3, dragon: 0 });
    assert.deepEqual(parsed.skills, {
        'Weakness Exploit': 1,
        'Maximum Might': 1,
        'Stamina Surge': 1
    });
    assert.deepEqual(parsed.setSkills, ["Rey Dau's Voltage"]);
});

test('recognizes alpha, beta, and gamma symbols in screenshots', () => {
    assert.equal(parseArmorOcr({ text: 'Equipment Info\nTest Helm α' }).name, 'Test Helm Alpha');
    assert.equal(parseArmorOcr({ text: 'Equipment Info\nTest Mail β' }).name, 'Test Mail Beta');
    assert.equal(parseArmorOcr({ text: 'Equipment Info\nTest Greaves γ' }).name, 'Test Greaves Gamma');
});

test('merges separate stats and group-skill screenshots into one draft', () => {
    const merged = mergeArmorPartials([
        parseArmorOcr(statsScreen, 'rey-sandhelm-1.png'),
        parseArmorOcr(groupScreen, 'rey-sandhelm-2.png')
    ]);
    assert.deepEqual(merged.groupSkills, ["Lord's Soul"]);
    assert.deepEqual(merged._importer.sourceImages, [
        'rey-sandhelm-1.png', 'rey-sandhelm-2.png'
    ]);
    assert.deepEqual(merged._importer.reviewRequired, ['slots']);
});

test('only accepts an explicitly OCR-readable slot level', () => {
    const parsed = parseArmorOcr({ text: 'Equipment Info\nTest Helm\nSlots 3' });
    assert.deepEqual(parsed.slots, [3]);
});

test('accepts noisy section headings emitted by OCR', () => {
    const parsed = parseArmorOcr({
        text: 'Equipment Info\nTest Coil\ne Equipment Skills\nBurst Lv 1\ne Set Bonus Skills v\n' +
            'Gogmapocalypse\nGroup Skills\nLord\'s Soul\n3 Guts (Tenacity)\nRarity 8'
    });
    assert.deepEqual(parsed.skills, { Burst: 1 });
    assert.deepEqual(parsed.setSkills, ['Gogmapocalypse']);
    assert.deepEqual(parsed.groupSkills, ["Lord's Soul"]);
});

test('reconciles harmless OCR spacing and capitalization against known references', () => {
    assert.equal(matchKnownName('Aquatic/ Oilsilt Mobility', ['Aquatic/Oilsilt Mobility']),
        'Aquatic/Oilsilt Mobility');
    assert.equal(matchKnownName('Rey Sandhelm γ', ['Rey Sandhelm Gamma']), 'Rey Sandhelm Gamma');
    const reconciled = reconcileDraftReferences({
        name: 'Rey Sandhelm Gamma',
        skills: { 'Latent power': 1 },
        setSkills: ["Rey D au's Voltage"],
        groupSkills: []
    }, {
        armorNames: ['Rey Sandhelm Gamma'],
        skills: ['Latent Power'],
        setSkills: ["Rey Dau's Voltage"],
        groupSkills: []
    });
    assert.deepEqual(reconciled.skills, { 'Latent Power': 1 });
    assert.deepEqual(reconciled.setSkills, ["Rey Dau's Voltage"]);
});

test('uses known armor slots to validate calibration screenshots', () => {
    const reconciled = reconcileDraftReferences({
        name: 'Rey Sandhelm γ',
        slots: [],
        skills: {},
        setSkills: [],
        groupSkills: [],
        _importer: { reviewRequired: [] }
    }, {
        armorNames: ['Rey Sandhelm Gamma'],
        armorSlots: { 'Rey Sandhelm Gamma': [3] },
        skills: [],
        setSkills: [],
        groupSkills: []
    });
    assert.deepEqual(reconciled.slots, [3]);
    assert.equal(reconciled._importer.slotsSource, 'existing-record-validation');
});
