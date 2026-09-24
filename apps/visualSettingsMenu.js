import { Constants as C, defaultPortraitSettingsTemplate, quickSettingsUpdate, uiButtonsIcons, getSettings } from '../scripts/const.js';
import { _portraitPartsKeys, VisualNovelDialogues } from '../scripts/main.js';
import { PresetUIClass } from '../scripts/presetUIClass.js';
import { openMassPortraitCreator } from './actorPicker.js';
import { ButtonsCustomizer } from './buttonsCustomizer.js';

// Под-режимы детального режима.
const vsmDetailsModes = ["moveSliders", "moveButtons", "hideElements"]
const getDetailModeSliderPos = (data) => ((1 / vsmDetailsModes.length) * vsmDetailsModes.indexOf(data.detailMode) * 100).toFixed(2)

export class VisualSettingsMenu extends FormApplication {
    constructor(mode = "home") {
        super();
        this.mode = "home";
        this.editablePreset = null
        this.activePmsTab = null
    }
    
    static get defaultOptions() {
        const defaults = super.defaultOptions;

        const overrides = {
            classes: ['visual-settings-menu-body'],
            width: "auto",
            height: "auto",
            resizable: false,
            id: "VisualSettingsMenu",
            template: `modules/${C.ID}/templates/visualSettingsMenu.hbs`,
            title: `Visual Settings Menu`,
            userId: game.userId,
            closeOnSubmit: false,
            submitOnChange: false
        };
        const mergedOptions = foundry.utils.mergeObject(defaults, overrides);
        return mergedOptions;
    }

    getData(options) {
        const _mode = this.mode

        // Portraits-automaker menu
        const autoPortraitSettings = game.settings.get(C.ID, `autoPortraitSettings`);
        const hiddenTypes = game.settings.get(C.ID, "hiddenTypes")
        const settingsTab = Actor.TYPES.filter(type => ![...hiddenTypes, "base"].includes(type)).map(t => { return {
            name: t,
            // Если у стороннего модуля, зарегистрировавшего этот подтип, нет собственной
            // локализации TYPES.Actor.<module-id>.<subtype> - localize() вернёт сырой ключ как есть.
            // Показываем вместо него хотя бы последний сегмент подтипа, а не полный дотнотированный ключ.
            label: game.i18n.translations.TYPES?.Actor?.[t] || t.split(".").pop(),
            autoSearchData: autoPortraitSettings[t]
        }});

        // UI menu
        const activePresetId = foundry.utils.deepClone(game.settings.get(C.ID, 'presetsUI')).choosenPreset
        const presetArray = [ ...game.settings.get(C.ID, 'presetsUI').presets ]
        const activePreset = presetArray.splice(presetArray.findIndex(p => p.id == activePresetId), 1)[0]

        if (!this.editablePreset) this.editablePreset = activePresetId || presetArray[0]?.id || null

        const preset = PresetUIClass.getPreset(this.editablePreset);
        const defaultSlotCount = game.settings.get(C.ID, 'slotCount')
        if (!preset.slotCount.left) preset.slotCount.left = defaultSlotCount
        if (!preset.slotCount.right) preset.slotCount.right = defaultSlotCount

        // presetArray.forEach((p, i) => {if (!p.hotkey) presetArray[i].hotkey = game.i18n.localize(`${C.ID}.visualSettingsMenu.hotkeyPlaceholder`)})
        const getPFields = (slotCount, masterSlot, side) => {
            // slotCount может прийти как строка из <input type="text"> или как некорректное значение
            // (NaN, отрицательное, дробное, за пределами задокументированного максимума "до 5") -
            // без приведения к числу и клампа Array.slice(0, slotCount) даёт неожиданные результаты
            // (например отрицательное число отсчитывает слоты с конца массива nums)
            const clampedSlotCount = Math.min(5, Math.max(1, Math.trunc(Number(slotCount)) || 1))
            const nums = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"].slice(0, clampedSlotCount)
            return nums.reduce((acc, el, i) => {
                acc.push({
                    active: (el == masterSlot),
                    key: el,
                    last: (masterSlot == "Last" && i == clampedSlotCount - 1),
                    lineSide: (i == (clampedSlotCount-1) / 2) ? "center" : ((side == "left") == (i < clampedSlotCount / 2)) ? "left" : "right"
                })
                return acc
            }, [])
        }
        const pFields = {
            left: getPFields(preset.slotCount.left, preset.masterSlot.left, "left"),  
            right: getPFields(preset.slotCount.right, preset.masterSlot.right, "right").reverse()
        }

        // Элементы верхнего слайдера
        const headerElsAddContent = {
            locName: {icon: "building", span: `${game.i18n.localize(`${C.ID}.visualSettingsMenu.location`)}`},
            parLocName: {icon: "city", span: `${game.i18n.localize(`${C.ID}.visualSettingsMenu.parentLocation`)}`},
            clock: {icon: "clock", span: `12:30`},
            weather: {icon: "cloud-sun", i: `fas fa-sun`},
            temperature: {icon: "thermometer", i: `fas fa-temperature-low`},
        }
        preset.headerSliderEls = preset.headerSliderEls.map(el => ({...el, ...headerElsAddContent[el.key]}))
        // TEMP
        preset.headerSliderEls.forEach(el => {el.active = (preset.activeElements[el.key])})
        // TEMP

        const data = {
            slotCountPlaceholder: defaultSlotCount,
            editblePresetId: this.editablePreset,
            choodedPresetId: activePresetId || null,
            activePreset,
            currentTab: this.activePmsTab || settingsTab[0]?.name || null,
            useChosenGroupSettings: game.settings.get(C.ID, 'useChosenGroupSettings'),
            portraitFoldersPath: C.portraitFoldersPath(),
            lineWidth: {left: (100 - 100 / pFields.left.length), right: (100 - 100 / pFields.right.length)},
            detailModeBuffer: {...game.settings.get(C.ID, 'detailModeBuffer')},
        }
        data.detailModeBuffer.pos = getDetailModeSliderPos(data.detailModeBuffer)
        data.detailModeBuffer.modes = vsmDetailsModes

        const settingsArray = (menus, keys) => {
            const menusArr = menus.reduce((acc, current) => {
                const _menu = game.settings.menus.get(`${C.ID}.${current}`)
                let item = {
                    button: true,
                    name: game.i18n.localize(`${C.ID}.settings.${current}`),
                    hint: game.i18n.localize(`${C.ID}.settings.${current}Hint`),
                    label: game.i18n.localize(`${C.ID}.settings.${current}Label`),
                    icon: _menu.icon,
                    key: current,
                    type: "button"
                }
                acc.push(item)
                return acc
            }, [])
            const keysArr = keys.reduce((acc, current) => {
                const _setting = game.settings.settings.get(`${C.ID}.${current}`)
                let item = {
                    name: game.i18n.localize(`${C.ID}.settings.${current}`),
                    hint: game.i18n.localize(`${C.ID}.settings.${current}Hint`),
                    value: game.settings.get(C.ID, current),
                    key: current,
                    type: typeof(_setting.type()),
                    filePicker: _setting.filePicker || null
                }
                if (_setting.choices) item.choices = Object.keys(_setting.choices).reduce((acc, current) => {
                    acc.push({key: current, value: _setting.choices[current]})
                    return acc
                }, [])
                // {min, max, step} - если задано при регистрации (см. registerSettings в scripts/settings.js),
                // шаблон рисует слайдер вместо обычного числового поля (см. visualSettingsMenu.hbs, type=="number")
                if (_setting.range) item.range = _setting.range
                acc.push(item)
                return acc
            }, [])
            return [...menusArr, ...keysArr]
        }

        // Visual settings menu
        const visualSettingsMenus = ["selectorMenu", "customSliders"]
        const visualSettingsKeys = ["masterSlotIsLastActive", "hintButton", "requestsSound", "worldWidthEqualFrame", "fontFamily", "worldOffsetY", "slotCount", "hiddenNamePlaceholder", "hiddenTitlePlaceholder", "backgroundPlaceholder"]
        // Tech settings menu
        const techSettingsMenus = ["permissions", "restoreFromBackup", "createBackup", "ForcedSettingsMigration"]
        const techSettingsKeys = ["headerPortraitButton", "makesBackup", "showToolbar", "permaForcedOpen", "portraitFoldersPath", "backgoundFoldersPath", "zIndex"]
        // Modules settings menu
        const modulesSettingsMenus = []
        const modulesSettingsKeys = ["useSimpleCalendar", "advancedRequestsSync", "discordNotifications", "discordActivitySync", "discordAutoConnect", "discordChannelId", "discordHighlightGM"]
        // Effects settings menu (панель "Эффекты" - apps/effectsPanel.js)
        const effectsSettingsMenus = []
        const effectsSettingsKeys = ["flashLightSpeed", "flashDarkSpeed", "bgScrollDirection", "bgScrollLoop", "bgScrollSpeed", "bgBlurStrength", "narrativeTextMode", "narrativeTypeSpeed", "barChangeSpeed", "barsAlwaysShow"]

        const settings =
            _mode=== "menuVisual" ? settingsArray(visualSettingsMenus, visualSettingsKeys) :
            _mode == "menuTech" ? settingsArray(techSettingsMenus, techSettingsKeys) :
            _mode == "menuModules" ? settingsArray(modulesSettingsMenus, modulesSettingsKeys) :
            _mode == "menuEffects" ? settingsArray(effectsSettingsMenus, effectsSettingsKeys) :
            null


        return { showMode: _mode, pFields, data, ...preset, presets: presetArray, settings, settingsTab, isMenuTab: true };
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Главное меню
        if (this.mode == "home") {
            const menuButtons = html[0].querySelectorAll('.vsm-menu-button')
            // Кнопки в главном меню
            menuButtons.forEach(button => {
                button.addEventListener('click', async (event) => {
                    const mode = event.currentTarget.dataset.mode
                    if (mode == "wipButton") {
                        ui.notifications.warn(`WIP`)
                        return
                    }
                    this.mode = mode
                    if (mode == "menuUI") {
                        this.render(true, {left: window.innerWidth * 0.05, top: window.innerHeight * 0.1})
                    } else {
                        this.render(true, {left: window.innerWidth * 0.25, top: window.innerHeight * 0.2})
                    }
                    this.bringToFront()
                })
            })
        } else {
            // Вернуться в главное меню
            const backToMenuButtons = html[0].querySelectorAll('.vsm-toMenu-button')
            backToMenuButtons.forEach(button => {
                button.addEventListener('click', (event) => {
                    this.mode = "home"
                    this.render(true, {left: (window.innerWidth - 760) / 2, top: (window.innerHeight - 560) / 2})
                    this.bringToFront()
                })
            })
        }
        

        // Меню настроек визуала/технических настроек/настроек модулей/настроек эффектов
        if (["menuVisual", "menuTech", "menuModules", "menuEffects"].includes(this.mode)) {
            // FilePicker
            const filePickers = html[0].querySelectorAll('.vsm-filepicker')
            filePickers.forEach(filePicker => {
                filePicker.addEventListener('click', (event) => {
                    const input = html[0].querySelector(`.vsm-filepicker-input[name="${event.currentTarget.dataset.target}"]`)
                    new FilePicker({classes: ["filepicker"], type: event.currentTarget.dataset.type, displayMode: "thumbs", callback: async (image) => {
                        if (image) {
                            input.value = image
                        }
                    }}).render()
                })
            })

            // Кнопки настроек-меню
            const settingMenuButtons = html[0].querySelectorAll('.vsm-setting-menu-button')
            settingMenuButtons.forEach(button => {
                button.addEventListener('click', async (event) => {
                    const key = event.currentTarget.dataset.key
                    const menuSetting = game.settings.menus.get(`${C.ID}.${key}`)
                    const _class = menuSetting.type
                    new _class().render(true)
                })
            })

            // Слайдер <-> числовое поле для type="number" настроек с range (например flashLightSpeed/
            // flashDarkSpeed в меню "Настройки эффектов") - см. visualSettingsMenu.hbs, setting.range
            html[0].querySelectorAll('.vsm-range-slider').forEach(slider => {
                const numberInput = slider.parentElement.querySelector('input[type="number"]')
                if (!numberInput) return
                slider.addEventListener('input', () => { numberInput.value = slider.value })
                numberInput.addEventListener('input', () => { slider.value = numberInput.value })
            })

            // Пара кнопок-переключателей для type="string" настроек с choices (например bgScrollDirection/
            // bgScrollLoop в меню "Настройки эффектов") - см. visualSettingsMenu.hbs, setting.choices.
            // Внутри одного .vsm-setting-container может быть только одна активная кнопка за раз.
            html[0].querySelectorAll('.vsm-choice-button').forEach(button => {
                button.addEventListener('click', (event) => {
                    const container = event.currentTarget.closest('.vsm-setting-container')
                    container?.querySelectorAll('.vsm-choice-button').forEach(b => {
                        b.classList.toggle('vsm-choice-active', b === event.currentTarget)
                    })
                })
            })

            // Сохранить настройки
            html[0].querySelector('.vsm-save-button')?.addEventListener('click', async (event) => {
                const settingEls = html[0].querySelectorAll('.vsm-setting-container')
                for (const el of settingEls) {
                    const settingType = el.dataset.type
                    if (settingType == "button") continue
                    const settingKey = el.dataset.key
                    const choiceButton = el.querySelector('.vsm-choice-button.vsm-choice-active')
                    const settingValue =
                        settingType == "boolean" ? el.querySelector('input').checked :
                        // parseFloat, а не parseInt - часть настроек (например flashLightSpeed/flashDarkSpeed)
                        // дробные (шаг 0.05), parseInt молча обрубал бы их до целого
                        settingType == "number" ? parseFloat(el.querySelector('input').value) :
                        choiceButton ? choiceButton.dataset.value :
                        (el.querySelector('input')?.value || el.querySelector('select')?.value)

                    await game.settings.set(C.ID, settingKey, settingValue)
                }
                // VisualNovelDialogues.instance.render(true)
                VisualNovelDialogues._render(null, true, true)
                ui.notifications.info(game.i18n.localize(`${C.ID}.visualSettingsMenu.saved`))
            })
        }

        // Меню настройки UI
        if (this.mode == "menuUI") {
            // Подсказка при наведении на элемент настройки
            const settingElements = html[0].querySelector('.vsm-UI').querySelectorAll('input, .vsm-pField-arrow, .vsm-mover-grab')
            const settingHintEl = html[0].querySelector(`.vsm-header .vsm-hint`)
            settingElements.forEach(el => {
                el.addEventListener('mouseover', (event) => {
                    const settingKey = el.dataset.key
                    const parts = settingKey.split(".")
                    settingHintEl.textContent = game.i18n.localize(`${C.ID}.uiSettingsMenuHints.${parts[0]}.${parts[1]}`)
                    settingHintEl.fontWeight = 900
                })
            })
            // Убираем подсказку когда убираем мышь
            settingElements.forEach(el => {
                el.addEventListener('mouseout', (event) => {
                    settingHintEl.textContent = game.i18n.localize(`${C.ID}.visualSettingsMenu.hintPlaceholder`)
                    settingHintEl.fontWeight = null
                })
            })

            // Добавить bar (горизонтальную шкалу) - только раскладка (позиция по умолчанию,
            // без перемещения/ресайза). Перемещение и ресайз - в detailed mode.
            html[0].querySelector('.vsm-add-bar-button')?.addEventListener('click', async (event) => {
                if (!this.editablePreset) {
                    ui.notifications.warn(game.i18n.localize(`${C.ID}.visualSettingsMenu.noPresetToSaveError`))
                    return
                }
                await PresetUIClass.addBar(this.editablePreset)
                this.render()
            })

            // Добавить пресет
            html[0].querySelector('.vsm-add-preset')?.addEventListener('click', async (event) => {
                const newPresetId = await PresetUIClass.addPreset()
                this.editablePreset = newPresetId
                this.render()
            })

            // Удалить пресет
            html[0].querySelectorAll('.vsm-preset-delete')?.forEach(button => {
                button.addEventListener('click', async (event) => {
                    const _id = event.currentTarget.closest('.vsm-preset').dataset.id
                    const _presetSettings = foundry.utils.deepClone(game.settings.get(C.ID, "presetsUI"))
                    const presetsArray = _presetSettings.presets.filter(p => p.id != _id)
                    if (presetsArray.length == 0) {
                        ui.notifications.error(game.i18n.localize(`${C.ID}.visualSettingsMenu.cannotDeleteTheOnlyOne`))
                    } else {
                        const confirmed = await Dialog.confirm({
                            title: game.i18n.localize(`${C.ID}.visualSettingsMenu.deletePresetConfirmTitle`),
                            content: `<p>${game.i18n.localize(`${C.ID}.visualSettingsMenu.deletePresetConfirmContent`)}</p>`,
                        })
                        if (!confirmed) return
                        await PresetUIClass.deletePreset(_id)
                        const newId = presetsArray[0]?.id
                        // Если удаляем активный пресет - ставим активым первый в списке
                        if (_id == _presetSettings.choosenPreset) await PresetUIClass.setPreset(newId)

                        // Если удаляем редактируемый пресет - ставим редактируемым первый в списке
                        if (_id == this.editablePreset) this.editablePreset = newId
                        this.render()
                    }
                })
            })

            // Скопировать настройки пресета
            html[0].querySelectorAll('.vsm-preset-import')?.forEach(button => {
                button.addEventListener('click', async (event) => {
                    const _id = event.currentTarget.closest('.vsm-preset').dataset.id
                    if (!_id) return
                    const presetData = PresetUIClass.getPreset(_id)
                    if (!presetData) return
                    this.bufferPresetData = presetData
                    ui.notifications.info(game.i18n.localize(`${C.ID}.visualSettingsMenu.copiedPreset`))
                })
            })

            // Вставить настройки пресета
            html[0].querySelectorAll('.vsm-preset-export')?.forEach(button => {
                button.addEventListener('click', async (event) => {
                    const _id = event.currentTarget.closest('.vsm-preset').dataset.id
                    if (!_id) return
                    const oldData = PresetUIClass.getPreset(_id)
                    if (!oldData) return
                    const bufferPresetData = this.bufferPresetData
                    if (bufferPresetData) {
                        await PresetUIClass.updatePreset(_id, {...bufferPresetData, id: _id, name: oldData.name, hotkey: oldData.hotkey})
                        ui.notifications.info(game.i18n.localize(`${C.ID}.visualSettingsMenu.pastedPreset`))
                        this.render()
                    } else {
                        ui.notifications.warn(game.i18n.localize(`${C.ID}.visualSettingsMenu.noCopiedPreset`))
                    }
                })
            })

            // Выбрать пресет в качестве редактируемого
            html[0].querySelectorAll('.vsm-preset-edit')?.forEach(button => {
                button.addEventListener('click', async (event) => {
                    const _id = event.currentTarget.closest('.vsm-preset').dataset.id
                    if (!_id) return
                    this.editablePreset = _id
                    this.render()
                })
            })
            // Выбрать пресет в качестве активного
            html[0].querySelectorAll('.vsm-preset-activate')?.forEach(button => {
                button.addEventListener('click', async (event) => {
                    const _id = event.currentTarget.closest('.vsm-preset').dataset.id
                    if (!_id) return
                    await PresetUIClass.setPreset(_id)
                    this.render()
                })
            })

            // Выбрать слот в качестве Главного
            const slotButtons = html[0].querySelectorAll('.vsm-pField-arrow')
            slotButtons?.forEach(el => {
                const side = el.parentElement.dataset.key
                el.addEventListener('click', async (event) => {
                    Array.from(slotButtons).filter(button => button.parentElement.dataset.key == side).forEach(button => {
                        button.classList.toggle('vsm-active', button.dataset.pos == el.dataset.pos)
                    })
                    const saveButton = html[0].querySelector('.vsm-ui-save-button')
                    saveButton?.classList?.toggle("vsm-hidden", false)
                    saveButton?.classList?.toggle("vsm-save-pulse", true)
                })
            })

            // Изменение любого инпута - появление кнопки "Сохранить"
            const uiMenuInputs = html[0].querySelector('.vsm-UI')?.querySelectorAll('input')
            uiMenuInputs?.forEach(input => {
                input.addEventListener('change', (event) => {
                    if (!this.editablePreset) {
                        ui.notifications.warn(game.i18n.localize(`${C.ID}.visualSettingsMenu.noPresetToSaveError`))
                        return
                    }
                    const saveButton = html[0].querySelector('.vsm-ui-save-button')
                    saveButton?.classList?.toggle("vsm-hidden", false)
                    saveButton?.classList?.toggle("vsm-save-pulse", true)
                })
            })

            // Сохранение пресета UI
            async function savePresetData(html, editablePresetId) {
                if (!editablePresetId) {
                    ui.notifications.warn(game.i18n.localize(`${C.ID}.visualSettingsMenu.noPresetToSaveError`))
                    return
                }
                // Собрать данные
                const inputEls = html[0].querySelector('.vsm-UI')?.querySelectorAll('input')
                const presetData = Array.from(inputEls).reduce((acc, el) => {
                    const parts = el.dataset.key.split(".")
                    if (!acc[parts[0]]) acc[parts[0]] = {}

                    acc[parts[0]][parts[1]] =
                        parts[0] == "activeElements" ? el.checked :
                        parts[0] == "slotCount" ? Math.min(5, Math.max(1, Math.trunc(Number(el.value)) || 1)) :
                        el.value

                    return acc
                }, {offset: {}})

                // Главный слот
                presetData.masterSlot = {
                    left: Array.from(slotButtons).filter(el => el.parentElement.dataset.key == "left").find(el => el.classList.contains('vsm-active'))?.dataset?.pos || "first",
                    right: Array.from(slotButtons).filter(el => el.parentElement.dataset.key == "right").find(el => el.classList.contains('vsm-active'))?.dataset?.pos || "first"
                }

                // Название пресета
                const presetEl = html[0].querySelector(`.vsm-preset[data-id="${editablePresetId}"]`)
                presetData.name = presetEl?.querySelector('.vsm-preset-input')?.value || game.i18n.localize(`${C.ID}.visualSettingsMenu.newPreset`)

                await PresetUIClass.updatePreset(editablePresetId, presetData)
                await VisualNovelDialogues._render(null, true, true)
                ui.notifications.info(game.i18n.localize(`${C.ID}.visualSettingsMenu.saved`))
            }
            html[0].querySelector('.vsm-ui-save-button')?.addEventListener('click', async (event) => {
                const editablePresetId = this.editablePreset
                await savePresetData(html, editablePresetId)
                this.render()
            })
            html[0].querySelectorAll('.vsm-preset-save')?.forEach(button => {
                button?.addEventListener('click', async (event) => {
                    const editablePresetId = this.editablePreset
                    await savePresetData(html, editablePresetId)
                    this.render()
                })
            })

            // Ресетнуть положение mover'а
            const moverResetEls = html[0].querySelectorAll('.vsm-mover-reset');
            moverResetEls.forEach(moverReset => {
                moverReset.addEventListener('click', (event) => {
                    const sliderType = moverReset.parentElement.dataset.slider
                    const sliderSide = sliderType.includes("right") ? "right" : "left"
                    const sliderEl = html[0].querySelector(`.vsm-move-${sliderType}`);
                    
                    const preset = new PresetUIClass()
                    const offset = preset.offset
                    sliderEl.style[sliderSide] = `${offset[`${sliderType}X`]}%`
                    sliderEl.style.top = `${offset[`${sliderType}Y`]}%`

                    const spanElX = moverReset.parentElement.querySelector('.vsm-mover-X');
                    const spanElY = moverReset.parentElement.querySelector('.vsm-mover-Y');
                    spanElX.innerHTML = `X: ${offset[`${sliderType}X`]}%`;
                    spanElY.innerHTML = `Y: ${offset[`${sliderType}Y`]}%`;
                    const saveButton = html[0].querySelector('.vsm-ui-save-button')
                    saveButton?.classList?.toggle("vsm-hidden", false)
                    saveButton?.classList?.toggle("vsm-save-pulse", true)
                })
            })
            // Перемещение элемента через mover
            const moverEls = html[0].querySelectorAll('.vsm-mover');
            moverEls.forEach(mover => {
                const editablePresetId = this.editablePreset;
                const grab = mover.querySelector('.vsm-mover-grab');
                const sliderType = mover.dataset.slider;
                const sliderSide = sliderType.includes("right") ? ("right") : ("left");
                const sliderEl = html[0].querySelector(`.vsm-move-${sliderType}`);
                const spanElX = mover.querySelector('.vsm-mover-X');
                const spanElY = mover.querySelector('.vsm-mover-Y');
                const parentEl = html[0].querySelector('.vsm-UI');

                let isDragging = false;
                let startX, startY, initialX, initialY, parentWidth, parentHeight;

                grab.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    parentWidth = parentEl.offsetWidth;
                    parentHeight = parentEl.offsetHeight;
                    initialX = parseInt(sliderEl.style[sliderSide]?.split("%")?.[0]) || 0;
                    initialY = parseInt(sliderEl.style.top?.split("%")?.[0]) || 0;
                    grab.style.cursor = 'grabbing';

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });

                function onMouseMove(e) {
                    if (!isDragging) return;
                    const dx = Math.round(((e.clientX - startX) / parentWidth) * 100) * (sliderSide == "right" ? -1 : 1);
                    const dy = Math.round(((e.clientY - startY) / parentHeight) * 100);
                    const shiftPressed = e.shiftKey;
                    if (shiftPressed) {
                        if (Math.abs(dx) > Math.abs(dy)) {
                            sliderEl.style[sliderSide] = `${(initialX + dx)}%`;
                            sliderEl.style.top = `${initialY}%`;
                            spanElX.innerHTML = `X: ${initialX + dx}%`;
                            spanElY.innerHTML = `Y: ${initialY}%`;
                        } else {
                            sliderEl.style.top = `${initialY + dy}%`;
                            sliderEl.style[sliderSide] = `${(initialX)}%`;
                            spanElX.innerHTML = `X: ${initialX}%`;
                            spanElY.innerHTML = `Y: ${initialY + dy}%`;
                        }
                    } else {
                        sliderEl.style.top = `${initialY + dy}%`;
                        sliderEl.style[sliderSide] = `${(initialX + dx)}%`;
                        spanElX.innerHTML = `X: ${initialX + dx}%`;
                        spanElY.innerHTML = `Y: ${initialY + dy}%`;
                    }
                }

                async function onMouseUp() {
                    isDragging = false;
                    grab.style.cursor = 'grab';
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    if (!editablePresetId) {
                        ui.notifications.warn(game.i18n.localize(`${C.ID}.visualSettingsMenu.noPresetToSaveError`));
                        return;
                    }
                    const saveButton = html[0].querySelector('.vsm-ui-save-button')
                    saveButton?.classList?.toggle("vsm-hidden", false)
                    saveButton?.classList?.toggle("vsm-save-pulse", true)
                }
            });

            // Перейти в детальный режим UI
            html.find('.vsm-buttom-button').on('click', (event) => {
                if (event.currentTarget.dataset.app == "detailUI") {
                    this.mode = "detailUI"
                    this.render(true, {left: window.innerWidth * 0.4, top: window.innerHeight * 0.6})
                    this.bringToFront()
                } else {
                    const app = new ButtonsCustomizer()
                    app.render(true)
                }
            })

        // Меню детального режима UI
        } else if (this.mode == "detailUI") {
            // Переключение подрежима
            html[0].querySelectorAll('.vsm-detail-mode-selector .vsm-detail-mode').forEach(el => {
                el.addEventListener('click', async (event) => {
                    // TEMP
                    return
                    const buffer = game.settings.get(C.ID, "detailModeBuffer")
                    buffer.mode = event.currentTarget.dataset.mode
                    await game.settings.set(C.ID, "detailModeBuffer", buffer)
                    this.render(true)
                })
            })

            // Скрыть другие окна
            html.find('#vsm-hideApps').on('change', async (event) => {
                // Обновляем настройку
                const buffer = game.settings.get(C.ID, "detailModeBuffer")
                buffer.hideApps = event.currentTarget.checked
                await game.settings.set(C.ID, "detailModeBuffer", buffer)
                // Меняем z-index
                document.getElementById("vn-body").style.zIndex = event.currentTarget.checked ? 9998 : game.settings.get(C.ID, "zIndex")
                document.getElementById("VisualSettingsMenu").style.zIndex = event.currentTarget.checked ? 9999 : 101
            })

            // Сетка-линейка
            html.find('#vsm-cellRuler').on('change', async (event) => {
                // Обновляем настройку
                const buffer = game.settings.get(C.ID, "detailModeBuffer")
                buffer.cellRuler = event.currentTarget.checked
                await game.settings.set(C.ID, "detailModeBuffer", buffer)
                // Переключаем отображение сетки-линейки
                document.getElementById("vn-cell-ruler").classList.toggle("vn-hidden", !event.currentTarget.checked)
            })

            // Сохранить изменения
            html.find('.vsm-detailUI-save-button').on('click', async () => {

                const editablePresetId = this.editablePreset
                if (!editablePresetId) {
                    ui.notifications.warn(game.i18n.localize(`${C.ID}.visualSettingsMenu.noPresetToSaveError`))
                    return
                }
                // Собрать данные
                const moverElNames = ["left", "right", "header"]
                const presetData = {offset: {}, masterSlot: {}, scale: {}}
                moverElNames.forEach(mover => {
                    const moverEl = document.getElementById(`vsm-mover-${mover}`)
                    if (!moverEl) return
                    const x = parseInt(moverEl.querySelector('.vsm-mover-X').textContent.split(": ")[1].split("%")[0]) || 0
                    const y = parseInt(moverEl.querySelector('.vsm-mover-Y').textContent.split(": ")[1].split("%")[0]) || 0
                    const s = parseInt(moverEl.querySelector('.vsm-mover-scale').textContent.split(": ")[1].split("%")[0]) || 100
                    presetData.offset[`${mover}SliderX`] = x
                    presetData.offset[`${mover}SliderY`] = y
                    presetData.scale[`${mover}Slider`] = s
                })
                // То же самое для bar - по одному муверу (#vsm-mover-bar-<id>) на каждый bar,
                // читаем актуальные X/Y/масштаб из его текста так же, как у слайдеров выше
                const currentPreset = PresetUIClass.getPreset(editablePresetId)
                presetData.bars = currentPreset.bars.map(bar => {
                    const moverEl = document.getElementById(`vsm-mover-bar-${bar.id}`)
                    if (!moverEl) return bar
                    const x = parseInt(moverEl.querySelector('.vsm-mover-X').textContent.split(": ")[1].split("%")[0]) || 0
                    const y = parseInt(moverEl.querySelector('.vsm-mover-Y').textContent.split(": ")[1].split("%")[0]) || 0
                    const s = parseInt(moverEl.querySelector('.vsm-mover-scale').textContent.split(": ")[1].split("%")[0]) || 100
                    return { ...bar, offsetX: x, offsetY: y, scale: s }
                })

                await PresetUIClass.updatePreset(editablePresetId, presetData)
                await VisualNovelDialogues._render(null, true, true)
                this.render()
                ui.notifications.info(game.i18n.localize(`${C.ID}.visualSettingsMenu.saved`))

            })

            // Отменить изменения
            html.find('.vsm-detailUI-cancel-button').on('click', async () => {

                await VisualNovelDialogues._render(["headerSlider", ..._portraitPartsKeys()])
                this.render(true)

            })

            // Вернуться в меню UI
            html.find('.vsm-detailUI-close-button').on('click', () => {
                this.mode = "menuUI"
                this.render(true, {left: window.innerWidth * 0.05, top: window.innerHeight * 0.1})
                this.bringToFront()
            })

        // Меню настроек автосоздания Портретов
        } else if (this.mode == "menuAutoPortraits") {
            // Кнопка мини-гайда
            html.find('.vsm-miniGuide-button').on('click', () => {
                new Dialog({
                    title: game.i18n.localize(`${C.ID}.dialogues.portraitAutoMakerGuideTitle`),
                    content: game.settings.get(C.ID, "autoPortraitLocalization")[game.i18n.lang] || game.settings.get(C.ID, "autoPortraitLocalization").en,
                    buttons: {},
                }).render(true, {width: window.innerWidth*0.40, height: window.innerHeight*0.70})
            })

            const app = this
            // Менюшка сокрытие типов персонажей
            html.find('.vsm-hiddenTypes-button').on('click', () => {
                const actorTypes = Actor.TYPES.filter(type => type != "base")
                const translates = game.i18n.translations.TYPES.Actor
                const hiddenTypes = game.settings.get(C.ID, "hiddenTypes")
                const content = `
                <div class="form-group">
                    <p>${game.i18n.localize(`${C.ID}.visualSettingsMenu.hiddenTypesHint`)}</p>
                    ${translates ? "" : `<p>${game.i18n.localize(`${C.ID}.visualSettingsMenu.noTypesTranslation`)}</p>`}
                        ${actorTypes.map(type => {
                            return `
                                <div class="form-fields">
                                    <label>
                                        <input id="hiddenTypes-${type}" type="checkbox" name="${type}" ${hiddenTypes.includes(type) ? "checked" : ""}>
                                        <span for="hiddenTypes-${type}">${translates?.[type] || type.split(".").pop()}</span>
                                    </label>
                                </div>
                            `
                        }).join("")}
                </div>
                `
                new Dialog({
                    title: game.i18n.localize(`${C.ID}.visualSettingsMenu.hiddenTypes`),
                    content: content,
                    buttons: {
                        ok: {
                            icon: '<i class="fas fa-check"></i>',
                            label: game.i18n.localize(`${C.ID}.buttons.confirm`),
                            callback: async (html) => {
                                // Обновляем настройки
                                const hiddenTypes = Array.from(html[0].querySelectorAll('input[type="checkbox"]:checked')).map(input => input.name)
                                await game.settings.set(C.ID, "hiddenTypes", hiddenTypes)
                                // Ререндер VisualSettingsMenu
                                // А как?
                                app.render(true)
                            }
                        }
                    }
                }).render(true)
            })

            // Переключение между вкладками
            const tabs = html[0].querySelectorAll('.pms-tab');
            const tabButtons = html[0].querySelectorAll('.pms-tab-button');
            tabButtons.forEach(tabButton => {
                tabButton.addEventListener('click', () => {
                    tabs.forEach(tab => {
                        tab.classList.toggle('pms-hidden', tabButton.dataset.tab != tab.dataset.tab)
                    })
                    tabButtons.forEach(button => {
                        button.classList.toggle('pms-choosed', tabButton.dataset.tab == button.dataset.tab)
                    })
                    this.activePmsTab = tabButton.dataset.tab;
                })
            })

            // Изменение селекторов
            const selectors = html[0].querySelectorAll('.pms-selector-box');
            selectors.forEach(selector => {
                selector.addEventListener('click', async () => {
                    const key = selector.parentElement.dataset.key;
                    const value = selector.dataset.value;
                    let selectorButtons = Array.from(selectors).filter(s => s.parentElement.dataset.key == key);
                    const activeGroup = selector.closest('.pms-tab').dataset.tab;
                    const autoPortraitSettings = foundry.utils.deepClone(game.settings.get(C.ID, "autoPortraitSettings"));
                    autoPortraitSettings[activeGroup].generalRules[key] = value;
                    await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                    selectorButtons = selectorButtons.filter(s => s.closest('.pms-tab').dataset.tab == activeGroup);
                    selectorButtons.forEach(button => {
                        button.classList.toggle('pms-choosed', button.dataset.value == value)
                    })
                })
            })

            // Чекбоксы
            const checkboxes = html[0].querySelectorAll('.pms-header-settings input[type="checkbox"]')
            checkboxes.forEach(checkbox => {
                const key = checkbox.dataset.key;
                const tab = checkbox.closest('.pms-tab').dataset.tab;
                checkbox.addEventListener('change', async () => {
                    if (key == "useThisGroupForAll") {
                        const checked = checkbox.checked
                        await game.settings.set(C.ID, "useChosenGroupSettings", checked ? tab : "");
                        Array.from(checkboxes).filter(c => c.dataset.key == "useThisGroupForAll" && c.closest('.pms-tab').dataset.tab != tab).forEach(c => {
                            c.checked = false
                            c.disabled = checked
                            c.dataset.tooltip = checked ? game.i18n.localize(`${C.ID}.portraitsMaker.useThisGroupForAllDisabled`) : "";
                            c.parentElement.classList.toggle('pms-locked', checked)
                        })
                    } else if (key == "useChosenGroupSettings") {
                        const selectedGroup = checkbox.closest('.pms-header-settings').querySelector('select[data-key="selectedGroup"]').value
                        const autoPortraitSettings = foundry.utils.deepClone(game.settings.get(C.ID, "autoPortraitSettings"));
                        autoPortraitSettings[tab].generalRules.useChosenGroupSettings = checkbox.checked ? selectedGroup : "";
                        await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                    }
                })
            })

            // Кнопки
            html[0].querySelectorAll('.pms-setting-button').forEach(button => {
                const key = button.dataset.key;
                const tab = button.closest('.pms-tab').dataset.tab;
                button.addEventListener('click', async () => {
                    const autoPortraitSettings = foundry.utils.deepClone(game.settings.get(C.ID, "autoPortraitSettings"));
                    if (key == "copyChosenGroup") {
                        const selectedGroup = button.parentElement.querySelector('select[data-key="selectedGroup"]').value
                        autoPortraitSettings[tab] = autoPortraitSettings[selectedGroup];
                        await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                        ui.notifications.info(game.i18n.localize(`${C.ID}.portraitsMaker.settingsCopied`));
                        this.render(true)
                    } else if (key == "addVariant") {
                        autoPortraitSettings[tab].searchConditions.push(defaultPortraitSettingsTemplate)
                        await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                        this.render(true)
                    } else if (key == "clearVariants") {
                        autoPortraitSettings[tab].searchConditions = []
                        await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                        this.render(true)
                    }
                })
            })

            // Перемещение пресета вверх и вниз
            html[0].querySelectorAll('.pms-autoSearch-item-move').forEach(button => {
                const key = button.dataset.key;
                const tab = button.closest('.pms-tab').dataset.tab;
                button.addEventListener('click', async () => {
                    const autoPortraitSettings = foundry.utils.deepClone(game.settings.get(C.ID, "autoPortraitSettings"));
                    if (key == "up") {
                        const index = parseInt(button.closest('.pms-autoSearch-item').dataset.index)
                        if (index > 0) {
                            const temp = autoPortraitSettings[tab].searchConditions[index - 1]
                            autoPortraitSettings[tab].searchConditions[index - 1] = autoPortraitSettings[tab].searchConditions[index]
                            autoPortraitSettings[tab].searchConditions[index] = temp
                            await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                            this.render(true)
                        }
                    } else if (key == "down") {
                        const index = parseInt(button.dataset.index)
                        if (index < autoPortraitSettings[tab].searchConditions.length - 1) {
                            const temp = autoPortraitSettings[tab].searchConditions[index + 1]
                            autoPortraitSettings[tab].searchConditions[index + 1] = autoPortraitSettings[tab].searchConditions[index]
                            autoPortraitSettings[tab].searchConditions[index] = temp
                            await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                            this.render(true)
                        }
                    }
                })
            })

            // Боковые кнопки
            html[0].querySelectorAll('.pms-autoSearch-item-sideButton').forEach(button => {
                const tab = button.closest('.pms-tab').dataset.tab;
                const key = button.dataset.key;
                button.addEventListener('click', async () => {
                    const autoPortraitSettings = foundry.utils.deepClone(game.settings.get(C.ID, "autoPortraitSettings"));
                    const index = parseInt(button.closest(".pms-asi-cornerButtons").dataset.index)
                    const temp = autoPortraitSettings[tab].searchConditions[index]
                    if (key == "activeSwitch") {
                        autoPortraitSettings[tab].searchConditions[index].active = !autoPortraitSettings[tab].searchConditions[index].active
                    } else if (key == "copy") {
                        autoPortraitSettings[tab].searchConditions.splice(index + 1, 0, temp)
                    } else if (key == "delete") {
                        if (autoPortraitSettings[tab].searchConditions.length > 1) {
                            autoPortraitSettings[tab].searchConditions.splice(index, 1)
                        } else {
                            ui.notifications.warn(game.i18n.localize(`${C.ID}.portraitsMaker.cantDeleteLast`));
                        }
                    }
                    await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                    this.render(true)
                })
            })

            // Массовое создание Портретов
            html[0].querySelector('.pms-multiCreate-button').addEventListener('click', async () => {
                await openMassPortraitCreator()
            })

            // Фильтры автопоиска
            // Блок первого и второго инпута при некоторых вариантах выбора
            html[0].querySelectorAll('.pms-autoSearch-item-boxPart select').forEach(select => {
                const selName = select.name
                const inputEl = select.parentElement.querySelector('input')
                const inputKey = inputEl.dataset.key
                const tab = select.closest('.pms-tab').dataset.tab;
                const index = parseInt(select.closest(".pms-autoSearch-item").dataset.index)
                select.addEventListener('change', async () => {
                    const autoPortraitSettings = foundry.utils.deepClone(game.settings.get(C.ID, "autoPortraitSettings"));
                    autoPortraitSettings[tab].searchConditions[index][selName] = select.value
                    await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                    this.render(true)
                })
                inputEl.addEventListener('change', async () => {
                    const autoPortraitSettings = foundry.utils.deepClone(game.settings.get(C.ID, "autoPortraitSettings"));
                    autoPortraitSettings[tab].searchConditions[index][inputKey] = inputEl.value
                    await game.settings.set(C.ID, "autoPortraitSettings", autoPortraitSettings);
                    this.render(true)
                })
            }) 

        }
    }

    // Метод для получения элемента mover'а с добавлением слушателей и прочей шелухи
    static _getMoverEl(side) {
        const moverBody = document.createElement('div');
        moverBody.className = 'vsm-mover';
        moverBody.dataset.slider = `${side}Slider`;
        moverBody.id = `vsm-mover-${side}`;

        const curPreset = PresetUIClass.getActivePreset()
        const offset = curPreset.offset
        const scale = curPreset.scale

        moverBody.style.transform = `translate(-50%, 0%) scale(${100 / scale[`${side}Slider`]})`;

        // Вставляем всю структуру HTML разом чтоб не ебать мозги ни себе ни людям
        moverBody.innerHTML = `
            <div class="vsm-mover-container flexrow">
                <div class="vsm-mover-reset" data-tooltip="${game.i18n.localize(`${C.ID}.uiSettingsMenuHints.mover.reset`)}"><i class="fas fa-redo-alt"></i></div>
                <div class="vsm-mover-text">
                    <span class="vsm-mover-X">X: ${offset[`${side}SliderX`]}%</span>
                    <span class="vsm-mover-Y">Y: ${offset[`${side}SliderY`]}%</span>
                </div>
                <div class="vsm-mover-grab"><i class="fas fa-arrows-up-down-left-right"></i></div>
            </div>
            <div class="vsm-mover-scale-container">
                <span class="vsm-mover-scale">${game.i18n.localize(`${C.ID}.visualSettingsMenu.scale`)}: ${scale[`${side}Slider`]}%</span>
                <input type="range" name="scale" min="50" max="300" value="${scale[`${side}Slider`]}">
            </div>
        `;
    
        // Ресет положения
        const moverReset = moverBody.querySelector('.vsm-mover-reset');
        const sliderEl = document.getElementById(`vn-${side}`);
        const sliderSide = side == "right" ? ("right") : ("left");
        moverReset.addEventListener('click', () => {
            // Позиция слайдера
            const defPreset = new PresetUIClass()
            const defOffset = defPreset.offset
            sliderEl.style[sliderSide] = `${defOffset[`${side}SliderX`]}%`
            sliderEl.style.top = `${defOffset[`${side}SliderY`]}%`
            sliderEl.style.scale = 1

            // Текст
            const spanElX = moverBody.querySelector('.vsm-mover-X');
            const spanElY = moverBody.querySelector('.vsm-mover-Y');
            const scaleEl = moverBody.querySelector('.vsm-mover-scale');
            spanElX.innerHTML = `X: ${defOffset[`${side}SliderX`]}%`;
            spanElY.innerHTML = `Y: ${defOffset[`${side}SliderY`]}%`;
            scaleEl.innerHTML = `${game.i18n.localize(`${C.ID}.visualSettingsMenu.scale`)}: ${defPreset.scale[`${side}Slider`]}%`;

            // Размер mover'а
            moverBody.style.transform = `translate(-50%, 0%)`;
            moverBody.style.scale = 1;
            moverBody.querySelector('input').value = defPreset.scale[`${side}Slider`];
            
            // Анимация на кнопку сохранения
            document.getElementById("vsm-detailUI-save")?.classList?.toggle("vsm-save-pulse", true)
        });
    
        // Слушатели mover'а
        const grab = moverBody.querySelector('.vsm-mover-grab');
        const spanElX = moverBody.querySelector('.vsm-mover-X');
        const spanElY = moverBody.querySelector('.vsm-mover-Y');

        let isDragging = false;
        let startX, startY, initialX, initialY

        // Мышку зажимаем на мувере
        grab.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = parseInt(sliderEl.style[sliderSide]?.split("%")?.[0]) || 0;
            initialY = parseInt(sliderEl.style.top?.split("%")?.[0]) || 0;
            grab.style.cursor = 'grabbing';

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        // Двигаем мышь
        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = Math.round(((e.clientX - startX) / window.innerWidth) * ({right: -100, header: 143}[side] || 100));
            const dy = Math.round(((e.clientY - startY) / window.innerHeight) * 100);
            const shiftPressed = e.shiftKey;
            if (shiftPressed) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    sliderEl.style[sliderSide] = `${(initialX + dx)}%`;
                    sliderEl.style.top = `${initialY}%`;
                    spanElX.innerHTML = `X: ${initialX + dx}%`;
                    spanElY.innerHTML = `Y: ${initialY}%`;
                } else {
                    sliderEl.style.top = `${initialY + dy}%`;
                    sliderEl.style[sliderSide] = `${(initialX)}%`;
                    spanElX.innerHTML = `X: ${initialX}%`;
                    spanElY.innerHTML = `Y: ${initialY + dy}%`;
                }
            } else {
                sliderEl.style.top = `${initialY + dy}%`;
                sliderEl.style[sliderSide] = `${(initialX + dx)}%`;
                spanElX.innerHTML = `X: ${initialX + dx}%`;
                spanElY.innerHTML = `Y: ${initialY + dy}%`;
            }
        }

        // Отпускаем мышь
        async function onMouseUp() {
            isDragging = false;
            grab.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Анимация на кнопку сохранения
            document.getElementById("vsm-detailUI-save")?.classList?.toggle("vsm-save-pulse", true)
        }

        // Слушатель ползунка масштаба
        moverBody.querySelector('input[name="scale"]').addEventListener('input', function(event) {
            sliderEl.style.scale = event.currentTarget.value / 100;
            moverBody.querySelector('.vsm-mover-scale').textContent = `${game.i18n.localize(`${C.ID}.visualSettingsMenu.scale`)}: ${event.currentTarget.value}%`;
            moverBody.style.transform = `translate(-50%, 0%) scale(${100 / event.currentTarget.value})`;
            // Анимация на кнопку сохранения
            document.getElementById("vsm-detailUI-save")?.classList?.toggle("vsm-save-pulse", true)
        });

        return moverBody;
    }

    // Мувер для bar - упрощённая версия _getMoverEl выше: bar позиционируется плоскими left/top %
    // (та же конвенция, что у headerSlider), поэтому не нужен ни выбор стороны, ни специальный
    // множитель {right: -100, header: 143} из _getMoverEl (там он компенсирует anchor справа/магическую
    // разницу масштаба заголовка). Плюс кнопка удаления bar прямо на мувере - detailed mode это
    // единственное место, где bar можно удалить (добавление - кнопкой в UI customization).
    static _getBarMoverEl(barId) {
        const moverBody = document.createElement('div');
        moverBody.className = 'vsm-mover vsm-bar-mover';
        moverBody.id = `vsm-mover-bar-${barId}`;

        const curPreset = PresetUIClass.getActivePreset()
        const bar = curPreset.bars.find(b => b.id === barId)
        const barEl = document.querySelector(`.vn-bar[data-bar-id="${barId}"]`)
        // Раскладка может ссылаться на bar, DOM-узла которого сейчас нет (скрыт - см. barsAlwaysShow,
        // main.js _preparePartContext "bars"). Без узла двигать нечего - мувер не создаём.
        if (!bar || !barEl) return null

        moverBody.style.transform = `translate(-50%, 0%) scale(${100 / bar.scale})`;

        moverBody.innerHTML = `
            <div class="vsm-mover-container flexrow">
                <div class="vsm-mover-reset" data-tooltip="${game.i18n.localize(`${C.ID}.uiSettingsMenuHints.mover.reset`)}"><i class="fas fa-redo-alt"></i></div>
                <div class="vsm-mover-text">
                    <span class="vsm-mover-X">X: ${bar.offsetX}%</span>
                    <span class="vsm-mover-Y">Y: ${bar.offsetY}%</span>
                </div>
                <div class="vsm-mover-grab"><i class="fas fa-arrows-up-down-left-right"></i></div>
                <div class="vsm-mover-delete" data-tooltip="${game.i18n.localize(`${C.ID}.visualSettingsMenu.deleteBarTooltip`)}"><i class="fas fa-trash"></i></div>
            </div>
            <div class="vsm-mover-scale-container">
                <span class="vsm-mover-scale">${game.i18n.localize(`${C.ID}.visualSettingsMenu.scale`)}: ${bar.scale}%</span>
                <input type="range" name="scale" min="50" max="300" value="${bar.scale}">
            </div>
        `;

        // Ресет положения
        const moverReset = moverBody.querySelector('.vsm-mover-reset');
        const defBar = PresetUIClass.newBar()
        moverReset.addEventListener('click', () => {
            barEl.style.left = `${defBar.offsetX}%`
            barEl.style.top = `${defBar.offsetY}%`
            barEl.style.scale = 1

            const spanElX = moverBody.querySelector('.vsm-mover-X');
            const spanElY = moverBody.querySelector('.vsm-mover-Y');
            const scaleEl = moverBody.querySelector('.vsm-mover-scale');
            spanElX.innerHTML = `X: ${defBar.offsetX}%`;
            spanElY.innerHTML = `Y: ${defBar.offsetY}%`;
            scaleEl.innerHTML = `${game.i18n.localize(`${C.ID}.visualSettingsMenu.scale`)}: ${defBar.scale}%`;

            moverBody.style.transform = `translate(-50%, 0%)`;
            moverBody.style.scale = 1;
            moverBody.querySelector('input').value = defBar.scale;

            document.getElementById("vsm-detailUI-save")?.classList?.toggle("vsm-save-pulse", true)
        });

        // Слушатели mover'а (та же математика перетаскивания, что у _getMoverEl, без per-side множителя -
        // bar всегда позиционируется через обычный left, не right)
        const grab = moverBody.querySelector('.vsm-mover-grab');
        const spanElX = moverBody.querySelector('.vsm-mover-X');
        const spanElY = moverBody.querySelector('.vsm-mover-Y');

        let isDragging = false;
        let startX, startY, initialX, initialY

        grab.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = parseInt(barEl.style.left?.split("%")?.[0]) || 0;
            initialY = parseInt(barEl.style.top?.split("%")?.[0]) || 0;
            grab.style.cursor = 'grabbing';

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = Math.round(((e.clientX - startX) / window.innerWidth) * 100);
            const dy = Math.round(((e.clientY - startY) / window.innerHeight) * 100);
            const shiftPressed = e.shiftKey;
            if (shiftPressed) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    barEl.style.left = `${(initialX + dx)}%`;
                    barEl.style.top = `${initialY}%`;
                    spanElX.innerHTML = `X: ${initialX + dx}%`;
                    spanElY.innerHTML = `Y: ${initialY}%`;
                } else {
                    barEl.style.top = `${initialY + dy}%`;
                    barEl.style.left = `${(initialX)}%`;
                    spanElX.innerHTML = `X: ${initialX}%`;
                    spanElY.innerHTML = `Y: ${initialY + dy}%`;
                }
            } else {
                barEl.style.top = `${initialY + dy}%`;
                barEl.style.left = `${(initialX + dx)}%`;
                spanElX.innerHTML = `X: ${initialX + dx}%`;
                spanElY.innerHTML = `Y: ${initialY + dy}%`;
            }
        }

        async function onMouseUp() {
            isDragging = false;
            grab.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.getElementById("vsm-detailUI-save")?.classList?.toggle("vsm-save-pulse", true)
        }

        moverBody.querySelector('input[name="scale"]').addEventListener('input', function(event) {
            barEl.style.scale = event.currentTarget.value / 100;
            moverBody.querySelector('.vsm-mover-scale').textContent = `${game.i18n.localize(`${C.ID}.visualSettingsMenu.scale`)}: ${event.currentTarget.value}%`;
            moverBody.style.transform = `translate(-50%, 0%) scale(${100 / event.currentTarget.value})`;
            document.getElementById("vsm-detailUI-save")?.classList?.toggle("vsm-save-pulse", true)
        });

        // Удалить bar - из раскладки (preset.bars) и из живого содержимого (vnData.barsData) разом,
        // это единственное место в интерфейсе, где bar можно удалить
        moverBody.querySelector('.vsm-mover-delete').addEventListener('click', async () => {
            await PresetUIClass.removeBar(curPreset.id, barId)
            const settingData = getSettings()
            const barsData = (settingData.barsData || []).filter(b => b.id !== barId)
            await quickSettingsUpdate({ barsData }, { renderData: { renderParts: ["bars"] } })
            moverBody.remove()
        })

        return moverBody;
    }

    static async detailModeChanges(html, detailMode = true){
        const detailModeBuffer = game.settings.get(C.ID, "detailModeBuffer");
        // Включение/выключение сетки-рулетки и изменение z-index vn-body
        document.getElementById("vn-cell-ruler").classList.toggle('vn-hidden', !(detailMode && detailModeBuffer.hideRuler));
        document.getElementById("vn-body").style.zIndex = detailMode && detailModeBuffer.hideApps ? 9998 : game.settings.get(C.ID, "zIndex");
        document.getElementById("VisualSettingsMenu").style.zIndex = detailMode && detailModeBuffer.hideApps ? 9999 : 101;

        // На всякий случай удаляем предыдущие mover'ы
        document.getElementById("vsm-mover-left")?.remove();
        document.getElementById("vsm-mover-right")?.remove();
        document.getElementById("vsm-mover-header")?.remove();
        document.querySelectorAll('[id^="vsm-mover-bar-"]').forEach(el => el.remove());
        // Добавление/удаление mover'ов
        if (detailMode && detailModeBuffer.mode == "moveSliders") {
            document.getElementById("vn-left").appendChild(VisualSettingsMenu._getMoverEl("left"));
            document.getElementById("vn-right").appendChild(VisualSettingsMenu._getMoverEl("right"));
            document.getElementById("vn-header").appendChild(VisualSettingsMenu._getMoverEl("header"));
            // По одному муверу на каждый bar активного пресета, у которого сейчас есть DOM-узел
            // (bar может быть скрыт - см. barsAlwaysShow). Мувер вставляется ВНУТРЬ самого .vn-bar,
            // как и у слайдеров (#vn-left/right/header) - так его translate(-50%, 0%) центрируется
            // ровно над своим bar, а не над всем контейнером #vn-bars.
            PresetUIClass.getActivePreset().bars.forEach(bar => {
                const barMover = VisualSettingsMenu._getBarMoverEl(bar.id)
                const barEl = document.querySelector(`.vn-bar[data-bar-id="${bar.id}"]`)
                if (barMover && barEl) barEl.appendChild(barMover)
            })
        }

        await game.settings.set(C.ID, "viewMode", detailMode);
        if (detailMode) await quickSettingsUpdate({editMode: false}, {renderData: {renderParts: ["editWindow", "foreground", "headerSlider", ..._portraitPartsKeys()]}})
        else VisualNovelDialogues._render(["editWindow", "foreground", "headerSlider", ..._portraitPartsKeys()]);
    }

    // А это тут просто по приколу (просто тронь - и всё развалится)
    async _updateObject(event, formData) {
    }
}
