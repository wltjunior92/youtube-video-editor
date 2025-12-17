import { join } from "node:path";
import { IGlobalState } from "../../interfaces/globalState";
import { getMediaDuration } from "../../utils/getMediaDuration";

export async function generateChangeVideoSpeedCommand(inputPath: string, outputPath: string, currentState: IGlobalState) {
  const videoDuration = await getMediaDuration(inputPath);
  
  if (!currentState.path_name) throw new Error("Path name not found");
  const thumbPath = join(process.cwd(), 'references', currentState.path_name, 'thumbnail_vertical.png');

  const THUMB_DURATION = 3;
  const MAX_TOTAL_DURATION = 179;
  const TARGET_VIDEO_DURATION = MAX_TOTAL_DURATION - THUMB_DURATION; // 176s para o vídeo

  let speed = 1.0;
  if (videoDuration > TARGET_VIDEO_DURATION) {
    speed = videoDuration / TARGET_VIDEO_DURATION;
  }

  const speedStr = speed.toFixed(6);
  const filterParts: string[] = [];

  // 1. Processar Vídeo Principal (Acelerar se necessário)
  if (speed > 1.000001) {
    filterParts.push(`[0:v]setpts=PTS/${speedStr},setsar=1[v_main]`, `[0:a]atempo=${speedStr},aresample=44100[a_main]`);
  } else {
    filterParts.push(`[0:v]setsar=1[v_main]`, `[0:a]aresample=44100[a_main]`);
  }

  // 2. Processar Thumbnail (Imagem estática + Silêncio)
  filterParts.push(
    `[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[v_thumb]`,
    `anullsrc=channel_layout=stereo:sample_rate=44100:d=${THUMB_DURATION}[a_thumb]`
  );

  // 3. Concatenar
  filterParts.push(`[v_main][a_main][v_thumb][a_thumb]concat=n=2:v=1:a=1[v_out][a_out]`);

  const filterComplex = `"${filterParts.join(';')}"`;

  // Input 0: Vídeo | Input 1: Imagem (loop de 3s)
  return `ffmpeg -y -i "${inputPath}" -loop 1 -t ${THUMB_DURATION} -i "${thumbPath}" -filter_complex ${filterComplex} -map "[v_out]" -map "[a_out]" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 160k "${outputPath}"`;
}