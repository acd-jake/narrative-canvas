import { SystemAdapter } from "./system-adapter.js";

export class Coc7SystemAdapter extends SystemAdapter {
  static systemId = "coc7";

  get readAloudClass() {
    return "keeper-read-aloud";
  }
}
