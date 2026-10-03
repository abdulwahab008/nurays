/** Process lifecycle flags shared by the server, health checks and background work. */
let shuttingDown = false;

export function markShuttingDown() {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
