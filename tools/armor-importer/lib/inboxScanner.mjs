import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getArmorGroupKey, mergeArmorPartials, parseArmorOcr } from './imageTextParser.mjs';
import { recognizeArmorImage } from './windowsOcr.mjs';
import { reconcileDraftReferences } from './referenceMatcher.mjs';

const IMAGE_EXTENSIONS = new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);

const listImages = async directory => {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) { return listImages(entryPath); }
        return IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : [];
    }));
    return nested.flat().sort();
};

const slugify = value => value.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unidentified-armor';

export const scanArmorInbox = async({
    inboxDirectory, draftsDirectory, reference = {}, onProgress = () => {}
}) => {
    await mkdir(draftsDirectory, { recursive: true });
    const imagePaths = await listImages(inboxDirectory);
    const groups = new Map();
    for (let index = 0; index < imagePaths.length; index++) {
        const imagePath = imagePaths[index];
        onProgress({ current: index + 1, total: imagePaths.length, imagePath });
        const ocr = await recognizeArmorImage(imagePath);
        const relativeImage = path.relative(inboxDirectory, imagePath);
        const partial = reconcileDraftReferences(parseArmorOcr(ocr, relativeImage), reference);
        const key = getArmorGroupKey(partial, relativeImage);
        const group = groups.get(key) || [];
        group.push(partial);
        groups.set(key, group);
    }
    const drafts = [];
    for (const records of groups.values()) {
        const draft = reconcileDraftReferences(mergeArmorPartials(records), reference);
        const draftPath = path.join(draftsDirectory, `${slugify(draft.name)}.json`);
        await writeFile(draftPath, `${JSON.stringify(draft, null, 4)}\n`, 'utf8');
        drafts.push({ draft, draftPath });
    }
    return { imageCount: imagePaths.length, drafts };
};
