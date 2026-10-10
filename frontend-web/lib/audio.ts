/**
 * The browser's audio engine, for the sound that tells someone about a new order or a cancellation, or null where there
 * is none (before Safari 14.1 it is called webkitAudioContext).
 */
export function newAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Engine = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Engine ? new Engine() : null;
}
