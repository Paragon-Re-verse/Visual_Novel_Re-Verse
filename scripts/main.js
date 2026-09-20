import { Constants as C, getSettings, peekSetting, getLocation, updatePortrait, getPortrait, selectorArray, getEmptyActiveSpeakers, requestSettingsUpdate, allowTo, setFontsSize, getTime, useSimpleCalendar, getActivePortrait, VNapp, quickSettingsUpdate, getMasterSlot, searchPortrait } from "./const.js";
import { ActorPicker } from "../apps/actorPicker.js";
import { LocationPicker, LocationPickerSettings } from "../apps/locationPicker.js";
import { SlidersSetClass } from "./slidersSetClass.js";
import { VisualSettingsMenu } from "../apps/visualSettingsMenu.js";
import { PresetUIClass } from "./presetUIClass.js";
import { DiscordMenu } from "../apps/discordMenu.js";
import { EffectsPanel } from "../apps/effectsPanel.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export const _portraitPartsKeys = (fullslots = false) => {
    const numbersArr = C.numArray
    const slotCount = fullslots ? {left: 10, right: 10} : PresetUIClass.getActivePreset().slotCount
    return ["left", "right"/*, "center"*/].reduce((acc, side) => {
        return [...acc, ...numbersArr.slice(0, slotCount[side]).map(num => `${side}${num}Portrait`)]
    }, [])
}
const _appPartsKey = (fullslots = false) => ["headerSlider", "background", "leftSlider", "rightSlider", "editWindow", "foreground", ..._portraitPartsKeys(fullslots)] 
const _getAppParts = (fullslots = false) => _appPartsKey(fullslots).reduce((acc, part) => {
    acc[part] = {template: `modules/${C.ID}/templates/mainApp/${(part.includes("Portrait") ? "portrait" : (["leftSlider", "rightSlider"].includes(part)) ? "slider" : part)}.hbs`}
    return acc
}, {})

export class VisualNovelDialogues extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ['vn-body'],
        id: "vn-body",
        position: {
            width: "100%",
            height: "100%",
        },
        actions: {
            // Кнопки слева-сверху
            hideVN: VisualNovelDialogues._hideVN,
            openActorSheet: VisualNovelDialogues._openActorSheet,
            toggleUI: this._toggleUI,
            hideBack: this._hideBack,
            discordMenu: this._discordMenu,
            selectorToggle: this._selectorToggle,
            selectorButtons: this._selectorButtons,
            togglePlayerList: this._togglePlayerList,
            showPlayerListForAll: this._showPlayerListForAll,
            playerListConMenu: {buttons: [2], handler: this._playerListConMenu},

            // Медовые соты
            changeBackground: this._changeBackground,
            openSettingsMenu: this._openSettingsMenu,
            toggleEditMode: this._toggleEditMode,
            toggleLinkChanges: this._toggleLinkChanges,
            resetChanges: this._resetChanges,
            epicRolls: this._epicRolls,
            effectsWindow: this._effectsWindow,
            mainGuideHint: this._mainGuideHint,

            // Окно редактирования
            openActorPicker: this._openActorPicker,
            editWindowHint: this._editWindowHint,
            closeEditWindow: this._closeEditWindow,
            ewPortraitClick: {buttons: [0, 2], handler: this._ewPortraitClick},
            toggleNameOrTitle: this._toggleNameOrTitle,
            confirmChanges: this._confirmChanges,
            cancelChanges: this._cancelChanges,
            zeroSettings: this._zeroSettings,
            deleteActor: this._deleteActor,

            // Верхний слайдер
            locationClick: {buttons: [0, 2], handler: this._locationClick},
            headerClockClick: {buttons: [0, 2], handler: this._headerClockClick},
            timeButtons: this._timeButtons,
            confirmTimeUpdates: this._confirmTimeUpdates,
            cancelTimeUpdates: this._cancelTimeUpdates,
            weatherClick: {buttons: [0, 2], handler: this._weatherClick},
            deletePortraitFromOrder: {buttons: [2], handler: this._deletePortraitFromOrder},

            // Дополнительно
            createRequest: this._createRequest,
            requestClick: {buttons: [0, 2], handler: this._requestClick},
            portraitClick: {buttons: [0, 2], handler: this._portraitClick},
            spriteSelect: this._spriteSelect,
            nameAndTitleContextMenu: {buttons: [2], handler: this._nameAndTitleContextMenu},

        },
        dragDrop: [{ dragSelector: '.vn-ew-slot img', dropSelector: '.vn-ew-slot' }, { dragSelector: '.vn-mo-item img', dropSelector: '.vn-pBody' }],
        window: {
            resizable: false,
            frame: false
        }
    }

    static PARTS = _getAppParts(true)

    constructor() {
        if (VisualNovelDialogues.instance) return VisualNovelDialogues.instance
        super()
        C.MODULE().app = this
        VisualNovelDialogues.#instance = C.MODULE().app
        this.#dragDrop = this.#createDragDropHandlers();
        // fullslots=true - чтобы состояние отслеживалось для ВСЕХ возможных слотов (до 10 на сторону),
        // а не только для тех, что попадают в slotCount текущего активного UI-пресета на момент создания.
        // Иначе для "запасных" слотов (за пределами текущего slotCount) partsState[part] был бы undefined,
        // и они каждый раз рендерились бы с переходным/анимационным классом вместо обычного stable-класса.
        this.partsState = _appPartsKey(true).reduce((acc, part) => {return {...acc, [part]: "hidden"}}, {})
    }

    static #instance = null

    #dragDrop;

    static get instance() {
        return this.#instance
    }

    _canSeeVN(settingData = getSettings()) {
        return settingData.showVN && !game.user.getFlag(C.ID, "hideVN") && (!settingData.showForIds || settingData.showForIds.includes(game.user.id))
    }

    // Пиздец
    partsClassData = {headerSlider: ["slide", "hideUI"], leftSlider: ["slide", "hideUI"], rightSlider: ["slide", "hideUI"], editWindow: ["fade", "editMode"], background: ["fade", "hideBack"], foreground: ["fade", "hideUI"]}
    _getPartClass=(part, settingData = getSettings(), uiData = PresetUIClass.getActivePreset()) => {
        const curState = this.partsState[part]
        const partIsActive = uiData.activeElements[part] || ["editWindow", "background", "foreground"].includes(part)
        let partDoesNotHide = !settingData[this.partsClassData[part][1]]
        if (part == "editWindow") partDoesNotHide = !partDoesNotHide
        const newState = (this._canSeeVN(settingData) && partDoesNotHide && partIsActive) ? "shown" : "hidden"
        this.partsState[part] = newState
        return (curState == newState) ? `vn-${newState}` : `vn-${newState}-${this.partsClassData[part][0]}`
    }

    _configureRenderOptions(options) {
        super._configureRenderOptions(options);
        options.parts = this.renderParts
    }

    async _prepareContext(options) {
        // bodyClass, shownElements, editWindowClass, activeElements, slidersClass, slidersSet, activeSpeakers
        const settingData = getSettings();
        // Проверка наполненности activeSpeakers
        const _empty = getEmptyActiveSpeakers();
        settingData.activeSpeakers = foundry.utils.mergeObject(settingData.activeSpeakers, _empty, {overwrite: false});

        // uiData
        const uiData = PresetUIClass.getActivePreset()

        // Отображение элементов исходя из прав пользователя
        const userPerm = game.user.role
        const permSettings = foundry.utils.deepClone(game.settings.get(C.ID, "playersPermissions"))
        let shownElements = Object.keys(permSettings).reduce((acc, el) => {
            acc[el] = permSettings[el].includes(userPerm)
            return acc
        }, {})
        shownElements["honeycomb"] = shownElements["editWindow"] || shownElements["locationSubChanges"]

        const data = {
            hideUI: settingData.hideUI,
            editMode: settingData.editMode,
            showVN: settingData.showVN && !game.user.getFlag(C.ID, "hideVN")
                && (game.user.isGM || !settingData.showForIds || settingData.showForIds?.includes(game.user.id))
        }

        // Установка стилей элементов для добавления плавной анимации появления/скрытия в зависимости от их текущего состояния
        const css = {
            editWindowWidth: 25+(Math.max(uiData.slotCount.left, uiData.slotCount.right)-3)*2 + "%",
            pFieldClass: settingData.editMode && data.showVN && game.user.isGM ? "" : "vn-hidden",
            playerListGlow: settingData.showForIds ? " vn-glow" : "",
            headerFont: game.settings.get(C.ID, "fontFamily"),
        }

        const portraitAddData = !this.renderParts.some(part => part.includes("Portrait")) ? {} : {
            worldOffsetY: game.settings.get(C.ID, "worldOffsetY"),
            worldWidthEqualFrame: game.settings.get(C.ID, "worldWidthEqualFrame"),
        }

        return { _data: settingData, _uiData: uiData, _slidersSet: SlidersSetClass.getActiveSet(), ...css, shownElements, ...uiData, ...data, portraitAddData };
    }

    async _preparePartContext(partType, context) {
        const settingData = context._data
        const side = partType.includes("left") ? "left" : "right"
        let index
        if (["leftSlider", "rightSlider"].includes(partType)) partType = "slider"
        if (partType.includes("Portrait")) {
            index = partType.replace(/(?:left|right|center)|Portrait/g, '')
            partType = "portrait"
        }
        switch (partType) {
            case "headerSlider":
                // Неактивная очередь
                const _order = Object.keys(settingData.order).reduce((acc, current) => {
                    for (let i = 0; i < 6; i++) {
                        acc[current][i] = settingData.order[current][i] || {}
                    }
                    return acc
                }, {"left": [], "right": [], "center": []})
                const activeLocation = settingData.location
                // order, +headerFont, locationName, parentLocation, editMode, timeNumbers, weather, weatherList, temperature, temperatureColor
                context = { ...context, _order, 
                    locationName: activeLocation.locationName, 
                    parentLocation: activeLocation.parentLocation, 
                    editMode: (settingData.editMode && context.shownElements["editWindow"]),
                    time: getTime(activeLocation.knowTime, settingData),
                    timeNumbers: getTime(true, settingData).split(""),
                    weather: activeLocation.weather || settingData.weatherList.find(w => w.name == "Неизвестная погода"),
                    weatherList: settingData.weatherList,
                    temperature: activeLocation.temperature,
                    temperatureColor: _getTemperatureColor(activeLocation.temperature),
                    headerImg: context._slidersSet.headerImg,
                    headerClass: this._getPartClass(partType, settingData, context._uiData),
                };
                // +shownElements, +activeElements(uiData), +slidersClass, +slidersSet
                break;
            case "background":
                // hideBack, backgroundImage
                context = { ...context,
                    backgroundImage: settingData.location.backgroundImage.replace(`(`, `\\(`).replace(`)`, `\\)`),
                    backgroundClass: this._getPartClass(partType, settingData, context._uiData),
                }
                // +bodyClass
                break;
            case "foreground":
                // Кнопки справа сверху
                let selectors = selectorArray()
                selectors = Object.keys(selectors).reduce((acc, current) => {
                    acc.push({
                        type: current,
                        name: game.i18n.localize(`${current == "TabCompendium" ? "SIDEBAR" : "DOCUMENT"}.${current}`),
                        icon: selectors[current],
                        active: game.settings.get(C.ID, `selector${current}`)
                    })
                    return acc
                }, [])
                const players = foundry.utils.deepClone(game.users.filter(u => u.active)).map(u => {
                    return {
                        id: u.id,
                        name: u.name,
                        color: u.color,
                        hidden: u.getFlag(C.ID, "hideVN"),
                        active: settingData.showForIds ? settingData.showForIds?.includes(u.id) : true,
                    }
                })
                // +hideUI, isGM, hasEpicRoll, showHintButton, selectorOpen, selectors, +playerListGlow, playerListOpen, players, requests
                context = { ...context, selectors, players,
                    isGM: game.user.isGM,
                    hasEpicRoll: game.modules.get("epic-rolls-5e")?.active,
                    showHintButton: game.settings.get(C.ID, "hintButton"),
                    selectorOpen: !!game.user.getFlag(C.ID, "selectorOpen"),
                    playerListOpen: !!game.user.getFlag(C.ID, "playerListOpen"),
                    requests: settingData.requests.sort((a, b) => b.level - a.level),
                    foregroundClass: this._getPartClass(partType, settingData, context._uiData),
                    linkChanges: settingData.linkChanges,
                    hideBack: settingData.hideBack,
                    hideBackAndUiButtons: allowTo('uiChanges'),
                    discordColorClass: await game.modules.get(C.ID).discordIntegration?.getConnectionStatus() || 'dsm-gray',
                    canSeeDiscordMenu: game.user.isGM || game.user.id == game.settings.get(C.ID, "discordHostUserId"),
                    // Полоски спрайтов "Активного персонажа" - см. _getSpriteStripData: у GM это персонаж, выбранный
                    // в "Портретах" окна редактирования, у игрока - его собственный привязанный персонаж
                    spriteStripLeft: _getSpriteStripData("left", settingData),
                    spriteStripRight: _getSpriteStripData("right", settingData),
                }
                // +bodyClass, +shownElements, +editWindowClass
                break;
            case "editWindow":
                // +editWindowWidth, highlightEl, editActorData
                const highlightEl = settingData.editActiveSpeaker
                const editActor = settingData.activeSpeakers[highlightEl]
                const leftCheck = highlightEl.includes("left")
                const editActorData = {
                    hideName: editActor?.hideName || false,
                    hideTitle: editActor?.hideTitle || false,
                    name: editActor?.name || "",
                    title: editActor?.title || "",
                    scale: editActor?.scale || 100,
                    offsetX: (editActor?.[leftCheck ? "offsetXl" : "offsetXr"])*(leftCheck ? -1 : 1) || 0,
                    offsetY: editActor?.offsetY*-1 || 0,
                    mirrorX: editActor?.mirrorX || false,
                    widthEqualFrame: editActor?.widthEqualFrame || false,
                }
                const numArray = C.numArray
                const activeSpeakers = ["left", "right"/*, "center"*/].reduce((acc, side) => {
                    acc[side] = numArray.slice(0, context._uiData.slotCount[side]).map(index => {return {
                        isEdit: highlightEl == `${side}${index}`,
                        index: index,
                        active: [...settingData.activeSlots.left, ...settingData.activeSlots.right]?.includes( `${side}${index}`), 
                        ...(settingData.activeSpeakers[`${side}${index}`] || {})}})
                    if (side == "right") acc[side].reverse()
                    return acc
                }, {"left": [], "right": []/*, "center": []*/})
                context = { ...context, editActorData, activeSpeakers, 
                    editWindowClass: this._getPartClass(partType, settingData, context._uiData),
                    showEditWindow: allowTo("editWindow"),
                }
                // +editWindowClass, activeSpeakers
                break;
            case "slider":
                // +offset(uiData), +pFieldClass, 
                const masterSlotPos = getMasterSlot(side, context._uiData)
                const masterSlotSpeaker = settingData.activeSpeakers[masterSlotPos]
                // +activeElements(uiData), +slidersClass, +slidersSet, activeSpeakers
                context = { ...context, side, 
                    slider: context._slidersSet[`${side}Slider`],
                    sliderBack: context._slidersSet[`${side}SliderBack`],
                    sliderClass: this._getPartClass(`${side}Slider`, settingData, context._uiData),
                    name: masterSlotSpeaker ? (masterSlotSpeaker.hideName ? game.settings.get(C.ID, "hiddenNamePlaceholder") : masterSlotSpeaker.name) : "",
                    title: masterSlotSpeaker ? (masterSlotSpeaker.hideTitle ? game.settings.get(C.ID, "hiddenTitlePlaceholder") : masterSlotSpeaker.title) : "",
                }
                break;
            case "portrait":
                const position = `${side}${index}`
                let speaker = {}
                let portraitData = settingData.activeSpeakers[position]
                if (portraitData) {
                    const numIndex = C.numArray.indexOf(index)
                    portraitData.offsetY -= context.portraitAddData.worldOffsetY
                    portraitData.offsetX = ((side == "left") ? portraitData.offsetXl : portraitData.offsetXr) * -1
                    portraitData._mirrorX = (!!portraitData.mirrorX == (side == "left"))
                    if (context.portraitAddData.worldWidthEqualFrame) portraitData.widthEqualFrame = true
                    const isActive = [...settingData.activeSlots.left, ...settingData.activeSlots.right]?.includes(position)
                    speaker = {...portraitData, zIndex: 31-numIndex-(isActive ? 0 : 10), active: isActive}
                }
                context = { ...context, side, index, speaker }
                break
        }
        return context
    }

    _preRender(context, options) {
        // При ререндере боковых слайдеров все элементы (части) Портретов исчезают, так как они находятся внутри Слайдеров
        // Как вариант, можно было бы ререндерить элемент Портретов при рендере Слайдеров, но это сбивало бы анимации и всё такое, так что ререндера нужно избежать
        // Для этого мы перетаскиваем все Портреты в основной элемент Приложения перед рендером, и закидываем в обновлённые слайдеры после рендера
        if (this.renderParts.some(part => part.includes("Slider")) && !options.isFirstRender) {
            const body = document.getElementById("vn-body")
            const portraitEls = body.querySelectorAll(".vn-pBody")
            portraitEls.forEach(el => body.appendChild(el))
        }
    }

    _bringToFront() {
        document.getElementById("vn-body").style.zIndex = game.settings.get(C.ID, "zIndex")
    }

    _onRender(context, options) {
        // Устанавливаем z-index приложения
        const html = $(this.element)
        document.getElementById("vn-body").style.zIndex = game.settings.get(C.ID, "zIndex")

        // Инициализация DragDrop - привязываем на каждом рендере, т.к. новые
        // перетаскиваемые элементы (слоты окна редактирования, очередь) появляются
        // в DOM только при последующих рендерах, а DragDrop.bind() находит только
        // те элементы, что существуют в DOM в момент вызова.
        this.#dragDrop.forEach((d) => d.bind(this.element));

        // Удаляем все лишние Портреты
        const portraitEls = html[0].querySelectorAll(".vn-pBody")
        const order = C.numArray
        const slotCount = PresetUIClass.getActivePreset().slotCount
        const slotCountPositions = {left: order.slice(0, slotCount.left), right: order.slice(0, slotCount.right)}
        let portraitElsRem = []
        portraitEls.forEach(el => {
            if (!slotCountPositions[el.dataset.side].includes(el.dataset.index)) el.remove()
            else portraitElsRem.push(el)
        })
        // Перемещаем все Портреты в Слайдеры
        const portraits = {
            left: Array.from(portraitElsRem).filter(el => el.dataset.side == "left").sort((a, b) => order.indexOf(a.dataset.index) - order.indexOf(b.dataset.index)),
            right: Array.from(portraitElsRem).filter(el => el.dataset.side == "right").sort((a, b) => order.indexOf(b.dataset.index) - order.indexOf(a.dataset.index)),
        }
        const slidersBox = {
            left: document.getElementById("vn-left-portraits"),
            right: document.getElementById("vn-right-portraits"),
        }
        portraits.left.forEach(el => slidersBox.left.appendChild(el))
        portraits.right.forEach(el => slidersBox.right.appendChild(el))

        // Слушатели
        // - EditWindow: Подсвечивание полей ввода при изменении
        html.find('.vn-edit-name, .vn-edit-title').off('change.vnHighlight').on('change.vnHighlight', function() {
            $(this).addClass('vn-hlight');
            html[0].querySelector('.vn-edit-apply').classList.toggle('vn-save-pulse', true);
        });
        // Поиск элемента редактируемого портрета
        const getActorEl = (pos = peekSetting("editActiveSpeaker")) => document.querySelector(`.vn-portrait.${pos} img`)
        // - EditWindow: Изменение масштаба
        html.find('input[name="scale"]').off('input.vnScale').on('input.vnScale', function(event) {
            $(this).addClass('vn-hlight');
            html[0].querySelector('.vn-edit-apply').classList.toggle('vn-save-pulse', true);
            const actorEl = getActorEl();
            const newVal = event.currentTarget.value
            actorEl.style.transform = actorEl.style.transform.replace(/scale\((-?\d+(?:\.\d+)?)\)/g, `scale(${newVal * 0.01})`);
            const counterEl = html.find('.range-scale-value');
            counterEl.text(`${newVal}%`);
        })
        // - EditWindow: Перемещение портрета по оси X
        html.find('input[name="coordX"]').off('input.vnCoordX').on('input.vnCoordX', function(event) {
            $(this).addClass('vn-hlight');
            html[0].querySelector('.vn-edit-apply').classList.toggle('vn-save-pulse', true);
            const actorEl = getActorEl();
            actorEl.style.left = `${event.currentTarget.value}px`;
            const counterEl = html.find(`.range-coordX-value`);
            counterEl.text(event.currentTarget.value);
        })
        // - EditWindow: Перемещение портрета по оси Y
        html.find('input[name="coordY"]').off('input.vnCoordY').on('input.vnCoordY', function(event) {
            $(this).addClass('vn-hlight');
            html[0].querySelector('.vn-edit-apply').classList.toggle('vn-save-pulse', true);
            const actorEl = getActorEl();
            actorEl.style.top = `${(event.currentTarget.value*-1) - game.settings.get(C.ID, "worldOffsetY")}px`;
            const counterEl = html.find(`.range-coordY-value`);
            counterEl.text(event.currentTarget.value);
        })
        // - EditWindow: Дополнительные настройки
        // -- Отразить портрет по оси X
        html.find('input[name="mirrorX"]').off('change.vnMirrorX').on('change.vnMirrorX', function(event) {
            if (!allowTo("editWindow")) return
            event.target.parentElement.classList.add('vn-hlight');
            html[0].querySelector('.vn-edit-apply').classList.toggle('vn-save-pulse', true);
            const actorBodyEl = document.querySelector(`.vn-portrait.${peekSetting("editActiveSpeaker")} img`)
            if (!actorBodyEl) return
            actorBodyEl.style.transform = actorBodyEl.style.transform.replace(/scaleX\(\s*-?1\s*\)/g, m => m === "scaleX(-1)" ? "scaleX(1)" : "scaleX(-1)")
        })
        // -- Ширина портрета = ширине рамки
        html.find('input[name="widthEqualFrame"]').off('change.vnWidthEqFrame').on('change.vnWidthEqFrame', function(event) {
            if (!allowTo("editWindow")) return
            event.target.parentElement.classList.add('vn-hlight');
            html[0].querySelector('.vn-edit-apply').classList.toggle('vn-save-pulse', true);
            const actorBodyEl = document.querySelector(`.vn-portrait.${peekSetting("editActiveSpeaker")}`)
            if (!actorBodyEl) return
            if (event.target.checked) {
                actorBodyEl.style.width = "100%"
                actorBodyEl.style.height = "auto"
            } else {
                actorBodyEl.style.removeProperty('width')
                actorBodyEl.style.removeProperty('height')
            }
        })
        // - Температура: Изменение (локально)
        html.find('input[name="temperature"]').off('input.vnTempPreview').on('input.vnTempPreview', function(event) {
            const color = _getTemperatureColor(parseInt(event.currentTarget.value));
            const thermometerEl = html.find('.vn-thermometer');
            thermometerEl[0].style.color = color;
            const tooltipEl = document.getElementById('tooltip')
            if (tooltipEl.textContent.search(/[0-9]+°C/) != -1) tooltipEl.textContent = `${event.currentTarget.value}°C`;
        })
        // - Температура: Изменение (глобально)
        html.find('input[name="temperature"]').off('change.vnTempCommit').on('change.vnTempCommit', async function(event) {
            if (!allowTo('locationSubChanges')) return
            const settingData = getSettings();
            const location = getLocation(settingData)
            const color = _getTemperatureColor(parseInt(event.currentTarget.value));
            location.forEach(m => {
                m.temperature = parseInt(event.currentTarget.value)
                m.temperatureColor = color
            })
            await requestSettingsUpdate(settingData, {renderData: {renderParts: ["headerSlider"]}})
        });
        // - Прочее: Наведение на портрет выводит его имя на плашку
        let timeoutId;
        html[0].querySelectorAll('.vn-pField').forEach(activeElement => {
            if (activeElement.dataset.vnHoverBound) return
            activeElement.dataset.vnHoverBound = "true"
            const _isLeft = activeElement.parentElement.dataset.pos.includes("left")
            const side = _isLeft ? "left" : "right"
            const textParEl = _isLeft ? document.getElementById(`vn-left-text`) : document.getElementById(`vn-right-text`)
            activeElement.addEventListener('mouseover', function() {
                timeoutId = setTimeout(function() {
                    const portraitData = getActivePortrait(activeElement.parentElement.dataset.id)
                    if (portraitData) {
                        textParEl.querySelector(`.vn-name`).textContent = (portraitData?.hideName ? game.settings.get(C.ID, "hiddenNamePlaceholder") : portraitData?.name) || ""
                        textParEl.querySelector(`.vn-title`).textContent = (portraitData?.hideTitle ? game.settings.get(C.ID, "hiddenTitlePlaceholder") : portraitData?.title) || ""
                    }
                    clearTimeout(timeoutId);
                }, 750); 
            });
            activeElement.addEventListener('mouseout', function() {
                const settingData = getSettings()
                const uiData = PresetUIClass.getActivePreset()
                const portraitData = settingData.activeSpeakers[side + uiData.masterSlot[side]]
                textParEl.querySelector(`.vn-name`).textContent = (portraitData?.hideName ? game.settings.get(C.ID, "hiddenNamePlaceholder") : portraitData?.name) || ""
                textParEl.querySelector(`.vn-title`).textContent = (portraitData?.hideTitle ? game.settings.get(C.ID, "hiddenTitlePlaceholder") : portraitData?.title) || ""
                clearTimeout(timeoutId);
            });
        })
        // - Прочее: Наведение на кнопку переключения оторажения списка игроков убирает подсветку (если была)
        const playerListOpenEl = document.getElementById(`vn-player-list-open`)
        if (playerListOpenEl && !playerListOpenEl.dataset.vnHoverBound) {
            playerListOpenEl.dataset.vnHoverBound = "true"
            playerListOpenEl.addEventListener('mouseover', (event) => {
                event.target.classList.remove("vn-glow")
            })
        }
        // - Полоска спрайтов "Активного персонажа": прокрутка колесом мыши по горизонтали
        html.find('.vn-sprite-strip').off('wheel.vnSpriteScroll').on('wheel.vnSpriteScroll', function(event) {
            if (!event.originalEvent.deltaY) return
            event.preventDefault()
            this.scrollLeft += event.originalEvent.deltaY
        })

        // - Визуальные эффекты: слои затемнения фона и "режима ряда" пересобираются/обновляются
        // на каждом рендере окна, синхронно с текущими settings (см. блок "Визуальные эффекты" ниже файла)
        const fxLayers = _ensureEffectLayers(document.getElementById("vn-body"))
        const fxSettings = getSettings()
        fxLayers.darken.classList.toggle("vn-fx-active", !!fxSettings.darkenBack)
        _updateRowLayer(fxLayers.row, fxSettings)

        // - Визуальные эффекты: масштабирование/смещение фона (VNLocation.scale/offsetX/offsetY,
        // диалог "Масштабирование" в LocationPicker) и медленная прокрутка фона (переключатель в панели
        // "Эффекты", направление/зацикленность/скорость - настройки bgScrollDirection/bgScrollLoop/
        // bgScrollSpeed). Статический кроп (масштаб + положение жёлтой рамки) применяется через
        // background-size/background-position (bgSizeX/Y, bgPosX/Y - готовые проценты, разрешённые ОДИН
        // РАЗ в диалоге на экране ГМа, см. apps/locationPicker.js openScaleDialog/computeFrame - здесь
        // они просто копируются в инлайн-стиль без пересчёта на каждый рендер). Прокрутка - отдельный,
        // полностью независимый от кропа transform:scale(1.06)+translateX(...) (--vn-bg-scale/--vn-bg-pan,
        // см. _injectEffectStyles за transform/keyframes) - фиксированный запас масштаба поверх уже
        // выбранного кропа, панорамирующий ТОЛЬКО по оси X, поэтому вертикальное положение при прокрутке
        // всегда остаётся ровно тем, что выбрано рамкой в "Масштабировании" (background-position-y
        // прокруткой не трогается - именно так и выполняется требование "не опускаться ниже/выше при
        // смене рамки масштабирования"). Легаси-локации без bgSizeX/Y (масштабированные до этой фичи)
        // продолжают рендериться старым способом - равномерный transform:scale(location.scale) поверх
        // обычного background-size:cover;background-position:center (styles/module.css, не тронут), что
        // визуально идентично центрированному кропу. Ниже в этом же блоке - ещё и размытие фона
        // (переключатель "Блюр фона", сила - настройка bgBlurStrength), см. комментарий в конце блока.
        // Вынесено в отдельную функцию _applyBackgroundVisualEffects() (см. ниже по файлу, рядом с
        // _updateRowLayer) - она умеет применять эти стили/классы к УЖЕ СУЩЕСТВУЮЩЕМУ #vn-background-image
        // без пересборки DOM, что важно для плавных CSS-transition (см. правку "блюр телепортируется"
        // 2026-08-29 ниже в проектных заметках): Handlebars-рендер части "background" уничтожает и
        // пересоздаёт этот элемент, а transition не может анимировать свойство на только что созданном
        // узле (браузеру не от чего "оттолкнуться"). Поэтому переключатель "Блюр фона" в effectsPanel.js
        // больше НЕ запрашивает renderParts:["background"] - вместо этого Hooks.on("updateSetting", ...)
        // ниже по файлу вызывает эту функцию напрямую на уже существующем узле.
        _applyBackgroundVisualEffects()
    }

    // DragDrop
    #createDragDropHandlers() {
        return this.options.dragDrop.map((d) => {
        d.permissions = {
            dragstart: this._canDragStart.bind(this),
            drop: this._canDragDrop.bind(this),
        };
        d.callbacks = {
            dragstart: this._onDragStart.bind(this),
            drop: this._onDrop.bind(this),
        };
        return new DragDrop(d);
        });
    }
    
    _canDragDrop(event) {
        return true;
    }
    _canDragStart(event) {
        return true;
    }

    // Перетягивание (замена) портретов в окне редактирования
    _onDragStart(event) {
        // Объясняю прикол (в основном для будущего себя):
        // В EditWindow мы перетягиваем img элемент, а не элемент-слот. Это нужно для того чтоб мы не могли пустые элементы таскать. 
        // Да, уверен что есть решение получше, но вот сам его и ищи, умник блять.
        // Из-за этого в случае с EditWindow нам нужен родительский элемент, а в случае с очередью - сам элемент
        const slotEl = event.currentTarget.parentElement
        const actorId = slotEl.dataset.id

        if (!actorId) return {}
        const slotPos = slotEl.dataset.pos
        const actorFlags = searchPortrait(actorId, getSettings(), slotPos)
        let transferData = {
            type: "PortraitData",
            portraitSlot: slotPos,
            portraitData: actorFlags
        }
        if (slotEl.classList.contains("vn-mo-item")) {
            transferData.miniOrderData = {id: actorId, side: slotEl.dataset.side, index: Number(slotEl.dataset.index)}
        }
        if (actorFlags) event.dataTransfer.setData("text/plain", JSON.stringify(transferData));
    }

    /*
    transferData: {
        type: "PortraitData",
        portraitData: OBJECT
        portraitSlot: STRING
        miniOrderData: {id: STRING, side: STRING}
    }
    */
    async _onDrop(event) {
        const actorData = event.dataTransfer.getData('text/plain');
        if (!actorData || actorData === "") return
        let transferData = JSON.parse(actorData)
        if (!transferData) return

        const settings = getSettings()
        if (transferData.type == "Actor") {
            const id = transferData.uuid?.split(".")?.pop() || ""
            const portraitData = searchPortrait(id)
            if (portraitData) {
                transferData = {
                    type: "PortraitData",
                    portraitSlot: transferData.portraitSlot,
                    portraitData: portraitData
                }
            } else {
                return
            }
        }
        if (transferData.type != "PortraitData") return

        const targetEl = event.currentTarget
        const position = targetEl.dataset.pos

        // Добавление нового персонажа (портрета) через ActorPicker (../app/actorPicker.js)
        if (targetEl?.classList?.contains("vn-pBody")) {
            const currentSpeaker = settings.activeSpeakers[position]
            settings.activeSpeakers[position] = transferData.portraitData
            let renderParts = [`${position}Portrait`, "foreground"]
            // Если переносим из мини-очереди сверху - удаляем портрет из мини-очереди
            if (transferData.miniOrderData) {
                const _side = transferData.miniOrderData.side
                const _id = transferData.miniOrderData.id
                const _mIndex = transferData.miniOrderData.index
                const _index = (Number.isInteger(_mIndex) && settings.order[_side][_mIndex]?.id === _id)
                    ? _mIndex
                    : settings.order[_side].findIndex(el => el.id === _id)
                if (currentSpeaker) {
                    if (_index !== -1) {
                        settings.order[_side][_index] = {
                            id: currentSpeaker.id,
                            img: currentSpeaker.img,
                            name: `${currentSpeaker.name}${currentSpeaker.title ? `, ${currentSpeaker.title}` : ""}`,
                        }
                    }
                } else {
                    settings.order[_side] = _index !== -1
                        ? settings.order[_side].filter((el, i) => i !== _index)
                        : settings.order[_side].filter(el => el.id !== _id)
                }
                renderParts.push("headerSlider")
            }
            await requestSettingsUpdate(settings, {renderData: {renderParts}})
        // Окно редактирования VN - перемещение (смена) портрета
        } else if (targetEl?.classList?.contains("vn-ew-slot")) {
            let renderParts = [`${position}Portrait`, "foreground"]
            if (transferData.portraitSlot) {
                settings.activeSpeakers[transferData.portraitSlot] = getActivePortrait(targetEl.dataset.id, settings, position) || null
                renderParts.push(`${transferData.portraitSlot}Portrait`)
            }
            settings.activeSpeakers[position] = transferData.portraitData
            await requestSettingsUpdate(settings, {renderData: {renderParts}})
        } else {
            return false
        }
    }

    // Показать/скрыть интерфейс
    static async toggleVN(showForIds = null) {
        const forcedOpen = game.settings.get(C.ID, "permaForcedOpen")
        if (allowTo("displayControl")) {
            if (forcedOpen) {
                for (const user of game.users) {
                    await user.setFlag(C.ID, "hideVN", false)
                }
            }
            await quickSettingsUpdate({showVN: !peekSetting("showVN"), showForIds: showForIds}, {renderData: {fullRender: true}})
        } else {
            // ГМ может заблокировать личный выход игроков из новеллы (см. apps/effectsPanel.js) -
            // проверка та же, что и в _hideVN, т.к. это второй способ игрока скрыть VN лично для себя (хоткей "K")
            if (peekSetting("lockExit")) {
                ui.notifications.warn("Выход из новеллы заблокирован Мастером")
                return
            }
            const hideVN = game.user.getFlag(C.ID, "hideVN") || false;
            ui.notifications.info(game.i18n.localize(forcedOpen
                ? `${C.ID}.settings.${!hideVN ? "hideVN" : "dontHideVN"}`
                : `${C.ID}.settings.hiveVNforNow`
            ));
            await game.user.setFlag(C.ID, "hideVN", !hideVN);
            VisualNovelDialogues._render(null, true)
        }
    }

    /**
     * Renders specified parts of the Novel Dialogue Re:Mai interface.
     * 
     * @param {Array} parts - The parts of the interface to render. If empty, no parts are rendered unless fullRender is true.
     * @param {boolean} fullRender - If true, all parts of the interface are rendered by default.
     * @param {boolean} globalRender - If true, emits a socket event to synchronize rendering across clients.
     */
    static _render(parts = [], fullRender = false, globalRender = false) {
        // Предохранитель чтоб не выёбывался
        if (!VisualNovelDialogues.instance) return

        // ВАЖНО: сверяемся с ПОЛНЫМ (fullslots=true) набором частей - тем же самым, которым были
        // зарегистрированы static PARTS (см. _getAppParts(true) выше). Раньше здесь использовался
        // _appPartsKey() без fullslots=true, который берёт slotCount из ТЕКУЩЕГО активного UI-пресета
        // (может быть 3-4 на сторону) - из-за этого рендер портретов в слотах ЗА пределами текущего
        // slotCount молча отбрасывался фильтром, хотя сам DOM-контейнер для них уже существует.
        // Значения в activeSpeakers сохранялись корректно, а вот отрисовка - нет.
        if (fullRender) parts = _appPartsKey(true)
        else parts = parts.filter(p=>_appPartsKey(true).includes(p))
        // Штуки-дрюки
        if (parts.some(p=>p.includes("Portrait"))) {
            if (!parts.includes("editWindow") && peekSetting("editMode")) parts.push("editWindow")
            const masterSlots = PresetUIClass.getActivePreset().masterSlot
            if (parts.includes(`left${masterSlots.left}Portrait`) && !parts.includes("leftSlider")) parts.push("leftSlider")
            if (parts.includes(`right${masterSlots.right}Portrait`) && !parts.includes("rightSlider")) parts.push("rightSlider")
        }

        
        VisualNovelDialogues.instance.renderParts = parts
        VisualNovelDialogues.instance.render(true);

        if (globalRender) game.socket.emit(`module.${C.ID}`, { type: 'renderVN', data: parts });
    }

    // Действия
    static async _hideVN(event, target) {
        if (game.settings.get(C.ID, "viewMode")) return
        if (allowTo("locationChanges")) {
            await quickSettingsUpdate({showVN: false}, {renderData: {fullRender: true}})
        } else {
            // ГМ может заблокировать личный выход игроков из новеллы (см. apps/effectsPanel.js) -
            // на закрытие всей новеллы ГМом (ветка выше, allowTo("locationChanges")) это не влияет
            if (peekSetting("lockExit")) {
                ui.notifications.warn("Выход из новеллы заблокирован Мастером")
                return
            }
            await game.user.setFlag(C.ID, "hideVN", !game.user.getFlag(C.ID, "hideVN"))
            VisualNovelDialogues._render(null, true)
        }
    }
    static _openActorSheet(event, target) {
        const sheet = game.user.character?.sheet
        if (sheet) {
            sheet.render(true)
        } else {
            ui.notifications.info(game.i18n.localize(`${C.ID}.errors.noSheet`))
        }
    }
    static async _toggleUI(event, target) {
        if (!allowTo("locationChanges")) return
        // "Режим ряда" (apps/effectsPanel.js, .vn-fx-toggle-row) больше не может остаться
        // включённым после закрытия панели "Эффекты" (см. Hooks.on("closeEffectsPanel", ...)
        // ниже в этом файле) - панель сама выключает его при закрытии, так что здесь эта
        // кнопка снова просто переключает hideUI, без специального случая под rowMode
        // (раньше он тут был - см. историю правок от 2026-08-27 - но раз "застрять" в режиме
        // ряда с закрытой панелью теперь невозможно, дублировать в двух местах не нужно).
        await quickSettingsUpdate({hideUI: !peekSetting("hideUI")}, {renderData: {renderParts: ["headerSlider", "leftSlider", "rightSlider", "foreground"]}})
    }
    static async _hideBack(event, target) {
        if (!allowTo("locationChanges")) return
        await quickSettingsUpdate({hideBack: !peekSetting("hideBack")}, {renderData: {renderParts: ["background", "foreground"]}})
    }
    static _discordMenu(event, target) {
        DiscordMenu._render(null, true)
    }
    static async _selectorToggle(event, target) {
        await game.user.setFlag(C.ID, "selectorOpen", !game.user.getFlag(C.ID, "selectorOpen"))
        VisualNovelDialogues._render(["foreground"], null)
    }
    static _selectorButtons(event, target) {
        // dont ask me, ok?
        const _type = {"ChatMessages": "chat","Combats": "combat","Scenes": "scenes","Actors": "actors","Items": "items","JournalEntries": "journal","RollTables": "tables","CardsPlural": "cards","Playlists": "playlists","TabCompendium": "compendium","Settings": "settings"}
        const tabApp = ui[_type[target.dataset.type]];
        if (!tabApp) return;
        tabApp.renderPopout(tabApp);
    }
    static async _togglePlayerList(event, target) {
        await game.user.setFlag(C.ID, "playerListOpen", !game.user.getFlag(C.ID, "playerListOpen"))
        VisualNovelDialogues._render(["foreground"], null)
    }
    static async _showPlayerListForAll(event, target) {
        if (!allowTo('displayControl')) return
        await quickSettingsUpdate({showForIds: game.users.map(user => user.id)})
        VisualNovelDialogues._render(null, true)
    }
    static _playerListConMenu(event, target) {
        if (!allowTo('displayControl')) return
        function closeDropdownOnClickOutside(event) {
            const dropdown = document.querySelector('.vn-players-list-dropdown'); 
            if (!dropdown?.contains(event.target)) {
                dropdown?.remove();
                document.removeEventListener('click', closeDropdownOnClickOutside);
            }
        }
        // Закрываем все старые окошки
        const existingEls = document.querySelectorAll('.vn-players-list-dropdown')
        existingEls.forEach(el => el.remove())
        // Создаём новое окошко
        const _id = target.dataset.userId
        const dropdownListEl = document.createElement('nav')
        const olEl = document.createElement('ol')
        olEl.className = 'vn-context-items'
    
        const user = game.users.get(_id)
        const settings = getSettings()
        const showForIds = settings.showForIds && settings.showForIds?.length > 0 ? settings.showForIds : game.users.map(u => u.id)
        const isActive = showForIds.includes(_id)
    
        function createButton(key, icon, onClick) {
            const button = document.createElement('li')
            button.className = 'vn-context-item'
            button.innerHTML = `<i class="fas fa-${icon} fa-fw"></i><span>${game.i18n.localize(`${C.ID}.contextmenu.${key}`)}</span>`
            button.addEventListener('click', onClick)
            olEl.append(button)
        }
    
        if (user?.isGM) {
            // Выключаем VN для всех кроме себя
            createButton('onlyYou', 'street-view', async () => {
                const settings = getSettings()
                settings.showForIds = [game.user.id]
                await requestSettingsUpdate(settings, {renderData: {fullRender: true}})
            })
        } else {
            // Выключаем VN для всех кроме себя и выбранного
            createButton('dialogue', 'people-arrows', async () => {
                const settings = getSettings()
                settings.showForIds = [game.user.id, _id]
                await requestSettingsUpdate(settings, {renderData: {fullRender: true}})
            })
            // Переключаем отображение для выбранного
            createButton(`switch${isActive ? "Hide" : "Show"}`, `eye${isActive ? "-slash" : ""}`, async () => {
                const settings = getSettings()
                if (settings.showForIds && settings.showForIds?.length > 0) {
                    settings.showForIds = settings.showForIds.includes(_id) ? settings.showForIds.filter(id => id !== _id) : [...settings.showForIds, _id]
                } else {
                    settings.showForIds = game.users.map(u => u.id).filter(id => id !== _id)
                }
                await requestSettingsUpdate(settings, {renderData: {fullRender: true}})
            })
            // Если чувак скрывает сам - дать пизды флагу
            if (user?.getFlag(C.ID, "hideVN")) {
                createButton('turnOffHide', 'people-pulling', async () => {
                    await user.setFlag(C.ID, "hideVN", false)
                })
            }
        }
    
        dropdownListEl.className = 'vn-players-list-dropdown'
        dropdownListEl.append(olEl)
        target.appendChild(dropdownListEl)
        document.addEventListener('click', closeDropdownOnClickOutside);
    }
    // Медовые соты
    static _changeBackground(event, target) {
        if (!allowTo('locationChanges')) return
        new FilePicker({classes: ["filepicker"], current: C.portraitFoldersPath(), type: "image", displayMode: "thumbs", callback: async (image) => {
            if (image) {
                const settingData = getSettings()
                const location = getLocation(settingData)
                location.forEach(m => m.backgroundImage = image);
                await requestSettingsUpdate(settingData, {renderData: {renderParts: ["background"]}})
            };
        }}).render();
    }
    static _openSettingsMenu(event, target) {
        new VisualSettingsMenu().render(true, {left: (window.innerWidth - 760) / 2, top: (window.innerHeight - 560) / 2})
    }
    static async _toggleEditMode(event, target) {
        if (!allowTo('editWindow')) return
        await quickSettingsUpdate({editMode: !peekSetting("editMode")}, {renderData: {renderParts: ["editWindow", "foreground", ..._portraitPartsKeys()]}})
    }
    static async _toggleLinkChanges(event, target) {
        if (!allowTo('locationChanges')) return
        await quickSettingsUpdate({linkChanges: !peekSetting("linkChanges")}, {renderData: {renderParts: ["foreground"]}})
    }
    static async _resetChanges(event, target) {
        if (!allowTo('locationChanges')) return
        const settingData = getSettings()
        const originalLocation = settingData.locationList.find(m => m.id == settingData.location.id);
        if (originalLocation) {
            settingData.location = originalLocation;
            await requestSettingsUpdate(settingData, {renderData: {renderParts: ["background", "headerSlider"]}})
        } else {
            ui.notifications.error(game.i18n.localize(`${C.ID}.errors.noOriginalLocation`));
        }
    }
    static _epicRolls(event, target) {
        if (!game.user.isGM && !game.modules.get("epic-rolls-5e")?.active) return
        const epicRollButton = document.getElementById('chat-controls')?.querySelector('.epic-roll-chat-control')
        if (epicRollButton) epicRollButton.click()
    }
    static _effectsWindow(event, target) {
        if (!game.user.isGM) return
        new EffectsPanel().render(true)
    }
    static _mainGuideHint(event, target) {
        new Dialog({
            title: game.i18n.localize(`${C.ID}.dialogues.globalGuideTitle`),
            content: game.settings.get(C.ID, "globalGuideLocalization")[game.i18n.lang] || game.settings.get(C.ID, "globalGuideLocalization").en,
            buttons: {
            },
        }).render(true, {width: window.innerWidth*0.70, height: window.innerHeight*0.90})
    }

    // Окно редактирования
    static _openActorPicker(event, target) {
        if (!allowTo("editWindow")) return
        ActorPicker.open();
    }
    static _editWindowHint(event, target) {
        if (!allowTo("editWindow")) return
        new Dialog({
            title: game.i18n.localize(`${C.ID}.dialogues.editWindowTitle`),
            content: game.i18n.localize(`${C.ID}.dialogues.editWindowHint`),
            buttons: {
            },
        }).render(true)
    }
    static async _closeEditWindow(event, target) {
        if (!allowTo("editWindow")) return
        await quickSettingsUpdate({editMode: false}, {renderData: {renderParts: ["editWindow", "foreground", ..._portraitPartsKeys()]}})
    }
    static async _ewPortraitClick(event, target) {
        if (!allowTo("editWindow")) return
        const settingData = getSettings()
        if (event.type == "click") {
            const side = target.dataset.side
            const index = target.dataset.index
            const pos = side + index
            let renderParts = []
            // Активный портрет на соответствующей стороне только выбранный
            if (event.ctrlKey) {
                settingData.activeSlots[side] = [pos]
                renderParts.push(..._portraitPartsKeys().filter(p => p.startsWith(`${side}`)))
                // При настройке делаем слот мастер-слотом
                if (game.settings.get(C.ID, "masterSlotIsLastActive")) {
                    const preset = PresetUIClass.getActivePreset()
                    preset.masterSlot[side] = index
                    await PresetUIClass.updatePreset(preset.id, preset)
                    renderParts.push(`${side}Slider`)
                }
            // Переключение "активности" выбранного портрета
            } else if (event.shiftKey) {
                renderParts.push(`${pos}Portrait`)
                if (settingData.activeSlots[side].includes(pos)) {
                    settingData.activeSlots[side] = settingData.activeSlots[side].filter(slot => slot !== pos)
                } else {
                    settingData.activeSlots[side].push(pos)
                    // При настройке делаем слот мастер-слотом
                    if (game.settings.get(C.ID, "masterSlotIsLastActive")) {
                        const preset = PresetUIClass.getActivePreset()
                        preset.masterSlot[side] = index
                        await PresetUIClass.updatePreset(preset.id, preset)
                        renderParts.push(`${side}Slider`)
                    }
                }
            } else {
                settingData.editActiveSpeaker = pos
                renderParts.push(`editWindow`, `foreground`)
            }
            await requestSettingsUpdate(settingData, {renderData: {renderParts}})
        } else {
            if (!target.dataset.id) return
            const pos = target.dataset.side + target.dataset.index
            settingData.activeSpeakers[pos] = null
            await requestSettingsUpdate(settingData, {renderData: {renderParts: ["editWindow", `${pos}Portrait`]}})
        }
    }
    static _toggleNameOrTitle(event, target) {
        const key = target.dataset.key
        const settingData = getSettings()
        const pos = settingData.editActiveSpeaker
        const side = pos.includes('left') ? 'left' : 'right'  // left/right
        const portraitData = settingData.activeSpeakers[pos]
        if (!portraitData) {
            ui.notifications.warn(game.i18n.localize(`${C.ID}.errors.noPortrait`));
            return
        }
        const hidden = !target.classList.contains('fa-eye-slash')
        // Если редактируемый Портрет находится в мастер-слоте, скрываем имя/титул на плашке
        if (pos == getMasterSlot(side)) {
           // Скрываем имя на плашке
           const textParEl = document.getElementById(`vn-${side}-text`)
           const lowKey = key.toLowerCase()
           textParEl.querySelector(`.vn-${lowKey}`).textContent = (hidden ? game.settings.get(C.ID, `hidden${key}Placeholder`) : portraitData?.[lowKey]) || ""
        }
        // Меняем иконку глазика
        target.className = `vn-ew-hide fas fa-eye${hidden ? "-slash" : ""}`
        // Подсвечиваем кнопку "Сохранить"
        document.getElementById('vn-edit-window').querySelector('.vn-edit-apply').classList.toggle('vn-save-pulse', true);
    }
    static async _confirmChanges(event, target) {
        if (!allowTo("editWindow")) return
        let settingData = getSettings();
        const portraitData = settingData.activeSpeakers[settingData.editActiveSpeaker]
        if (!portraitData) {
            ui.notifications.warn(game.i18n.localize(`${C.ID}.errors.noPortrait`));
            return
        }
        const leftCheck = settingData.editActiveSpeaker.includes("left")

        const editWindowEl = document.getElementById('vn-edit-window')
        // Имя и титул
        portraitData.name = editWindowEl.querySelector('.vn-edit-name').value;
        portraitData.title = editWindowEl.querySelector('.vn-edit-title').value;
        // Отображение имени и титула
        editWindowEl.querySelectorAll('.vn-ew-hide').forEach(el => {
            const key = el.dataset.key
            portraitData[`hide${key}`] = el.classList.contains('fa-eye-slash')
        })
        // Масштаб и смещение
        portraitData.scale = parseInt(document.getElementById('vn-edit-scale').value);
        portraitData[leftCheck ? "offsetXl" : "offsetXr"] = parseInt(document.getElementById('vn-edit-offsetX').value)*(leftCheck ? -1 : 1);
        portraitData.offsetY = parseInt(document.getElementById('vn-edit-offsetY').value)*-1;
        // Дополнительные настройки
        portraitData.mirrorX = editWindowEl.querySelector('input[name="mirrorX"]').checked
        portraitData.widthEqualFrame = editWindowEl.querySelector('input[name="widthEqualFrame"]').checked

        settingData.activeSpeakers[settingData.editActiveSpeaker] = portraitData
        // Подтираем "hideName" и "hideTitle"
        // Ну и хуйня решение :(
        const newPortraitData = foundry.utils.deepClone(portraitData)
        delete newPortraitData.hideName
        delete newPortraitData.hideTitle
        settingData = await updatePortrait(newPortraitData.id, newPortraitData, settingData, true)
        await requestSettingsUpdate(settingData, {renderData: {renderParts: ["editWindow", `${settingData.editActiveSpeaker}Portrait`]}})
    }
    static _cancelChanges(event, target) {
        if (!allowTo("editWindow")) return
        VisualNovelDialogues._render(["editWindow", (getSettings().editActiveSpeaker + "Portrait")], null, true)
    }
    static _zeroSettings(event, target) {
        if (!allowTo("editWindow")) return
        const element = document.getElementById('vn-edit-window').querySelector('.vn-edit-slider-container')
        $(element.querySelector('input[name="scale"]')).val(100).trigger('input')
        $(element.querySelector('input[name="coordX"]')).val(0).trigger('input')
        $(element.querySelector('input[name="coordY"]')).val(0).trigger('input')
    }
    static async _deleteActor(event, target) {
        if (!allowTo("editWindow")) return
        const settingData = getSettings()
        settingData.activeSpeakers[settingData.editActiveSpeaker] = null
        await requestSettingsUpdate(settingData, {renderData: {renderParts: ["editWindow", `${settingData.editActiveSpeaker}Portrait`, "foreground"]}})
    }
    
    // Верхний слайдер
    static _locationClick(event, target) {
        if (!allowTo("locationChanges")) return
        if (event.type == "click") {
            const type = target.dataset.type
            LocationPicker.open(type, (type == "parent" ? `${getSettings().location?.parentLocation || ""}` : ""));
        } else {
            LocationPickerSettings.open("current")
        }
    }
    static async _headerClockClick(event, target) {
        if (!allowTo('locationSubChanges')) return
        const settings = getSettings()
        if (event.type == "contextmenu" && settings.editMode) {
            const clockDropdownEl = document.getElementById('vn-clock-dropdown');
            clockDropdownEl.style.display = clockDropdownEl.style.display == 'flex' ? "none" : 'flex';
        } else {
            // Если нажимаем куда-то не на часы - закрываем менюшку (дропдаун)
            if (!["vn-clock", "vn-time-body"].some(s => event.target.classList.contains(s))) return
            // - При выключенном editMode - открываем календарь
            if (!settings.editMode) {
                if (game.modules.get('foundryvtt-simple-calendar')?.active) SimpleCalendar.api.showCalendar()
            // - При включенном editMode - переключаем отображение времени на локации
            } else {
                if (!allowTo('locationSubChanges')) return
                const location = settings.location
                location.knowTime = !location.knowTime
                // - При включенном linkChanges - переключаем отображение времени И НА ОРИГИНАЛЬНОЙ ЛОКАЦИИ тоже
                if (settings.linkChanges) {
                    settings.locationList.find(m => m.id == location.id).knowTime = location.knowTime
                }
                await requestSettingsUpdate(settings, {renderData: {renderParts: ["headerSlider"]}})
            }
        }
    }
    static _timeButtons(event, target) {
        const numEls = Array.from(document.getElementById("vn-time")?.querySelectorAll('.vn-clock-number'))
        const index = target.dataset.index;
        const maxValues = [2, 9, ":", 5, 9];
        const minValues = [0, 0, ":", 0, 0];
        const timeArray = numEls.map(el => el.textContent);
        let currentDigit = parseInt(timeArray[index]);
        if (timeArray[0] === '2') {
            maxValues[1] = 3; // Если первая цифра часа 2, то вторая цифра может быть максимум 3
        }
    
        if (target.dataset.type == "plus") {
            currentDigit = (currentDigit + 1) > maxValues[index] ? minValues[index] : currentDigit + 1;
        } else {
            currentDigit = (currentDigit - 1) < minValues[index] ? maxValues[index] : currentDigit - 1;
        }
        const numEl = target.parentElement.querySelector('span');
        numEl.textContent = currentDigit
    }
    static async _confirmTimeUpdates(event, target) {
        if (!allowTo('locationSubChanges')) return
        const settings = getSettings();
        const dropdownEl = document.getElementById('vn-clock-dropdown');
        dropdownEl.style.display = 'none';

        const numEls = dropdownEl.querySelectorAll('.vn-clock-number');
        const time = Array.from(numEls).reduce((a, b) => a + b.textContent, "") || "12:30"

        if (useSimpleCalendar()) {
            const timeObj = SimpleCalendar.api.currentDateTime()
            timeObj.hour = parseInt(time.split(":")[0])
            timeObj.minute = parseInt(time.split(":")[1])
            SimpleCalendar.api.setDate(timeObj)
        } else {
            settings.clockTime = time
            await requestSettingsUpdate(settings, {renderData: {renderParts: ["headerSlider"]}})
        }
    }
    static _cancelTimeUpdates(event, target) {
        if (!allowTo('locationSubChanges')) return
        const timeEL = document.getElementById('vn-time')
        const clockEl = timeEL?.querySelector(".vn-clock");
        document.getElementById('vn-clock-dropdown').style.display = 'none';
        const time = getTime()
        clockEl.textContent = time

        const numEls = timeEL?.querySelectorAll('.vn-clock-number');
        numEls.forEach((el, i) => {
            el.textContent = time[i]
        })
    }
    static async _weatherClick(event, target) {
        if (!allowTo('locationSubChanges')) return
        const settingData = getSettings()
        const optionEl = event.target.closest('.vn-weather-option')
        const dropdownEl = document.getElementById('vn-weather')?.querySelector('.vn-weather-dropdown')

        // Клик по варианту в выпадающем меню
        if (optionEl) {
            if (!settingData.editMode) return
            if (optionEl.dataset.id === "new") {
                if (event.type !== "click") return
                if (dropdownEl) dropdownEl.style.display = 'none'
                VisualNovelDialogues._createWeather()
                return
            }
            if (event.type === "click") {
                // ЛКМ - выбрать погоду
                const chosen = settingData.weatherList.find(w => w.id === optionEl.dataset.id)
                if (!chosen) return
                getLocation(settingData).forEach(m => { m.weather = chosen })
                if (dropdownEl) dropdownEl.style.display = 'none'
                await requestSettingsUpdate(settingData, {renderData: {renderParts: ["headerSlider"]}})
            } else if (event.type === "contextmenu") {
                // ПКМ - удалить погоду
                const removed = settingData.weatherList.find(w => w.id === optionEl.dataset.id)
                if (!removed) return
                settingData.weatherList = settingData.weatherList.filter(w => w.id !== optionEl.dataset.id)
                const fallback = settingData.weatherList.find(w => w.name === "Неизвестная погода") || settingData.weatherList[0]
                settingData.locationList.forEach(m => { if (m.weather?.id === removed.id) m.weather = fallback })
                if (settingData.location.weather?.id === removed.id) settingData.location.weather = fallback
                await requestSettingsUpdate(settingData, {renderData: {renderParts: ["headerSlider"]}})
                ui.notifications.info(`${game.i18n.localize(`${C.ID}.header.deleteWeather1`)}${removed.name}${game.i18n.localize(`${C.ID}.header.deleteWeather2`)}`)
            }
            return
        }

        // Клик по самой иконке погоды - открыть/закрыть меню
        if (!settingData.editMode) return
        if (dropdownEl) dropdownEl.style.display = dropdownEl.style.display === 'flex' ? 'none' : 'flex'
    }
    static _createWeather() {
        if (!allowTo('locationSubChanges')) return
        new Dialog({
            title: game.i18n.localize(`${C.ID}.header.newWeather`),
            content: `
                <div class="flexcol">
                    <div class="form-group">
                        <label>${game.i18n.localize(`${C.ID}.header.weatherName`)}</label>
                        <input type="text" class="vn-new-weather-name"/>
                    </div>
                    <div class="form-group">
                        <label>Font Awesome</label>
                        <input type="text" class="vn-new-weather-icon" placeholder="fas fa-cloud" value="fas fa-cloud"/>
                    </div>
                </div>
            `,
            buttons: {
                common: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize(`${C.ID}.buttons.confirm`),
                    callback: async (html) => {
                        const name = html[0].querySelector('.vn-new-weather-name').value.trim() || game.i18n.localize(`${C.ID}.header.newWeather`)
                        const icon = html[0].querySelector('.vn-new-weather-icon').value.trim() || "fas fa-cloud"
                        const settingData = getSettings()
                        const newWeather = {name, icon, id: foundry.utils.randomID()}
                        settingData.weatherList.push(newWeather)
                        getLocation(settingData).forEach(m => { m.weather = newWeather })
                        await requestSettingsUpdate(settingData, {renderData: {renderParts: ["headerSlider"]}})
                    }
                }
            },
            default: "common",
        }).render(true)
    }
    static async _deletePortraitFromOrder(event, target) {
        if (!allowTo('miniOrder')) return
        const _side = target.dataset.side
        const _id = target.dataset.id
        if (!_id) return
        const settings = getSettings()
        settings.order[_side] = settings.order[_side].filter(el => el.id !== _id)
        await requestSettingsUpdate(settings, {renderData: {renderParts: ["headerSlider"]}})
    }
    // Дополнительно
    static async _createRequest(event, target) {
        if (!allowTo('requests')) return
        const img = game.user.character?.prototypeToken?.texture?.src
        if (!img) {
            ui.notifications.error(game.i18n.localize(`${C.ID}.errors.noCharacter`))
            return
        }
        let settingData = getSettings()
        const id = game.user.id
        const requestData = {
            level: parseInt(target.dataset.level),
            img: img,
            id: game.user.id,
            charId: game.user.character.id,
            name: game.user.character.name
        }
        settingData.requests = settingData.requests.filter(r => r.id != id)
        settingData.requests.push(requestData)

        // Временный костыль до обновления Advanced Requests
        const _options = {change: ["requestAdd"], requestId: id, renderData: {renderParts: ["foreground"]}}

        await requestSettingsUpdate(settingData, _options)
        // VisualNovelDialogues._render(["foreground"])
        playSound(parseInt(target.dataset.level))
    }
    static async _requestClick(event, target) {
        if (event.type == "click" && allowTo('requests')) {
            const _id = target.dataset.id
            const settingData = getSettings()
            const charId = target.dataset.charid
            const portraitData = searchPortrait(charId, settingData)
            settingData.requests = settingData.requests.filter(request => request.id != _id)
            let renderParts = ["foreground"]
            if (portraitData) {
                // Позиция уже существующего Портрета с charId завяки
                const swapPos = Object.keys(settingData.activeSpeakers).find(key => settingData.activeSpeakers[key]?.id === charId);
                // Позиция мастер-слота
                const masterSlot = getMasterSlot("left")
                if (swapPos != masterSlot) {
                    // Портрет в мастер-слоте
                    const masterSlotSpeaker = settingData.activeSpeakers[masterSlot] || null
                    // Если у нас уже есть Портрет с charId заявки, меняем местами его и Портрет в мастер-слоте (даже если мастер-слот пустой, чтобы не дублировать Портрет-заявку)
                    if (swapPos) settingData.activeSpeakers[swapPos] = masterSlotSpeaker

                    // Если в мастер-слоте кто-то был, но девать его некуда (нету swapPos), отправляем его в мини-очередь
                    if (masterSlotSpeaker && !swapPos) {
                        settingData.order["left"].push({
                            id: masterSlotSpeaker.id,
                            img: masterSlotSpeaker.img,
                            name: `${masterSlotSpeaker.name}${masterSlotSpeaker.title ? `, ${masterSlotSpeaker.title}` : ""}`,
                        })
                        if (settingData.order.length > 6) settingData.order["left"].shift()
                        renderParts.push("headerSlider")
                    }

                    // Делаем Портрет в мастер-слоте активным
                    if (!settingData.activeSlots["left"].includes(masterSlot)) {
                        settingData.activeSlots["left"].push(masterSlot)
                    }
                    
                    renderParts.push(`${masterSlot}Portrait`)
                    if (swapPos) renderParts.push(`${swapPos}Portrait`)
                    settingData.activeSpeakers[masterSlot] = portraitData
                }
            } else {
                ui.notifications.error(game.i18n.localize(`${C.ID}.errors.noCharacter`))
            }
            // Временный костыль до обновления Advanced Requests
            const _options = {change: ["requestsRemove"], requestId: _id, renderData: {renderParts}}

            await requestSettingsUpdate(settingData, _options)
            // VisualNovelDialogues._render(renderParts)
        } else {
            // Временный костыль до обновления Advanced Requests
            const _options = {change: ["requestsRemove"], requestId: target.dataset.id, renderData: {renderParts: ["foreground"]}}

            const settingData = getSettings()
            await quickSettingsUpdate({requests: settingData.requests.filter(request => request.id != target.dataset.id)}, _options)
            // VisualNovelDialogues._render(["foreground"])
        }
    }
    static async _portraitClick(event, target) {
        const settings = getSettings()
        const pos = target.dataset.pos
        const side = target.dataset.side
        if (event.type == "click" && allowTo('portraitInteraction') && pos) {
            let renderParts = [`${pos}Portrait`, "foreground"]
            if (game.user.isGM || event.target?.dataset?.id == game.user.character?.id) {
                const masterSlot = getMasterSlot(side)
                if (pos == masterSlot) return
                const portraitData = settings.activeSpeakers[pos]
                if (!portraitData) return
                const _toSwapData = settings.activeSpeakers[masterSlot] // буфер
                settings.activeSpeakers[masterSlot] = portraitData
                settings.activeSpeakers[pos] = _toSwapData
                renderParts.push(`${masterSlot}Portrait`)
            } else {
                const myPos = Object.keys(settings.activeSpeakers).find(_pos => {
                    if (settings.activeSpeakers[_pos]?.id === game.user.character?.id) return _pos;
                });
                if (!myPos) return
                const _toSwapData = settings.activeSpeakers[pos]
                settings.activeSpeakers[pos] = settings.activeSpeakers[myPos]
                settings.activeSpeakers[myPos] = _toSwapData
                renderParts.push(`${myPos}Portrait`)
            }
            await requestSettingsUpdate(settings, {renderData: {renderParts}})
        } else if (allowTo('miniOrder')) {
            const portraitData = settings.activeSpeakers[pos]
            settings.activeSpeakers[pos] = null
            let renderParts = [`${pos}Portrait`, "foreground"]
            const _id = target.dataset.id
            if (portraitData && !settings.order[side].some(item => item.id === _id)) {
                settings.order[side].push({
                    id: _id,
                    img: portraitData.img,
                    name: `${portraitData.name}${portraitData.title ? `, ${portraitData.title}` : ""}`,
                })
                if (settings.order[side].length > 6) settings.order[side].shift()
                renderParts.push("headerSlider")
            }
            await requestSettingsUpdate(settings, {renderData: {renderParts}})
        }
    }
    // Клик по миниатюре в полоске спрайтов "Активного персонажа" - меняет отображаемое изображение
    // в текущем слоте (главное изображение или один из доп. спрайтов)
    static async _spriteSelect(event, target) {
        const pos = target.dataset.pos
        const side = target.dataset.side
        const src = target.dataset.src
        if (!pos || !src) return
        const settings = getSettings()
        const speaker = settings.activeSpeakers[pos]
        if (!speaker) return
        // Режим 1 (GM): менять можно только в режиме редактирования, и только тот слот, что сейчас
        // выбран в "Портретах" (editActiveSpeaker) - т.е. ровно тот, чью полоску мы показали
        if (game.user.isGM) {
            if (!settings.editMode || !allowTo('editWindow') || settings.editActiveSpeaker !== pos) return
        // Режим 2 (игрок): только свой привязанный персонаж (Character Player анкета)
        } else {
            if (!allowTo('portraitInteraction') || speaker.id !== game.user.character?.id) return
        }
        if (speaker.img === src) return
        // Замораживаем оригинальное главное изображение при первом переключении - иначе после перезаписи
        // speaker.img новым значением мы бы навсегда потеряли, каким было настоящее "главное" изображение
        if (!speaker.mainImg) speaker.mainImg = speaker.img
        speaker.img = src
        await requestSettingsUpdate(settings, {renderData: {renderParts: [`${pos}Portrait`, "foreground"]}})
    }
    static async _nameAndTitleContextMenu(event, target) {
        const side = target.dataset.side
        const hideWhat = target.dataset.type
        const uiPreset = PresetUIClass.getActivePreset()
        const masterSlot = side + uiPreset.masterSlot[side]
        const settings = getSettings()
        const thisSideActiveSpeaker = settings.activeSpeakers[masterSlot]
        if (!thisSideActiveSpeaker) return
        thisSideActiveSpeaker[`hide${hideWhat}`] = !thisSideActiveSpeaker[`hide${hideWhat}`]
        await requestSettingsUpdate(settings, {renderData: {renderParts: [`${masterSlot}Portrait`]}})
    }
}

// Приводит запись доп. спрайта к единому виду {img, label}. Поддерживает и старый формат
// (просто строка-путь), и новый (объект с названием) - для обратной совместимости.
const _normalizeSprite = (s) => {
    if (!s) return null
    if (typeof s === "string") return { img: s, label: "" }
    if (typeof s === "object" && s.img) return { img: s.img, label: s.label || "" }
    return null
}

// Данные для полоски выбора спрайтов "Активного персонажа" на указанной стороне.
// Режим 1 (GM): доступно только в режиме редактирования, для персонажа, выбранного в "Портретах" (editActiveSpeaker).
// Режим 2 (игрок): показывает спрайты его привязанного персонажа (game.user.character); если один и тот же
// персонаж занимает 2 слота на ОДНОЙ стороне - берётся первый по порядку слот (никогда не оба сразу).
const _getSpriteStripData = (side, settingData = getSettings()) => {
    let pos = null
    if (game.user.isGM) {
        if (!settingData.editMode || !allowTo('editWindow')) return null
        const editPos = settingData.editActiveSpeaker
        if (!editPos || !editPos.startsWith(side)) return null
        pos = editPos
    } else {
        if (!allowTo('portraitInteraction')) return null
        const charId = game.user.character?.id
        if (!charId) return null
        const slotCount = PresetUIClass.getActivePreset().slotCount[side] || 0
        pos = C.numArray.slice(0, slotCount)
            .map(index => `${side}${index}`)
            .find(p => settingData.activeSpeakers[p]?.id === charId)
        if (!pos) return null
    }
    const speaker = settingData.activeSpeakers[pos]
    if (!speaker) return null
    const mainImg = speaker.mainImg || speaker.img
    const normalizedSprites = (speaker.sprites || []).map(_normalizeSprite).filter(Boolean)
    // Собираем финальный список без дублей по пути картинки (главное изображение - всегда первым)
    const seen = new Set()
    const spriteImages = []
    ;[{ img: mainImg, label: "" }, ...normalizedSprites].forEach(entry => {
        if (!entry.img || seen.has(entry.img)) return
        seen.add(entry.img)
        spriteImages.push({
            img: entry.img,
            tooltip: entry.label || game.i18n.localize(`${C.ID}.buttons.spriteSelect`)
        })
    })
    if (spriteImages.length <= 1) return null
    return { pos, side, spriteImages, activeSprite: speaker.img }
}

function playSound(reqLevel) {
    if (game.settings.get(C.ID, "requestsSound")) {
        AudioHelper.play({
            src: `modules/${C.ID}/templates/assets/request${reqLevel}.wav`,
            volume: game.settings.get("core", "globalInterfaceVolume"),
        });
    }
    game.socket.emit(`module.${C.ID}`, {
        type: 'playSound',
        data: reqLevel
    });
}


// Определение цвета для температуры
const _getTemperatureColor = (temperature) => {
    if (!temperature) {
        return "";
    }
    const colors = {
        color1: {red: 0, green: 15, blue: 115},
        color2: {red: 85, green: 255, blue: 0},
        color3: {red: 255, green: 30, blue: 0},
    }
    let fade = (temperature+100)/100;
    if (fade >= 1) {
        fade -= 1;
        colors.color1 = {red: 85, green: 255, blue: 0};
        colors.color2 = {red: 255, green: 30, blue: 0};
    }
    const gradient = {
        red: parseInt(Math.floor(colors.color1.red + ((colors.color2.red - colors.color1.red) * fade)), 10),
        green: parseInt(Math.floor(colors.color1.green + ((colors.color2.green - colors.color1.green) * fade)), 10),
        blue: parseInt(Math.floor(colors.color1.blue + ((colors.color2.blue - colors.color1.blue) * fade)), 10),
    }
    return `rgba(${gradient.red}, ${gradient.green}, ${gradient.blue}, 1)`;
}

// ——— Визуальные эффекты (тряска / вспышки / затемнение фона / режим ряда) ———
// Сделаны как отдельный самостоятельный слой поверх #vn-body, не завязанный на разметку
// background/foreground/portrait.hbs - чтобы не трогать существующие шаблоны и стили.
// Тряска и вспышки - одноразовые, разлетаются всем клиентам через socket (см. triggerVNEffect).
// Затемнение фона и режим ряда - постоянное состояние, хранится в settings (см. EffectsPanel),
// поэтому синхронизируется штатным механизмом модуля (updateSetting -> _render) без доп. socket-сообщений.

let _fxStylesInjected = false
function _injectEffectStyles() {
    if (_fxStylesInjected) return
    _fxStylesInjected = true
    const style = document.createElement("style")
    style.id = "vn-fx-styles"
    style.textContent = `
        #vn-fx-flash-layer, #vn-fx-darken-layer, #vn-fx-row-layer, #vn-fx-narrative-layer { position: absolute; inset: 0; pointer-events: none; }
        #vn-fx-flash-layer { z-index: 9000; opacity: 0; }
        #vn-fx-darken-layer { z-index: 5; background: #000; opacity: 0; transition: opacity .6s ease; }
        #vn-fx-darken-layer.vn-fx-active { opacity: 1; }
        #vn-fx-row-layer {
            z-index: 20; display: none; align-items: flex-end; justify-content: center;
            gap: 1.5vw; padding-bottom: 2vh; opacity: 0; transition: opacity .6s ease;
        }
        #vn-fx-row-layer.vn-fx-active { display: flex; opacity: 1; }
        #vn-fx-row-layer img { max-height: 70vh; max-width: 18vw; object-fit: contain; filter: drop-shadow(0 10px 18px rgba(0,0,0,.6)); }
        /* "Нарратив" (кнопка в панели "Эффекты") - полноэкранная одноразовая текстовая вставка:
           чёрный экран + закадровый текст ГМа по центру, курсивом. Плашки VN (шапка #vn-up и оба
           слайдера #vn-left/#vn-right под портретами) прячутся тем же плавным opacity-переходом. */
        #vn-fx-narrative-layer {
            z-index: 9600; background: #000; opacity: 0;
            display: flex; align-items: center; justify-content: center;
            transition: opacity 1s ease;
        }
        #vn-fx-narrative-layer.vn-fx-active { opacity: 1; pointer-events: auto; }
        #vn-fx-narrative-text {
            color: #fff; font-style: italic; text-align: center;
            max-width: 55%; font-size: 1.6vw; line-height: 1.6;
            opacity: 0; transition: opacity .5s ease; white-space: pre-wrap;
        }
        #vn-fx-narrative-text.vn-fx-active { opacity: 1; }
        #vn-up, #vn-left, #vn-right { transition: opacity 1s ease; }
        @keyframes vn-fx-shake-anim {
            0%, 100% { transform: translateX(0); }
            15% { transform: translateX(-14px) rotate(-1deg); }
            30% { transform: translateX(12px) rotate(1deg); }
            45% { transform: translateX(-10px); }
            60% { transform: translateX(8px); }
            75% { transform: translateX(-5px); }
            90% { transform: translateX(3px); }
        }
        /* Внимание: у классов-анимаций префикс "vn-fx-anim-", а НЕ просто "vn-fx-<действие>" -
           потому что effectsPanel.hbs использует "vn-fx-shake"/"vn-fx-flash-light"/"vn-fx-flash-dark"
           как классы для сами́х КНОПОК (селекторы под клик-листенеры в apps/effectsPanel.js).
           Если использовать одинаковые имена для кнопок и для анимаций - статичные свойства
           анимации (например background:#000 у вспышки тьмы) навсегда красят саму кнопку. */
        .vn-fx-anim-shake { animation: vn-fx-shake-anim .5s ease-in-out; }
        @keyframes vn-fx-flash-light-anim { 0% { opacity: .9; } 100% { opacity: 0; } }
        @keyframes vn-fx-flash-dark-anim { 0% { opacity: .85; } 100% { opacity: 0; } }
        .vn-fx-anim-flash-light { background: #fff; animation: vn-fx-flash-light-anim .4s ease-out; }
        .vn-fx-anim-flash-dark { background: #000; animation: vn-fx-flash-dark-anim .5s ease-out; }
        @keyframes vn-fx-sprite-flash-light-anim { 0% { filter: brightness(2.6) saturate(1.4); } 100% { filter: brightness(1); } }
        @keyframes vn-fx-sprite-flash-dark-anim { 0% { filter: brightness(.15); } 100% { filter: brightness(1); } }
        .vn-fx-sprite-flash-light { animation: vn-fx-sprite-flash-light-anim .4s ease-out; }
        .vn-fx-sprite-flash-dark { animation: vn-fx-sprite-flash-dark-anim .5s ease-out; }
        /* Окно панели "Эффекты" (apps/effectsPanel.js) */
        .vn-fx-panel-body .window-content { padding: 8px; }
        .vn-fx-panel .vn-fx-section { margin-bottom: 8px; }
        .vn-fx-panel .vn-fx-row { display: flex; gap: 6px; }
        .vn-fx-panel .vn-fx-row button { flex: 1; }
        .vn-fx-panel .vn-fx-label { display: block; margin-bottom: 4px; }
        .vn-fx-panel button.vn-fx-active { background: #4a7; color: #fff; }
        .vn-fx-panel .vn-fx-hint { font-size: 11px; opacity: .7; margin-top: 6px; }
        /* Масштабирование/смещение фона (диалог "Масштабирование" в LocationPicker,
           apps/locationPicker.js -> VNLocation.scale/offsetX/offsetY) применяется через инлайн
           background-size/background-position (см. main.js _onRender) - НЕ через этот transform: он
           используется только медленной прокруткой фона (переключатель "Прокрутка фона" в панели
           "Эффекты") - фиксированный запас масштаба (+6%) поверх уже выбранного кропа, чтобы панораме
           было куда двигаться без прогалин по краям. Легаси-локации без сохранённого кропа - исключение,
           см. main.js _onRender: для них transform:scale() по-прежнему несёт саму величину масштаба.
           --vn-bg-scale/--vn-bg-pan выставляются в JS (main.js _onRender) - см. комментарии там. */
        #vn-background-image {
            transform: scale(var(--vn-bg-scale, 1));
            transform-origin: center center;
            /* Плавное вкл/выкл размытия (переключатель "Блюр фона") - без настройки скорости,
               фиксированная длительность 2.5 секунды (в обе стороны). */
            transition: filter 2.5s ease;
        }
        #vn-background-image.vn-fx-bgscroll-right {
            animation-name: vn-fx-bgscroll-right-anim;
            animation-duration: 45s;
            animation-timing-function: ease-in-out;
        }
        #vn-background-image.vn-fx-bgscroll-left {
            animation-name: vn-fx-bgscroll-left-anim;
            animation-duration: 45s;
            animation-timing-function: ease-in-out;
        }
        /* "Цикл" - анимация бесконечно идёт туда-обратно (alternate), при достижении любого края
           разворачивается и ползёт назад. "Конец" - проигрывается один раз и останавливается
           (fill-mode:forwards) на конечном (крайнем) положении. */
        #vn-background-image.vn-fx-bgscroll-loop {
            animation-iteration-count: infinite;
            animation-direction: alternate;
        }
        #vn-background-image.vn-fx-bgscroll-end {
            animation-iteration-count: 1;
            animation-fill-mode: forwards;
        }
        @keyframes vn-fx-bgscroll-right-anim {
            from { transform: scale(var(--vn-bg-scale, 1)) translateX(calc(-1 * var(--vn-bg-pan, 0%))); }
            to   { transform: scale(var(--vn-bg-scale, 1)) translateX(var(--vn-bg-pan, 0%)); }
        }
        @keyframes vn-fx-bgscroll-left-anim {
            from { transform: scale(var(--vn-bg-scale, 1)) translateX(var(--vn-bg-pan, 0%)); }
            to   { transform: scale(var(--vn-bg-scale, 1)) translateX(calc(-1 * var(--vn-bg-pan, 0%))); }
        }
        /* Пара кнопок-переключателей для настроек с choices (bgScrollDirection/bgScrollLoop,
           меню "Настройки эффектов" - см. visualSettingsMenu.hbs, apps/visualSettingsMenu.js) */
        .vsm-choice-group {
            display: flex;
            gap: 6px;
            flex: 1 1 auto;
        }
        .vsm-choice-button {
            flex: 1 1 auto;
        }
        .vsm-choice-button.vsm-choice-active {
            background: #4a7;
            color: #fff;
        }
        /* "Visual Settings Menu" (apps/visualSettingsMenu.js): добавили 7-ю кнопку ("Настройки эффектов")
           в главное меню (templates/visualSettingsMenu.hbs, .vsm-menu-button). Базовая раскладка в
           styles/module.css (.vsm-main-menu-body) - сетка 3x2 под ровно 6 кнопок фиксированного размера
           200x200px; вместо правки самого module.css/module.sass (нет сборки, чтобы их пересобрать)
           переопределяем здесь: сетка становится 4x2, кнопки чуть меньше - при gap:20px это даёт ту же
           итоговую ширину (~760px), на которую рассчитаны хардкод-координаты центрирования окна
           (new VisualSettingsMenu().render(true, {left: (window.innerWidth - 760) / 2, ...})) в
           main.js/visualSettingsMenu.js, поэтому позиционирование окна остаётся корректным. */
        .vsm-main-menu-body {
            grid-template-columns: repeat(4, 1fr) !important;
            grid-template-rows: repeat(2, 1fr) !important;
            gap: 20px !important;
        }
        .vsm-main-menu-body div {
            width: 150px !important;
            height: 150px !important;
        }
        .vsm-main-menu-body div i {
            font-size: 380% !important;
        }
        .vsm-main-menu-body div span {
            font-size: 115% !important;
        }
        /* Слайдер + числовое поле для настроек с range (flashLightSpeed/flashDarkSpeed, меню "Настройки
           эффектов" - см. visualSettingsMenu.hbs, setting.range) */
        .vsm-range-slider {
            flex: 1 1 auto;
            min-width: 100px;
        }
        .vsm-range-number {
            width: 60px;
            flex: 0 0 60px;
        }
    `
    document.head.appendChild(style)
}

// Идемпотентно создаёт (если ещё не созданы) три слоя эффектов внутри #vn-body и возвращает ссылки на них
function _ensureEffectLayers(body) {
    _injectEffectStyles()
    if (!body) return { flash: null, darken: null, row: null }
    let flash = document.getElementById("vn-fx-flash-layer")
    if (!flash) {
        flash = document.createElement("div")
        flash.id = "vn-fx-flash-layer"
        body.appendChild(flash)
    }
    let darken = document.getElementById("vn-fx-darken-layer")
    if (!darken) {
        darken = document.createElement("div")
        darken.id = "vn-fx-darken-layer"
        body.appendChild(darken)
    }
    let row = document.getElementById("vn-fx-row-layer")
    if (!row) {
        row = document.createElement("div")
        row.id = "vn-fx-row-layer"
        body.appendChild(row)
    }
    let narrative = document.getElementById("vn-fx-narrative-layer")
    if (!narrative) {
        narrative = document.createElement("div")
        narrative.id = "vn-fx-narrative-layer"
        const narrativeText = document.createElement("div")
        narrativeText.id = "vn-fx-narrative-text"
        narrative.appendChild(narrativeText)
        body.appendChild(narrative)
    }
    return { flash, darken, row, narrative }
}

// Перестраивает содержимое слоя "режима ряда" под текущих активных персонажей (только когда режим включён)
function _updateRowLayer(rowEl, settingData) {
    if (!rowEl) return
    const active = !!settingData.rowMode
    rowEl.classList.toggle("vn-fx-active", active)
    if (!active) {
        if (rowEl.childElementCount) rowEl.innerHTML = ""
        return
    }
    const speakers = ["left", "right"].flatMap(side =>
        (settingData.activeSlots?.[side] || [])
            .map(pos => settingData.activeSpeakers?.[pos])
            .filter(Boolean)
    )
    const existingSrcs = Array.from(rowEl.querySelectorAll("img")).map(img => img.dataset.src).join("|")
    const wantedSrcs = speakers.map(s => s.img).join("|")
    if (existingSrcs === wantedSrcs) return
    rowEl.innerHTML = ""
    speakers.forEach(s => {
        const img = document.createElement("img")
        img.src = s.img
        img.dataset.src = s.img
        rowEl.appendChild(img)
    })
}

// Применяет к УЖЕ СУЩЕСТВУЮЩЕМУ #vn-background-image кроп/прокрутку/блюр фона, читая их из текущих
// settings - без Handlebars-рендера. Вызывается из _onRender() (после каждого рендера окна) И напрямую
// из Hooks.on("updateSetting", ...) (main.js, ниже по файлу) для переключателей "Блюр фона"/"Прокрутка
// фона" - те больше НЕ просят renderParts:["background"], т.к. Foundry при рендере части "background"
// уничтожает и пересоздаёт этот img-элемент, а CSS transition (см. #vn-background-image в
// _injectEffectStyles) не может анимировать свойство на только что созданном узле - браузер красит его
// сразу в конечное состояние, отсюда "мгновенный" блюр вместо плавного. Вызов этой функции напрямую на
// персистентном узле чинит это в корне, не трогая логику самого кропа/прокрутки/блюра.
function _applyBackgroundVisualEffects() {
    const bgImgEl = document.getElementById("vn-background-image")
    if (!bgImgEl) return
    const fxSettings = getSettings()
    const loc = fxSettings.location || {}
    const hasResolvedCrop = Number.isFinite(loc.bgSizeX) && Number.isFinite(loc.bgSizeY)
    const scrollOn = !!fxSettings.bgScroll
    let effectiveScale
    if (hasResolvedCrop) {
        bgImgEl.style.backgroundSize = `${loc.bgSizeX}% ${loc.bgSizeY}%`
        bgImgEl.style.backgroundPosition = `${Number.isFinite(loc.bgPosX) ? loc.bgPosX : 50}% ${Number.isFinite(loc.bgPosY) ? loc.bgPosY : 50}%`
        // Запас масштаба под прокрутку - фиксированная константа (+6%), полностью независимая от
        // выбранного в "Масштабировании" кропа (тот уже "запечён" в background-size/position выше).
        effectiveScale = scrollOn ? 1.06 : 1
    } else {
        bgImgEl.style.backgroundSize = ""
        bgImgEl.style.backgroundPosition = ""
        const locationScale = Math.max(100, Number(loc.scale) || 100) / 100
        // При включённой прокрутке добавляем небольшой запас масштаба (+6%) сверх выбранного ГМ
        // "Масштабирования" - иначе при 100% (без запаса) панораме двигаться некуда без прогалин
        // по краям. Само статическое "Масштабирование" от этого не меняется - запас действует
        // только всё время, пока включена прокрутка.
        effectiveScale = scrollOn ? locationScale * 1.06 : locationScale
    }
    const panPercent = effectiveScale > 1 ? (50 * (effectiveScale - 1) / effectiveScale) : 0
    bgImgEl.style.setProperty("--vn-bg-scale", String(effectiveScale))
    bgImgEl.style.setProperty("--vn-bg-pan", `${panPercent}%`)

    // bgScrollDirection/bgScrollLoop/bgScrollSpeed - это НЕ поля vnData, а отдельные
    // registerSettings-настройки ГМа (см. scripts/settings.js, меню "Настройки эффектов"),
    // поэтому читаем их напрямую через game.settings.get, как и flashLightSpeed/flashDarkSpeed
    // (см. triggerVNEffect ниже по файлу). Скорость выставляется инлайн-стилем - перебивает
    // "animation-duration: 45s" из правила в _injectEffectStyles ниже (тот же приём, что и с
    // flashLightSpeed/flashDarkSpeed).
    const direction = game.settings.get(C.ID, "bgScrollDirection") || "right"
    const loop = game.settings.get(C.ID, "bgScrollLoop") === "cycle"
    const scrollSpeed = Number(game.settings.get(C.ID, "bgScrollSpeed")) || 45
    bgImgEl.style.animationDuration = `${scrollSpeed}s`
    bgImgEl.classList.toggle("vn-fx-bgscroll-right", scrollOn && direction === "right")
    bgImgEl.classList.toggle("vn-fx-bgscroll-left", scrollOn && direction === "left")
    bgImgEl.classList.toggle("vn-fx-bgscroll-loop", scrollOn && loop)
    bgImgEl.classList.toggle("vn-fx-bgscroll-end", scrollOn && !loop)

    // - Визуальные эффекты: размытие фона (переключатель "Блюр фона" в панели "Эффекты",
    // apps/effectsPanel.js, vnData.bgBlur) - сила размытия настраивается ГМом отдельно
    // (bgBlurStrength, "Настройки эффектов", 0..1, 0 - без размытия, 1 - максимальное).
    // Применяется как CSS filter:blur(...) в px - независимое от background-size/position
    // (статический кроп) и от transform (прокрутка/легаси-масштаб) свойство, поэтому спокойно
    // сочетается с обеими фичами одновременно, ничего в их логике трогать не пришлось.
    const blurOn = !!fxSettings.bgBlur
    const rawBlurStrength = Number(game.settings.get(C.ID, "bgBlurStrength"))
    const blurStrength = Number.isFinite(rawBlurStrength) ? Math.min(1, Math.max(0, rawBlurStrength)) : 0.5
    const MAX_BLUR_PX = 24
    bgImgEl.style.filter = blurOn ? `blur(${(blurStrength * MAX_BLUR_PX).toFixed(2)}px)` : ""
}

// Одноразовое применение эффекта (тряска / вспышка) прямо в DOM, локально на этом клиенте
// kind: "shake" | "flashLight" | "flashDark"
// target: "all" - на все активные спрайты (или во весь экран для вспышек) - либо позиция вида "left1"
function _applyEffectLocally(kind, target) {
    const body = document.getElementById("vn-body")
    if (!body) return
    const layers = _ensureEffectLayers(body)

    if (kind === "shake") {
        // ВАЖНО: для "all" раньше тут был селектор ".vn-pBody" (внешняя обёртка портрета) - но у
        // ".vn-pBody-left"/".vn-pBody-right" (второй класс на том же элементе, см. portrait.hbs) в
        // module.css есть базовый "transform: translate(0, -90%)", который держит портрет на нужной
        // высоте внутри слайдера. Наша keyframe-анимация тряски задаёт transform:translateX(...) и на
        // время анимации ПОЛНОСТЬЮ подменяет собой этот transform, стирая "-90%" по Y - из-за этого
        // все портреты на время тряски визуально проваливались вниз. У ".vn-portrait" (внутренний
        // контейнер, см. portrait.hbs) же нет собственного transform, поэтому тряска через него
        // (как и было для конкретной цели) безопасна. Заодно ".vn-portrait.vn-main" - это ровно
        // "активные" портреты (см. portrait.hbs: класс vn-main ставится по speaker.active), так что
        // выбор целей теперь буквально соответствует надписи в дропдауне "Все активные персонажи".
        const els = target === "all"
            ? Array.from(body.querySelectorAll(".vn-portrait.vn-main"))
            : Array.from(body.querySelectorAll(`.vn-portrait.${target}`))
        els.forEach(el => {
            el.classList.remove("vn-fx-anim-shake")
            void el.offsetWidth // форсируем reflow, чтобы анимацию можно было перезапустить повторным кликом
            el.classList.add("vn-fx-anim-shake")
            el.addEventListener("animationend", () => el.classList.remove("vn-fx-anim-shake"), { once: true })
        })
        return
    }

    if (kind === "flashLight" || kind === "flashDark") {
        // Скорость (длительность) вспышки настраивается ГМом в "Visual Settings Menu" -> "Настройки
        // эффектов" (flashLightSpeed/flashDarkSpeed, scripts/settings.js) - CSS-анимация сама по себе
        // duration-агностична (только % keyframes), длительность выставляем инлайн-стилем перед
        // запуском, он перебивает ".4s"/".5s" из shorthand "animation" в _injectEffectStyles ниже.
        const speed = game.settings.get(C.ID, kind === "flashLight" ? "flashLightSpeed" : "flashDarkSpeed")
        if (target === "all") {
            const cls = kind === "flashLight" ? "vn-fx-anim-flash-light" : "vn-fx-anim-flash-dark"
            layers.flash.classList.remove(cls)
            void layers.flash.offsetWidth
            layers.flash.style.animationDuration = `${speed}s`
            layers.flash.classList.add(cls)
            layers.flash.addEventListener("animationend", () => layers.flash.classList.remove(cls), { once: true })
        } else {
            const imgEl = body.querySelector(`.vn-portrait.${target} img`)
            if (!imgEl) return
            const cls = kind === "flashLight" ? "vn-fx-sprite-flash-light" : "vn-fx-sprite-flash-dark"
            imgEl.classList.remove(cls)
            void imgEl.offsetWidth
            imgEl.style.animationDuration = `${speed}s`
            imgEl.classList.add(cls)
            imgEl.addEventListener("animationend", () => imgEl.classList.remove(cls), { once: true })
        }
    }
}

// Точка входа для панели "Эффекты" (apps/effectsPanel.js): применяет эффект локально
// и рассылает его остальным клиентам через socket модуля (тряска/вспышки не хранятся в settings -
// это одноразовые события, а не постоянное состояние)
export function triggerVNEffect(kind, target = "all") {
    _applyEffectLocally(kind, target)
    game.socket.emit(`module.${C.ID}`, { type: 'vnEffect', data: { kind, target } })
}

// "Нарратив" (apps/effectsPanel.js): одноразовая полноэкранная текстовая вставка, страницы -
// абзацы текста ГМа (разделены пустой строкой). Как и тряска/вспышки - не хранится в vnData,
// просто разлетается всем клиентам через тот же socket модуля отдельным типом сообщения.
// Длительность фейда в/из чёрного экрана и плашек - совпадает с CSS transition (1s) у
// #vn-fx-narrative-layer/#vn-up/#vn-left/#vn-right выше. Пауза между страницами - фиксированные
// 6 секунд (запрошено явно, без настройки): Старт - Текст1 - Пауза 6с - Текст2 - Пауза 6с - Конец.
const NARRATIVE_FADE_MS = 1000
const NARRATIVE_PAGE_HOLD_MS = 6000
// Выход из "Нарратива" в обычный режим - отдельная, более медленная длительность (запрошено явно),
// чем вход (NARRATIVE_FADE_MS) - выставляется как inline transition-duration поверх CSS 1s у
// #vn-fx-narrative-layer/#vn-fx-narrative-text/#vn-up/#vn-left/#vn-right на время самого выхода,
// затем снимается - следующий заход снова использует обычный вход за NARRATIVE_FADE_MS.
// Было 1.5с - после того, как реальный фейд плашек заработал (см. правку 2026-08-29 выше), эта
// длительность стала заметна впервые "живьём", и 1.5с всё ещё ощущались резко - увеличено до 3с.
const NARRATIVE_CLOSE_MS = 3000

// Показывает текст страницы либо сразу целиком ("Моментально"), либо по буквам ("Периодически",
// темп - настройка narrativeTypeSpeed, символов/сек) - режим и темп настраиваются ГМом в "Настройки
// эффектов" (apps/visualSettingsMenu.js, effectsSettingsKeys).
function _revealNarrativeText(el, text, mode, msPerChar, onDone) {
    if (mode !== "periodic" || !(msPerChar > 0)) {
        el.textContent = text
        onDone()
        return
    }
    el.textContent = ""
    let i = 0
    const tick = () => {
        i++
        el.textContent = text.slice(0, i)
        if (i < text.length) setTimeout(tick, msPerChar)
        else onDone()
    }
    tick()
}

function _playNarrativeText(pages) {
    const body = document.getElementById("vn-body")
    if (!body || !pages?.length) return
    const layer = _ensureEffectLayers(body).narrative
    const textEl = layer.querySelector("#vn-fx-narrative-text")
    const plates = document.querySelectorAll("#vn-up, #vn-left, #vn-right")
    // Уже идёт показ на этом клиенте - игнорируем повторный триггер, чтобы не сломать очередь страниц
    if (layer.dataset.playing === "1") return
    layer.dataset.playing = "1"

    const mode = game.settings.get(C.ID, "narrativeTextMode") || "instant"
    const rawSpeed = Number(game.settings.get(C.ID, "narrativeTypeSpeed"))
    const charsPerSec = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : 20
    const msPerChar = 1000 / charsPerSec

    let index = 0
    const finish = () => {
        const closeEls = [layer, textEl, ...plates]
        closeEls.forEach(el => { el.style.transitionDuration = `${NARRATIVE_CLOSE_MS}ms` })
        textEl.classList.remove("vn-fx-active")
        layer.classList.remove("vn-fx-active")
        plates.forEach(el => { el.style.opacity = "" })
        setTimeout(() => {
            layer.dataset.playing = ""
            closeEls.forEach(el => { el.style.transitionDuration = "" })
            // Стираем текст ТОЛЬКО теперь, когда выход полностью завершён (слой уже невидим) -
            // иначе при следующем запуске "Нарратива" старый текст на долю секунды виден сквозь
            // проявляющийся чёрный слой, пока showPage() ещё не перезаписал его новым.
            textEl.textContent = ""
        }, NARRATIVE_CLOSE_MS)
    }
    // textEl.vn-fx-active включается ОДИН раз перед первой страницей и выключается ОДИН раз в
    // finish() - не на каждой странице. Раньше опасити-фейд текста (.5s) переключался на КАЖДОЙ
    // странице и шёл ОДНОВРЕМЕННО с посимвольным набором - для короткой страницы к моменту, когда
    // текст становился видимым, уже была напечатана заметная часть символов, и страница выглядела
    // "уже готовой" вместо постепенного набора. Теперь набор - единственная анимация появления
    // текста на каждой странице, кроме первой (общий фейд слоя) и последней (общий фейд конца).
    const showPage = () => {
        _revealNarrativeText(textEl, pages[index], mode, msPerChar, () => {
            setTimeout(advance, NARRATIVE_PAGE_HOLD_MS)
        })
    }
    const advance = () => {
        index++
        if (index >= pages.length) { finish(); return }
        setTimeout(showPage, 300)
    }

    // Плашки #vn-up/#vn-left/#vn-right всегда несут "въездную" CSS-анимацию (slide-in-*,
    // styles/module.css, animation-fill-mode:forwards) - её "удержанное" значение opacity:1
    // перебивает ПРОСТОЙ inline-opacity в каскаде (CSS Animation по приоритету выше обычных
    // author-деклараций, в т.ч. inline-style без !important). Из-за этого плашки в "Нарративе"
    // НИКОГДА реально не скрывались - только маскировались чёрным слоем поверх; при ЗАКРЫТИИ
    // (плашки всё это время были на факт. opacity:1) чёрный слой открывал уже ПОЛНОСТЬЮ яркий
    // интерфейс без его собственного плавного проявления - отсюда ощущение "обрывается
    // моментально", хотя transition самого чёрного слоя (см. finish() ниже) отрабатывал верно.
    // Снимаем эту анимацию ОДИН раз перед скрытием - тогда inline opacity + injected transition
    // (_injectEffectStyles, "#vn-up, #vn-left, #vn-right") нормально анимируются в обе стороны,
    // как уже работает для #vn-fx-narrative-layer/#vn-fx-narrative-text.
    plates.forEach(el => { el.getAnimations().forEach(a => a.cancel()) })
    if (plates[0]) void plates[0].offsetHeight // форсируем reflow между cancel() и opacity, иначе transition не всегда стартует
    plates.forEach(el => { el.style.opacity = "0" })
    layer.classList.add("vn-fx-active")
    textEl.classList.add("vn-fx-active")
    setTimeout(showPage, NARRATIVE_FADE_MS)
}

export function triggerNarrativeText(text) {
    // Разрыв страницы - любой перевод строки (одинарный Enter в textarea), не только пустая
    // строка: ГМ печатает абзацы через один Enter, а требование именно пустой строки слишком
    // легко нарушить по невнимательности (см. баг-репорт: 2 из 3 абзацев разделены пустой
    // строкой корректно, 3-й - одинарным Enter, из-за чего 2 и 3 абзацы молча склеились в одну
    // страницу и «резко» сменялись без паузы/кроссфейда).
    const pages = String(text || "").replace(/\r\n/g, "\n").split(/\n+/).map(p => p.trim()).filter(Boolean)
    if (!pages.length) return
    _playNarrativeText(pages)
    game.socket.emit(`module.${C.ID}`, { type: 'vnNarrative', data: { pages } })
}

// Приём тряски/вспышек/нарратива от других клиентов
Hooks.once("ready", () => {
    game.socket.on(`module.${C.ID}`, (payload) => {
        if (payload?.type === 'vnEffect' && payload.data) {
            _applyEffectLocally(payload.data.kind, payload.data.target)
        } else if (payload?.type === 'vnNarrative' && payload.data?.pages) {
            _playNarrativeText(payload.data.pages)
        }
    })
})

// Устанавливаем размер шрифта для текста в headerSlider
Hooks.on("renderVisualNovelDialogues", () => {
    if (VisualNovelDialogues.instance.renderParts.includes("headerSlider")) setFontsSize()
})

// Ререндерим часы когда меняем время в simple-calendar
Hooks.on(`simple-calendar-date-time-change`, (calendarData) => {
    const settings = getSettings()
    if (!settings.showVN || !settings.location?.knowTime) return
    VisualNovelDialogues._render(["foreground"])
})

// Изменяем цвета в списке игроко в углу окна VN когда кто-то скрывает/раскрывает окно VN для себя
Hooks.on("updateUser", (user, changes) => {
    const hideVNFlag = changes?.flags?.[C.ID]?.hideVN
    if (typeof hideVNFlag === "boolean") {
        // Это нужно чтобы при мануальном изменении флага у другого игрока у него ре-ренедрилось окно визуалки
        // upd: я тут что-то поменял, и теперь вообще не понимаю смысла этого комментария (но если что, он относится к (game.user.id == user.id) )
        VisualNovelDialogues._render(["foreground"], (game.user.id == user.id))
    }
})


// Изменяем список игроков в углу окна VN когда кто-то входит/выходит
Hooks.on("userConnected", (user, joined) => {
    if (!VisualNovelDialogues.instance) return
    VisualNovelDialogues._render(["foreground"], null, true)
})


// А это надо чтобы "Предпросмотр" сетов слайдеров откатить когда окно закрывают :з
Hooks.on("closeCustomSlidersSet", () => {
    VisualNovelDialogues._render(["headerSlider", "leftSlider", "rightSlider"], null, true)
})

// Синхронизация с Advanced Requests (мне кажется что-то наебнулось)
// При запуске мира, если синхронизация включена и модуль Advanced Requests активен, переносим заявки в VN из Advanced Requests
Hooks.on("ready", async () => {
    if (game.modules.get("advanced-requests")?.active && game.settings.get(C.ID, 'advancedRequestsSync')) {
        const settings = getSettings()
        settings.requests = game.settings.get("advanced-requests", "queue").reduce((acc, el) => {
            const charId = game.users.get(el.id).character?.id || foundry.utils.randomID()
            acc[charId] = el
            return acc
        }, {})
    }
})

// Добавление поля id/ника Discord в меню User Configuration
Hooks.on("renderUserConfig", (userConfig, element) => {
    const userId = userConfig.document.id
    const discordId = game.users.get(userId).getFlag(C.ID, 'discordUserId')
    const template = `
        <div class="form-group">
            <label for="discordUserId-${userId}">${game.i18n.localize(`${C.ID}.settings.discordUserId`)}</label>
            <div class="form-fields">
                <input id="discordUserId-${userId}" type="text" name="discordUserId" value="${discordId || ""}">
            </div>
            <p class="hint">${game.i18n.localize(`${C.ID}.settings.discordUserIdHint`)}</p>
        </div>
    `
    element.querySelector('.standard-form fieldset').insertAdjacentHTML('beforeend', template)
    const inputElement = element.querySelector('input[name="discordUserId"]')
    inputElement.addEventListener('change', async event => {
        if (userId === game.user.id) await game.settings.set(C.ID, 'discordUserId', event.target.value)
        await game.users.get(userId)?.setFlag(C.ID, 'discordUserId', event.target.value)
    })
})
// При обновлении флага у игрока, меняем его в списке "Discord: список ID пользователей"
Hooks.on("updateUser", async (user, changes) => {
    if (!game.user.isGM || !changes.flags?.[C.ID]?.discordUserId) return
    const disSetting = foundry.utils.mergeObject(game.settings.get(C.ID, 'discordUsersIds'), {userId: user.id, discordId: changes.flags[C.ID].discordUserId})
    await game.settings.set(C.ID, 'discordUsersIds', disSetting)
})

// Синхронизация настроек
Hooks.on("updateSetting", async (setting, value, diff, userId) => {

    // Объясняю. Изначально рендер был сделан как статический метод класса VN, и вызывался после обновления настроек
    // Но если настройки обновлял игрок (через сокет), сокет, и обновление настроек в нём, срабатывало ПОЗЖЕ чем рендер
    // Из-за этого изменения внесённые в настройки при рендере не отражались
    // Поэтому теперь рендер вручную вызывается в updateSetting
    if (setting.key == `${C.ID}.vnData`) {
        // Синхронизирует кроп/прокрутку/блюр фона на УЖЕ существующем #vn-background-image, минуя
        // Handlebars-рендер части "background" - см. комментарий у _applyBackgroundVisualEffects() выше
        // по файлу (транзишены на пересозданном узле не анимируются). Вызывается для ВСЕХ обновлений
        // vnData (дёшево и идемпотентно, no-op если узла ещё нет в DOM), а не только для тех, что явно
        // просят renderParts:["background"].
        _applyBackgroundVisualEffects()
        if (diff?.renderData) VisualNovelDialogues._render(diff.renderData.renderParts, diff.renderData.fullRender)
    }

    // Переключаем синхронизацию в Advanced Requests -> переключаем её и в VN
    if (setting.key == `advanced-requests.visualNovelSync`) {
        await game.settings.set(C.ID, 'advancedRequestsSync', value.key)
    // Создаём заявку  в Advanced Requests -> создаём её и в VN
    } else if (setting.key == `advanced-requests.queue` && game.settings.get(C.ID, 'advancedRequestsSync')) {
        if (diff.stopFuckingAround) return
        const newRequests = foundry.utils.deepClone(setting.value).map(el => {
            el.level += 1
            return el
        })
        await quickSettingsUpdate({requests: newRequests}, {stopFuckingAround: true, renderData: {renderParts: ["foreground"]}})
    }

    // Пользователь изменяет настройку "Discord: Ваш ID/ник" -> меняем его в списке "Discord: список ID пользователей"
    if (setting.key == `${C.ID}.discordUserId` && game.user.isGMM) {
        const disSetting = foundry.utils.mergeObject(game.settings.get(C.ID, 'discordUserId'), {userId: userId, discordId: setting.value})
        await game.settings.set(C.ID, 'discordUsersIds', disSetting)
    }
})

// VisualSettingsMenu - mover'ы слайдеров в детальном режиме:
// - Рендер и удаление mover'ов при переход в детальный режим и из него соответственно
Hooks.on("renderVisualSettingsMenu", async (app, html, options) => {
    if (["detailUI", "menuUI"].includes(options.showMode)) {
        await VisualSettingsMenu.detailModeChanges(html, options.showMode == "detailUI");
    } 
});
// - Удаление mover'ов при закрытии visualSettingsMenu
Hooks.on("closeVisualSettingsMenu", async (app, html, options) => {
    await VisualSettingsMenu.detailModeChanges(html, false);
})

// Панель «Эффекты» - единственное место, где можно включить "режим ряда"
// (apps/effectsPanel.js, .vn-fx-toggle-row). Репорт тестировщика (2026-08-27): если ГМ
// включает режим ряда и потом просто закрывает панель (не выключив режим явно), выйти из
// него было нечем - обычный интерфейс скрыт вместе с honeycomb-меню, а переключатель живёт
// только внутри уже закрытой панели. Решение: закрытие панели "Эффекты" само выключает
// режим ряда, если он был включён - тем же набором флагов, что и повторный клик по кнопке
// "Режим ряда" внутри панели (rowMode/hideUI/darkenBack разом в false), так что застрять в
// этом состоянии больше нельзя в принципе - отдельная кнопка "на выход", которая раньше
// была нужна на угловой иконке восстановления интерфейса, больше не нужна.
Hooks.on("closeEffectsPanel", async (app, html, options) => {
    if (!peekSetting("rowMode")) return
    await quickSettingsUpdate(
        {rowMode: false, hideUI: false, darkenBack: false},
        {renderData: {renderParts: ["headerSlider", "leftSlider", "rightSlider", "foreground"]}}
    )
})

/*
——— Текущие действия ———
1) Детальный режим UIP - режим перемещения слайдеров
    ✔ Прописать функции и кнопки для меню детального режима:
        ✔ Переключение подрежимов (перемещение плашек / перемещение кнопок / ?)
        ✔ [Текст] Подсказка (Перемещайте элементы и меняйте их размер с помощью панелей на слайдерах. Кликнув по них ПКМ, вы можете переключить отображение соответствующего слайдера)
        ✔ [Чекбокс] Скрыть другие окна
        ✔ [Чекбокс] Линейка (1% от размера окна)
        - [Ползунок] Непрозрачность скрытых элементов
        - [Ползунок] Размер сетки в px
        ✔ [Кнопки] Сохранить / Отменить / Вернуться
    ✔ Нарисовать макет мини-меню для детального режима
    ✔ Дописать в шаблон visualSettingsMenu.hbs меню детального режима
    ✔ Добавить кнопку входа в детальный режим в меню UIP снизу окна
    ✔ Написать стили для добавленных элементов
    ✔ Написать первую часть слушателей для окна детального режима
    ✔ Добавить mover'ы в детальный режим для плашек (+возможность менять размер в mover'ах)
        ✔ Только X и Y
        ✔ Scale
        ✘ Переключение отображения
    ✔ Написать вторую часть слушателей для окна детального режима
    ✔ Подсветка на кнопку "Сохранить изменения" в детальном режиме
    ✔ Дописать крюки при выходе из детального режима ("поверх всех окон" и "сетка-рулетка")
    ✔ Выключение EditMode и запрет на действия в VN во время детального режима
    ✔ Проверить что всё работает и сохраняется
    - Скрытые элементы должны быть полупрозрачными
    [В ПРОЦЕССЕ] Проверить баги (например с ререндером окна VN)
2) Меню настроек кнопок и блоков кнопок
    ✔ Прописать цели которые должны достигаться с помощью меню настроек кнопок:
        - Выбор, какие кнопки будут в левом-верхнем блоке и в свободном пространстве
        - Выбор и изменение названия, цвета (фон, граница и иконка), формы, размера и иконки для кнопок (форма и размер только для свободок)
        - Изменение порядка кнопок в левом-верхнем блоке
        - Изменение порядка положения кнопок в свободном пространстве
    ✔ Написать API для всех действий кнопок
    ✔ Определить что может добавить пользователь в качестве функционала кнопки:
        - Запуск макроса
        - Любой написанный им код прямо в строке 
        - data-action, лол
    ✔ Прописать поля для кнопок:
        - Иконка
        - Название (тултип)
        - От лица.. [себя / ГМа] - выбор
        - [Команда / Макрос] - выбор
        - Команда/макрос
        - Кнопки "удалить" и "дублировать"
    - Написать приложение для меню кнопочек
    - Сделать кнопку открытия меню кнопок посреди рабочей области окна UIP
    - Создать класс-конструктор для кнопок
    - Прописать все базовые кнопки
    - Добавить режим перемещения кнопок в детальном режиме
    - Возможность создавать блоки и помещать кнопки в них
3) 

——— ЗАПЕЧАТАНО ———
- Кнопка "Меню кастомизации кнопок" в окне UIP
- Сетка-линейка в детальном режиме
- Подрежимы детального режима и их переключение
- globalThis - VisualNovelDialogues.vnActions
- Курсор при перетягивания элементов в верхнем слайдере (.vsm-UI-header > div)
- preset.headerSliderEls.forEach(el => {el.active = (preset.activeElements[el.key])}) (пока что "активность" берётся из activeElements)

——— ДЕТАЛИ ———
✔ Меню UIP - доделать тултипы и бекенд на пресеты
✔ Пресеты пока что (теперь) не влияют на визуал (не удаляются лишние слоты при уменьшении кол-ва?)
✔ Проверить что изначально существует базовый пресет и что нельзя удалить последний
✔ Временно убрать курсор для перетягивания элементов в верхнем слайдере
✔ Может быть выбран несуществующий пресет (не обновляется при удалении)

- проверить locationClick в глобале
✔ Лучше выделить активный пресет (цвета?)
- Окно UIP почему-то тянется к верху окна при открытии
- Сетка-линейка проецирует линии до краёв окна? (от верхнего-левого угла элемента в верх и лево окна)
✔ ПЕРЕКЛЮЧИТЬ ОТОБРАЖЕНИЕ ИМЕНИ (я так и не пофиксил этот баг)
✔ При рендере окна детального режима, если галочка "поверх всех окон" стоит, меняем z-index vn-body (при закрытии возвращаем ему z-index) + сетка-линейка
- В детальном режиме не меняется элемент подрежима сверху при переключении
- Добавить откат изменений при выборе другого портрета в EditWindow (или сохранять изменения в буфере?)
- Не забывай что в детальном режиме есть два нерабочих режима
- Сетка-линейка не включается автоматически при входе в детальный режим даже если она включена
✔ У нас всё ещё пропадает окно UIP при входе в детальный режим с "скрыть все окна"
✔ Кнопка закрытия VN слева-сверху всё ещё может закрыть окно VN с включенным режимом просмотра
- Заменить кнопку Эффектов на кнопку Lancer Communicator
- Сделать кнопку детального режима более заметной (другой цвет?)
- При клике на приложение ему присваивается z-index приложения (101 ++)

——— ПЛАН ———
—— [делаем сейчас] ——
- Пофиксить изображения в дискорд-гайде
- Добавить надпись "Если не запускается - скачайте node.js"
✔ Улучшить меню настроек
✔ Заменить настройки в меню настроек на кнопку "Открыть меню настроек"
- Редизайн меню UIP:
    - Более заметная подсказка сверху
    ✔ Полностью переделать пресеты
    ✔ Более заметное кол-во слотов (угловые полоски от слотов до поля ввода?)
- Рефкунционал меню UIP:
    ✔ Добавить "Детальный режим" и расписать его функционал
    ✔ Перенести Mover'ы в детальный режим
    - Засунуть меню настроек кнопок в детальный режим
    - Добавить возможность изменять ширину элементов в верхнем слайдере
    - При отключении элемента в верхнем слайдере, он должен "скрываться" чтобы пользователь понимал какую ширину будут занимать остальные элементы
    - Выделить редактируемый пресет
    - Если ни один пресет не редактируется - нужен какой-то плейсхолдер в рабочую область
- Детальный режим UIP:
    ✔ Открывается через кнопку внизу меню UIP, при этом...)
        ✔ Закрывая все окна
        ✔ Выключая режим редактирования
        ✔ Появляется передвигаемое мини-меню детального режима
    ✔ Закрывается через кнопку в мини-меню
    - Пока детальный режим активен...
        ✔ Нельзя скрыть меню VN (например через хоткей)
        ✔ Игроки видят обычный интерфейс VN
        - Скрытые слайдеры видно, но они полупрозрачные
        ✔ Интерфейс VN находится на z-index: 9999 (галочка)
    - Имеет несколько режимов:
        ✔ Перемещение и масштабирование слайдеров
        - Перемещение кнопок
            - Перемещение по сеткам
        - Переключение отображения элементов (без режима?)
- Меню настроек кнопок и блоков кнопок
    - Общий пулл кнопок из которых кнопки можно выбирать
    - Кастомные иконки кнопок (+ссылку на сайт с иконками)
✔ Слегка переделать стили окна Натроек автосоздания портретов (разбить на блоки и раздвинуть друг от друга)
✔ Убрать уведомления Discord Bridge
- Добавить ссылку модуля на версию v11
✔ Проверить что все настройки есть в меню
- Наебнулось количество слотов (после изменения в окне UIP и до перезагрузки мира)
- Пофиксить пути изображений в гайде бота дискорд
- Пофиксить баг из-за которого при выборе "крайнего-внутренного" слота в окне персонализции UI, не работала штука когда мастер говорил в дискорде и подсвечивался портерт в мастер-слоте
✔ с Z-index крайнего слота выходит за пределы задника плашки

—— [можно сделать сейчас] ——
- Менять цвет скрытого имени/титула вместо замены их на плейсхолдер
- Меню управления
- overflow для слайдеров? (чтобы ноги не торчали)
- API для макросов и интеграции с другими модулями:
    ✔ Кнопки окна VisualNovel
    - Выбор пресета UI
    - Выбор пресета слайдеров
    - Смена локации
    - Смена портретов

—— [отложено на потом] ——
- Проверить другие методы работы интеграции Discord
- Переделать демку модуля
- Буфер прошлой локации и кнопка возвращения на неё
- Подготовленные сцены и быстрый доступ?
- Рамки токенов для квадратных картинок
- фейдик в новых версиях бы....
- Молю перепиши блять гайд
- Возможность перемещать EditWindow
- Сделать кликабельным всю область настройки, а не только чекбокс/название


——— ДОБАВЛЕНО/ИЗМЕНЕНО ———
- Большая часть настроек модуля в меню "Configurate settings" FoundryVTT были заменены на кнопку открытия общего меню настроек модуля
- В меню настроек, при нажатии на текст (название/описание) настройки, соответствующий чекбокс переключается (раньше нужно было нажать именно на чекбокс)
- Улучшен стиль меню настроек
- Убраны уведомления об отсутствии подключения к Discord Bridge при запуске мира
- Переработан визуальный вид окна Персонализации:
    - Добавлены линии от Слотов до Поля ввода, чтобы сделать более заметным и очевидным их связь
    - Переработаны стили некоторых элементов для более корректной работы с нестандартными размерами окна
- Функции updateLocalizeFromString, updateLocalizeFromJournal и createJournalFromLocalize перемещены из "ui.VisualNovel" в "VisualNovel.utils" (до FoundryV13 вы всё ещё можете использовать "ui.VisualNovel")

——— ИСПРАВЛЕНО ———
- В "Настройке совместимых модулей" были добавлены отсутствующие настройки интеграции Discord
- Исправлена ошибка ввиду которой некоторые элементы интерфейса окна UIP могли выходить за рамки рабочей области, перекрывая другие элементы

? Хуй знает чё делать, но анимации Портретов всё равно прерываются при ренедрере слайдеров даже с учётом всего сделанного :(
- Переделать shownForIds, чтобы ГМ мог не только показывать лишь для себя, но и скрывать лишь для себя
- Доработать видимость того, что у тебя скрыта VN на данный момент
- Ошибка ввиду которой, если активной на данной момент локации по какой-то причине не было в списке локаций - изменения локаций не работали
- Теперь стартовая локация-плейсхолдер добавляется в список локаций, что спасает от некоторых ошибок
- Исправлен баг, из-за которого элемент имени Портерта на боковом слайдере всё ещё был кликабельным, даже если окно VN было скрыто (из-за чего он мог перекрывать сцену и меню Foundry)
- Пресеты локаций теперь работают корректно (ранее, вне зависимости от количества слотов выбранных в пресете, прогружались и добавлялись все 10 слотов)
- Раньше Портрет в крайних (ближних к краю экрана) слотах мог отображаться поверх задника слайдеров


——— ЗАМЕТКИ МЕЖДУ ВЕРСИЯМИ ———
- При переходе на FoundryV13 нужно будет убрать ui.VisualNovel
- 
*/