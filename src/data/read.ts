import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IGlobalState } from '../interfaces/globalState';

export async function readGlobalState() {
  const filePath = join(process.cwd(), 'src', 'data', 'globalState.json');
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as IGlobalState;
}