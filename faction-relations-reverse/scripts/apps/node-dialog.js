import { openHexPicker } from "./hex-picker.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/** Human-readable summary of a character's stored hex position, for the Position button. */
function describeHex(hex, allFactions) {
  if (!hex) return game.i18n.localize("FACTIONREL.PositionNotSet");
  const faction = allFactions?.find((f) => f.id === hex.faction);
  const factionName = faction ? faction.name : "?";
  return game.i18n.format("FACTIONREL.PositionSummary", {
    faction: factionName,
    col: hex.col + 1,
    row: hex.row + 1
  });
}

function buildFormHtml({ isFaction, node, allFactions }) {
  const n = node ?? {};

  const specificFields = isFaction
    ? `
    <div class="form-group">
      <label>${game.i18n.localize("FACTIONREL.ShortName")}</label>
      <input type="text" name="shortName" value="${esc(n.shortName)}"/>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("FACTIONREL.Color")}</label>
      <input type="color" name="color" value="${esc(n.color || "#8899aa")}"/>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("FACTIONREL.MemberCount")}</label>
      <input type="number" min="0" step="1" name="memberCount" value="${Number(n.memberCount) || 0}"/>
    </div>`
    : `
    <div class="form-group">
      <label>${game.i18n.localize("FACTIONREL.Code")}</label>
      <input type="text" name="code" value="${esc(n.code)}"/>
    </div>
    <div class="form-group frel-img-row">
      <label>${game.i18n.localize("FACTIONREL.Image")}</label>
      <input type="text" name="img" value="${esc(n.img)}"/>
      <button type="button" class="frel-pick-img" title="${game.i18n.localize("FACTIONREL.Image")}">
        <i class="fa-solid fa-file-image"></i>
      </button>
    </div>
    <div class="form-group frel-position-row">
      <label>${game.i18n.localize("FACTIONREL.Position")}</label>
      <button type="button" class="frel-position-btn">
        <span class="frel-position-summary">${esc(describeHex(n.hex, allFactions))}</span>
      </button>
      <input type="hidden" name="hexFaction" value="${esc(n.hex?.faction ?? "")}"/>
      <input type="hidden" name="hexCol" value="${n.hex ? n.hex.col : ""}"/>
      <input type="hidden" name="hexRow" value="${n.hex ? n.hex.row : ""}"/>
    </div>`;

  return `
    <div class="frel-node-form" autocomplete="off">
      <div class="form-group">
        <label>${game.i18n.localize("FACTIONREL.Name")}</label>
        <input type="text" name="name" value="${esc(n.name)}" autofocus/>
      </div>
      ${specificFields}
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" name="revealed" ${n.revealed !== false ? "checked" : ""}/>
          ${game.i18n.localize("FACTIONREL.Revealed")}
        </label>
      </div>
    </div>
  `;
}

/**
 * Read field values out of the dialog's root element by [name], rather than via
 * FormData(form). DialogV2 already wraps our content in its own <form>, so nesting
 * a second <form> here is invalid HTML (the browser silently drops it) and using
 * FormData against a plain container throws. Reading fields directly by name works
 * regardless of whether the container is a <form> or a plain <div>.
 */
function readForm(rootEl, { isFaction }) {
  const field = (name) => rootEl?.querySelector(`[name="${name}"]`) ?? null;
  const values = {
    name: (field("name")?.value || "").toString().trim(),
    revealed: !!field("revealed")?.checked
  };
  if (isFaction) {
    values.shortName = (field("shortName")?.value || "").toString().trim();
    values.color = field("color")?.value || "#8899aa";
    values.memberCount = Number(field("memberCount")?.value) || 0;
  } else {
    values.code = (field("code")?.value || "").toString().trim();
    values.img = (field("img")?.value || "").toString().trim();
    const hexFaction = field("hexFaction")?.value || "";
    const hexCol = field("hexCol")?.value;
    const hexRow = field("hexRow")?.value;
    values.hex = hexFaction && hexCol !== "" && hexRow !== undefined && hexRow !== ""
      ? { faction: hexFaction, col: Number(hexCol), row: Number(hexRow) }
      : null;
  }
  return { values };
}

function bindImagePicker(rootEl) {
  const pickBtn = rootEl.querySelector(".frel-pick-img");
  if (!pickBtn) return;
  pickBtn.addEventListener("click", () => {
    const input = rootEl.querySelector('input[name="img"]');
    new FilePicker({
      type: "image",
      current: input?.value ?? "",
      callback: (path) => { if (input) input.value = path; }
    }).render(true);
  });
}

/** Wire the "Position" button (character dialogs only) to the hex picker sub-dialog. */
function bindPositionPicker(rootEl, { isFaction, data, allFactions, character }) {
  if (isFaction) return;
  const posBtn = rootEl.querySelector(".frel-position-btn");
  if (!posBtn) return;

  posBtn.addEventListener("click", async () => {
    const hexFactionInput = rootEl.querySelector('input[name="hexFaction"]');
    const hexColInput = rootEl.querySelector('input[name="hexCol"]');
    const hexRowInput = rootEl.querySelector('input[name="hexRow"]');
    const summaryEl = rootEl.querySelector(".frel-position-summary");

    const currentHex = hexFactionInput.value
      ? { faction: hexFactionInput.value, col: Number(hexColInput.value), row: Number(hexRowInput.value) }
      : null;

    const result = await openHexPicker({
      data,
      factions: allFactions ?? [],
      character: { id: character?.id, hex: currentHex }
    });

    if (result.action === "select") {
      hexFactionInput.value = result.hex.faction;
      hexColInput.value = result.hex.col;
      hexRowInput.value = result.hex.row;
      summaryEl.textContent = describeHex(result.hex, allFactions);
    } else if (result.action === "clear") {
      hexFactionInput.value = "";
      hexColInput.value = "";
      hexRowInput.value = "";
      summaryEl.textContent = describeHex(null, allFactions);
    }
  });
}

/**
 * Open the add/edit dialog for a faction or character node. Links between nodes are
 * managed separately, on the canvas itself (see RelationsOverlay's link mode) — not
 * from this dialog.
 * @param {object} params
 * @param {object} [params.data] - full stored world data; required for character
 *   dialogs so the Position picker can list factions and check hex occupancy.
 * @param {object[]} [params.allFactions] - all faction nodes; required for character dialogs.
 * @returns {Promise<{action: "save"|"delete"|"cancel", values?: object}>}
 */
export async function openNodeDialog({ isFaction, isNew, node, data, allFactions }) {
  const title = isFaction
    ? game.i18n.localize(isNew ? "FACTIONREL.NewFaction" : "FACTIONREL.EditFaction")
    : game.i18n.localize(isNew ? "FACTIONREL.NewCharacter" : "FACTIONREL.EditCharacter");

  const content = buildFormHtml({ isFaction, node, allFactions });
  const DialogV2 = foundry.applications?.api?.DialogV2;

  const bindAll = (rootEl) => {
    bindImagePicker(rootEl);
    bindPositionPicker(rootEl, { isFaction, data, allFactions, character: node });
  };

  if (DialogV2) {
    const buttons = [
      {
        action: "save",
        label: game.i18n.localize("FACTIONREL.Save"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button, dialog) => {
          const formEl = dialog.element.querySelector(".frel-node-form");
          return { action: "save", ...readForm(formEl, { isFaction }) };
        }
      }
    ];
    if (!isNew) {
      buttons.push({
        action: "delete",
        label: game.i18n.localize("FACTIONREL.Delete"),
        icon: "fa-solid fa-trash",
        callback: () => ({ action: "delete" })
      });
    }
    buttons.push({
      action: "cancel",
      label: game.i18n.localize("FACTIONREL.Cancel"),
      icon: "fa-solid fa-xmark",
      callback: () => ({ action: "cancel" })
    });

    const result = await DialogV2.wait({
      window: { title },
      content,
      buttons,
      render: (event, dialog) => bindAll(dialog.element),
      rejectClose: false
    });
    return result ?? { action: "cancel" };
  }

  // Legacy Dialog fallback.
  return new Promise((resolve) => {
    const dlg = new Dialog({
      title,
      content,
      buttons: {
        save: {
          label: game.i18n.localize("FACTIONREL.Save"),
          callback: (html) => {
            const formEl = html[0].querySelector(".frel-node-form");
            resolve({ action: "save", ...readForm(formEl, { isFaction }) });
          }
        },
        ...(isNew ? {} : {
          delete: {
            label: game.i18n.localize("FACTIONREL.Delete"),
            callback: () => resolve({ action: "delete" })
          }
        }),
        cancel: {
          label: game.i18n.localize("FACTIONREL.Cancel"),
          callback: () => resolve({ action: "cancel" })
        }
      },
      default: "save",
      close: () => resolve({ action: "cancel" }),
      render: (html) => bindAll(html[0])
    });
    dlg.render(true);
  });
}

/** Read-only info popup for players clicking a revealed node. */
export async function openViewDialog({ isFaction, node }) {
  const content = `
    <div class="frel-view-dialog">
      ${!isFaction && node.img ? `<img src="${esc(node.img)}" class="frel-view-img"/>` : ""}
      <h2>${esc(node.name)}</h2>
      <p>${esc(isFaction ? node.shortName : node.code)}</p>
      ${isFaction ? `<p class="frel-view-count">${game.i18n.localize("FACTIONREL.MemberCount")}: ${Number(node.memberCount) || 0}</p>` : ""}
    </div>
  `;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    return DialogV2.wait({
      window: { title: node.name },
      content,
      buttons: [{ action: "ok", label: "OK", default: true, callback: () => true }]
    });
  }
  return new Dialog({ title: node.name, content, buttons: { ok: { label: "OK" } }, default: "ok" }).render(true);
}

/** Small confirm dialog used before deleting a node from the quick-delete icon. */
export async function confirmDelete(name) {
  const body = game.i18n.format("FACTIONREL.ConfirmDeleteBody", { name });
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2) {
    return DialogV2.confirm({
      window: { title: game.i18n.localize("FACTIONREL.ConfirmDeleteTitle") },
      content: `<p>${esc(body)}</p>`
    });
  }
  return Dialog.confirm({
    title: game.i18n.localize("FACTIONREL.ConfirmDeleteTitle"),
    content: `<p>${esc(body)}</p>`
  });
}
