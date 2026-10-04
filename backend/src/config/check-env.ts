// Imported right after dotenv in index.ts, so the configuration is checked before any
// other module connects to anything or reads a secret.
import { validateConfigOrExit } from './env';

validateConfigOrExit();
