import { mkdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArmorImport, normalizeArmorRecord, validateArmorRecord } from './lib/armorRecord.mjs';
import { applyArmorRecord } from './lib/repositoryWriter.mjs';
import { scanArmorInbox } from './lib/inboxScanner.mjs';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolDirectory, '../..');

const usage = `
MHWBuilder Armor Importer

Usage:
  npm run armor-importer -- --input <armor.json>
  npm run armor-importer -- --input <armor.json> --apply
  npm run armor-importer -- --scan-inbox

Options:
  --apply                   Write to compact and detailed database files.
  --overwrite               Replace an existing armor entry with the same name.
  --allow-new-references    Allow unknown skills, Set Bonuses, or Group Skills.
  --scan-inbox              OCR all images in inbox and generate grouped drafts.
`;

const getArguments = argv => {
    const args = { apply: false, overwrite: false, allowNewReferences: false };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === '--input') { args.input = argv[++index]; }
        else if (argument === '--apply') { args.apply = true; }
        else if (argument === '--overwrite') { args.overwrite = true; }
        else if (argument === '--allow-new-references') { args.allowNewReferences = true; }
        else if (argument === '--scan-inbox') { args.scanInbox = true; }
        else if (argument === '--help' || argument === '-h') { args.help = true; }
        else { throw new Error(`Unknown argument: ${argument}`); }
    }
    return args;
};

const readJson = async relativePath => JSON.parse(
    await readFile(path.join(root, relativePath), 'utf8')
);

const loadReference = async type => {
    const [skills, setSkills, groupSkills, armor] = await Promise.all([
        readJson('src/data/compact/skills.json'),
        readJson('src/data/compact/set-skills.json'),
        readJson('src/data/compact/group-skills.json'),
        readJson(`src/data/compact/${type}.json`)
    ]);
    return {
        skills: Object.keys(skills),
        setSkills: Object.keys(setSkills),
        groupSkills: Object.keys(groupSkills),
        armorNames: Object.keys(armor)
    };
};

const loadScannerReference = async() => {
    const [skills, setSkills, groupSkills, ...armorTypes] = await Promise.all([
        readJson('src/data/compact/skills.json'),
        readJson('src/data/compact/set-skills.json'),
        readJson('src/data/compact/group-skills.json'),
        ...['head', 'chest', 'arms', 'waist', 'legs'].map(type =>
            readJson(`src/data/compact/${type}.json`)
        )
    ]);
    return {
        skills: Object.keys(skills),
        setSkills: Object.keys(setSkills),
        groupSkills: Object.keys(groupSkills),
        armorNames: armorTypes.flatMap(armor => Object.keys(armor)),
        armorSlots: Object.assign({}, ...armorTypes.map(armor => Object.fromEntries(
            Object.entries(armor).map(([name, data]) => [name, data[3] || []])
        )))
    };
};

const main = async() => {
    const args = getArguments(process.argv.slice(2));
    if (args.help || (!args.input && !args.scanInbox)) {
        console.log(usage.trim());
        process.exitCode = args.help ? 0 : 1;
        return;
    }
    if (args.scanInbox) {
        const result = await scanArmorInbox({
            inboxDirectory: path.join(toolDirectory, 'inbox'),
            draftsDirectory: path.join(toolDirectory, 'drafts', 'generated'),
            reference: await loadScannerReference(),
            onProgress: ({ current, total, imagePath }) =>
                console.log(`[${current}/${total}] OCR ${path.relative(root, imagePath)}`)
        });
        console.log(`Generated ${result.drafts.length} draft(s) from ${result.imageCount} image(s).`);
        result.drafts.forEach(({ draft, draftPath }) => {
            const review = draft._importer?.reviewRequired || [];
            console.log(`- ${path.relative(root, draftPath)}${review.length ? ` (review: ${review.join(', ')})` : ''}`);
        });
        return;
    }
    const inputPath = path.resolve(process.cwd(), args.input);
    const input = JSON.parse(await readFile(inputPath, 'utf8'));
    const reference = await loadReference(normalizeArmorRecord(input).type);
    const validation = validateArmorRecord(input, reference);
    validation.errors.forEach(message => console.error(`ERROR: ${message}`));
    validation.warnings.forEach(message => console.warn(`WARNING: ${message}`));
    const unknownReferences = validation.warnings.filter(message => message.startsWith('New '));
    if (!validation.valid) { throw new Error('Armor record validation failed.'); }
    if (unknownReferences.length && !args.allowNewReferences) {
        throw new Error('Unknown references require --allow-new-references and separate metadata review.');
    }
    const preview = buildArmorImport(validation.record);
    console.log(JSON.stringify(preview, null, 2));
    if (!args.apply) {
        console.log('\nPreview only. Re-run with --apply to update the repository.');
        return;
    }
    const result = await applyArmorRecord(root, validation.record, { overwrite: args.overwrite });
    console.log(`\nApplied ${result.record.name}:`);
    console.log(`- ${path.relative(root, result.compactPath)}`);
    console.log(`- ${path.relative(root, result.detailedPath)}`);
    const sourceImages = input._importer?.sourceImages || [];
    if (sourceImages.length) {
        const archiveDirectory = path.join(toolDirectory, 'processed',
            validation.record.name.replace(/[<>:"/\\|?*]/g, '_'));
        await mkdir(archiveDirectory, { recursive: true });
        for (const relativeImage of sourceImages) {
            const sourcePath = path.resolve(toolDirectory, 'inbox', relativeImage);
            const inboxRoot = path.resolve(toolDirectory, 'inbox');
            if (!sourcePath.startsWith(inboxRoot)) { continue; }
            await rename(sourcePath, path.join(archiveDirectory, path.basename(sourcePath)));
        }
        console.log(`- archived ${sourceImages.length} source image(s) in ${path.relative(root, archiveDirectory)}`);
    }
};

main().catch(error => {
    console.error(`Armor import failed: ${error.message}`);
    process.exitCode = 1;
});
