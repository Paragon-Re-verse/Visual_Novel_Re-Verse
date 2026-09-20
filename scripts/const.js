import { PresetUIClass } from "./presetUIClass.js";

export const Constants = {
    ID: "visual-novel-reverse",
    MODULE: () => game.modules.get(Constants.ID),
    backgroundPlaceholder: () => game.settings.get(Constants.ID, "backgroundPlaceholder"), /*"modules/visual-novel-reverse/templates/backgrounds/stBuilding1.webp"*/
    portraitFoldersPath: () => game.settings.get(Constants.ID, "portraitFoldersPath") /*"dialogBack"*/,
    backgoundFoldersPath: () => game.settings.get(Constants.ID, "backgoundFoldersPath") /*"VN-portraits"*/,
    headerImg: "modules/visual-novel-reverse/templates/assets/header-body.webp",
    leftSlider: "modules/visual-novel-reverse/templates/assets/left-slide-top.webp",
    rightSlider: "modules/visual-novel-reverse/templates/assets/right-slide-top.webp",
    leftSliderBack: "modules/visual-novel-reverse/templates/assets/left-slide-back.webp",
    rightSliderBack: "modules/visual-novel-reverse/templates/assets/right-slide-back.webp",
    numArray: ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"]
}

export const VNapp = () => Constants.MODULE().app

/**
 * Retrieves the settings data for the visual novel dialogues module.
 *
 * @return {Object} The settings data for the visual novel dialogues module.
 */
// 
export const getSettings = () => foundry.utils.deepClone(game.settings.get(Constants.ID, "vnData"));

/**
 * Reads a single field straight from the live stored vnData object, without deep-cloning
 * the whole (potentially large) settings blob first. Only use this for read-only access
 * (e.g. reading a value to negate/inspect before a write) - never mutate the returned value,
 * since it may be a direct reference into Foundry's cached setting.
 *
 * @param {string} key - The vnData field to read.
 * @return {*} The current value of that field.
 */
export const peekSetting = (key) => game.settings.get(Constants.ID, "vnData")[key];


/**
 * Retrieves the location based on the setting data, with an additional location list lookup if linkChanges is true.
 *
 * @param {Object} settingData - The setting data containing location and linkChanges information.
 * @return {Array} The retrieved location or a combination of location and additional location from the list.
 */
export const getLocation = (settingData) => {
    const listLoc = settingData.locationList.find(m => m.id == settingData.location.id)
    return settingData.linkChanges && listLoc
        ? [settingData.location, listLoc]
        : [settingData.location]
}

/**
 * Recursively retrieves the tags from a source object and its folder, if any.
 *
 * @param {Object} source - The source object containing the folder and name properties.
 * @param {Array} [arr=[]] - The array to store the tags. Defaults to an array with two elements: the default main folder name and the no folder placeholder.
 * @return {Array} - The array of tags retrieved from the source object and its folder.
 */
export const getTags = (source, arr = [game.i18n.localize(`${Constants.ID}.placeholders.defaultMainFolderName`), game.i18n.localize(`${Constants.ID}.placeholders.noFolder`)]) => {
    if (source?.folder) {
        arr[1] = source?.name
        return getTags(source?.folder, arr)
    } else {
        arr[0] = source?.name || arr[0]
        return arr
    }
}

// Когда создаём новый портрет
// Когда берём существующий и добавляем отсутствующие ключи
export const getDefaultPortraitData = (actor = {}) => {
    return {
        img: null,
        sprites: [],
        name: actor.prototypeToken?.name || "Nameless",
        title: "",
        // Папка Actor Picker теперь назначается вручную через выпадающий список в Actor-Picker Settings,
        // а не автоматически из папки Foundry Actor Directory (см. apps/actorFoldersManager.js)
        tag: null,
        id: actor.id,
        scale: 100,
        offsetXl: 0,
        offsetXr: 0,
        offsetY: 0,
        hasActor: !!Object.keys({}).length
    }
}

/**
 * Retrieves the portrait object with the given ID from the settings object and add the missing keys.
 *
 * @param {string} id - The ID of the portrait to retrieve.
 * @param {object} [settings=getSettings()] - The settings object to retrieve the portrait from. Defaults to the result of getSettings().
 * @return {object} The portrait object with the specified ID.
 */
// 
export const getPortrait = (id, settings = getSettings()) => {
    const speaker = settings.portraits.find(m => m.id == id)
    return speaker ? foundry.utils.mergeObject(speaker, getDefaultPortraitData(), { overwrite: false }) : null
}

/**
 * Retrieves the portrait object with the given ID from the active speakers in the settings object and add the missing keys.
 *
 * @param {string} id - The ID of the portrait to retrieve.
 * @param {object} [settings=getSettings()] - The settings object to retrieve the portrait from. Defaults to the result of getSettings().
 * @return {object} The portrait object with the specified ID.
 */
// 
export const getActivePortrait = (id, settings = getSettings(), slotPos = null) => {
    // Если известен конкретный слот (data-pos) - берём именно его, чтобы не спутать
    // с другим слотом, где сидит тот же самый актёр (дубликаты NPC и т.п.)
    const bySlot = slotPos ? settings.activeSpeakers[slotPos] : null
    const speaker = (bySlot?.id == id ? bySlot : null) || Object.values(settings.activeSpeakers).find(m => m?.id == id)
    return speaker ? foundry.utils.mergeObject(speaker, getDefaultPortraitData(), { overwrite: false }) : null
}

/**
 * Searches for a portrait first among activeSpeakers, then among the list of Portraits, returning the portrait found or null.
 *
 * @param {string} id - The ID of the portrait to search for.
 * @param {object} [settings=getSettings()] - The settings object to search in. Defaults to the result of getSettings().
 * @return {object|null} The found portrait object with merged default data, or null if not found.
 */
export const searchPortrait = (id, settings = getSettings(), slotPos = null) => {
    const bySlot = slotPos ? settings.activeSpeakers[slotPos] : null
    const speaker = (bySlot?.id == id ? bySlot : null)
        || Object.values(settings.activeSpeakers).find(m => m?.id == id)
        || settings.portraits.find(m => m?.id == id)
    return speaker ? foundry.utils.mergeObject(speaker, getDefaultPortraitData(), { overwrite: false }) : null
}

/**
 * Updates the portrait with the given ID in the settings object.
 *
 * @param {string} id - The ID of the portrait to update.
 * @param {object} newData - The new data for the portrait.
 * @param {object} [settings=getSettings()] - The settings object to update. Defaults to the result of getSettings().
 * @param {boolean} [_return=false] - Whether to return the updated settings object or not. Defaults to false.
 * @return {Promise<object>|object} - If _return is true, returns the updated settings object. Otherwise, returns a Promise that resolves with the updated settings object.
 */
export const updatePortrait = async (id, newData, settings = getSettings(), _return = false) => {
    if (getPortrait(id, settings)) {
        settings.portraits = settings.portraits.map(m => m.id == id ? newData : m)
    } else {
        settings.portraits.push(newData)
    }
    if (_return)    return settings
    else            await requestSettingsUpdate(settings)
}

/**
 * Returns an object containing key-value pairs representing different types of selectors and their corresponding icons.
 *
 * @return {Object} An object with keys representing selectors and values representing their corresponding icons.
 */
//
export const selectorArray = () => {return {'ChatMessages': "comments", 'Combats': "sword", "Scenes": "map", 'Actors': "user", 'Items': "suitcase", 'JournalEntries': "book-open", 'RollTables': "th-list", 'CardsPlural': "cards", 'Playlists': "music", 'TabCompendium': "atlas", 'Settings': "cogs"}}

/**
 * Generates an object with empty active speakers slots for the given sides and numbers.
 *
 * @param {Array<string>} sides - An array of side names. Defaults to ["left", "right", "center"].
 * @param {Array<string>} numbers - An array of number names. Defaults to ["First", "Second", "Third", "Fourth", "Fifth"].
 * @return {Object} - An object with keys in the format of `${side}${num}` and values set to null.
 */
export const getEmptyActiveSpeakers = (sides = ["left", "right", "center"], numbers = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"]) => {
    let _obj = {};
    sides.forEach(side => {
        numbers.forEach(num => {
            _obj[`${side}${num}`] = null;
        });
    });
    return _obj;
}

/**
 * Creates a backup of the game settings by saving a JSON file to the 'settingsBackups' directory.
 *
 * @return {Promise<void>} A Promise that resolves when the backup is created successfully.
 * @throws {Error} If there is an error while creating the backup.
 */
export async function createBackup() {
    let count
    try {
        count = await FilePicker.browse("data", `modules/${Constants.ID}/settingsBackups`)
    } catch (error) {
        console.log(`%c${game.i18n.localize(`${Constants.ID}.errors.createBackup`)}:`, "color:red")
        await FilePicker.createDirectory("data", `modules/${Constants.ID}/settingsBackups`)
    }
    const date = new Date()
    const name = `settingsBackup-${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}-${date.getHours()}.${date.getMinutes()}.json`
    const newFile = new File([JSON.stringify(game.settings.get(Constants.ID, 'vnData'))], name, { type: "application/json" });
    await FilePicker.upload("data", `modules/${Constants.ID}/settingsBackups`, newFile, {}, {notify:false});
}

/**
 * Retrieves the size of a texture.
 *
 * @param {string} imgPath - The path to the texture image.
 * @return {Promise<{x: number, y: number}>} The width and height of the texture.
 */
export const getTextureSize = async (imgPath) => {
    const textureData = await loadTexture(imgPath)
    return {x: textureData.width, y: textureData.height}
}

// Default permissions. Literally.
export const defaultPermissions = {
    editWindow: [3, 4],
    portraitInteraction: [1, 2, 3, 4],
    requests: [1, 2, 3, 4],
    miniOrder: [3, 4],
    locationSubChanges: [2, 3, 4],
    locationChanges: [3, 4],
    displayControl: [3, 4],
    uiChanges: [3, 4]
}

/**
 * Updates the settings for the game module via socket (allows players to change settings).
 *
 * @param {Object} settingData - The new settings data.
 * @param {Object} options - The options for updating the settings.
 * @return {Promise<void>} A promise that resolves when the settings are updated.
 */
export async function requestSettingsUpdate(settingData, options) {
    if (game.user.isGM) {
        await game.settings.set(Constants.ID, 'vnData', settingData, options);
    } else {
        game.socket.emit(`module.${Constants.ID}`, {
            type: 'VNDataSetSettings',
            data: settingData,
            options: options
        });
    }
}

/**
 * Updates the settings for the game module with the provided updates and options.
 *
 * @param {Object} updates - An object containing the updates to be applied to the settings.
 * @param {Object} options - An object containing the options for updating the settings.
 * @return {Promise<void>} A promise that resolves when the settings are updated.
 */
export async function quickSettingsUpdate (updates = {}, options = {}) {
    await requestSettingsUpdate( (foundry.utils.mergeObject(getSettings(), updates, { insertKeys: false })), options );
}


/**
 * Checks if the current user has permission to perform an action, given the action key from the players permissions settings.
 * @param {string} key - The action key from the players permissions settings.
 * @param {Object} [permSettings] - The object containing the players permissions settings. If not provided, will be taken from the game settings.
 * @return {boolean} True if the user is allowed to perform the action, false otherwise.
 */
export const allowTo = (key, permSettings = foundry.utils.deepClone(game.settings.get(Constants.ID, "playersPermissions"))) => permSettings[key].includes(game.user.role) && !game.settings.get(Constants.ID, "viewMode")


/**
 * Calculates the font sizes and line heights for a given font, location name, parent location name, and UI size, and sets the style.
 *
 * @param {Array<number>} [UIsize=[0.33, 0.85, 0.7]] - The UI elements size array.
 * @return {void} This function does not return anything.
 */
export function setFontsSize (UIsize = [0.33, 0.85, 0.7]) {
    const locNameEl = document.getElementById("vn-current-location-body")?.querySelector("span")
    const parLocNameEl = document.getElementById("vn-parent-location-body")?.querySelector("span")
    const spanWidth = window.innerWidth * UIsize[0] * UIsize[1] * UIsize[2] * 0.95
    if (locNameEl) {
        locNameEl.style.fontSize = `1vw`
        const locWidth = locNameEl.offsetWidth;
        locNameEl.style.fontSize = `${Math.min((spanWidth / locWidth).toFixed(2), 2.9)}vw`
    }
    if (parLocNameEl) {
        parLocNameEl.style.fontSize = `1vw`
        const parLocWidth = parLocNameEl.offsetWidth
        parLocNameEl.style.fontSize = `${Math.min((spanWidth / parLocWidth).toFixed(2), 2.6)}vw`
    }
}

export const useSimpleCalendar = () => game.modules.get("foundryvtt-simple-calendar")?.active && game.settings.get(Constants.ID, "useSimpleCalendar") && foundry.utils.isNewerVersion(game.modules.get("foundryvtt-simple-calendar")?.version, "2.1.58")

/**
 * Retrieves the current time if `knowTime` is true, otherwise returns "--:--".
 *
 * @param {boolean} [knowTime=true] - Indicates whether to retrieve the current time.
 * @param {object} [settings=getSettings()] - The settings object to retrieve the clock time from. Defaults to the result of `getSettings()`.
 * @return {string} The current time in the format "HH:MM" if `knowTime` is true, otherwise "--:--".
 */
export const getTime = (knowTime = true, settings = getSettings()) => {
    if (knowTime) {
        const time = useSimpleCalendar() ? SimpleCalendar.api.currentDateTimeDisplay().time.replace(/:[^:]*$/, "") : (settings.clockTime || "12:30")
        return time
    } else {
        return "--:--"
    }
}

/**
 * Retrieves the master slot for a given side based on the provided uiData.
 *
 * @param {string} side - The side for which to retrieve the master slot.
 * @param {object} [uiData=PresetUIClass.getActivePreset()] - The uiData object containing master slot information. Defaults to the active preset.
 * @return {string} The master slot for the given side.
 */
export const getMasterSlot = (side, uiData = PresetUIClass.getActivePreset()) => {
    const masterSlot = uiData.masterSlot[side]
    if (masterSlot == "Last") {
        return (side + ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][uiData.slotCount[side] - 1])
    } else {
        return (side + masterSlot)
    }
}

// Скорее всего потом добавлю возможность изменять иконки, и этот объект нужен сразу в двух местах, так что он побудет временной заглушкой в качестве переменной вместо настройки
export const uiButtonsIcons = {
    hideVN: "fas fa-eye-slash",
    openActor: "fas fa-user",
    hideUI: "fas fa-tv",
    hideBack: "fas fa-image",
    selector: "fas fa-caret-right",
    playerList: "fas fa-caret-right",
    requestFirst: "far fa-hand",
    requestSecond: "fas fa-hand",
    requestThird: "fas fa-hand-sparkles"
}

// Дефолтные настройки автосоздания портретов
export const defaultPortraitSettingsTemplate = {
    active: true,
    filePlace: "defaultFolder",
    folderPath: "",
    nameCompare: "inputInName",
    fileName: "{tokenName}",
    chosenExt: "any",
    customExtension: ".webp",
}
const generalRulesTemplate = {
    portraitAutoCreationRule: "openSheet",
    useImage: "searchImage",
    afterRule: "dontMakePort",
    chosenGroup: "",
    useChosenGroupSettings: false
}
export const defaultPortraitSettings = {
    character: { searchConditions: [defaultPortraitSettingsTemplate], generalRules: generalRulesTemplate },
    npc: { searchConditions: [defaultPortraitSettingsTemplate], generalRules: generalRulesTemplate }
}