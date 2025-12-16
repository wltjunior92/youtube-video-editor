import { telegramBotApi } from "../lib/axios";

export async function notifyProgress({
  message,
  message_id,
  setProcessing,
}: {
  message: string
  message_id?: number
  setProcessing?: boolean
}): Promise<{ message_id: number }> {
  let id: number
  if (!message_id) {
    const { data } = await telegramBotApi.post('/notify', {
      message,
      processing_status: setProcessing
    })
    id = data.message_id
  } else {
    const { data } = await telegramBotApi.patch('/update', {
      message_id,
      message,
      processing_status: setProcessing
    })
    id = data.message_id
  }

  return {
    message_id: id
  }
}
