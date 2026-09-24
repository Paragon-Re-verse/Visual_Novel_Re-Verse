import { Constants as C, getSettings, quickSettingsUpdate, peekSetting } from '../scripts/const.js';
import { triggerVNEffect, triggerNarrativeText } from '../scripts/main.js';
import { PresetUIClass } from '../scripts/presetUIClass.js';

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
            // Класс окна-приложения (Application root) - НЕ переиспользовать имя 'vn-fx-panel-body':
            // это имя уже занято внутренним flex-рядом в templates/effectsPanel.hbs, и CSS-правило
            // .vn-fx-panel-body { align-items: flex-start } писалось именно для него. Совпадение
            // имён приводило к тому, что то же правило утекало и на корень окна, сжимая
            // .window-header (родитель заголовка и кнопки Close) вместо растягивания на всю ширину.
            classes: ['vn-fx-panel-app'],
            width: 640,
            height: "auto",
            resizable: false,
            id: "EffectsPanel",
            template: `modules/${C.ID}/templates/effectsPanel.hbs`,
            title: game.i18n.localize(`${C.ID}.effectsPanel.windowTitle`),
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

    // Список bar активного UI-пресета (раскладка) + их живое содержимое из vnData.barsData
    // (если содержимого ещё нет - bar ни разу не редактировался, показываем значения по умолчанию;
    // сам факт отсутствия записи в barsData - это и есть "скрыт до первого изменения", см. main.js)
    _getBarsData(settingData = getSettings()) {
        const preset = PresetUIClass.getActivePreset()
        const barsContent = settingData.barsData || []
        return preset.bars.map(layout => {
            const content = barsContent.find(b => b.id === layout.id) || {}
            const totalSeconds = content.timerDurationSeconds || 0
            return {
                id: layout.id,
                name: content.name || "",
                color: content.color || "#a33636",
                value: content.value ?? 0,
                mode: content.mode || "counter",
                isTimer: content.mode === "timer",
                timerH: Math.floor(totalSeconds / 3600),
                timerM: Math.floor((totalSeconds % 3600) / 60),
                timerS: totalSeconds % 60,
            }
        })
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
            bars: this._getBarsData(settingData),
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
                title: game.i18n.localize(`${C.ID}.effectsPanel.narrativeDialogTitle`),
                content: `<textarea class="vn-narrative-input" rows="6" style="width:100%;resize:vertical;" placeholder="${game.i18n.localize(`${C.ID}.effectsPanel.narrativePlaceholder`)}"></textarea>`,
                buttons: {
                    confirm: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize(`${C.ID}.effectsPanel.confirm`),
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

        // --- Горизонтальные шкалы (bar) - отдельная колонка. Раскладка (позиция/масштаб) заведена
        // в UI customization/detailed mode (PresetUIClass.bars) - здесь редактируется только живое
        // содержимое (vnData.barsData), по одной строке на bar. Первое изменение любого поля создаёт
        // запись в barsData (bar перестаёт быть скрытым, если barsAlwaysShow выключен) - см. main.js
        // _preparePartContext "bars" case. ---

        // Добавить новый bar прямо отсюда, не выходя в UI customization (раньше это был единственный
        // путь - долгий и неочевидный для панели, которой пользуются "по ходу игры"). Раскладка
        // получает дефолтную позицию/масштаб (см. PresetUIClass.newBar) - подправить её можно в
        // detailed mode, как и у любого другого bar.
        html[0].querySelector('.vn-fx-bar-add-button')?.addEventListener('click', async () => {
            const preset = PresetUIClass.getActivePreset()
            await PresetUIClass.addBar(preset.id)
            this.render()
        })

        html[0].querySelectorAll('.vn-fx-bar-row').forEach(rowEl => {
            const barId = rowEl.dataset.barId

            // patch - изменяемые поля bar. Если записи ещё нет в barsData - это структурное появление
            // нового узла .vn-bar в VN-окне, нужен renderParts:["bars"] один раз. Если запись уже
            // есть - только значение/цвет меняются на уже существующем узле (see main.js
            // _applyBarVisualState, вызывается из Hooks.on("updateSetting", ...) без renderParts,
            // чтобы CSS transition плавно анимировал изменение, а не дёргался пересозданным узлом).
            const upsertBar = async (patch) => {
                const settingData = getSettings()
                const barsData = foundry.utils.deepClone(settingData.barsData || [])
                let bar = barsData.find(b => b.id === barId)
                const isNew = !bar
                if (!bar) {
                    bar = { id: barId, name: "", color: "#a33636", value: 0, mode: "counter", timerDurationSeconds: 0, timerEndTimestamp: null }
                    barsData.push(bar)
                }
                Object.assign(bar, patch)
                await quickSettingsUpdate({ barsData }, isNew ? { renderData: { renderParts: ["bars"] } } : {})
            }

            rowEl.querySelector('[data-key="name"]')?.addEventListener('change', (event) => {
                upsertBar({ name: event.currentTarget.value })
            })
            rowEl.querySelector('[data-key="color"]')?.addEventListener('change', (event) => {
                upsertBar({ color: event.currentTarget.value })
            })
            // "input" стреляет на каждый пиксель протаскивания ползунка - пишем в settings только
            // на "change" (отпускание), иначе на один драг ушла бы пачка записей game.settings.set
            // подряд. Пока тащим - только обновляем текстовый индикатор локально, без записи.
            const valueInputEl = rowEl.querySelector('[data-key="value"]')
            const valueReadoutEl = rowEl.querySelector('.vn-fx-bar-value-readout')
            valueInputEl?.addEventListener('input', (event) => {
                if (valueReadoutEl) valueReadoutEl.textContent = `${event.currentTarget.value}%`
            })
            valueInputEl?.addEventListener('change', (event) => {
                upsertBar({ mode: "counter", value: Math.max(0, Math.min(100, Number(event.currentTarget.value) || 0)) })
            })
            rowEl.querySelector('[data-key="mode"]')?.addEventListener('change', async (event) => {
                await upsertBar({ mode: event.currentTarget.value })
                // Переключение counter/timer меняет, какие поля показаны в самой панели - надо
                // перерисовать панель (не VN-окно, там достаточно нового значения displayValue)
                this.render()
            })
            rowEl.querySelector('.vn-fx-bar-timer-start')?.addEventListener('click', () => {
                const h = Number(rowEl.querySelector('[data-key="timerH"]')?.value) || 0
                const m = Number(rowEl.querySelector('[data-key="timerM"]')?.value) || 0
                const s = Number(rowEl.querySelector('[data-key="timerS"]')?.value) || 0
                const totalSeconds = Math.max(1, h * 3600 + m * 60 + s)
                upsertBar({ mode: "timer", timerDurationSeconds: totalSeconds, timerEndTimestamp: Date.now() + totalSeconds * 1000, value: 100 })
            })
        })
    }

    async _updateObject(event, formData) {
    }
}
