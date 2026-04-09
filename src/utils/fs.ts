import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

export async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

export async function readJsonLines<T>(filePath: string): Promise<T[]> {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .flatMap((line) => {
                try {
                    return [JSON.parse(line) as T];
                } catch {
                    return [];
                }
            });
    } catch {
        return [];
    }
}

export async function atomicWriteText(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
}

export async function atomicWriteJson<T>(filePath: string, value: T): Promise<void> {
    await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function copyFilePreservingLayout(
    sourcePath: string,
    destinationRoot: string
): Promise<string> {
    const relativePath = sourcePath.replace(/^([A-Za-z]:)?\//, '').replace(/:/g, '_');
    const destinationPath = path.join(destinationRoot, relativePath);
    await ensureDir(path.dirname(destinationPath));
    await fs.copyFile(sourcePath, destinationPath);
    return destinationPath;
}

export async function removeFileIfExists(filePath: string): Promise<void> {
    try {
        await fs.rm(filePath, { force: true });
    } catch {
        // ignore
    }
}
