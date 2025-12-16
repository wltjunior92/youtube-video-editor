import axios from "axios";
import { writeFile } from "node:fs/promises";
import { IGlobalState } from "../interfaces/globalState";
import { join } from "node:path";
import { checkFileExists } from "../utils/checkFileExists";

export async function generateNarration(speech: string, currentState: IGlobalState, sceneIdx: number, stageName: string, videoType: 'short' | 'long' ) {
  const { data } = await axios.post('https://api.minimax.io/v1/t2a_v2', {
    model: "speech-2.6-hd",
    text: speech,
    stream: false,
    language_boost: "Portuguese",
    output_format: "hex",
    voice_setting: {
      "voice_id": currentState.voice_id,
      "speed": 1,
      "vol": 1.9,
      "pitch": -1,
      "emotion": "disgusted",
      "text_normalization": true
    },
    pronunciation_dict: {
      tone: [
        "ex-/êz",
        "Ex-/Êz",
        "ex-chefe/êz chéfe",
        "EUA/Estados Unidos",
        "ONU/Nações Unidas",
        "coautor/kô-autor",
        "coautora/kô-autora",
        "cofundador/kô-fundador",
        "cofundadora/kô-fundadora",
        "IBGE/í-bê-gê-é",
        "FGTS/éfê-gê-tê-ésse",
        "INSS/í-êni-ésse-ésse",
        "CMN/cê-mê-nê",
        "BACEN/bá-sên",
        "Ibama/ibama",
        "FUNAI/funái",
        "Bolsonaro/bolssonáro",
        "Lula/lúla",
        "Moraes/moráis",
        "Lewandowski/levandófcski",
        "Dallagnol/dalanhól",
        "Guedes/guêdes",
        "Qatar/catar",
        "Chile/xíle",
        "Israel/izraél",
        "habeas/rábias",
        "corpus/córpus",
        "liminar/liminár",
        "inquérito/inquérto",
        "denúncia/denúnssia",
        "podcast/pód-quêst",
        "streaming/strí-mingue",
        "YouTube/iu-túbi",
        "TikTok/tíque-tóc",
        "WhatsApp/uótizápi",
        "etc/etecétera",
        "vis-à-vis/vizavi",
        "status/státus",
        "focus/fócus"
      ]
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1
    }
  }, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.HAILUO_MINIMAX_AUDIO_APIKEY}`
    }
  })
 
  const generatedAudioInHex = data.data.audio as string

  const cleanHex = generatedAudioInHex.replace(/\s+/g, '')
  const buffer = Buffer.from(cleanHex, 'hex');

  buffer.toString('base64');

  const fileName = `narracao_scene_${sceneIdx}.mp3`;

  const outDir = join(
      process.cwd(),
      'videos',
      'estourouNoticia',
      currentState.path_name!,
      videoType,
      stageName,
      'tmp',
    );
  
    const outFile = join(
      outDir,
      fileName,
    );

  await writeFile(outFile, buffer);
  const created = await checkFileExists(outFile)
  return created
}