// Runs in the browser before the app starts (Next.js instrumentation-client hook).
import { initErrorReporting } from './lib/error-reporting';

initErrorReporting();
