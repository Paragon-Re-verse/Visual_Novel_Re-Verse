import { MODULE_ID } from "./constants.js";
import { RelationsOverlay } from "./apps/relations-overlay.js";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "data", {
    scope: "world",
    config: false,
    type: Object,
    default: {
      factions: [],
      factionLinks: [],
      characters: [],
      characterLinks: []
    },
    onChange: () => {
      // World settings sync to every client automatically; just re-draw if the
      // overlay for this client is currently open.
      const app = RelationsOverlay.instance;
      if (app?.rendered) app._draw();
    }
  });

  game.keybindings.register(MODULE_ID, "openMap", {
    name: "FACTIONREL.OpenMap",
    editable: [],
    onDown: () => {
      RelationsOverlay.open();
      return true;
    }
  });
});

Hooks.on("getSceneControlButtons", (controls) => {
  const tool = {
    name: MODULE_ID,
    title: "FACTIONREL.OpenMap",
    icon: "fa-solid fa-diagram-project",
    button: true,
    visible: true,
    onClick: () => RelationsOverlay.open(),
    onChange: () => RelationsOverlay.open()
  };

  // Foundry v13 has shipped both an array-of-groups and an object-of-groups
  // shape for this hook across builds; handle both defensively.
  if (Array.isArray(controls)) {
    const tokenGroup = controls.find((c) => c.name === "token" || c.name === "tokens");
    if (!tokenGroup) return;
    if (Array.isArray(tokenGroup.tools)) tokenGroup.tools.push(tool);
    else if (tokenGroup.tools) tokenGroup.tools[tool.name] = tool;
  } else if (controls && typeof controls === "object") {
    const tokenGroup = controls.tokens ?? controls.token;
    if (!tokenGroup) return;
    if (Array.isArray(tokenGroup.tools)) tokenGroup.tools.push(tool);
    else if (tokenGroup.tools) tokenGroup.tools[tool.name] = tool;
  }
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      open: () => RelationsOverlay.open()
    };
  }
  console.log(`${MODULE_ID} | ready`);
});
