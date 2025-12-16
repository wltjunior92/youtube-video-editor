export function extractAudioCommand(inputPath: string, outputPath: string) {
  return `ffmpeg -y -i "${inputPath}" -vn -acodec libmp3lame -b:a 160k "${outputPath}"`;
}