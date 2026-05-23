import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp({ seed: true });

app.listen(port, () => {
  console.log(`[server] LedgerPilot API listening on http://localhost:${port}`);
});
