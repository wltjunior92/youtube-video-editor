import { spawn } from 'node:child_process';
import { notifyProgress } from './notifyProgress';

export function executeFfmpegCommand(command: string, duration: number, prefix: string, messageId?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, { shell: true });

    let lastPercentage = 0;
    let errorLog = '';

    process.stderr.on('data', (data) => {
      const output = data.toString();
      errorLog += output;
      const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      
      if (timeMatch && duration > 0) {
        const hours = parseFloat(timeMatch[1]);
        const minutes = parseFloat(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        
        const percentage = Math.round((currentTime / duration) * 100);
        
        if (percentage >= lastPercentage + 10) {
          lastPercentage = percentage;
          notifyProgress({
            message: `${prefix} ${percentage}%`,
            message_id: messageId,
          }).catch(() => {});
        }
      }
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`FFmpeg exited with code ${code}: ${errorLog}`)
        );
      }
    });
  });
}