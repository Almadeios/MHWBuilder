import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendJsonProperty, applyArmorRecord } from '../lib/repositoryWriter.mjs';

test('appends a JSON property without rewriting existing records', () => {
    const source = '{\n    "Existing": {\n        "value": 1\n    }\n}\n';
    const output = appendJsonProperty(source, 'New Armor', { slots: [3] });
    assert.deepEqual(JSON.parse(output), {
        Existing: { value: 1 },
        'New Armor': { slots: [3] }
    });
    assert.ok(output.startsWith(source.slice(0, source.lastIndexOf('}')).trimEnd()));
});

test('rejects duplicate names unless overwrite is explicit', () => {
    const source = '{\n    "Existing": { "value": 1 }\n}\n';
    assert.throws(() => appendJsonProperty(source, 'Existing', { value: 2 }), /already exists/);
    assert.equal(JSON.parse(appendJsonProperty(source, 'Existing', { value: 2 }, true)).Existing.value, 2);
});

test('preserves CRLF when appending', () => {
    const source = '{\r\n    "Existing": 1\r\n}\r\n';
    const output = appendJsonProperty(source, 'Next', 2);
    assert.equal(output.includes('\r\n'), true);
    assert.equal(output.replaceAll('\r\n', '').includes('\n'), false);
});

test('applies one reviewed record to both repository databases', async() => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'armor-importer-'));
    const compactDirectory = path.join(root, 'src', 'data', 'compact');
    const detailedDirectory = path.join(root, 'src', 'data', 'detailed');
    await Promise.all([
        mkdir(compactDirectory, { recursive: true }),
        mkdir(detailedDirectory, { recursive: true })
    ]);
    await Promise.all([
        writeFile(path.join(compactDirectory, 'head.json'), '{}\n'),
        writeFile(path.join(detailedDirectory, 'head.json'), '{}\n')
    ]);
    try {
        await applyArmorRecord(root, {
            name: 'Test Helm', type: 'head', rarity: 8, rank: 'high', defense: 68,
            slots: [3], resistances: {}, skills: { Agitator: 1 }
        });
        const compact = JSON.parse(await readFile(path.join(compactDirectory, 'head.json')));
        const detailed = JSON.parse(await readFile(path.join(detailedDirectory, 'head.json')));
        assert.deepEqual(compact['Test Helm'][3], [3]);
        assert.equal(detailed['Test Helm'].skills.Agitator, 1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
