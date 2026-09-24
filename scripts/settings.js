import { Constants as C, allowTo, createBackup, defaultPermissions, getEmptyActiveSpeakers, getSettings, selectorArray, defaultPortraitSettings, VNapp } from "./const.js";
import { VisualNovelDialogues } from "./main.js";
import { VNLocation } from "./locationClass.js";
import { addMenuSetting, vndSelectorMenu, RestoreFromBackup, CreateBackup, CustomSlidersSet, PlayersPermissions, ForcedSettingsMigration } from './settingsMenu.js';
import { localizeConsts } from "./localizeConsts.js";
import { discordElementActivity, DiscordIntegration } from './discordIntegration.js';
import { DiscordMenu } from "../apps/discordMenu.js";
import { VisualSettingsMenu } from "../apps/visualSettingsMenu.js";
import { PresetUIClass } from "./presetUIClass.js";
import { ButtonsCustomizer, DefaultButton } from "../apps/buttonsCustomizer.js";

Hooks.once('init', function() {

    game.keybindings.register(C.ID, "toggleVN", {
        name: game.i18n.localize(`${C.ID}.settings.toggleVN`),
        editable: [
            {key: "KeyK"}
        ],
        onDown: () => {
        },
        onUp: (e) => {
            e.event.preventDefault();
            e.event.stopPropagation();
            VisualNovelDialogues.toggleVN();
        }
    });

    game.keybindings.register(C.ID, "hiddenTurnVN", {
        name: game.i18n.localize(`${C.ID}.settings.hiddenTurnVN`),
        config: true,
        editable: [
          {key: "KeyL"}
        ],
        onDown: () => {
        },
        onUp: (e) => {
            e.event.preventDefault();
            e.event.stopPropagation();
            if (game.user.isGM) VisualNovelDialogues.toggleVN([game.user.id]);
        },
        restricted: true
    });

    // Меню настроек
    game.settings.registerMenu(C.ID, 'settingsMainMenu', {
        'name': game.i18n.localize(`${C.ID}.settings.settingsMainMenu`),
        'label': game.i18n.localize(`${C.ID}.settings.settingsMainMenuLabel`),
        'hint': game.i18n.localize(`${C.ID}.settings.settingsMainMenuHint`),
        'icon': 'fas fa-house',
		restricted: true,
        'type': VisualSettingsMenu,
    })

    // Селектор
    // Меню селектора
    game.settings.registerMenu(C.ID, 'selectorMenu', {
        'name': game.i18n.localize(`${C.ID}.settings.selectorMenu`),
        'label': game.i18n.localize(`${C.ID}.settings.selectorMenuLabel`),
        'hint': game.i18n.localize(`${C.ID}.settings.selectorMenuHint`),
        'icon': 'fas fa-gears',
		restricted: true,
        'type': vndSelectorMenu,
    });
    // Опции меню селектора
    const registerSelectorSetting = (name) => {
        game.settings.register(C.ID, `selector${name}`, {
            name: `${name == "TabCompendium" ? "SIDEBAR" : "DOCUMENT"}.${name}`,
            scope: "client",
            config: false,
            type: Boolean,
            default: true,
        });
        addMenuSetting(`selector${name}`, 'selectorMenu');
    }
    Object.keys(selectorArray()).forEach(name => registerSelectorSetting(name))

    // Права игроков
    game.settings.registerMenu(C.ID, 'permissions', {
        'name': game.i18n.localize(`${C.ID}.settings.permissions`),
        'label': game.i18n.localize(`${C.ID}.settings.permissionsLabel`),
        'hint': game.i18n.localize(`${C.ID}.settings.permissionsHint`),
        'icon': 'fas fa-shield-alt',
		restricted: true,
        'type': PlayersPermissions,
    })

    // Сеты плашек
    game.settings.registerMenu(C.ID, 'customSliders', {
        'name': game.i18n.localize(`${C.ID}.settings.customSliders`),
        'label': game.i18n.localize(`${C.ID}.settings.customSlidersLabel`),
        'hint': game.i18n.localize(`${C.ID}.settings.customSlidersHint`),
        'icon': 'fas fa-layer-group',
		restricted: true,
        'type': CustomSlidersSet,
    });

    // Кастомизатор кнопок быстрого доступа
    game.settings.registerMenu(C.ID, 'buttonsCustomizer', {
        'name': game.i18n.localize(`${C.ID}.settings.buttonsCustomizerMenu`),
        'label': game.i18n.localize(`${C.ID}.buttonsCustomizer.openButton`),
        'hint': game.i18n.localize(`${C.ID}.settings.buttonsCustomizerMenuHint`),
        'icon': 'fas fa-list-check',
        restricted: true,
        'type': ButtonsCustomizer,
    });
    game.settings.register(C.ID, "buttonsList", {
        scope: "world",
        type: Array,
        config: false,
        default: DefaultButton.defauldButtonList().map(button => ({...button})),
    });

    const registerSettings = (key, _scope = 'world', _config = true, _type = Boolean, _default = true, _filePicker = null, reRender = false, choices = null, range = null) => {
        game.settings.register(C.ID, key, {
            ...{
                name: game.i18n.localize(`${C.ID}.settings.${key}`),
                hint: game.i18n.localize(`${C.ID}.settings.${key}Hint`),
                scope: _scope,
                config: _config,
                type: _type,
                default: _default,
                onChange: (value) => {
                    if (reRender) VisualNovelDialogues._render(null, true)
                }
            },
            ...(_filePicker ? {filePicker: _filePicker} : {}),
            ...(choices ? { choices: choices } : {}),
            // range: {min, max, step} - используется меню "Настройки эффектов" (apps/visualSettingsMenu.js,
            // settingsArray()) чтобы отрисовать слайдер вместо обычного числового поля, см. flashLightSpeed/
            // flashDarkSpeed ниже
            ...(range ? { range: range } : {})
        });
    }
    
    game.settings.registerMenu(C.ID, "restoreFromBackup", {
        name: game.i18n.localize(`${C.ID}.settings.restoreFromBackup`),
        label: game.i18n.localize(`${C.ID}.settings.restoreFromBackupLabel`),
        hint: game.i18n.localize(`${C.ID}.settings.restoreFromBackupHint`),
		icon: 'fas fa-file-code',
		restricted: true,
        type: RestoreFromBackup
    })
    game.settings.registerMenu(C.ID, "createBackup", {
        name: game.i18n.localize(`${C.ID}.settings.createBackup`),
        label: game.i18n.localize(`${C.ID}.settings.createBackupLabel`),
        hint: game.i18n.localize(`${C.ID}.settings.createBackupHint`),
		icon: 'fas fa-file-pen',
		restricted: true,
        type: CreateBackup
    })

    // Принудительная миграция настроек на новую версию
    game.settings.registerMenu(C.ID, "ForcedSettingsMigration", {
        name: game.i18n.localize(`${C.ID}.settings.ForcedSettingsMigration`),
        label: game.i18n.localize(`${C.ID}.settings.ForcedSettingsMigrationLabel`),
        hint: game.i18n.localize(`${C.ID}.settings.ForcedSettingsMigrationHint`),
		icon: 'fas fa-code-compare',
		restricted: true,
        type: ForcedSettingsMigration
    })


    // Кнопка подсказки
    registerSettings("hintButton", "client", true, Boolean, true, null, true)
    // Кнопка настроек портрета в заголовке листа персонажа
    registerSettings("headerPortraitButton", "client", true, Boolean, false)
    // (Устаревшее) При отображение имени крайнего персонажа, выбирается крайний персонаж с внутренней части
    // registerSettings("innerSideMainName", "client", true, Boolean, false, null, true)
    // Последний активный слот становится мастер-слотом
    registerSettings("masterSlotIsLastActive", "client", false, Boolean, false)
    // Делать бекапы при запуске мира
    registerSettings("makesBackup", "world", false, Boolean, true)
    // Звук заявок
    registerSettings("requestsSound", "client", false, Boolean, true)
    // Отображать панель инструментов
    registerSettings("showToolbar", "client", false, Boolean, true)
    // Ширина портретов = ширина рамок
    registerSettings("worldWidthEqualFrame", "world", false, Boolean, false, null, true)
    // Каждое открытие окна Visual Novel считается принудительным
    registerSettings("permaForcedOpen", "world", false, Boolean, false)
    // Шрифт
    const fonts = Object.keys(CONFIG.fontDefinitions).reduce((acc, key) => { acc[key] = key; return acc }, {});
    registerSettings("fontFamily", "client", false, String, "Amiri", null, true, fonts)
    // Смещение всех портретов по оси Y
    registerSettings("worldOffsetY", "world", false, Number, 0, null, true)
    // Количество слотов окна VN (на одной стороне)
    registerSettings("slotCount", "world", false, Number, 4, null, true, null, {min: 1, max: 5, step: 1}) // по умолчанию
    // z-index окна
    registerSettings("zIndex", "world", false, Number, 90, null, true) // по умолчанию
    // Скорость (длительность, в секундах) вспышки света/тьмы - панель "Эффекты" (apps/effectsPanel.js),
    // применяется в scripts/main.js (_applyEffectLocally) как animationDuration поверх CSS-анимации.
    // Дефолты совпадают с исходными хардкод-длительностями CSS (.4s/.5s), чтобы поведение не поменялось
    // для тех, кто ничего не настраивал.
    registerSettings("flashLightSpeed", "world", false, Number, 0.4, null, false, null, {min: 0.1, max: 2, step: 0.05})
    registerSettings("flashDarkSpeed", "world", false, Number, 0.5, null, false, null, {min: 0.1, max: 2, step: 0.05})
    // Медленная прокрутка фона (переключатель "Прокрутка фона" в панели "Эффекты", apps/effectsPanel.js) -
    // сам переключатель хранится в vnData.bgScroll (см. defaultVnData ниже), а вот В КАКУЮ СТОРОНУ и
    // ЗАЦИКЛЕНА ЛИ анимация - это две настройки ГМа отсюда, из меню "Настройки эффектов"
    // (apps/visualSettingsMenu.js, effectsSettingsKeys), рядом с flashLightSpeed/flashDarkSpeed.
    // choices здесь - {key: "показываемый текст кнопки"}, settingsArray()/visualSettingsMenu.hbs рисует
    // из них не выпадающий список, а пару кнопок-переключателей (см. .vsm-choice-button)
    registerSettings("bgScrollDirection", "world", false, String, "right", null, false, {left: game.i18n.localize(`${C.ID}.settings.bgScrollDirectionLeft`), right: game.i18n.localize(`${C.ID}.settings.bgScrollDirectionRight`)})
    registerSettings("bgScrollLoop", "world", false, String, "end", null, false, {end: game.i18n.localize(`${C.ID}.settings.bgScrollLoopEnd`), cycle: game.i18n.localize(`${C.ID}.settings.bgScrollLoopCycle`)})
    // Скорость (длительность полного прохода, в секундах) прокрутки фона - тот же слайдер-паттерн, что и
    // flashLightSpeed/flashDarkSpeed выше, применяется в main.js (_onRender) как animationDuration поверх
    // CSS-анимации. Дефолт (45s) совпадает с исходной хардкод-длительностью CSS, чтобы поведение не
    // поменялось для тех, кто ничего не настраивал.
    registerSettings("bgScrollSpeed", "world", false, Number, 45, null, false, null, {min: 5, max: 180, step: 1})
    // Размытие фона (переключатель "Блюр фона" в панели "Эффекты", apps/effectsPanel.js) - сам
    // переключатель хранится в vnData.bgBlur (см. defaultVnData ниже), а вот СИЛА размытия - отдельная
    // настройка ГМа отсюда, из меню "Настройки эффектов". 0 - размытия нет, 1 - максимальное (см.
    // main.js _onRender, где значение 0-1 переводится в пиксели CSS filter:blur()).
    registerSettings("bgBlurStrength", "world", false, Number, 0.5, null, false, null, {min: 0, max: 1, step: 0.05})
    // Режим показа текста в эффекте "Нарратив" (панель "Эффекты") - "Моментально" (вся страница сразу)
    // или "Периодически" (по буквам, см. narrativeTypeSpeed ниже) - тот же паттерн кнопок-переключателей,
    // что у bgScrollDirection/bgScrollLoop выше.
    registerSettings("narrativeTextMode", "world", false, String, "instant", null, false, {instant: game.i18n.localize(`${C.ID}.settings.narrativeTextModeInstant`), periodic: game.i18n.localize(`${C.ID}.settings.narrativeTextModePeriodic`)})
    // Темп появления букв в режиме "Периодически" - символов в секунду. Тот же слайдер-паттерн, что и
    // flashLightSpeed/bgScrollSpeed выше, применяется в main.js (_playNarrativeText).
    registerSettings("narrativeTypeSpeed", "world", false, Number, 20, null, false, null, {min: 2, max: 60, step: 1})
    // Скорость изменения значения горизонтальной шкалы (bar) - длительность CSS-transition
    // заполнения в секундах, тот же паттерн, что у flashLightSpeed/bgScrollSpeed выше.
    registerSettings("barChangeSpeed", "world", false, Number, 0.6, null, false, null, {min: 0.1, max: 3, step: 0.05})
    // Показывать все заведённые в пресете bar всегда, либо скрывать конкретный bar до тех пор,
    // пока ГМ впервые не поменяет его значение в панели "Эффекты" (см. vnData.bars, apps/effectsPanel.js)
    registerSettings("barsAlwaysShow", "world", false, Boolean, true)
    // Плейсхолдер фона
    registerSettings("backgroundPlaceholder", "world", false, String, "modules/visual-novel-reverse/templates/assets/placeholderImage.webp", "image")
    // Дефолтная папка для поиска портретов
    registerSettings("portraitFoldersPath", "world", false, String, "", "folder")
    // Дефолтная папка для выбора фонов
    registerSettings("backgoundFoldersPath", "world", false, String, "", "folder")
    // Плейсхолдер скрытого имени
    registerSettings("hiddenNamePlaceholder", "world", false, String, "???")
    // Плейсхолдер скрытого титула
    registerSettings("hiddenTitlePlaceholder", "world", false, String, "")
    // Использование Simple Calendar для отображения времени
    registerSettings("useSimpleCalendar", "world", false, Boolean, true, null, true)
    // Синхронизация заявок с модулем "Advanced Requests"
    registerSettings("advancedRequestsSync", "world", game.modules.get("advanced-requests")?.active, Boolean, true)
    // Discord: оповещать о входе/выходе из голосового канала
    registerSettings("discordNotifications", "world", false, Boolean, true)
    // Discord: "Активность" портрета персонажа игрока синхронизирована с Discord (говорит/перестает говорить)
    registerSettings("discordActivitySync", "world", false, Boolean, true)
    // Discord: Автоматически пытаться подключиться к Discord Bridge при запуске мира FoundryVTT
    registerSettings("discordAutoConnect", "world", false, Boolean, true)
    // Discord: ID/название голосового канала
    registerSettings("discordChannelId", "world", false, String, "")
    // Discord: Когда ГМ говорит, подсвечивается Портрет в правом мастер-слоте
    registerSettings("discordHighlightGM", "world", false, Boolean, true)
    // Discord: Хост Discord Bridge
    registerSettings("discordHostUserId", "world", false, String, "") 
    // Discord: Ваш ID/ник
    game.settings.register(C.ID, "discordUserId", {
        name: game.i18n.localize(`${C.ID}.settings.discordUserId`),
        hint: game.i18n.localize(`${C.ID}.settings.discordUserIdHint`),
        scope: "client",
        config: true,
        type: String,
        default: "",
        onChange: updateDiscordUserIdSetting
    });


    // СКРЫТЫЕ 

    // Discord: список ID пользователей
    registerSettings("discordUsersIds", "world", false, Object, {})

    // (Устаревшее) Отображается имя крайнего персонажа
    registerSettings("sideMainName", "client", false, Boolean, true, null, true)
    // (Устаревшее) Использовать токены в качестве изображения для Портретов по умолчанию
    registerSettings("useTokenForPortraits", "world", false, Boolean, false)

    // Невъебически огромный текст для глобал-гайда
    registerSettings("globalGuideLocalization", "world", false, Object, {ru: localizeConsts.globalGuide.ru, en: localizeConsts.globalGuide.en})
    // Уже не такой большой текст для гайда по окну настройки автосоздания портретов
    registerSettings("autoPortraitLocalization", "world", false, Object, {ru: localizeConsts.autoPortraitMakerGuide.ru, en: localizeConsts.autoPortraitMakerGuide.en})
    // Уже прям поменьше текст для гайда по созданию дискорд-бота
    registerSettings("discordBotLocalization", "world", false, Object, {ru: localizeConsts.discordGuide.ru, en: localizeConsts.discordGuide.en})
    // Права игроков
    registerSettings("playersPermissions", "world", false, Object, defaultPermissions, null, true)
    // Наборы
    registerSettings("assetPacks", "world", false, Object, {locationPacks: [], portraitPacks: []}, null, true)
    // Настройки для автосоздания Портретов
    registerSettings("autoPortraitSettings", "world", false, Object, defaultPortraitSettings)
    // Использовать группу настроек для автосоздания Портретов для остальных групп
    registerSettings("useChosenGroupSettings", "world", false, String, "")
    // Скрытые группы для автосоздания портретов
    registerSettings("hiddenTypes", "world", false, Array, [])
    // Буффер детального режима
    registerSettings("detailModeBuffer", "client", false, Object, {mode: "moveSliders", hideApps: false, cellRuler: false})
    // Режим просмотра
    registerSettings("viewMode", "client", false, Boolean, false)
    // Одноразовые проверки
    registerSettings("oneTimeChecks", "world", false, Object, {startDialog: true, updateToV2: true})

    // УСТАРЕЛО
    globalThis.ui.VisualNovel = {
        updateLocalizeFromString: async (lang = game.i18n.lang, text) => {
            foundry.utils.logCompatibilityWarning(game.i18n.localize(`${C.ID}.errors.uiVisualNovelDeprecated`), {since: 12, until: 13})
            await updateLocalizeFromString(lang, text)
        },
        updateLocalizeFromJournal: async (lang = game.i18n.lang, journalId, pageId) => {
            foundry.utils.logCompatibilityWarning(game.i18n.localize(`${C.ID}.errors.uiVisualNovelDeprecated`), {since: 12, until: 13})
            await updateLocalizeFromJournal(lang, journalId, pageId)
        },
        createJournalFromLocalize: async (lang = game.i18n.lang) => {
            foundry.utils.logCompatibilityWarning(game.i18n.localize(`${C.ID}.errors.uiVisualNovelDeprecated`), {since: 12, until: 13})
            await createJournalFromLocalize(lang)
        }
    }
    globalThis.VisualNovelDialogues = {
        // Утилити-функции
        utils: {
            updateLocalizeFromString,
            updateLocalizeFromJournal,
            createJournalFromLocalize
        },
        // Действия окна VisualNovel (кнопки в VN)
        /*
        vnActions: {
            toogleVN: VisualNovelDialogues.toggleVN,
            hideVN: () => VisualNovelDialogues._hideVN(),
            openActorSheet: () => VisualNovelDialogues._openActorSheet(),
            toogleUI: () => VisualNovelDialogues._toggleUI(),
            hideBack: () => VisualNovelDialogues._hideBack(),
            discordMenu: () => VisualNovelDialogues._discordMenu(),
            changeBackground: () => VisualNovelDialogues._changeBackground(),
            openSettingsMenu: () => VisualNovelDialogues._openSettingsMenu(),
            toggleEditMode: () => VisualNovelDialogues._toggleEditMode(),
            toggleLinkChanges: () => VisualNovelDialogues._toggleLinkChanges(),
            resetChanges: () => VisualNovelDialogues._resetChanges(),
            epicRolls: () => VisualNovelDialogues._epicRolls(),
            effectsWindow: () => VisualNovelDialogues._effectsWindow(),
            mainGuideHint: () => VisualNovelDialogues._mainGuideHint(), 
            openActorPicker: () => VisualNovelDialogues._openActorPicker(),
            editWindowHint: () => VisualNovelDialogues._editWindowHint(),
            locationClick: (parrentLocation = false, type = "current") => VisualNovelDialogues._locationClick({type: (parrentLocation ? "contextMenu" : "click")}, {dataset: {type: type}}),
            deletePortraitFromOrder: (portraitId, side = "left") => VisualNovelDialogues._deletePortraitFromOrder(null, {dataset: {id: portraitId, side: side}}),
            createRequest: (requestLevel = 1) => VisualNovelDialogues._createRequest(null, {dataset: {level: requestLevel}}),
            requestClick: (discard = false, requestId, charId) => VisualNovelDialogues._requestClick({type: (discard ? "contextMenu" : "click")}, {dataset: {id: requestId, charid: charId}}),
        }
        */
        // + Добавить действие для перемещения портрета
    }
});


const defaultVnData = () => {
    const defaultLoc = new VNLocation({locationName: "???",})
    return {
        showVN: false,
        activeSpeakers: getEmptyActiveSpeakers(),
        activeSlots: {left: ["leftfirst"], right: ["rightfirst"]},
        editActiveSpeaker: "leftfirst",
        order: {"left": [], "right": [], "center": []},
        portraits: [],
        // Собственные Категории/Папки Actor Picker (не связаны с папками Foundry Actor Directory)
        actorFolders: [],
        location: defaultLoc,
        locationList: [defaultLoc],
        locationFilters: [],
        showForIds: null,
        editMode: false,
        linkChanges: true,
        hideBack: false,
        hideUI: false,
        // Визуальные эффекты (apps/effectsPanel.js): затемнение фона и "режим ряда".
        // Важно держать их здесь, а не только выставлять через quickSettingsUpdate -
        // иначе хук "ready" ниже (mergeObject(defaultVnData(), settings, {insertKeys:false}))
        // будет молча стирать эти поля при каждой перезагрузке мира, т.к. insertKeys:false
        // выкидывает из settings любые ключи, которых нет в дефолтном объекте.
        darkenBack: false,
        rowMode: false,
        // Медленная прокрутка фона: простой переключатель вкл/выкл (одна кнопка "Прокрутка фона" в
        // панели "Эффекты", apps/effectsPanel.js). Направление и зацикленность/однократность анимации -
        // это отдельные ГМ-настройки bgScrollDirection/bgScrollLoop (registerSettings выше в этом файле,
        // меню "Настройки эффектов"), а не часть vnData - см. main.js (_onRender применяет классы на
        // #vn-background-image; сама CSS-анимация - в _injectEffectStyles)
        bgScroll: false,
        // Размытие фона: простой переключатель вкл/выкл (кнопка "Блюр фона" в панели "Эффекты",
        // apps/effectsPanel.js) - та же схема, что у bgScroll выше. Сила размытия (0-1, чем больше - тем
        // сильнее блюр) - отдельная ГМ-настройка bgBlurStrength (registerSettings выше в этом файле,
        // меню "Настройки эффектов"), а не часть vnData - см. main.js (_onRender ставит инлайн-стиль
        // filter:blur(...) на #vn-background-image).
        bgBlur: false,
        // Блокировка выхода игроков из новеллы, включается ГМом из панели "Эффекты".
        // Блокирует ТОЛЬКО личный выход игрока (кнопка "Скрыть VN" / хоткей K без прав
        // locationChanges/displayControl) - см. main.js _hideVN и toggleVN. Полное закрытие
        // окна ГМом (у кого есть эти права) не блокируется.
        lockExit: false,
        clockTime: "12:30",
        requests: [],
        // Живое содержимое горизонтальных шкал (bar), заведённых в текущем UI-пресете
        // (раскладка/позиция - PresetUIClass.bars, ключ "bars"; здесь - именно "barsData",
        // чтобы не схлопнуться с preset.bars при спреде {...uiData, ...data} в _prepareContext).
        // Элемент появляется здесь только когда ГМ впервые меняет его значение в панели
        // "Эффекты" - см. barsAlwaysShow выше и apps/effectsPanel.js. {id, name, color, value,
        // mode: "counter"|"timer", timerDurationSeconds, timerEndTimestamp}
        barsData: [],
        weatherList: [
            {
                name: game.i18n.localize(`${C.ID}.createWeather.unknownWeather`),
                icon: "fas fa-eye-slash",
                id: foundry.utils.randomID()
            },
            {
                name: game.i18n.localize(`${C.ID}.createWeather.sunny`),
                icon: "fas fa-sun",
                id: foundry.utils.randomID()
            },
            {
                name: game.i18n.localize(`${C.ID}.createWeather.cloudy`),
                icon: "fas fa-cloud-sun",
                id: foundry.utils.randomID()
            },
            {
                name: game.i18n.localize(`${C.ID}.createWeather.foggy`),
                icon: "fas fa-smog",
                id: foundry.utils.randomID()
            },
            {
                name: game.i18n.localize(`${C.ID}.createWeather.windy`),
                icon: "fas fa-wind",
                id: foundry.utils.randomID()
            }
        ]
    }
}

Hooks.on('setup', () => {

    game.settings.register(C.ID, 'style', {
        scope: 'world',
        type: Object,
        config: false,
        default: {
            sliderSets: [],
            choosenSliderSet: "",
        }
    })

    game.settings.register(C.ID, 'presetsUI', {
        scope: 'world',
        type: Object,
        config: false,
        default: {
            presets: [new PresetUIClass()],
            choosenPreset: "",
        }
    })

    game.settings.register(C.ID, 'vnData', {
        scope: 'world',
        type: Object,
        default: defaultVnData()
    });

    game.settings.register(C.ID, 'showVN', {
        scope: 'world',
        type: Boolean,
        default: false,
        onChange: value => {
            if (!game.user.getFlag(C.ID, "hideVN")) {
                VisualNovelDialogues.refresh("changeShow");
            } else {
                ui.notifications.warn(game.i18n.localize(`${C.ID}.settings.hideInfo`));
            }
        }
    })


    CONFIG.Canvas.layers.visualNovelDialogues = { layerClass: VNDLayer, group: "interface" };
});

class VNDLayer extends InteractionLayer {
    static LAYER_NAME = "visualNovelDialogues";
    constructor() {
        super();
    }

    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, {
            name: VNDLayer.LAYER_NAME,
            zIndex: 245
        });
    }
}



Hooks.on("ready", async () => {
    if (game.user.isGM) {
        console.log("——— VISUAL NOVEL DIALOGUES | Ready hook | Validating and updating settings | Start ———")
        // Обновляем playersPermissions
        const permSettings = game.settings.get(C.ID, "playersPermissions")
        const mergedPermissions = foundry.utils.mergeObject(defaultPermissions, permSettings, {insertKeys: false})
        await game.settings.set(C.ID, "playersPermissions", mergedPermissions)
        console.log("Players permissions updated ✔")
        // Обновляем vnData
        const settings = getSettings()
        const mergedSettings = foundry.utils.mergeObject(defaultVnData(), settings, {insertKeys: false})
        // Миграция: bgScroll раньше был строкой "off"/"left"/"right" (переключатель прокрутки фона в
        // панели "Эффекты" с выбором направления прямо там), теперь - простой boolean (направление и
        // зацикленность вынесены в отдельные настройки bgScrollDirection/bgScrollLoop, см. выше в этом
        // файле) - mergeObject сам по себе не приводит типы, так что без этого шага старая строка "off"
        // читалась бы как true (!!"off" === true) везде, где бывший вкл/выкл теперь ожидает boolean.
        if (typeof mergedSettings.bgScroll === "string") {
            mergedSettings.bgScroll = (mergedSettings.bgScroll === "left" || mergedSettings.bgScroll === "right")
        }
        await game.settings.set(C.ID, "vnData", mergedSettings)
        console.log("VnData updated ✔")
        // Проверяем что есть хотя бы 1 пресет
        const presets = game.settings.get(C.ID, "presetsUI")
        console.log("Presets check...")
        if (!presets.presets.length) {
            await PresetUIClass.addPreset()
            console.log("There weren't any presets. Added a new preset ✔")
        } else {
            console.log("Presets checked ✔")
        }
        // Бекап
        if (game.settings.get(C.ID, "makesBackup")) {
            await createBackup();
            console.log("Backup created ✔")
        }
        // Ебля с настройкой "Отображать имя последнего выбранного"
        if (!game.settings.get(C.ID, "sideMainName")) {
            await game.settings.set(C.ID, "masterSlotIsLastActive", true)
            await game.settings.set(C.ID, "sideMainName", true)
            console.log("Side main name settings data migrated ✔")
        }
        // Ебля с настройкой "Использовать токены в качестве Портретов"
        if (game.settings.get(C.ID, "useTokenForPortraits")) {
            const autoPortraitSettings = game.settings.get(C.ID, "autoPortraitSettings")
            autoPortraitSettings.character.generalRules.useImage = "tokenImage"
            autoPortraitSettings.npc.generalRules.useImage = "tokenImage"
            await game.settings.set(C.ID, "useTokenForPortraits", false)
            console.log("\"Use token for portraits\" settings data migrated ✔")
        }

        // Чек штуковин
        const oneTimeChecks = game.settings.get(C.ID, "oneTimeChecks")
        if (oneTimeChecks.updateToV2) {
            ForcedSettingsMigration.updateSettingsToV2()
            console.log("Visual Novel window data was successfully migrated to appV2 ✔")
        }

        // Отключаем синхронизацию с Advanced Requests если версия старая
        if (!game.modules.get("advanced-requests")?.active && game.settings.get(C.ID, 'advancedRequestsSync')) {
            await game.settings.set(C.ID, 'advancedRequestsSync', false)
            console.log("!!! Advanced requests was disabled because it's version is deprecated !!!")
        }

        // Выключаем режим просмотра (если, например, вдруг закрыли мир в детальном режиме)
        if (game.settings.get(C.ID, "viewMode")) {
            await game.settings.set(C.ID, "viewMode", false)
            console.log("View mode was disabled ✔")
        }
        console.log("——— VISUAL NOVEL DIALOGUES | Ready hook | Validating and updating settings | End ✔ ———")
    }

    // Вызываем VisualNovelDialogues
    new VisualNovelDialogues();
    VisualNovelDialogues._render(null, true, true);

    // Discord интеграция
    const discordHostId = game.settings.get(C.ID, "discordHostUserId")
    if (discordHostId ? game.user.id == discordHostId : game.user.isGM) new DiscordIntegration();
})

async function updateLocalizeFromString(lang = game.i18n.lang, text) {
    const globalGuideLocalization = game.settings.get(C.ID, "globalGuideLocalization")
    if (globalGuideLocalization && text) {
        globalGuideLocalization[lang] = text
        await game.settings.set(C.ID, "globalGuideLocalization", globalGuideLocalization)
        ui.notifications.info(game.i18n.localize(`${C.ID}.settings.localizeUpdated`))
    }
}

async function updateLocalizeFromJournal(lang = game.i18n.lang, journalId, pageId) {
    const text = game.journal.get(journalId)?.pages?.get(pageId)?.text?.content
    if (!text) {
        ui.notifications.error(game.i18n.localize(`${C.ID}.errors.noTextToImport`))
        return
    }
    await updateLocalizeFromString(lang, text)
}

async function createJournalFromLocalize(lang = game.i18n.lang) {
    const globalGuideLocalization = game.settings.get(C.ID, "globalGuideLocalization")
    if (globalGuideLocalization && globalGuideLocalization[lang]) {
        let pages = Object.entries(globalGuideLocalization).map(([key, value]) => {
            return {name: key, text: {content: value}}
        })
        let journalEntry = await JournalEntry.create({
            name: 'Novel Dialogue Re:Mai localizations journal',
            pages: pages,
        });
    }
}

// Панель инструментов в левой части экрана
Hooks.on("getSceneControlButtons", (controls) => { pushControlButtons(controls) });
Hooks.on("renderSceneControls", (controls) => {  });

function pushControlButtons(controls){
    const showToolbar = game.settings.get(C.ID, "showToolbar")
    if (!showToolbar || !allowTo("displayControl")) return

    // Foundry v13: controls - объект по группам, tools внутри группы - тоже объект (не массив)
    if (controls.tokens) {
        controls.tokens.tools.openWithControlledTokens = {
            name: "openWithControlledTokens",
            title: game.i18n.localize(`${C.ID}.toolbar.openWithControlledTokens`),
            icon: "fas fa-users-viewfinder",
            visible: true,
            button: true,
            order: Object.keys(controls.tokens.tools).length,
            onChange: async () => {
                const controlledActorIds = {
                    players: canvas.tokens.controlled.filter(t => t.actor?.type == "character").map(t => t.actor?.id),
                    npc: canvas.tokens.controlled.filter(t => t.actor?.type != "character").map(t => t.actor?.id),
                }
                await parseActors(controlledActorIds)
            }
        }
    }

    controls.visualNovelToolbar = {
        name: "visualNovelToolbar",
        title: "Visual Novel toolbar",
        icon: "fas fa-users-between-lines",
        layer: "visualNovelDialogues",
        visible: true,
        activeTool: "openVN",
        tools: {
            openVN: {
                name: "openVN",
                title: game.i18n.localize(`${C.ID}.toolbar.openVN`),
                icon: "fas fa-window-maximize",
                visible: true,
                button: true,
                order: 0,
                onChange: () => { VisualNovelDialogues.toggleVN() }
            },
            hiddenOpenVN: {
                name: "hiddenOpenVN",
                title: game.i18n.localize(`${C.ID}.toolbar.hiddenOpenVN`),
                icon: "fas fa-eye-low-vision",
                visible: true,
                button: true,
                order: 1,
                onChange: () => {
                    ui.notifications.info(game.i18n.localize(`${C.ID}.settings.showVNOnlyForYou`))
                    VisualNovelDialogues.toggleVN([game.user.id])
                }
            },
            openWithSceneTokens: {
                name: "openWithSceneTokens",
                title: game.i18n.localize(`${C.ID}.toolbar.openWithSceneTokens`),
                icon: "fas fa-users-rectangle",
                visible: true,
                button: true,
                order: 2,
                onChange: async () => {
                    const actorOnSceneIds = {
                        players: canvas.tokens.placeables.filter(t => t.actor?.type == "character").map(t => t.actor?.id),
                        npc: canvas.tokens.placeables.filter(t => t.actor?.type != "character").map(t => t.actor?.id),
                    }
                    await parseActors(actorOnSceneIds)
                }
            },
            openWithChoosenPlayers: {
                // Это переделать надо. Мы открываем ДЛЯ ИГРОКОВ, а не "выбираем портреты для переноса в VN"
                name: "openWithChoosenPlayers",
                title: game.i18n.localize(`${C.ID}.toolbar.openWithChoosenPlayers`),
                icon: "far fa-users-gear",
                visible: true,
                button: true,
                order: 3,
                onChange: () => {
                    const players = game.users.filter(p=>p.active)
                    let content = `<form class="flexcol">`
                    for (let i = 0; i < players.length; i++) {
                        const player = players[i]
                        content += `
                            <div class="form-group vn-choose-players">
                                <img src="${player.avatar}">
                                <label for="vncp-${player.id}">${player.name}</label>
                                <input id="vncp-${player.id}" type="checkbox" name="${player.id}" checked>
                            </div>
                        `
                    }
                    content += `</form>`
                    new Dialog({
                        title: game.i18n.localize(`${C.ID}.toolbar.openWithChoosenPlayers`),
                        content: content,
                        buttons: {
                            sumbit: {
                                icon: "<i class='fas fa-users'></i>",
                                label: game.i18n.localize(`${C.ID}.toolbar.openWithChoosenPlayers`),
                                callback: (html) => {
                                    const checkedEls = html.find("input:checked")
                                    const ids = Array.from(checkedEls).map(el => el.name)
                                    VisualNovelDialogues.toggleVN(ids)
                                }
                            }
                        }
                    }).render(true)
                }
            },
            forcedOpen: {
                name: "forcedOpen",
                title: game.i18n.localize(`${C.ID}.toolbar.forcedOpen`),
                icon: "fas fa-people-pulling",
                visible: true,
                button: true,
                order: 4,
                onChange: () => {
                    VisualNovelDialogues.toggleVN(game.users.filter(p=>p.active).map(p=>p.id))
                 }
            },
        },
    };
}

async function parseActors(actorIds) {
    const settings = getSettings()
    settings.activeSpeakers = getEmptyActiveSpeakers()
    const portraits = settings.portraits
    const getPortraitData = (id) => portraits.find(portrait => portrait.id == id)

    const portraitIdList = portraits.map(portrait => portrait.id)
    const actorWithPortraitIds = {
        players: actorIds.players.filter(actorId => portraitIdList.includes(actorId)),
        npc: actorIds.npc.filter(actorId => portraitIdList.includes(actorId)),
    }

    const slotCount = game.settings.get(C.ID, "slotCount");
    // Игроки
    ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"].slice(0, Math.min(slotCount, actorWithPortraitIds.players.length)).forEach((num, i) => {
        settings.activeSpeakers[`left${num}`] = getPortraitData(actorWithPortraitIds.players[i])
    })
    if (actorWithPortraitIds.players.length > slotCount) {
        actorWithPortraitIds.players = actorWithPortraitIds.players.slice(slotCount)
        if (actorWithPortraitIds.players.length > 5) actorWithPortraitIds.players = actorWithPortraitIds.players.slice(0, 5)
        settings.order.left = actorWithPortraitIds.players.map(actorId => getPortraitData(actorId))
    }
    // НПС
    ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"].slice(0, Math.min(slotCount, actorWithPortraitIds.npc.length)).forEach((num, i) => {
        settings.activeSpeakers[`right${num}`] = getPortraitData(actorWithPortraitIds.npc[i])
    })
    if (actorWithPortraitIds.npc.length > slotCount) {
        actorWithPortraitIds.npc = actorWithPortraitIds.npc.slice(slotCount)
        if (actorWithPortraitIds.npc.length > 5) actorWithPortraitIds.npc = actorWithPortraitIds.npc.slice(0, 5)
        settings.order.right = actorWithPortraitIds.npc.map(actorId => getPortraitData(actorId))
    }
    await game.settings.set(C.ID, "vnData", settings)

    VisualNovelDialogues.toggleVN()
}

// Сокеты
Hooks.on('setup', () => {
    game.socket.on(`module.${C.ID}`, async ({ type, data, options, key }) => {
        switch (type) {
            case "VNDataSetSettings":
                if (game.user.isGM) await game.settings.set(C.ID, 'vnData', data, options);
                break;
            case "renderVN":
                if (!VisualNovelDialogues.instance) return
                VisualNovelDialogues.instance.renderParts = data
                VisualNovelDialogues.instance.render(true)
                break;
            case "playSound":
                if (game.settings.get(C.ID, "requestsSound")) {
                    AudioHelper.play({
                        src: `modules/${C.ID}/templates/assets/request${data}.wav`,
                        volume: game.settings.get("core", "globalInterfaceVolume"),
                    });
                }
                break;
            case "discordUsersIds":
                if (game.user.isGM) await game.settings.set(C.ID, 'discordUsersIds', data);
                break;
            case "setSetting":
                if (game.user.isGM) await game.settings.set(C.ID, key, data, options);
                break;
            case "discordElementActivity":
                discordElementActivity(data.id, data.isSpeaking)
                break;
        }
    });
});

// Пользователь изменяет настройку "Discord: Ваш ID/ник" -> меняем его в списке "Discord: список ID пользователей"
async function updateDiscordUserIdSetting(value) {
    const userId = game.user.id
    const newSetting = foundry.utils.mergeObject(game.settings.get(C.ID, 'discordUsersIds'), {[userId]: value})
    await game.user.setFlag(C.ID, 'discordUserId', value)
    if (game.user.isGM) {
        await game.settings.set(C.ID, 'discordUsersIds', newSetting);
    } else {
        game.socket.emit(`module.${C.ID}`, {
            type: 'discordUsersIds',
            data: newSetting,
        });
    }
    DiscordMenu._render(["troubleshooting"]);
}

// Дискорд штуки
Hooks.once('shutdown', async () => {
    if (DiscordIntegration.instance) {
        await DiscordIntegration.instance.shutdown();
    }
});