# Сессия 2026-06-09 — дизайн-ревью, чек-лист релиза, Android-сборка, Git-синхронизация и подводные камни телефона

> Контекст: разбор скриншотов в `documentation/` (15 фото `photo_*.jpg` — **референс-приложение** на Android, которое мы пересоздаём; 10 PNG в `documentation/Current/` — **текущая web-версия**).
> Правила: ответы пользователю — транслитом; после задач — такой doc; решения принимаю сам, без AskUserQuestion.

---

## 0. Главное (TL;DR)

1. **Блокатор №1 для релиза — Git-синхронизация физически не заработает в текущем виде.** `isomorphic-git` ходит на `github.com` через `fetch`, а GitHub НЕ отдаёт CORS-заголовки на git-smart-HTTP. В коде (`lib/git.ts`) нет `corsProxy`, в `capacitor.config.ts` не включён `CapacitorHttp`. → `Клонировать` и `Sync` будут падать с сетевой ошибкой и в браузере, и в APK. Это надо решить ДО релиза (см. §5.1). Всё остальное — вторично.
2. **Web-версия уже обогнала референс по UI** (статистика, сортировка, темы, экран настройки теста, цветные обложки). Правки по дизайну — точечная полировка, а не переделка.
3. **Главные функциональные пробелы vs референс:** «Воспроизвести всё» (hands-free авто-озвучка), «Выбрать» (мультивыбор/массовые операции), «Распознавание речи». Первое — ожидаемо для релиза, остальные можно отложить.

---

## 1. Правки по дизайну

Сравнение референса (`photo_*`) и текущего web (`Current/Screenshot_*`).

| # | Что | Где (файл) | Приоритет |
|---|-----|-----------|-----------|
| D1 | **Пустые плитки карточек выглядят «сломанными».** `card-tile` имеет `min-height: 180px`, и карта без текста на лицевой = большой пустой бокс с серым курсивом «Без текста на лицевой» (Screenshot_7, 8). Референс показывал реальный контент карты. Фикс: если `front.text` пуст — показывать `back.text` как основной контент; снизить `min-height` до ~110px или сделать высоту по контенту. | `components/CardPreview.tsx` (стр. 66–75), `app/globals.css` (`.card-tile`, стр. 57) | **Высокий** |
| D2 | **Несогласованность цветов уровней запоминания.** В редакторе карты (Screenshot_4) «Прогресс запоминания» Bx1–Bx5 — тёмные пилюли с красным активным. А в настройке теста (Screenshot_9), опциях (Screenshot_10) и в `CardPreview` — полноцветная шкала `BOX_COLORS` (красный→оранжевый→жёлтый→зелёный→циан). Привести селектор в редакторе к `BOX_COLORS`/`BOX_LABEL`, чтобы цвет уровня был одинаков везде. | `app/card/page.tsx` (блок «Прогресс запоминания»), палитра уже есть в `lib/srs.ts` (`BOX_COLORS`, `BOX_LABEL`) | **Высокий** |
| D3 | **Длинный редактор карты.** Две стороны × (текст + Камера + Файл + Запись голоса) растягивают экран на 2+ прокрутки (Screenshot_3, 4). Свернуть «Изображение»/«Аудио» в компактные иконки-кнопки, раскрывающиеся по тапу. | `app/card/page.tsx`, `components/ImageInput.tsx`, `components/AudioRecorderButton.tsx` | Средний |
| D4 | **Нижняя навигация неконсистентна и беднее референса.** Главная — 3 пункта (Колода/Импорт/Синхр.), колода — 5 (Тест/Добавить/Импорт/Экспорт/Опции). Референс-колода: Воспроизвести всё / Добавить карточку / Опции / Распознавание речи / Выбрать. Унифицировать стиль иконок; добавить «Воспроизвести всё» (см. §2). | `components/BottomActions.tsx`, `app/deck/page.tsx`, `app/page.tsx` | Средний |
| D5 | **Терминология «карта» vs «карточка».** Кнопка на обложке — «Добавить карту» (Screenshot_1), в колоде — «Добавить» (Screenshot_7), референс — «карточку». Выбрать один термин («карточка») и применить везде. | `components/DeckCard.tsx`, `components/BottomActions.tsx` | Низкий |
| D6 | **Иконка-динамик в текстовом поле малозаметна** (Screenshot_3) — низкий контраст в правом верхнем углу textarea. Сделать явной кнопкой с подписью/фоном. | `app/card/page.tsx` | Низкий |
| D7 | **Пустые поля по бокам на десктопе** (Screenshot_3,4,5,10) — центрированная колонка ~720px, на широком экране много чёрного. Для mobile-first это нормально; опционально на `lg+` добавить мягкий фон/иллюстрацию по краям или 2-колоночную раскладку списков. | `app/layout.tsx`, контейнеры страниц | Низкий (necessary only для web) |
| D8 | **6 уровней в референсе vs 5 в web.** photo_5 показывает Уровень 1–6 + «Не установлен» (цветные). Текущая модель — 5 коробок Leitner (`BoxSchema` 1–5). Это **сознательное упрощение**, не баг. Решение: оставляем 5 (проще, классический Leitner). Зафиксировано. | `lib/types.ts`, `lib/srs.ts` | Решение принято |

**Что НЕ трогаем (уже лучше референса):** цветные обложки колод с буквой + бейдж %, строка статистики на главной, выпадашка сортировки (Screenshot_8), экран настройки теста (Screenshot_9), переключатель тем, «Опасная зона».

---

## 2. Чек-лист к релизу (v1.0)

### Блокаторы (без них релиз бессмысленен)
- [ ] **Починить Git-sync (CORS)** — см. §5.1. Это сама суть приложения.
- [ ] **Конфликт/расхождение при pull.** Сейчас `pull` только fast-forward (`lib/git.ts`, стр. 109–125); при расхождении pull тихо пропускается и идёт push → GitHub отклонит non-fast-forward, либо потеряются чужие правки (`cards.json` перезаписывается целиком = last-write-wins). Минимум для релиза: ловить non-FF, показывать «сначала потяните» + правило «1 активное устройство, частый sync». По-хорошему — merge по `card.id`+`updatedAt`.

### Функциональные (ожидаемо для flashcards-приложения)
- [ ] **«Воспроизвести всё»** — one-tap hands-free режим: проходит все карты, озвучивает обе стороны, авто-переворот/переход. Кирпичики уже есть: `autoSpeak` + `flipDelay` + `nextDelay` (`lib/types.ts` `DeckSettings`, использование в `app/study/page.tsx:335`). Нужно собрать в одну кнопку на экране колоды.
- [ ] **Пустые/ошибочные состояния:** пустая колода («Нет карточек — добавьте первую»), нет колод, ошибка sync (тост), оффлайн-индикатор.
- [ ] **Полный E2E-прогон:** создать колоду → карты с картинкой и аудио → экспорт `.fcdeck` (полный пакет) → импорт на втором устройстве → данные совпали (медиа на месте).
- [ ] **Проверка TTS-голосов:** наличие `ru`-голоса, корректный фолбэк если голоса нет (`lib/tts.ts`).

### Полировка / магазин
- [ ] **Иконка приложения и splash** (общее с Android) — заменить дефолт Capacitor на `public/icon-512.svg` через `@capacitor/assets`.
- [ ] **PWA-манифест** `public/manifest.json` — проверить name/icons/theme_color/display.
- [ ] **PAT в localStorage** (`lib/settings.ts`) — на общем устройстве риск; использовать fine-grained токен на 1 репо (Contents-only), дать кнопку «Стереть токен/выйти», не логировать.
- [ ] **Privacy Policy + Условия** — референс их имел (photo_13). Для публикации в Play Store privacy policy URL **обязателен**.
- [ ] **Версия:** bump `package.json` → 1.0.0, обновить `CHANGELOG.md`, тег `v1.0.0` (CI авто-релиз с APK).
- [ ] Согласовать тексты (см. D5), убрать заглушки.

---

## 3. Чек-лист Android Build

Текущее состояние: `capacitor.config.ts` корректен (`appId com.kirill.flashcards`, `webDir out`, `androidScheme https`), `build-android.bat` рабочий, CI `.github/workflows/android.yml` собирает **debug** APK на каждый push и Release при теге `v*`. Папки `android/` ещё нет (создаётся при `cap add android` локально/в CI).

- [ ] **Решение: debug vs signed release.** CI сейчас делает `assembleDebug` — годится только для sideload-теста, НЕ для Play Store. Для публикации нужен подписанный `assembleRelease`/`bundleRelease`:
  - [ ] сгенерировать keystore (`keytool`);
  - [ ] положить keystore (base64) и пароли в GitHub Secrets;
  - [ ] добавить signingConfig в `android/app/build.gradle` + шаг сборки release в workflow.
- [ ] **Иконка/splash:** `npx @capacitor/assets generate --android` из `icon-512`.
- [ ] **versionCode / versionName** в `android/app/build.gradle` (после первого `cap add`).
- [ ] **Разрешения в AndroidManifest:** `CAMERA`, `RECORD_AUDIO` (кнопки «Камера» и «Запись голоса»). `cap sync` добавляет разрешения плагинов, но web-`getUserMedia` в WebView требует и `<uses-permission>`, и runtime-запрос — проверить, что диалог реально появляется (см. §5.4).
- [ ] **`androidScheme: https`** (есть) — критично: даёт origin `https://localhost`, иначе secure-context API (микрофон/камера/`speechSynthesis`) заблокированы. Не менять.
- [ ] **target SDK 34/35** — Play Store требует. Проверить после `cap add` (Capacitor 7 ставит свежий по умолчанию).
- [ ] **CapacitorHttp** (если выбран как решение CORS, §5.1) — включить в `capacitor.config.ts` и пере-`sync`.
- [ ] **Тест на реальном устройстве** (debug APK из CI Artifacts): данные сохраняются после перезапуска, TTS звучит, камера/микрофон работают, Git-sync проходит.
- [ ] **Аппаратная кнопка «Назад»** — чтобы не закрывала приложение вместо возврата (см. §5.9).

**Как получить APK без Android Studio:** push в `main` → GitHub → вкладка **Actions** → последний запуск → **Artifacts** → `flashcards-apk` → скачать → установить на телефон (разрешить установку из неизвестных источников).

---

## 4. Инструкция: Git-синхронизация (ПК ↔ телефон)

> **ВАЖНО:** шаги ниже — это «как задумано» (и как описано в самом приложении, Screenshot_6). Пока не починен CORS (§5.1), кнопки `Клонировать`/`Sync` будут падать. Сначала §5.1, потом эта инструкция работает «как есть».

**Как устроено хранение.** Каждое устройство — это клон одного Git-репозитория. Колоды лежат обычными файлами:
```
decks/<id>/deck.json      ← мета колоды (имя, цвет, языки, настройки)
decks/<id>/cards.json     ← все карточки колоды
decks/<id>/media/*.webp|.webm  ← картинки и аудио
```
Это значит: репозиторий можно открыть/править прямо на github.com или склонировать обычным `git` на любой машине.

### Шаг 1. Создать репозиторий (один раз)
1. На GitHub → **New repository** → имя, напр. `flashcards`, **Private**, без README (пустой проще).

### Шаг 2. Создать токен (один раз)
2. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens** → **Generate new token**.
3. **Repository access** → Only select repositories → выбрать `flashcards`.
4. **Repository permissions → Contents → Read and write**.
5. Скопировать токен (`github_pat_...`) — показывается один раз.

### Шаг 3. ПК (сайт/dev-сборка)
6. Открыть **Настройки** (шестерёнка) → блок **Git синхронизация**.
7. Заполнить: **URL** `https://github.com/USER/flashcards.git`, **Ветка** `main`, **Имя пользователя**, **E-mail**, **Personal Access Token** → **Сохранить настройки**.
8. **Клонировать** (первый раз подтягивает репо в локальное хранилище).
9. Создавать/править колоды → жать **Sync (pull + push)**.

### Шаг 4. Телефон (APK)
10. Установить APK (см. §3) → **Настройки** → ввести **тот же** URL + токен + ветку.
11. **Клонировать** → данные с ПК подтянутся.
12. Дальше после правок — **Sync**.

### Правила безопасной синхронизации
- **Жми Sync до и после** сессии правок на устройстве.
- Пока нет merge по карточкам — **держи активным одно устройство за раз**; не правь одну колоду параллельно на двух без промежуточного sync (иначе non-FF/перезапись).
- Резервная копия независимо от Git — **Экспорт `.fcdeck`** (полный пакет с медиа).
- Альтернатива на ПК: можно вообще не пользоваться кнопкой в приложении, а синхронизировать папку через обычный `git` в терминале — репозиторий тот же.

---

## 5. Подводные камни телефона и решения (decisions)

### 5.1. ⚠️ CORS: isomorphic-git → GitHub (БЛОКАТОР) — ✅ РЕШЕНО: вариант B, реализовано
**Решение пользователя (2026-06-09): вариант B — собственный CORS-прокси.**
Сделано в этой сессии:
- `cors-proxy/` — Cloudflare Worker (`src/index.js`, `wrangler.toml`, `README.md`), совместимый с протоколом `corsProxy` isomorphic-git, с белым списком git-хостов.
- `lib/types.ts` — поле `corsProxy` в `GitConfigSchema`.
- `lib/git.ts` — `corsProxy` проброшен в `clone/pull/push`.
- `app/settings/page.tsx` — поле «CORS-прокси» + обновлённая инструкция.
- **Осталось пользователю:** развернуть воркер (`cd cors-proxy && npm i && npx wrangler login && npx wrangler deploy`), вставить URL в Настройки → CORS-прокси. Дальше Клонировать/Sync работают и на сайте, и в APK.

**Проблема (для истории).** GitHub не отдаёт `Access-Control-Allow-Origin` на git-smart-HTTP. Рассмотренные варианты:
- **A. Публичный CORS-proxy** — `corsProxy: 'https://cors.isomorphic-git.org'` в вызовах git. 1 строка, но **токен идёт через чужой сервер** (ломает privacy-нарратив) + нестабильность/лимиты. ❌ для приватных репо.
- **B. Свой cors-proxy** — `@isomorphic-git/cors-proxy` на Cloudflare Worker/VPS. Privacy сохраняется (свой доверенный хост), ~30 мин настройки. ✅ для web.
- **C. Android: `CapacitorHttp`** — `plugins.CapacitorHttp.enabled = true` в `capacitor.config.ts`. Патчит `fetch` → нативный HTTP минует CORS. Работает ТОЛЬКО в APK (не на десктоп-web). Нужно проверить совместимость с `isomorphic-git/http/web` (он зовёт `fetch` → должно подхватиться). ✅ самый privacy-чистый для телефона.
- **D. Переписать sync на GitHub REST Contents API** (`api.github.com` отдаёт CORS) — работает из любого браузера без прокси, но теряется настоящий git-merge, всё пофайлово, лимиты API. Больше работы.

**Рекомендация:** **C (CapacitorHttp) для Android** + **B (свой прокси) или D для web**. Если web-версия не приоритет — только C на телефоне, а на ПК синхронизировать обычным `git` в терминале (репо то же).

### 5.2. Хранилище WebView (lightning-fs → IndexedDB) — ✅ РЕШЕНО и реализовано
**Требование: никто ничего не стирает, всё работает через Git.** Сделано:
1. ✅ `navigator.storage.persist()` при старте (`components/ThemeProvider.tsx`) — WebView не вытесняет IndexedDB.
2. ✅ **Авто-sync** (`lib/autosync.ts`): debounce 4с после любого изменения (вшит в `repository.ts` → `writeCards`/`writeDeckMeta`/`deleteDeck`). Флаг `cfg.autoSync` + тумблер в Настройках. Ленивый `import("./git")`, чтобы не раздувать бандл страниц. Полный `syncAll` (commit → pull+merge → push), безопасный merge (см. 5.6).
3. ✅ **Стереть токен** (5.7) — кнопка в «Опасной зоне».
4. Источник правды — Git-репозиторий; локальный IndexedDB — кэш-клон. Любое устройство восстанавливается через `Клонировать`. `.fcdeck`-экспорт — ручной бэкап.

Остаётся (необязательно): предупреждение о `pendingChanges` перед уходом/сбросом; sync при старте приложения.

### 5.3. TTS (озвучка) — ✅ РЕШЕНО: нативный плагин (полноценное приложение)
**Решение пользователя: на Android делаем полноценное приложение** → не полагаемся на капризный WebView `speechSynthesis`, переходим на нативный TTS.
План (native-трек, §6): плагин `@capacitor-community/text-to-speech`; в `lib/tts.ts` обернуть в платформо-зависимый слой — `Capacitor.isNativePlatform()` → нативный TTS, иначе web `speechSynthesis` (фолбэк для сайта). API `speak()/stopSpeak()` не меняем, правок в вызывающем коде не требуется.

### 5.4. Камера / микрофон — ✅ РЕШЕНО: нативные плагины (по умолчанию, т.к. полноценное приложение)
Пользователь явного указания не дал, но 5.3/5.5 задают вектор «полноценное native-приложение». Решение по умолчанию: фото — `@capacitor/camera`, разрешения + runtime-запрос. `androidScheme: https` (есть) оставляем. Web-вариант (`getUserMedia`/`<input capture>`) остаётся фолбэком для сайта. Детали — §6.

### 5.5. Запись голоса (гс) + прослушивание — ✅ РЕШЕНО: запись+воспроизведение, STT отменён
**Переформулировка пользователя:** нужно НЕ распознавание речи (STT), а **записать голосовое сообщение и потом его прослушать**. Это фича «Запись голоса» (`components/AudioRecorderButton.tsx` → `lib/media.ts`, сейчас web `MediaRecorder`).
План: для надёжности в native — нативная запись (`@capacitor-community/voice-recorder` или эквивалент) с web-фолбэком; воспроизведение — `<audio>` из сохранённого медиа (работает и в WebView). Speech-recognition из планов убираем.

### 5.6. Git-конфликты / multi-device — ✅ РЕШЕНО: 3-way merge по карточкам
Было: FF-only pull, last-write-wins по файлу — правки одной стороны терялись.
Сделано (`lib/merge.ts` + `lib/git.ts`): `pull` использует кастомный `mergeDriver` isomorphic-git, который сливает `cards.json` по `id` карточки (новейшая по `updatedAt` побеждает; удаление уважается только если вторая сторона карту не трогала; конфликт «удалено vs изменено» → сохраняем правку). `deck.json` — новейшая версия. `syncAll` теперь pull(merge) ДО push и не глотает настоящие ошибки слияния. Покрыто 10 unit-тестами (правки с двух устройств, удаление, конфликт). Теперь правки двух устройств не затирают друг друга — можно работать параллельно.

Остаётся (необязательно): field-level merge внутри карты (сейчас карта целиком — новейшая); UI ручного разрешения для редких бинарных конфликтов медиа.

### 5.7. Токен (PAT) в localStorage — ✅ РЕШЕНО (частично)
Хранится открыто в WebView localStorage. На потерянном/общем телефоне — риск утечки.
Сделано: кнопка **«Стереть токен»** в Настройках (убирает PAT с устройства). Рекомендация по-прежнему: fine-grained токен только на 1 репо с Contents-only.

### 5.8. Размер репозитория от медиа
Картинки/аудио коммитятся бинарниками прямо в git; история раздувается (хранятся все версии). `clone depth=1` смягчает скачивание, но push-история всё равно растёт.
**Решение:** на релиз — ок; на будущее — squash истории / git-lfs / внешнее хранилище медиа.

### 5.9. Аппаратная кнопка «Назад» (Android)
Next.js-роутинг в Capacitor: системная «Назад» может закрыть приложение вместо возврата.
**Решение:** обработчик `@capacitor/app` `backButton` → history.back, выход только с главного экрана.

### 5.10. Оффлайн — это плюс (не проблема)
Приложение offline-first: всё локально, изменения копятся git-коммитами и пушатся при сети. Сеть нужна только для sync. Оставляем как есть — это конкурентное преимущество (`docs/2026-05-11-ideas.md`).

---

---

## 6. Native-трек (Android — полноценное приложение)

**Статус (2026-06-10): JS/TS-интеграция реализована и собирается (tsc ✓, build ✓).** Плагины установлены под Capacitor 7, обёртки платформо-зависимы (`Capacitor.isNativePlatform()`) с web-фолбэком и ленивым `import()` (бандлы страниц выросли лишь на ~3 кБ — core для детекта платформы; сами плагины грузятся только на устройстве). Java/Android SDK в этой среде нет → генерация `android/` и сборка APK выполняются в CI / на устройстве.

Установлено: `@capacitor/camera@7`, `@capacitor/app@7`, `@capacitor-community/text-to-speech@6.1.0` (peer `@capacitor/core >=7`), `capacitor-voice-recorder@7.0.6`.

Сделано в коде:
- ✅ **5.3 TTS** — `lib/tts.ts`: native ветка `@capacitor-community/text-to-speech`, web `speechSynthesis` как фолбэк. `speak()/stopSpeak()` без изменений сигнатур.
- ✅ **5.5 запись гс** — `lib/media.ts`: native `capacitor-voice-recorder` (запрос разрешения, base64→Blob), web `MediaRecorder` как фолбэк. `AudioRecorderButton` не тронут. Воспроизведение — существующий `<audio>`.
- ✅ **5.4 камера** — `components/ImageInput.tsx`: native `@capacitor/camera` (Камера/Галерея), web `<input capture>` как фолбэк.
- ✅ **5.9 кнопка «Назад»** — `components/NativeBridge.tsx` (`@capacitor/app`), смонтирован в `app/layout.tsx`.

Осталось (CI / устройство, без Java тут не сделать):

### Шаг A. Сгенерировать android-проект и засинкать плагины
```bash
npm run build
npx cap add android       # создаст папку android/ (CI уже делает это, если папки нет)
npx cap sync android      # скопирует 4 новых плагина + смержит permissions (CAMERA, RECORD_AUDIO)
```
CORS на телефоне отдельно настраивать не нужно — `corsProxy` из настроек работает и в APK.

### Шаг B. Разрешения — проверить после sync
`android/app/src/main/AndroidManifest.xml`: `CAMERA`, `RECORD_AUDIO` (плагины добавляют свои; проверить наличие и runtime-запрос на устройстве).

### Шаг C. Иконка/splash + подписанный APK (§3)
- `npm i -D @capacitor/assets`; `npx @capacitor/assets generate --android` из `public/icon-512` (нужна папка `android/`).
- Keystore + signingConfig + секреты в CI для `bundleRelease`.

### Шаг D. Прогон на реальном устройстве
Установить APK → проверить: clone/sync через прокси; нативный TTS звучит; запись гс + прослушивание; камера/галерея; данные переживают перезапуск; «Назад» возвращает, а не закрывает; авто-sync пушит.

---

## Что дальше (приоритет)
1. ✅ **§5 закрыт** — CORS proxy (B), 3-way merge без потери данных, авто-sync, storage.persist, стереть токен.
2. ✅ **§6 native-код готов** — TTS / запись гс / камера / кнопка «Назад» (платформо-зависимо, build ✓).
3. **Действия пользователя/CI:** развернуть воркер (`cors-proxy/`); `cap add android` + `cap sync` (CI); иконка/splash + подписанный APK; **прогон на устройстве** (§6 шаг D) — единственный способ проверить нативные ветки.
4. **D1 + D2** (пустые плитки, единый цвет уровней) + **«Воспроизвести всё»** (§2) — web/UI-полировка.

## Файлы, изменённые в этой сессии
**Блок 1 — CORS (5.1, вариант B) + persist (5.2):**
- `lib/types.ts` — поле `corsProxy` в `GitConfigSchema`.
- `lib/git.ts` — `corsProxy` в `clone/pull/push` (+ хелпер `corsProxyFor`).
- `app/settings/page.tsx` — поле «CORS-прокси» + обновлённая инструкция.
- `components/ThemeProvider.tsx` — `navigator.storage.persist()` при старте.
- `tsconfig.json` — `cors-proxy` в exclude.
- `cors-proxy/*` *(новое)* — Cloudflare Worker: `src/index.js`, `wrangler.toml`, `package.json`, `README.md`.

**Блок 2 — сохранность данных (5.2 авто-sync, 5.6 merge, 5.7 токен):**
- `lib/merge.ts` *(новое)* — 3-way merge `cards.json`/`deck.json` по id (+ mergeDriver). 10 unit-тестов прошли.
- `lib/git.ts` — `pull` с `mergeDriver`; `syncAll` не глотает ошибки слияния.
- `lib/autosync.ts` *(новое)* — debounce-авто-sync с ленивым `import("./git")`.
- `lib/repository.ts` — `scheduleAutoSync()` в `writeCards`/`writeDeckMeta`/`deleteDeck`.
- `app/settings/page.tsx` — тумблер «Авто-синхронизация» + кнопка «Стереть токен».
- Проверка: `npx tsc --noEmit` ✓, `npm run build` ✓ (exit 0); бандлы страниц без регрессии (lazy-import).

**Блок 3 — native-трек §6 (TTS/гс/камера/назад):**
- `package.json` — добавлены `@capacitor/camera@7`, `@capacitor/app@7`, `@capacitor-community/text-to-speech@6.1.0`, `capacitor-voice-recorder@7.0.6`.
- `lib/tts.ts` — native TTS + web-фолбэк.
- `lib/media.ts` — native запись (`capacitor-voice-recorder`) + хелперы `base64ToBlob`/`dataUrlToFile` + web-фолбэк.
- `components/ImageInput.tsx` — native камера (`@capacitor/camera`) + web-фолбэк.
- `components/NativeBridge.tsx` *(новое)* + `app/layout.tsx` — кнопка «Назад» (`@capacitor/app`).
- Проверка: tsc ✓, build ✓; нативные ветки требуют проверки на устройстве (Java/SDK тут нет).

**Анализ (прочитано, без правок):** `lib/{tts,repository,srs,fs,media,settings}.ts`, `components/{CardPreview,AudioRecorderButton}.tsx`, `app/globals.css`, `app/study/page.tsx`, `.github/workflows/android.yml`, `capacitor.config.ts`, `package.json`, `public/seed-data/*`.
**Скриншоты:** `documentation/photo_1..15` (референс), `documentation/Current/Screenshot_1..10` (web).
