import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IGlobalState } from '../interfaces/globalState';

export async function resetGlobalState() {
  const content: IGlobalState = {
    voice_id: 'English_Insightful_Speaker',
    g_googledrive_dir: '1fQNNQClgmLUhRNYG0srYH14cRtIr07IO',
  }
  const filePath = join(process.cwd(), 'src', 'data', 'globalState.json');
  await writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
}