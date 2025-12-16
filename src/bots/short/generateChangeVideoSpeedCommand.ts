import { getMediaDuration } from "../../utils/getMediaDuration";

export async function generateChangeVideoSpeedCommand(inputPath: string, outputPath: string) {
  const videoDuration = await getMediaDuration(inputPath);

  if (videoDuration > 180) {
    const speed = videoDuration / 179;
    const speedStr = speed.toFixed(6);

    return `ffmpeg -y -i "${inputPath}" -filter_complex "[0:v]setpts=PTS/${speedStr}[v];[0:a]atempo=${speedStr}[a]" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 160k "${outputPath}"`;
  }

  return `ffmpeg -y -i "${inputPath}" -c copy "${outputPath}"`;
}