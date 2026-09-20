import { Constants as C, getSettings, quickSettingsUpdate, peekSetting } from '../scripts/const.js';
import { triggerVNEffect, triggerNarrativeText } from '../scripts/main.js';

// Окно "Эффекты" — быстрый доступ ГМ к визуальным эффектам поверх окна визуальной новеллы:
// - Тряска спрайта (одного выбранного или всех активных сразу)
// - Вспышка света / тьмы (по всему экрану, либо только на выбранном спрайте)
// - Затемнение фона (переключатель, полностью тёмный фон вместо картинки локации)
// - Режим ряда (переключатель: обычный интерфейс сменяется затемнением,
//   все активные персонажи выстраиваются в один горизонтальный ряд)
// - Медленная прокрутка фона (переключатель вкл/выкл; направление и зацикленность анимации
//   настраиваются отдельно ГМом в "Настройки эффектов" - scripts/settings.js, bgScrollDirection/bgScrollLoop)
// - Блокировка личного выхода игроков из новеллы (переключатель)
//
// Сама логика применения эффектов (DOM/CSS/socket) живёт в scripts/main.js (triggerVNEffect),
// это окно - только UI поверх неё, чтобы не дублировать код между ГМ-клиентом и обработчиком сокета.
export class EffectsPanel extends FormApplication {
    static instance = null

    static get defaultOptions() {
        const defaults = super.defaultOptions;
        const overrides = {
            classes: ['vn-fx-panel-body'],
            width: 320,
            height: "auto",
            resizable: false,
            id: "EffectsPanel",
            template: `modules/${C.ID}/templates/effectsPanel.hbs`,
            // TODO: локализация. Файлы language/en.json и language/ru.json сейчас не трогали
            // (правились "вслепую", без десктопа под рукой, а ломать структуру локализации не хотелось) -
            // тексты панели пока захардкожены на русском прямо в effectsPanel.hbs.
            title: "Эффекты",
            closeOnSubmit: false,
            submitOnChange: false
        };
        return foundry.utils.mergeObject(defaults, overrides);
    }

    // Список активных (видимых) портретов для выбора цели эффекта
    _getActiveTargets(settingData = getSettings()) {
        const positions = [...(settingData.activeSlots?.left || []), ...(settingData.activeSlots?.right || [])]
        return positions
            .map(pos => ({ pos, speaker: settingData.activeSpeakers?.[pos] }))
            .filter(t => t.speaker)
            .map(t => ({ pos: t.pos, name: t.speaker.name || t.pos }))
    }

    getData(options) {
        const settingData = getSettings()
        return {
            targets: this._getActiveTargets(settingData),
            darkenBack: !!settingData.darkenBack,
            rowMode: !!settingData.rowMode,
            bgScroll: !!settingData.bgScroll,
            bgBlur: !!settingData.bgBlur,
            lockExit: !!settingData.lockExit,
        }
    }

    _getSelectedTarget(html) {
        return html[0].querySelector('.vn-fx-target-select')?.value || "all"
    }

    activateListeners(html) {
        super.activateListeners(html);

        // --- Тряска ---
        html.find('.vn-fx-shake').on('click', (event) => {
            event.preventDefault()
            triggerVNEffect('shake', this._getSelectedTarget(html))
        })

        // --- Вспышка света / тьмы ---
        html.find('.vn-fx-flash-light').on('click', (event) => {
            event.preventDefault()
            triggerVNEffect('flashLight', this._getSelectedTarget(html))
        })
        html.find('.vn-fx-flash-dark').on('click', (event) => {
            event.preventDefault()
            triggerVNEffect('flashDark', this._getSelectedTarget(html))
        })

        // --- Затемнение фона (переключатель, синхронизируется всем игрокам через настройки) ---
        html.find('.vn-fx-toggle-darken').on('click', async (event) => {
            event.preventDefault()
            await quickSettingsUpdate({ darkenBack: !peekSetting("darkenBack") }, { renderData: { renderParts: ["foreground"] } })
            event.currentTarget.classList.toggle('vn-fx-active', !!getSettings().darkenBack)
        })

        // --- Режим ряда (переключатель) ---
        html.find('.vn-fx-toggle-row').on('click', async (event) => {
            event.preventDefault()
            const turningOn = !peekSetting("rowMode")
            // При включении режима ряда прячем обычный интерфейс (как обычная кнопка "Скрыть интерфейс")
            // и заодно включаем затемнение фона - при выключении оба возвращаются обратно.
            // (Если нужно "затемнение само по себе" без режима ряда - для этого отдельная кнопка выше.)
            await quickSettingsUpdate(
                { rowMode: turningOn, hideUI: turningOn, darkenBack: turningOn },
                { renderData: { renderParts: ["headerSlider", "leftSlider", "rightSlider", "foreground"] } }
            )
            event.currentTarget.classList.toggle('vn-fx-active', turningOn)
            html[0].querySelector('.vn-fx-toggle-darken')?.classList.toggle('vn-fx-active', turningOn)
        })

        // --- Медленная прокрутка фона (один переключатель вкл/выкл, общий для всех игроков.
        // Направление и зацикленность берутся из настроек ГМа - bgScrollDirection/bgScrollLoop,
        // "Настройки эффектов" в Visual Settings Menu, применяются в main.js _onRender) ---
        html.find('.vn-fx-bgscroll-toggle').on('click', async (event) => {
            event.preventDefault()
            const next = !peekSetting("bgScroll")
            await quickSettingsUpdate({ bgScroll: next }, { renderData: { renderParts: ["background"] } })
            event.currentTarget.classList.toggle('vn-fx-active', next)
        })

        // --- Размытие фона (переключатель вкл/выкл, общий для всех игроков. Сила размытия берётся из
        // настройки ГМа - bgBlurStrength, "Настройки эффектов" в Visual Settings Menu, применяется в
        // main.js _onRender). БЕЗ renderParts:["background"] - иначе Foundry пересобирает Handlebars-часть
        // "background" и уничтожает/пересоздаёт #vn-background-image на каждый клик, а CSS transition
        // (плавное появление/исчезновение блюра) не может анимироваться на только что созданном узле -
        // получался мгновенный скачок вместо плавного перехода. main.js, Hooks.on("updateSetting", ...)
        // сам применяет blur на уже существующем узле через _applyBackgroundVisualEffects(). ---
        html.find('.vn-fx-blur-toggle').on('click', async (event) => {
            event.preventDefault()
            const next = !peekSetting("bgBlur")
            await quickSettingsUpdate({ bgBlur: next })
            event.currentTarget.classList.toggle('vn-fx-active', next)
        })

        // --- Нарратив (одноразовая полноэкранная текстовая вставка - ГМ пишет текст в диалоге,
        // каждый перевод строки внутри текста = разрыв на "страницы"; см. triggerNarrativeText, main.js) ---
        html.find('.vn-fx-narrative').on('click', (event) => {
            event.preventDefault()
            new Dialog({
                title: "Текст",
                content: `<textarea class="vn-narrative-input" rows="6" style="width:100%;resize:vertical;" placeholder="Новая строка - новая страница"></textarea>`,
                buttons: {
                    confirm: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "ПОДТВЕРДИТЬ",
                        callback: (html) => triggerNarrativeText(html[0].querySelector('.vn-narrative-input')?.value || "")
                    }
                },
                default: "confirm"
            }).render(true)
        })

        // --- Блокировка личного выхода игроков из новеллы (переключатель) ---
        html.find('.vn-fx-toggle-lockexit').on('click', async (event) => {
            event.preventDefault()
            await quickSettingsUpdate({ lockExit: !peekSetting("lockExit") }, { renderData: { renderParts: ["foreground"] } })
            event.currentTarget.classList.toggle('vn-fx-active', !!getSettings().lockExit)
        })
    }

    async _updateObject(event, formData) {
    }
}
