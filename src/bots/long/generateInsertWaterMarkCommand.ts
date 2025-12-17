import { join } from 'node:path';

export function generateInsertWatermarkCommand(inputPath: string, outputPath: string) {
  const watermarkPath = join(process.cwd(), 'global', 'logo.png');
  const filterComplex = `[1:v]scale=120:-1[logo];[0:v][logo]overlay=10:10[vout]`;

  return `ffmpeg -y -i "${inputPath}" -i "${watermarkPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a copy "${outputPath}"`;
}