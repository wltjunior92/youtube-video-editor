import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IGlobalState } from '../interfaces/globalState';

export async function writeGlobalState(content: IGlobalState) {
  const filePath = join(process.cwd(), 'src', 'data', 'globalState.json');
  await writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
}