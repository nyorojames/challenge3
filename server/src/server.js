import { app } from './app.js';
import { config } from './config.js';

app.listen(config.PORT, () => {
  console.log(`Duka Ledger API on http://localhost:${config.PORT}  (AI provider: ${config.AI_PROVIDER})`);
});
