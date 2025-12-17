import axios from "axios";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { IGlobalState } from "../interfaces/globalState";

export async function generateTranscription(currentState: IGlobalState, videoType: 'short' | 'long') {
  if (!currentState.path_name) throw new Error("Path name not found");

  const filePath = join(process.cwd(), 'videos', 'estourouNoticia', currentState.path_name, videoType, 'tmp', `${videoType}_audio_para_transcricao.mp3`);
  const file = await readFile(filePath);
  const blob = new Blob([file], { type: 'audio/mpeg' });

  const formData = new FormData();
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json');
  formData.append('file', blob, `${videoType}_audio_para_transcricao.mp3`);
  formData.append('timestamp_granularities[]', 'segment');
  formData.append('timestamp_granularities[]', 'word');

  const { data } = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_APIKEY}`
    }
  });

  return data;
}