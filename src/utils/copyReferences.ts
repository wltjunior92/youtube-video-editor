import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function copyReferences(pathName: string) {
  const sourceDir = join('D:\\n8n_files\\assets\\noticias\\projects', pathName);
  const destDir = join(process.cwd(), 'references', pathName);

  await mkdir(destDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      await copyFile(join(sourceDir, entry.name), join(destDir, entry.name));
    }
  }
}