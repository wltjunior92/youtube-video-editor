import axios from "axios";

export const telegramBotApi = axios.create({
  baseURL: 'http://localhost:3333'
})