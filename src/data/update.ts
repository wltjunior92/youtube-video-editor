import { IGlobalState } from '../interfaces/globalState';
import { readGlobalState } from './read';
import { writeGlobalState } from './write';

export async function updateGlobalState(updates: Partial<IGlobalState>) {
  const currentState = await readGlobalState();
  const updatedState = { ...currentState, ...updates };
  await writeGlobalState(updatedState);
  return updatedState;
}