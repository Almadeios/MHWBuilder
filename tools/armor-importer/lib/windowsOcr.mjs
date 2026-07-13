import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const directory = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(directory, '../scripts/windows-ocr.ps1');

export const recognizeArmorImage = async imagePath => {
    if (process.platform !== 'win32') {
        throw new Error('The bundled OCR adapter currently requires Windows.');
    }
    const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ImagePath', imagePath
    ], { maxBuffer: 10 * 1024 * 1024, windowsHide: true });
    const json = Buffer.from(stdout.trim(), 'base64').toString('utf8');
    return JSON.parse(json);
};
