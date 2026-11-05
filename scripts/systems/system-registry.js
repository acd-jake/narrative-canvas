import { SystemAdapter } from "./system-adapter.js";
import { Pf2eSystemAdapter } from "./pf2e-system-adapter.js";
import { Coc7SystemAdapter } from "./coc7-system-adapter.js";

/** Add new system adapters to this list. */
const ADAPTER_CLASSES = [Pf2eSystemAdapter, Coc7SystemAdapter];

const adapters = new Map(ADAPTER_CLASSES.map(AdapterClass => [AdapterClass.systemId, new AdapterClass()]));
const fallback = new SystemAdapter();

/** Looks up the system adapter for the active or a named game system. */
export class SystemAdapters {
  /** @returns {SystemAdapter} Adapter for a system id; the generic adapter if none exists. */
  static get(systemId) {
    return adapters.get(String(systemId).toLowerCase()) ?? fallback;
  }

  /** @returns {SystemAdapter} Adapter for the running game system. */
  static current() {
    return this.get(game.system.id);
  }
}
