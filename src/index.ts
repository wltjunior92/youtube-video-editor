import { app } from "./app";

try {
  process.loadEnvFile();
} catch {
  // .env file not found
}

const port = Number(process.env.PORT) || 3000;

app
  .listen({
    host: '0.0.0.0',
    port,
  })
  .then(() => console.log(`HTTP server running on port ${port} 👍`))