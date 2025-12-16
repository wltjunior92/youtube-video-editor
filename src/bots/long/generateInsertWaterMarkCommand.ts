import { join } from 'node:path';

export function generateInsertWatermarkCommand(inputPath: string, outputPath: string) {
  const watermarkPath = join(process.cwd(), 'global', 'logo-pb.png');
  const filterComplex = `[1:v]scale=140:-1,format=rgba,colorchannelmixer=aa=0.20[logo];[0:v][logo]overlay=x='(W-w)/2 + (W-w)/2*0.8*sin(2*PI*t/17)':y='(H-h)/2 + (H-h)/2*0.8*cos(2*PI*t/23)'[vout]`;

  return `ffmpeg -y -i "${inputPath}" -i "${watermarkPath}" -filter_complex "${filterComplex}" -map "[vout]" -map 0:a? -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a copy "${outputPath}"`;
}