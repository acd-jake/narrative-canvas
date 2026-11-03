import { NarrativeSettings } from "./settings.js";
import { NarrativeSceneRepository } from "./scene-repository.js";

/** Persists and reconciles the active narrative state. */
export class NarrativeActiveStateStore {
  /**
   * @param {{ addHandoutImageOverlay: (image: object, overlays: object[]) => object[] }} dependencies
   */
  constructor({ addHandoutImageOverlay }) {
    this.addHandoutImageOverlay = addHandoutImageOverlay;
  }

  async persist(state) {
    if (!game.user.isGM) return;

    const payload = {
      activeSceneId: state.activeSceneId || "",
      background: state.background || "",
      handoutImage: state.handoutImage || "",
      handoutImageOverlays: (state.handoutImageOverlays || []).map((overlay, index) => ({
        id: overlay.id,
        src: overlay.src,
        title: overlay.title || "",
        description: overlay.description || "",
        showDescription: overlay.showDescription === true,
        size: Number.isFinite(overlay.size) ? Math.max(0.25, Math.min(1.5, overlay.size)) : 1,
        ...(Number.isFinite(overlay.position?.x) && Number.isFinite(overlay.position?.y)
          ? { position: { x: overlay.position.x, y: overlay.position.y } }
          : {}),
        zOrder: Number.isFinite(overlay.zOrder) ? overlay.zOrder : index
      })),
      activeActors: (state.activeActors || []).map(actor => ({
        id: actor.id,
        name: actor.name,
        img: actor.img,
        showName: actor.showName !== false
      })),
      activeSpeakerId: state.activeSpeakerId || null
    };

    await NarrativeSettings.saveActiveState(payload);
  }

  /** Restores saved state and validates references against the current scenes. */
  restore(state) {
    const saved = NarrativeSettings.getActiveState();
    if (!saved || typeof saved !== "object") return;

    const scenes = NarrativeSceneRepository.getAll();
    let validatedSceneId = "";
    let validatedSceneData = null;

    if (saved.activeSceneId) {
      validatedSceneData = scenes.find(scene => scene.id === saved.activeSceneId) || null;
      if (validatedSceneData) {
        validatedSceneId = validatedSceneData.id;
      }
    }

    const savedHandoutImage = saved.handoutImage
      || (saved.backgroundDisplayMode === "journal" ? saved.background : "");
    let validatedBackground = "";
    if (typeof saved.background === "string" && saved.background.trim()) {
      if (saved.backgroundDisplayMode === "journal") {
        validatedBackground = "";
      } else if (validatedSceneData?.backgrounds?.length) {
        const bgExists = validatedSceneData.backgrounds.some(bg => bg.path === saved.background);
        if (bgExists) {
          validatedBackground = saved.background;
        }
      } else {
        validatedBackground = saved.background;
      }
    }

    const validatedHandoutImage = validatedSceneData?.handoutImages?.length
      ? validatedSceneData.handoutImages.some(image => image.path === savedHandoutImage) ? savedHandoutImage : ""
      : savedHandoutImage;

    let validatedActors = [];
    if (Array.isArray(saved.activeActors) && saved.activeActors.length) {
      if (validatedSceneData?.actors?.length) {
        const sceneActorMap = new Map(validatedSceneData.actors.map(actor => [actor.id, actor]));
        for (const savedActor of saved.activeActors) {
          const matched = sceneActorMap.get(savedActor.id);
          if (matched) {
            validatedActors.push({
              id: matched.id,
              name: matched.name,
              img: matched.img,
              showName: matched.showName !== false
            });
          }
        }
      } else if (!saved.activeSceneId) {
        validatedActors = saved.activeActors
          .filter(actor => typeof actor?.id === "string" && typeof actor.img === "string")
          .map(actor => ({
            id: actor.id,
            name: typeof actor.name === "string" ? actor.name : "",
            img: actor.img,
            showName: actor.showName !== false
          }));
      }
    }

    let validatedSpeakerId = null;
    if (saved.activeSpeakerId && validatedActors.some(actor => actor.id === saved.activeSpeakerId)) {
      validatedSpeakerId = saved.activeSpeakerId;
    }

    state.activeSceneId = validatedSceneId;
    state.currentSceneData = validatedSceneData;
    state.background = validatedBackground;
    state.handoutImage = validatedHandoutImage;
    if (Array.isArray(saved.handoutImageOverlays)) {
      state.handoutImageOverlays = saved.handoutImageOverlays
        .filter(overlay => typeof overlay?.src === "string" && overlay.src.trim())
        .map((overlay, index) => {
          const sceneImage = validatedSceneData?.handoutImages
            ?.find(image => image.path === overlay.src);
          const x = Number(overlay.position?.x);
          const y = Number(overlay.position?.y);
          const hasPosition = Number.isFinite(x) && Number.isFinite(y);

          return {
            id: typeof overlay.id === "string" ? overlay.id : `restored-handout-${index}`,
            src: overlay.src,
            title: sceneImage?.name || overlay.title || "",
            description: sceneImage?.description || overlay.description || "",
            showDescription: sceneImage
              ? sceneImage.showDescription === true
              : overlay.showDescription === true,
            size: Number.isFinite(Number(overlay.size))
              ? Math.max(0.25, Math.min(1.5, Number(overlay.size)))
              : 1,
            ...(hasPosition ? { position: { x, y } } : {}),
            zOrder: Number.isFinite(overlay.zOrder) ? overlay.zOrder : index
          };
        });
    } else {
      state.handoutImageOverlays = [];
      const restoredHandout = validatedSceneData?.handoutImages
        ?.find(image => image.path === validatedHandoutImage);
      if (restoredHandout) {
        state.handoutImageOverlays = this.addHandoutImageOverlay({
          src: restoredHandout.path,
          title: restoredHandout.name || "",
          description: restoredHandout.description || "",
          showDescription: restoredHandout.showDescription === true
        }, state.handoutImageOverlays);
      }
    }
    state.activeActors = validatedActors;
    state.activeSpeakerId = validatedSpeakerId;
  }
}