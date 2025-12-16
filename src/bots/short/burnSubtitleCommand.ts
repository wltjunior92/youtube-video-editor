import { join } from 'node:path';

export function burnSubtitleCommand(
  inputPath: string,
  outputPath: string,
  assPath: string
) {
  const fontsDir = join(process.cwd(), 'global');
  const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  const safeFontsDir = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:');

  return `ffmpeg -y -i "${inputPath}" -vf "ass='${safeAssPath}':fontsdir='${safeFontsDir}':original_size=1080x1920" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a copy "${outputPath}"`;
}