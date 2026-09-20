import { MODULE_ID, hexKey } from "../constants.js";

const DEFAULT_DATA = {
  factions: [],
  factionLinks: [],
  characters: [],
  characterLinks: []
};

/** Deep-cloned snapshot of the stored data, safe to mutate locally. */
export function getData() {
  const stored = game.settings.get(MODULE_ID, "data") ?? DEFAULT_DATA;
  return foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_DATA), stored, { inplace: false });
}

/** Persist a full data object. GM-only in practice (world setting permissions). */
export async function setData(data) {
  return game.settings.set(MODULE_ID, "data", data);
}

export function makeId() {
  return foundry.utils.randomID(10);
}

/**
 * Remove a node and every link referencing it from the given view's arrays.
 * Mutates and returns the passed data object.
 */
export function removeNodeAndLinks(data, nodesKey, linksKey, nodeId) {
  data[nodesKey] = data[nodesKey].filter((n) => n.id !== nodeId);
  data[linksKey] = data[linksKey].filter((l) => l.a !== nodeId && l.b !== nodeId);
  return data;
}

/** Toggle presence of a link between two node ids. Mutates and returns data. */
export function toggleLink(data, linksKey, a, b, shouldExist) {
  const exists = data[linksKey].some(
    (l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)
  );
  if (shouldExist && !exists) {
    data[linksKey].push({ a, b });
  } else if (!shouldExist && exists) {
    data[linksKey] = data[linksKey].filter(
      (l) => !((l.a === a && l.b === b) || (l.a === b && l.b === a))
    );
  }
  return data;
}

/**
 * Map of "col,row" -> character node, for every character currently placed
 * inside the given faction's hex field. Pass excludeCharacterId (e.g. the
 * character being edited) to leave its own current cell out of the map, so it
 * doesn't read back as "occupied by someone else".
 */
export function getFactionOccupancy(data, factionId, excludeCharacterId = null) {
  const map = new Map();
  for (const c of data.characters) {
    if (c.id === excludeCharacterId) continue;
    if (c.hex?.faction === factionId) map.set(hexKey(c.hex.col, c.hex.row), c);
  }
  return map;
}

/**
 * Clear the stored hex position of any character placed in a faction that's
 * about to be deleted, so characters never keep pointing at a faction that no
 * longer exists. Mutates and returns data.
 */
export function clearHexReferencesToFaction(data, factionId) {
  for (const c of data.characters) {
    if (c.hex?.faction === factionId) delete c.hex;
  }
  return data;
}
