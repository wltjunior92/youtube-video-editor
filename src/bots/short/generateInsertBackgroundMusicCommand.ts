import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { IGlobalState } from "../../interfaces/globalState";
import { getMediaDuration } from "../../utils/getMediaDuration";
import { updateGlobalState } from "../../data/update";

const CROSSFADE_SEC = 1;
const BG_VOLUME = 0.10;
const MAIN_VOLUME = 1.0;

export async function generateInsertBackgroundMusicCommand(inputPath: string, outputPath: string, currentState: IGlobalState, videoDuration: number) {
  if (!currentState.path_name) throw new Error("Path name not found");

  const musicDir = join(process.cwd(), "global", "musicas");
  const files = await readdir(musicDir);
  const musics = files.filter((file) => file.endsWith(".mp3"));

  const musicsWithDuration = await Promise.all(
    musics.map(async (name) => {
      const path = join(musicDir, name);
      const duration = await getMediaDuration(path);
      return { name, duration, path };
    })
  );

  const validMusics = musicsWithDuration.filter((m) => m.duration > 0);

  const selectedMusics: typeof validMusics = [];
  let currentDuration = 0;

  while (currentDuration < videoDuration) {
    const randomIndex = Math.floor(Math.random() * validMusics.length);
    const music = validMusics[randomIndex];

    if (selectedMusics.length > 0 && selectedMusics[selectedMusics.length - 1].name === music.name && validMusics.length > 1) {
      continue;
    }

    selectedMusics.push(music);
    currentDuration += music.duration;
  }

  await updateGlobalState({
    selectedMusic: {
      ...currentState.selectedMusic,
      short: selectedMusics
    }
  })

  const bgInputParts = selectedMusics.map((m) => `-i "${m.path}"`).join(" ");

  const filterParts: string[] = [];
  const n = selectedMusics.length;

  filterParts.push(`[1:a]anull[bg0]`);

  if (n > 1) {
    for (let i2 = 2; i2 <= n; i2++) {
      const prev = `bg${i2 - 2}`;
      const nextIn = `${i2}:a`;
      const out = `bg${i2 - 1}`;
      filterParts.push(
        `[${prev}][${nextIn}]acrossfade=d=${CROSSFADE_SEC}:c1=tri:c2=tri[${out}]`
      );
    }
  }

  const bgFinalLabel = `bg${n - 1}`;

  filterParts.push(
    `[${bgFinalLabel}]volume=${BG_VOLUME},atrim=0:${videoDuration.toFixed(
      3
    )},asetpts=PTS-STARTPTS[bgv]`,
    `[0:a]volume=${MAIN_VOLUME},atrim=0:${videoDuration.toFixed(
      3
    )},asetpts=PTS-STARTPTS[main]`,
    `[main][bgv]amix=inputs=2:normalize=0:duration=first[aout]`
  );

  const filterComplex = `"${filterParts.join(";")}"`;

  const ffmpegCmd =
    `ffmpeg -y ` +
    `-i "${inputPath}" ` +
    `${bgInputParts} ` +
    `-filter_complex ${filterComplex} ` +
    `-map 0:v -map "[aout]" ` +
    `-c:v copy ` +
    `-c:a aac -b:a 160k ` +
    `"${outputPath}"`;

  return { ffmpegCmd, usedTracks: selectedMusics };
}