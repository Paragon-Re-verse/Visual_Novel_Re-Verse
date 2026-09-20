export const MODULE_ID = "faction-relations-reverse";

export const VIEWS = {
  FACTIONS: "factions",
  CHARACTERS: "characters"
};

/** Collection keys per view, on the stored data object. */
export const VIEW_KEYS = {
  [VIEWS.FACTIONS]: { nodes: "factions", links: "factionLinks" },
  [VIEWS.CHARACTERS]: { nodes: "characters", links: "characterLinks" }
};

/**
 * Every faction has a fixed internal grid of hex slots that characters can be
 * placed into (via the character's "Position" picker). The grid itself is not
 * stored anywhere — only which {col,row} cell each character occupies within
 * its chosen faction (character.hex = {faction, col, row}). Cells are laid out
 * as flat-top hexagons tiled in offset columns, matching the flat-top hex shape
 * already used for faction nodes elsewhere in this module.
 */
export const HEX_FIELD_COLS = 5;
export const HEX_FIELD_ROWS = 4;
export const HEX_FIELD_HEX_SIZE = 60; // center-to-vertex radius, in pixels

/** Unique string key for a hex cell, suitable for Map/Set lookups. */
export function hexKey(col, row) {
  return `${col},${row}`;
}

/** Pixel center of the flat-top hex cell at (col, row), for a given hex size. */
export function hexCellCenter(col, row, size = HEX_FIELD_HEX_SIZE) {
  const width = size * 2;
  const height = Math.sqrt(3) * size;
  const x = col * width * 0.75 + width / 2;
  const y = row * height + (col % 2 ? height / 2 : 0) + height / 2;
  return { x, y };
}

/** Overall pixel footprint of the whole fixed hex field, for a given hex size. */
export function hexFieldPixelSize(size = HEX_FIELD_HEX_SIZE) {
  const width = size * 2;
  const height = Math.sqrt(3) * size;
  return {
    width: width * 0.75 * (HEX_FIELD_COLS - 1) + width,
    height: height * (HEX_FIELD_ROWS + 0.5)
  };
}

/** All valid {col, row} cells of the fixed hex field. */
export function hexFieldCells() {
  const cells = [];
  for (let col = 0; col < HEX_FIELD_COLS; col++) {
    for (let row = 0; row < HEX_FIELD_ROWS; row++) {
      cells.push({ col, row });
    }
  }
  return cells;
}
