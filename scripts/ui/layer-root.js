const ROOT_ID = "nc-layer-root";

/** Single container for all module layers; only this element is ordered against Foundry's windows. */
export class LayerRoot {
  static append(node) {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    root.appendChild(node);
  }

  static removeIfEmpty() {
    const root = document.getElementById(ROOT_ID);
    if (root && !root.firstElementChild) root.remove();
  }
}
