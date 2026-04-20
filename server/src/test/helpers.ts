import { buildApp } from '../app.js';
import { store } from '../store/memory-store.js';

export function buildTestApp() {
  return buildApp({ logger: false });
}

export function resetStore(): void {
  store.reset();
}
