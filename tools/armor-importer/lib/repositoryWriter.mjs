import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCompactArmorEntry, buildDetailedArmorEntry, normalizeArmorRecord } from './armorRecord.mjs';

const getNewline = text => text.includes('\r\n') ? '\r\n' : '\n';

export const appendJsonProperty = (source, name, value, overwrite = false) => {
    const parsed = JSON.parse(source);
    if (Object.prototype.hasOwnProperty.call(parsed, name) && !overwrite) {
        throw new Error(`Entry already exists: ${name}. Use --overwrite to replace it.`);
    }
    if (overwrite) {
        parsed[name] = value;
        return `${JSON.stringify(parsed, null, 4)}${getNewline(source)}`;
    }
    const newline = getNewline(source);
    const closingIndex = source.lastIndexOf('}');
    if (closingIndex < 0) { throw new Error('Target JSON does not contain a root object.'); }
    const propertyLines = JSON.stringify({ [name]: value }, null, 4)
        .split('\n').slice(1, -1).join(newline);
    const beforeClosing = source.slice(0, closingIndex).trimEnd();
    const separator = Object.keys(parsed).length ? ',' : '';
    return `${beforeClosing}${separator}${newline}${propertyLines}${newline}}${newline}`;
};

const replaceFile = async(filePath, contents) => {
    const temporaryPath = `${filePath}.armor-importer.tmp`;
    await writeFile(temporaryPath, contents, 'utf8');
    await rename(temporaryPath, filePath);
};

export const applyArmorRecord = async(root, input, { overwrite = false } = {}) => {
    const record = normalizeArmorRecord(input);
    const compactPath = path.join(root, 'src', 'data', 'compact', `${record.type}.json`);
    const detailedPath = path.join(root, 'src', 'data', 'detailed', `${record.type}.json`);
    const [compactSource, detailedSource] = await Promise.all([
        readFile(compactPath, 'utf8'), readFile(detailedPath, 'utf8')
    ]);
    const compactOutput = appendJsonProperty(
        compactSource, record.name, buildCompactArmorEntry(record), overwrite
    );
    const detailedOutput = appendJsonProperty(
        detailedSource, record.name, buildDetailedArmorEntry(record), overwrite
    );
    try {
        await replaceFile(compactPath, compactOutput);
        await replaceFile(detailedPath, detailedOutput);
    } catch (error) {
        await Promise.all([
            writeFile(compactPath, compactSource, 'utf8'),
            writeFile(detailedPath, detailedSource, 'utf8')
        ]);
        throw error;
    }
    return { compactPath, detailedPath, record };
};
