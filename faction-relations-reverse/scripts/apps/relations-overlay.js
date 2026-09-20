import {
  MODULE_ID,
  VIEWS,
  VIEW_KEYS,
  HEX_FIELD_HEX_SIZE,
  hexCellCenter,
  hexFieldCells,
  hexKey
} from "../constants.js";
import {
  getData,
  setData,
  makeId,
  removeNodeAndLinks,
  toggleLink,
  getFactionOccupancy,
  clearHexReferencesToFaction
} from "../data/relations-data.js";
import { openNodeDialog, openViewDialog, confirmDelete } from "./node-dialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CLICK_DRAG_THRESHOLD = 5; // px of mouse movement before a mousedown counts as a drag, not a click
const SCALE_MIN = 0.3;
const SCALE_MAX = 2.5;
// Canvas zoom scale at which, in the Factions view, a faction hex "opens up" in place
// into the hex cluster of its member characters (semantic zoom — no click needed).
const FACTION_ZOOM_THRESHOLD = 1.5;

export class RelationsOverlay extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "faction-relations-reverse-overlay",
    tag: "div",
    classes: ["faction-relations-reverse-app"],
    window: {
      title: "FACTIONREL.Title",
      icon: "fa-solid fa-diagram-project",
      resizable: true
    },
    position: {
      width: 1100,
      height: 720
    },
    actions: {
      addNode: RelationsOverlay.#onAddNode,
      resetView: RelationsOverlay.#onResetView,
      toggleLinkMode: RelationsOverlay.#onToggleLinkMode
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/relations-overlay.hbs`,
      root: true
    }
  };

  /** @type {RelationsOverlay|null} */
  static instance = null;

  static open() {
    if (!RelationsOverlay.instance) RelationsOverlay.instance = new RelationsOverlay();
    if (RelationsOverlay.instance.rendered) RelationsOverlay.instance.bringToFront();
    else RelationsOverlay.instance.render(true);
    return RelationsOverlay.instance;
  }

  constructor(options = {}) {
    super(options);
    this.view = VIEWS.FACTIONS;
    this.transform = { x: 60, y: 40, scale: 1 };
    /** Whether the last _draw() rendered faction member clusters (canvas scale past the threshold). */
    this._factionsZoomedIn = false;
    /** GM-only "click two nodes to link them" mode, toggled from the toolbar. */
    this._linkMode = false;
    /** id of the node clicked first while link mode is active, awaiting a second click. */
    this._linkSourceId = null;
    /** "faction" | "character" — the type of the pending link source, so a second
     *  click of the other type restarts the pick instead of attempting an invalid
     *  cross-type link. */
    this._linkSourceKind = null;
  }

  async _prepareContext(_options) {
    return { isGM: game.user.isGM };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    this._tabsEl = this.element.querySelectorAll(".frel-tab");
    this._canvasEl = this.element.querySelector(".frel-canvas");
    this._worldEl = this.element.querySelector(".frel-world");
    this._svgEl = this.element.querySelector(".frel-edges");
    this._nodesEl = this.element.querySelector(".frel-nodes");
    this._addBtn = this.element.querySelector('[data-action="addNode"]');
    this._linkModeBtn = this.element.querySelector('[data-action="toggleLinkMode"]');
    this._searchEl = this.element.querySelector(".frel-search");
    this._searchResultsEl = this.element.querySelector(".frel-search-results");
    this._searchWrapEl = this.element.querySelector(".frel-search-wrap");

    for (const tab of this._tabsEl) {
      tab.addEventListener("click", () => this._setView(tab.dataset.view));
    }

    this._canvasEl.addEventListener("mousedown", this._onCanvasMouseDown.bind(this));
    this._canvasEl.addEventListener("wheel", this._onCanvasWheel.bind(this), { passive: false });

    // Re-bind only if this is a genuinely new <input> element (e.g. after a full
    // close+reopen), so re-renders of the same DOM don't stack duplicate listeners.
    if (this._searchEl && this._searchEl !== this._boundSearchEl) {
      this._boundSearchEl = this._searchEl;
      this._searchEl.addEventListener("input", () => this._updateSearchResults());
      this._searchEl.addEventListener("focus", () => this._updateSearchResults());
      this._searchEl.addEventListener("keydown", (ev) => this._onSearchKeydown(ev));
    }
    if (!this._searchDocBound) {
      this._searchDocBound = true;
      this._onDocMouseDown = (ev) => {
        if (this._searchWrapEl && !this._searchWrapEl.contains(ev.target)) this._closeSearchResults();
      };
      document.addEventListener("mousedown", this._onDocMouseDown);
    }

    this._updateLinkModeUI();
    this._draw();
  }

  async close(options) {
    if (this._onDocMouseDown) {
      document.removeEventListener("mousedown", this._onDocMouseDown);
      this._onDocMouseDown = null;
      this._searchDocBound = false;
    }
    return super.close(options);
  }

  _setView(view) {
    if (!Object.values(VIEWS).includes(view) || view === this.view) return;
    this.view = view;
    // A pending link source only makes sense within the tab it was picked on
    // (factions link to factions, characters to characters) — drop it on switch.
    this._linkSourceId = null;
    this._linkSourceKind = null;
    this._draw();
  }

  _applyTransform() {
    this._worldEl.style.transform =
      `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
  }

  // ---------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------

  _draw() {
    if (!this._nodesEl) return;
    const isGM = game.user.isGM;
    const { nodes: nodesKey, links: linksKey } = VIEW_KEYS[this.view];
    const data = getData();
    const nodes = data[nodesKey];
    const links = data[linksKey];
    // Semantic zoom: past the threshold, each faction's hex cluster reveals the real
    // identity of its members instead of silhouettes — no click needed, just
    // scroll/pinch-zoom the canvas. Below the threshold every faction still renders
    // as a hex cluster (just anonymized), so factions and characters read as the
    // same kind of thing — hexes — at every zoom level.
    const factionsZoomedIn = this.transform.scale >= FACTION_ZOOM_THRESHOLD;
    this._factionsZoomedIn = factionsZoomedIn;

    for (const tab of this._tabsEl) {
      tab.classList.toggle("active", tab.dataset.view === this.view);
    }

    this._nodesEl.innerHTML = "";
    this._nodesEl.classList.toggle("frel-mode-hexfield", factionsZoomedIn);

    const byId = new Map(nodes.map((n) => [n.id, n]));

    // Character-to-character links (GM-only "link mode" now also works on the member
    // hexes inside a zoomed-in faction cluster, not just on factions themselves — see
    // _onLinkModeNodeClick). Every pair is drawn the same way regardless of whether
    // both members are in the same faction cluster or two different ones: a plain
    // top-level line (in global canvas coordinates, so it correctly hides behind any
    // node it happens to cross under, same as faction links) plus, at each of the two
    // endpoints specifically, a short stub injected *inside* that hex's own clipped
    // shape (see _injectCharLinkStub) — see _drawEdges.
    const charLinks = data.characterLinks || [];
    const charGlobalPos = new Map();

    for (const node of nodes) {
      const visible = node.revealed !== false || isGM;
      if (!visible) continue;

      const { el, memberPositions } = this._buildFactionClusterEl(
        node,
        getFactionOccupancy(data, node.id),
        isGM,
        factionsZoomedIn
      );
      el.style.left = `${node.x ?? 0}px`;
      el.style.top = `${node.y ?? 0}px`;
      this._nodesEl.appendChild(el);
      for (const [charId, pos] of memberPositions) {
        charGlobalPos.set(charId, { x: (node.x ?? 0) + pos.x, y: (node.y ?? 0) + pos.y, el: pos.el });
      }
    }

    this._drawEdges(links, byId, isGM, charLinks, charGlobalPos);
    this._applyTransform();
  }

  // ---------------------------------------------------------------------
  // Faction hex clusters (semantic zoom)
  // ---------------------------------------------------------------------

  /**
   * Builds one faction's node element as a hex cluster: one small hex per member
   * currently placed in its internal hex field (see hex-picker.js), laid out with
   * the same geometry used there, centered on the faction's own (x, y). Below the
   * zoom threshold the member hexes render as anonymous silhouettes (the faction's
   * own name/short name/count act as its label); past the threshold they reveal
   * each member's actual portrait/name and become individually clickable. A faction
   * with no members placed yet still renders as a single placeholder hex, so it
   * never just vanishes.
   *
   * The returned element is a single `.frel-node`, positioned exactly like every
   * other node (top-left = faction.x/y) so existing drag/click handling works
   * unchanged — the member hexes inside are positioned via local offsets relative
   * to that same box.
   */
  _buildFactionClusterEl(faction, occupancy, isGM, revealMembers) {
    const hidden = faction.revealed === false;
    const el = document.createElement("div");
    el.className = "frel-node frel-hex frel-faction-cluster";
    el.dataset.id = faction.id;
    if (hidden) el.classList.add("frel-hidden-node");
    el.style.setProperty("--frel-color", hidden ? "#3a3a3a" : (faction.color || "#8899aa"));

    // Where to park the GM eye-toggle button — overridden below once the cluster's
    // actual (often much wider than the old 180x156 hex-card) footprint is known,
    // so it sits next to the label instead of floating at a fixed corner.
    let eyePos = null;
    // characterId -> {x, y, el} — this cluster's own local coordinates (same origin
    // as the label/hex tokens) plus a reference to the actual hex-token element, for
    // every member currently shown with a real identity. _draw() combines the local
    // x/y with this faction's own (x, y) to get each member's global position, and
    // uses the element reference to inject character-link stubs directly into that
    // hex — see _drawEdges.
    const memberPositions = new Map();

    if (hidden) {
      // Whole faction hidden from players (fog of war) — keep the simple "?" placeholder,
      // matching how a hidden character card behaves; no cluster detail leaks through.
      el.innerHTML = `<div class="frel-hex-inner"><i class="fa-solid fa-question"></i></div>`;
    } else {
      const hexWidth = HEX_FIELD_HEX_SIZE * 2;
      const hexHeight = Math.sqrt(3) * HEX_FIELD_HEX_SIZE;
      const entries = [...occupancy.entries()];

      // Once the GM is zoomed in, show EVERY slot of the faction's fixed hex field —
      // occupied ones as members, empty ones as a dashed "+" hex the GM can click to
      // create a new character pre-placed right there. Anyone else (or still below
      // the zoom threshold) only ever sees the OCCUPIED cells, same as before.
      const showAllSlots = isGM && revealMembers;
      const cells = showAllSlots
        ? hexFieldCells()
        : entries.map(([key]) => {
            const [col, row] = key.split(",").map(Number);
            return { col, row };
          });

      // Bounding box of only the cells being rendered (not always the full fixed 5x4
      // field) — so the cluster's on-canvas footprint, and the label centered above
      // it, always match exactly what's visible. Two members close together get a
      // tight label centered between just those two; adding a third re-centers
      // everything around all three. Once showAllSlots kicks in, this naturally
      // widens back out to the full field's bounds, since all 20 cells are rendered.
      let bounds = null;
      const positioned = cells.map(({ col, row }) => {
        const { x: localX, y: localY } = hexCellCenter(col, row, HEX_FIELD_HEX_SIZE);
        const left = localX - hexWidth / 2;
        const right = localX + hexWidth / 2;
        const top = localY - hexHeight / 2;
        const bottom = localY + hexHeight / 2;
        bounds = bounds
          ? {
              left: Math.min(bounds.left, left),
              right: Math.max(bounds.right, right),
              top: Math.min(bounds.top, top),
              bottom: Math.max(bounds.bottom, bottom)
            }
          : { left, right, top, bottom };
        return { character: occupancy.get(hexKey(col, row)) ?? null, col, row, localX, localY };
      });
      const boundsWidth = bounds ? bounds.right - bounds.left : hexWidth;
      const boundsHeight = bounds ? bounds.bottom - bounds.top : hexHeight;
      const boundsCenterX = bounds ? (bounds.left + bounds.right) / 2 : 0;
      const boundsCenterY = bounds ? (bounds.top + bounds.bottom) / 2 : 0;

      // Below the zoom threshold, the cluster reads as one solid-colored hex blob
      // (see .frel-hexframe-plain) — its name/short name/count sit centered *inside*
      // that shape, at the natural meeting point of every occupied hex, rather than
      // floating above it. Past the threshold, each member hex already shows its own
      // name, so the faction's own name/short name would just be clutter — only a
      // small member-count badge is kept, positioned above the (possibly full 20-cell)
      // grid like before.
      const labelWidth = cells.length ? Math.max(boundsWidth, hexWidth + 40) : hexWidth + 40;
      let labelTop, labelHtml;
      if (revealMembers) {
        labelTop = cells.length ? 80 - boundsHeight / 2 - 30 : 80 - hexHeight / 2 - 26;
        labelHtml = `<div class="frel-cluster-count"><i class="fa-solid fa-user"></i> ${occupancy.size || Number(faction.memberCount) || 0}</div>`;
      } else {
        // Centered inside the merged blob: bounds-relative positioning always maps
        // the cluster's own bounding-box center to local (90, 80) — see boundsCenterX/Y
        // below — so centering the label there puts it right between all active hexes.
        labelTop = 80 - 27;
        labelHtml = `
          <div class="frel-cluster-name">${foundry.utils.escapeHTML(faction.name || "")}</div>
          ${faction.shortName ? `<div class="frel-cluster-short">${foundry.utils.escapeHTML(faction.shortName)}</div>` : ""}
          <div class="frel-cluster-count"><i class="fa-solid fa-user"></i> ${occupancy.size || Number(faction.memberCount) || 0}</div>
        `;
      }

      const label = document.createElement("div");
      label.className = "frel-cluster-label";
      label.style.width = `${labelWidth}px`;
      label.style.left = `${90 - labelWidth / 2}px`;
      label.style.top = `${labelTop}px`;
      label.innerHTML = labelHtml;
      el.appendChild(label);

      eyePos = { left: 90 + labelWidth / 2 + 6, top: labelTop - 2 };

      const factionColor = faction.color || "#8899aa";

      if (!cells.length) {
        // Nobody placed yet, and this viewer can't see the full addable grid (not
        // GM, or still below the zoom threshold) — a single anonymous placeholder so
        // the faction never just vanishes.
        const ph = this._buildClusterHexEl(null, isGM, revealMembers, factionColor, hexWidth, hexHeight, null);
        ph.style.left = `${90 - hexWidth / 2}px`;
        ph.style.top = `${80 - hexHeight / 2}px`;
        el.appendChild(ph);
      } else {
        for (const { character, col, row, localX, localY } of positioned) {
          if (!showAllSlots) {
            if (!character) continue;
            if (revealMembers) {
              const memberVisible = character.revealed !== false || isGM;
              if (!memberVisible) continue;
            }
          }
          const relX = 90 + (localX - boundsCenterX);
          const relY = 80 + (localY - boundsCenterY);
          const emptySlot = showAllSlots && !character ? { factionId: faction.id, col, row } : null;
          const token = this._buildClusterHexEl(character, isGM, revealMembers, factionColor, hexWidth, hexHeight, emptySlot);
          token.style.left = `${relX - hexWidth / 2}px`;
          token.style.top = `${relY - hexHeight / 2}px`;
          el.appendChild(token);

          const showsIdentity = revealMembers && !!character;
          if (showsIdentity) {
            memberPositions.set(character.id, { x: relX, y: relY, el: token });
          }
        }
      }
    }

    if (isGM) {
      const eye = document.createElement("button");
      eye.type = "button";
      eye.className = "frel-node-eye";
      eye.title = game.i18n.localize("FACTIONREL.Revealed");
      eye.innerHTML = `<i class="fa-solid ${hidden ? "fa-eye-slash" : "fa-eye"}"></i>`;
      if (eyePos) {
        eye.style.left = `${eyePos.left}px`;
        eye.style.top = `${eyePos.top}px`;
        eye.style.right = "auto";
      }
      eye.addEventListener("mousedown", (ev) => ev.stopPropagation());
      eye.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._toggleReveal(faction.id);
      });
      el.appendChild(eye);
    }

    el.addEventListener("mousedown", (ev) => this._onNodeMouseDown(ev, faction, el));
    return { el, memberPositions };
  }

  /**
   * One small hex within a faction cluster. Pass `character: null` for the
   * empty-faction placeholder or, when `emptySlot` is set, for a genuinely
   * addable slot in the full hex field (GM + zoomed in — see `showAllSlots` in
   * `_buildFactionClusterEl`). When `revealMembers` is false (below the zoom
   * threshold) every occupied hex renders as a plain solid-colored shape (no
   * border, no inner card) taking the faction's own color, and has no click
   * handler of its own — clicks/drags fall through to the faction container, and
   * identically-colored neighbors blend into what reads as one merged blob. When
   * true, each occupied hex shows the real character (or "Unrevealed" for a
   * character individually hidden from players) and is clickable on its own.
   *
   * The portrait itself is a smaller square photo inside a white frame, with the
   * name printed at the bottom of that frame — entirely inside the outer hex's
   * own footprint, rather than a label floating below it. That's a deliberate
   * fix for tightly-tessellated columns: a name positioned *outside* the hex
   * used to get visually swallowed by the very next hex tessellating directly
   * beneath it (zero gap between hexes sharing a column).
   *
   * `hexWidth`/`hexHeight` size the token to match the exact hex-field geometry
   * (see hex-picker.js) so adjacent members tessellate without gaps or overlap.
   */
  _buildClusterHexEl(character, isGM, revealMembers, factionColor, hexWidth, hexHeight, emptySlot) {
    const el = document.createElement("div");
    el.className = "frel-hex-token";
    el.style.width = `${hexWidth}px`;
    el.style.height = `${hexHeight}px`;

    const photoSize = Math.round(hexWidth * 0.5);

    if (emptySlot) {
      el.innerHTML = `<div class="frel-hexframe frel-hexframe-empty" title="${game.i18n.localize("FACTIONREL.AddCharacterHere")}"><i class="fa-solid fa-plus"></i></div>`;
      el.addEventListener("mousedown", (ev) => ev.stopPropagation());
      el.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await this._addCharacterAtHex(emptySlot.factionId, emptySlot.col, emptySlot.row);
      });
      return el;
    }

    // Below the zoom threshold (or the no-members placeholder), the whole cluster
    // reads as one solid-colored hex blob rather than a set of individual cards —
    // a plain colored hex with no border, so identical-colored neighbors tessellate
    // into what looks like a single merged shape with no visible seam between them.
    const showIdentity = revealMembers && !!character;
    if (!showIdentity) {
      el.innerHTML = `<div class="frel-hexframe frel-hexframe-plain" style="--frel-color:${factionColor}"></div>`;
      return el;
    }

    const hiddenChar = character.revealed === false;
    el.dataset.id = character.id;
    const photoStyle = !hiddenChar && character.img ? `background-image:url('${character.img}')` : "";
    const photoIcon = hiddenChar
      ? `<i class="fa-solid fa-user-secret"></i>`
      : (character.img ? "" : `<i class="fa-solid fa-user"></i>`);
    const displayName = hiddenChar
      ? game.i18n.localize("FACTIONREL.Unrevealed")
      : foundry.utils.escapeHTML(character.name || "");

    el.innerHTML = `
      <div class="frel-hexframe" style="--frel-color:${factionColor}">
        <div class="frel-hex-photo-frame">
          <div class="frel-hex-photo" style="width:${photoSize}px;height:${photoSize}px;${photoStyle}">${photoIcon}</div>
          <div class="frel-hex-photo-name" style="max-width:${photoSize}px">${displayName}</div>
        </div>
      </div>`;

    el.addEventListener("mousedown", (ev) => ev.stopPropagation());
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (isGM && this._linkMode) {
        this._onLinkModeNodeClick(character.id, "character");
        return;
      }
      if (!isGM && hiddenChar) return;
      if (!isGM) {
        await openViewDialog({ isFaction: false, node: character });
        return;
      }
      await this._openEditDialog(character, false);
    });

    return el;
  }

  /** Short line from a hex-token's own center outward, clipped to that hex's shape
   *  by inserting it inside .frel-hexframe *before* .frel-hex-photo-frame — this is
   *  what makes a character-link line read as sitting above that hex's color but
   *  below its white portrait frame, regardless of where the link's *other* end is
   *  (same cluster or a different faction entirely — see _drawEdges). */
  _injectCharLinkStub(hexTokenEl, hexWidth, hexHeight, angle) {
    const frame = hexTokenEl.querySelector(".frel-hexframe");
    if (!frame) return;
    const photoFrame = frame.querySelector(".frel-hex-photo-frame");
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "frel-char-edge-stub");
    svg.setAttribute("viewBox", `0 0 ${hexWidth} ${hexHeight}`);
    svg.setAttribute("preserveAspectRatio", "none");
    const cx = hexWidth / 2;
    const cy = hexHeight / 2;
    const len = hexWidth; // long enough to always reach past the clipped edge
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", cx);
    line.setAttribute("y1", cy);
    line.setAttribute("x2", cx + Math.cos(angle) * len);
    line.setAttribute("y2", cy + Math.sin(angle) * len);
    line.setAttribute("class", "frel-char-edge");
    svg.appendChild(line);
    if (photoFrame) frame.insertBefore(svg, photoFrame);
    else frame.appendChild(svg);
  }

  _drawEdges(factionLinks, byId, isGM, charLinks = [], charGlobalPos = new Map()) {
    this._svgEl.innerHTML = "";
    const ns = "http://www.w3.org/2000/svg";
    for (const link of factionLinks) {
      const a = byId.get(link.a);
      const b = byId.get(link.b);
      if (!a || !b) continue;
      const aHidden = a.revealed === false && !isGM;
      const bHidden = b.revealed === false && !isGM;
      if (aHidden || bHidden) continue;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", (a.x ?? 0) + this._nodeCenterOffset(a).x);
      line.setAttribute("y1", (a.y ?? 0) + this._nodeCenterOffset(a).y);
      line.setAttribute("x2", (b.x ?? 0) + this._nodeCenterOffset(b).x);
      line.setAttribute("y2", (b.y ?? 0) + this._nodeCenterOffset(b).y);
      line.setAttribute("class", "frel-edge");
      this._svgEl.appendChild(line);
    }

    // Character links: drawn the SAME way whether both members are in one faction
    // cluster or two different ones — a plain top-level line in global canvas
    // coordinates (hides behind any node it crosses under, same mechanism as
    // faction links above) PLUS, at each of the two endpoints specifically, a stub
    // injected directly into that hex's own DOM (_injectCharLinkStub) so the line
    // visibly enters that hex above its color and ducks under its portrait frame —
    // something only achievable from inside that specific hex's own clip-path
    // stacking context, regardless of how far away the other endpoint is.
    const hexWidth = HEX_FIELD_HEX_SIZE * 2;
    const hexHeight = Math.sqrt(3) * HEX_FIELD_HEX_SIZE;
    for (const link of charLinks) {
      const posA = charGlobalPos.get(link.a);
      const posB = charGlobalPos.get(link.b);
      if (!posA || !posB) continue;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", posA.x);
      line.setAttribute("y1", posA.y);
      line.setAttribute("x2", posB.x);
      line.setAttribute("y2", posB.y);
      line.setAttribute("class", "frel-char-edge");
      this._svgEl.appendChild(line);

      const angle = Math.atan2(posB.y - posA.y, posB.x - posA.x);
      this._injectCharLinkStub(posA.el, hexWidth, hexHeight, angle);
      this._injectCharLinkStub(posB.el, hexWidth, hexHeight, angle + Math.PI);
    }
  }

  _nodeCenterOffset(node) {
    return this.view === VIEWS.FACTIONS ? { x: 90, y: 80 } : { x: 55, y: 65 };
  }

  // ---------------------------------------------------------------------
  // Pan / zoom
  // ---------------------------------------------------------------------

  _onCanvasWheel(ev) {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, this.transform.scale * factor));
    this.transform.scale = next;

    // Only rebuild the node DOM when this tick actually crosses the faction/character
    // semantic-zoom boundary — otherwise a cheap transform-only update is enough.
    const isFaction = this.view === VIEWS.FACTIONS;
    const nowZoomedIn = isFaction && next >= FACTION_ZOOM_THRESHOLD;
    if (isFaction && nowZoomedIn !== this._factionsZoomedIn) {
      this._draw();
    } else {
      this._applyTransform();
    }
  }

  _onCanvasMouseDown(ev) {
    if (ev.target !== this._canvasEl && ev.target !== this._worldEl) return;
    if (ev.button !== 0) return;
    const start = { x: ev.clientX, y: ev.clientY };
    const origin = { ...this.transform };

    const onMove = (mev) => {
      this.transform.x = origin.x + (mev.clientX - start.x);
      this.transform.y = origin.y + (mev.clientY - start.y);
      this._applyTransform();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ---------------------------------------------------------------------
  // Search (jump the camera to a faction or character by name)
  // ---------------------------------------------------------------------

  _updateSearchResults() {
    const query = (this._searchEl?.value || "").trim().toLowerCase();
    if (!query) {
      this._closeSearchResults();
      return;
    }
    const isGM = game.user.isGM;
    const data = getData();
    const results = [];

    for (const f of data.factions) {
      if (f.revealed === false && !isGM) continue;
      if ((f.name || "").toLowerCase().includes(query)) {
        results.push({ kind: "faction", id: f.id, name: f.name });
      }
    }
    for (const c of data.characters) {
      if (c.revealed === false && !isGM) continue;
      // A character not yet placed into any faction's hex field has nowhere to
      // jump to (there's no standalone character view any more) — skip it.
      if (!c.hex?.faction) continue;
      if ((c.name || "").toLowerCase().includes(query)) {
        results.push({ kind: "character", id: c.id, name: c.name });
      }
    }
    results.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    this._renderSearchResults(results.slice(0, 8));
  }

  _renderSearchResults(results) {
    if (!this._searchResultsEl) return;
    this._searchResultsEl.innerHTML = "";

    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "frel-search-empty";
      empty.textContent = game.i18n.localize("FACTIONREL.NoResults");
      this._searchResultsEl.appendChild(empty);
      this._searchResultsEl.style.display = "block";
      return;
    }

    for (const r of results) {
      const item = document.createElement("div");
      item.className = "frel-search-result";
      const typeLabel = r.kind === "faction"
        ? game.i18n.localize("FACTIONREL.TabFactions")
        : game.i18n.localize("FACTIONREL.TabCharacters");
      item.innerHTML = `
        <i class="fa-solid ${r.kind === "faction" ? "fa-hexagon-nodes" : "fa-user"}"></i>
        <span class="frel-search-result-name">${foundry.utils.escapeHTML(r.name || "")}</span>
        <span class="frel-search-result-type">${typeLabel}</span>
      `;
      // Prevent the input from blurring (which would close the dropdown) before the click fires.
      item.addEventListener("mousedown", (ev) => ev.preventDefault());
      item.addEventListener("click", () => {
        this._jumpToNode(r.kind, r.id);
        this._closeSearchResults();
        if (this._searchEl) this._searchEl.value = "";
      });
      this._searchResultsEl.appendChild(item);
    }
    this._searchResultsEl.style.display = "block";
  }

  _closeSearchResults() {
    if (!this._searchResultsEl) return;
    this._searchResultsEl.style.display = "none";
    this._searchResultsEl.innerHTML = "";
  }

  _onSearchKeydown(ev) {
    if (ev.key === "Escape") {
      this._closeSearchResults();
      this._searchEl?.blur();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const first = this._searchResultsEl?.querySelector(".frel-search-result");
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }

  /**
   * Center the camera on a faction, or — for a character — on the faction they're
   * currently placed in (zooming in far enough to reveal them if not already),
   * since characters no longer have a standalone view of their own to jump to.
   * Keeps the current zoom otherwise unchanged.
   */
  _jumpToNode(kind, id) {
    if (!this._canvasEl) return;
    const data = getData();

    let faction;
    if (kind === "faction") {
      faction = data.factions.find((n) => n.id === id);
    } else {
      const character = data.characters.find((c) => c.id === id);
      faction = character?.hex?.faction ? data.factions.find((f) => f.id === character.hex.faction) : null;
      if (faction && this.transform.scale < FACTION_ZOOM_THRESHOLD) {
        this.transform.scale = FACTION_ZOOM_THRESHOLD + 0.1;
      }
    }
    if (!faction) return;

    const centerX = (faction.x ?? 0) + 90;
    const centerY = (faction.y ?? 0) + 80;
    const rect = this._canvasEl.getBoundingClientRect();
    this.transform.x = rect.width / 2 - centerX * this.transform.scale;
    this.transform.y = rect.height / 2 - centerY * this.transform.scale;
    this._draw();
  }

  // ---------------------------------------------------------------------
  // Node drag / click
  // ---------------------------------------------------------------------

  _onNodeMouseDown(ev, node, el) {
    ev.stopPropagation();
    if (ev.button !== 0) return;
    const isGM = game.user.isGM;

    if (isGM && this._linkMode) {
      ev.preventDefault();
      this._onLinkModeNodeClick(node.id, "faction");
      return;
    }

    const start = { x: ev.clientX, y: ev.clientY };
    const origin = { x: node.x ?? 0, y: node.y ?? 0 };
    let moved = false;

    const onMove = (mev) => {
      const dx = (mev.clientX - start.x) / this.transform.scale;
      const dy = (mev.clientY - start.y) / this.transform.scale;
      if (!moved && Math.hypot(mev.clientX - start.x, mev.clientY - start.y) > CLICK_DRAG_THRESHOLD) {
        moved = true;
      }
      if (moved && isGM) {
        el.style.left = `${origin.x + dx}px`;
        el.style.top = `${origin.y + dy}px`;
        this._redrawEdgesLive();
      }
    };

    const onUp = async (mev) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (moved && isGM) {
        const dx = (mev.clientX - start.x) / this.transform.scale;
        const dy = (mev.clientY - start.y) / this.transform.scale;
        await this._persistNodePosition(node.id, origin.x + dx, origin.y + dy);
      } else if (!moved) {
        await this._onNodeClick(node.id);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  /** Cheap live edge redraw during drag, without touching stored data or full re-render. */
  _redrawEdgesLive() {
    const { nodes: nodesKey } = VIEW_KEYS[this.view];
    const data = getData();
    const byId = new Map(data[nodesKey].map((n) => [n.id, n]));
    for (const el of this._nodesEl.querySelectorAll(".frel-node")) {
      const n = byId.get(el.dataset.id);
      if (n) {
        n.x = parseFloat(el.style.left) || 0;
        n.y = parseFloat(el.style.top) || 0;
      }
    }
    this._drawEdges(data[VIEW_KEYS[this.view].links], byId, game.user.isGM);
  }

  async _persistNodePosition(id, x, y) {
    const { nodes: nodesKey } = VIEW_KEYS[this.view];
    const data = getData();
    const node = data[nodesKey].find((n) => n.id === id);
    if (!node) return;
    node.x = Math.round(x);
    node.y = Math.round(y);
    await setData(data);
  }

  async _toggleReveal(id) {
    const { nodes: nodesKey } = VIEW_KEYS[this.view];
    const data = getData();
    const node = data[nodesKey].find((n) => n.id === id);
    if (!node) return;
    node.revealed = node.revealed === false; // flip, defaulting undefined(=true) -> false
    await setData(data);
  }

  async _onNodeClick(id) {
    const isFaction = this.view === VIEWS.FACTIONS;
    const { nodes: nodesKey } = VIEW_KEYS[this.view];
    const data = getData();
    const node = data[nodesKey].find((n) => n.id === id);
    if (!node) return;

    if (!game.user.isGM) {
      if (node.revealed === false) return;
      await openViewDialog({ isFaction, node });
      return;
    }

    await this._openEditDialog(node);
  }

  // ---------------------------------------------------------------------
  // Link mode (GM-only: click one node, then another, to toggle a link)
  // ---------------------------------------------------------------------

  /**
   * Click-to-link, replacing the old checkbox list in the node dialog — with
   * dozens of nodes, ticking checkboxes doesn't scale. While link mode is on
   * (toolbar toggle, GM-only), clicking a node no longer opens its edit dialog:
   * the first click marks it as the pending link source (highlighted), and a
   * second click on a *different* node of the same type toggles a link between
   * them, then clears the pending selection so the next pair can be picked.
   * Clicking the same node again cancels the pending selection.
   *
   * Works on both top-level faction clusters (`kind: "faction"`) and, since the
   * member hexes inside a zoomed-in faction cluster are also individually
   * clickable, on characters too (`kind: "character"`) — each kind toggles its
   * own link list (`factionLinks` / `characterLinks`). Picking a node of a
   * different kind than the pending source restarts the pick on the new node
   * instead of attempting an invalid cross-type link.
   */
  async _onLinkModeNodeClick(id, kind) {
    if (!this._linkSourceId) {
      this._linkSourceId = id;
      this._linkSourceKind = kind;
      this._updateLinkSourceHighlight();
      return;
    }
    if (this._linkSourceId === id) {
      this._linkSourceId = null;
      this._linkSourceKind = null;
      this._updateLinkSourceHighlight();
      return;
    }
    if (this._linkSourceKind !== kind) {
      this._linkSourceId = id;
      this._linkSourceKind = kind;
      this._updateLinkSourceHighlight();
      return;
    }

    const linksKey = kind === "faction" ? "factionLinks" : "characterLinks";
    const sourceId = this._linkSourceId;
    this._linkSourceId = null;
    this._linkSourceKind = null;

    const data = getData();
    const exists = data[linksKey].some(
      (l) => (l.a === sourceId && l.b === id) || (l.a === id && l.b === sourceId)
    );
    toggleLink(data, linksKey, sourceId, id, !exists);
    await setData(data);
    this._draw();
  }

  _updateLinkModeUI() {
    if (this._linkModeBtn) this._linkModeBtn.classList.toggle("active", this._linkMode);
    if (this._canvasEl) this._canvasEl.classList.toggle("frel-linking", this._linkMode);
    this._updateLinkSourceHighlight();
  }

  _updateLinkSourceHighlight() {
    if (!this._nodesEl) return;
    // Matches both top-level faction clusters (.frel-node) and, once zoomed in,
    // individually-clickable member hexes (.frel-hex-token) — both set data-id.
    for (const el of this._nodesEl.querySelectorAll("[data-id]")) {
      el.classList.toggle("frel-link-source", !!this._linkSourceId && el.dataset.id === this._linkSourceId);
    }
  }

  // ---------------------------------------------------------------------
  // Add / edit
  // ---------------------------------------------------------------------

  /**
   * Create a brand-new character pre-placed at a specific empty hex slot inside a
   * faction's cluster — the replacement for the old "Add" button on a standalone
   * Characters tab, now that characters only ever exist inside their faction's hex
   * field. Opens the normal character dialog with the Position already filled in
   * (the GM can still change it via the Position button if they want a different
   * slot before saving).
   */
  async _addCharacterAtHex(factionId, col, row) {
    const data = getData();
    const result = await openNodeDialog({
      isFaction: false,
      isNew: true,
      node: { hex: { faction: factionId, col, row } },
      data,
      allFactions: data.factions
    });
    if (result.action !== "save") return;
    const id = makeId();
    data.characters.push({ id, x: 0, y: 0, ...result.values });
    await setData(data);
    this._draw();
  }

  /**
   * @param {object|null} node - existing node to edit, or null to create a new one.
   * @param {boolean|null} isFactionOverride - force faction vs. character behavior
   *   regardless of the currently active tab. Needed when opening a character's
   *   dialog from inside a faction's hex cluster (Factions tab, zoomed in), where
   *   `this.view` is still "factions". Leave null to fall back to the current tab
   *   (the normal case).
   */
  async _openEditDialog(node, isFactionOverride = null) {
    const isFaction = isFactionOverride ?? (this.view === VIEWS.FACTIONS);
    const { nodes: nodesKey, links: linksKey } = VIEW_KEYS[isFaction ? VIEWS.FACTIONS : VIEWS.CHARACTERS];
    const data = getData();
    const isNew = !node;
    const current = node ? data[nodesKey].find((n) => n.id === node.id) : null;

    // Links are no longer managed from this dialog (checkboxes don't scale past a
    // handful of nodes) — see link mode (_onLinkModeNodeClick) for the click-to-link
    // canvas flow that replaced it.
    const result = await openNodeDialog({
      isFaction,
      isNew,
      node: current,
      data,
      allFactions: data.factions
    });
    if (result.action === "cancel") return;

    if (result.action === "delete" && current) {
      const ok = await confirmDelete(current.name);
      if (!ok) return;
      removeNodeAndLinks(data, nodesKey, linksKey, current.id);
      if (isFaction) clearHexReferencesToFaction(data, current.id);
      await setData(data);
      return;
    }

    if (result.action === "save") {
      if (isNew) {
        const id = makeId();
        const centerX = (-this.transform.x + (this._canvasEl?.clientWidth ?? 900) / 2) / this.transform.scale;
        const centerY = (-this.transform.y + (this._canvasEl?.clientHeight ?? 500) / 2) / this.transform.scale;
        data[nodesKey].push({ id, x: Math.round(centerX), y: Math.round(centerY), ...result.values });
      } else {
        foundry.utils.mergeObject(current, result.values);
      }
      await setData(data);
    }
  }

  // ---------------------------------------------------------------------
  // Toolbar actions
  // ---------------------------------------------------------------------

  static async #onAddNode(_event, _target) {
    await this._openEditDialog(null);
  }

  static #onResetView(_event, _target) {
    this.transform = { x: 60, y: 40, scale: 1 };
    // Always rebuild (not just re-apply the transform): resetting scale can cross the
    // semantic-zoom boundary and needs to swap faction clusters back for hex cards.
    this._draw();
  }

  static async #onToggleLinkMode(_event, _target) {
    this._linkMode = !this._linkMode;
    this._linkSourceId = null;
    this._linkSourceKind = null;
    this._updateLinkModeUI();
  }
}
