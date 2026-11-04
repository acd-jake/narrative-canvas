import { SystemAdapter } from "./system-adapter.js";

export class Pf2eSystemAdapter extends SystemAdapter {
  static systemId = "pf2e";

  get readAloudClass() {
    return "narrative";
  }

  get raisedDialogHooks() {
    return ["renderCheckModifiersDialog", "renderRollModifiersDialog"];
  }
}
