import {
  HEX_FIELD_COLS,
  HEX_FIELD_ROWS,
  HEX_FIELD_HEX_SIZE,
  hexCellCenter,
  hexFieldPixelSize,
  hexKey
} from "../constants.js";
import { getFactionOccupancy } from "../data/relations-data.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/** Build the HTML for the fixed hex field, with occupied/selected cells marked. */
function buildFieldHtml({ occupied, selectedKey, size }) {
  const { width, height } = hexFieldPixelSize(size);
  const cellWidth = size * 2;
  const cellHeight = Math.sqrt(3) * size;
  let cellsHtml = "";
  for (let col = 0; col < HEX_FIELD_COLS; col++) {
    for (let row = 0; row < HEX_FIELD_ROWS; row++) {
      const key = hexKey(col, row);
      const { x, y } = hexCellCenter(col, row, size);
      const occupant = occupied.get(key);
      const classes = ["frel-hexcell"];
      if (occupant) classes.push("frel-hexcell-occupied");
      if (key === selectedKey) classes.push("frel-hexcell-selected");
      cellsHtml += `
        <div class="${classes.join(" ")}" data-key="${key}"
             style="left:${x - cellWidth / 2}px; top:${y - cellHeight / 2}px; width:${cellWidth}px; height:${cellHeight}px;"
             title="${occupant ? esc(occupant.name) : ""}"></div>`;
    }
  }
  return `<div class="frel-hexfield" style="width:${width}px;height:${height}px;">${cellsHtml}</div>`;
}

/**
 * Let the GM pick a free hex cell within one faction's internal placement grid
 * for a character. Resolves once the dialog is confirmed, cleared, or cancelled.
 * @returns {Promise<{action:"select", hex:{faction,col,row}}|{action:"clear"}|{action:"cancel"}>}
 */
export async function openHexPicker({ data, factions, character }) {
  const DialogV2 = foundry.applications?.api?.DialogV2;

  if (!factions.length) {
    const content = `<p>${game.i18n.localize("FACTIONREL.NoFactionsYet")}</p>`;
    if (DialogV2) {
      await DialogV2.wait({
        window: { title: game.i18n.localize("FACTIONREL.Position") },
        content,
        buttons: [{ action: "ok", label: "OK", default: true, callback: () => true }]
      });
    } else {
      await new Promise((resolve) => {
        new Dialog({
          title: game.i18n.localize("FACTIONREL.Position"),
          content,
          buttons: { ok: { label: "OK", callback: () => resolve(true) } },
          close: () => resolve(true)
        }).render(true);
      });
    }
    return { action: "cancel" };
  }

  const size = HEX_FIELD_HEX_SIZE;
  let factionId = character?.hex?.faction && factions.some((f) => f.id === character.hex.faction)
    ? character.hex.faction
    : factions[0].id;
  let selectedKey = character?.hex && character.hex.faction === factionId
    ? hexKey(character.hex.col, character.hex.row)
    : null;

  const factionOptions = factions
    .map((f) => `<option value="${f.id}" ${f.id === factionId ? "selected" : ""}>${esc(f.name)}</option>`)
    .join("");

  const content = `
    <div class="frel-hexpicker">
      <div class="form-group">
        <label>${game.i18n.localize("FACTIONREL.Faction")}</label>
        <select class="frel-hexpicker-faction">${factionOptions}</select>
      </div>
      <div class="frel-hexpicker-field-slot">
        ${buildFieldHtml({ occupied: getFactionOccupancy(data, factionId, character?.id ?? null), selectedKey, size })}
      </div>
      <p class="frel-hexpicker-hint">${game.i18n.localize("FACTIONREL.HexPickHint")}</p>
    </div>
  `;

  function wire(rootEl) {
    const fieldSlot = rootEl.querySelector(".frel-hexpicker-field-slot");
    const select = rootEl.querySelector(".frel-hexpicker-faction");

    function bindCells() {
      fieldSlot.querySelectorAll(".frel-hexcell").forEach((cell) => {
        cell.addEventListener("click", () => {
          if (cell.classList.contains("frel-hexcell-occupied")) return;
          selectedKey = cell.dataset.key;
          fieldSlot.querySelectorAll(".frel-hexcell").forEach((c) => c.classList.remove("frel-hexcell-selected"));
          cell.classList.add("frel-hexcell-selected");
        });
      });
    }

    select.addEventListener("change", () => {
      factionId = select.value;
      selectedKey = character?.hex && character.hex.faction === factionId
        ? hexKey(character.hex.col, character.hex.row)
        : null;
      fieldSlot.innerHTML = buildFieldHtml({
        occupied: getFactionOccupancy(data, factionId, character?.id ?? null),
        selectedKey,
        size
      });
      bindCells();
    });

    bindCells();
  }

  const buttons = [
    {
      action: "select",
      label: game.i18n.localize("FACTIONREL.Confirm"),
      icon: "fa-solid fa-check",
      default: true,
      callback: () => {
        if (!selectedKey) return { action: "cancel" };
        const [col, row] = selectedKey.split(",").map(Number);
        return { action: "select", hex: { faction: factionId, col, row } };
      }
    }
  ];
  if (character?.hex) {
    buttons.push({
      action: "clear",
      label: game.i18n.localize("FACTIONREL.ClearPosition"),
      icon: "fa-solid fa-xmark",
      callback: () => ({ action: "clear" })
    });
  }
  buttons.push({
    action: "cancel",
    label: game.i18n.localize("FACTIONREL.Cancel"),
    icon: "fa-solid fa-ban",
    callback: () => ({ action: "cancel" })
  });

  if (DialogV2) {
    const result = await DialogV2.wait({
      window: { title: game.i18n.localize("FACTIONREL.Position") },
      content,
      buttons,
      position: { width: 560 },
      render: (event, dialog) => wire(dialog.element),
      rejectClose: false
    });
    return result ?? { action: "cancel" };
  }

  // Legacy Dialog fallback.
  return new Promise((resolve) => {
    const dlg = new Dialog({
      title: game.i18n.localize("FACTIONREL.Position"),
      content,
      width: 560,
      buttons: {
        select: {
          label: game.i18n.localize("FACTIONREL.Confirm"),
          callback: () => {
            if (!selectedKey) return resolve({ action: "cancel" });
            const [col, row] = selectedKey.split(",").map(Number);
            resolve({ action: "select", hex: { faction: factionId, col, row } });
          }
        },
        ...(character?.hex
          ? { clear: { label: game.i18n.localize("FACTIONREL.ClearPosition"), callback: () => resolve({ action: "clear" }) } }
          : {}),
        cancel: { label: game.i18n.localize("FACTIONREL.Cancel"), callback: () => resolve({ action: "cancel" }) }
      },
      default: "select",
      close: () => resolve({ action: "cancel" }),
      render: (html) => wire(html[0])
    });
    dlg.render(true);
  });
}
