# SETUP — что сделано и что осталось

## ✅ Что я уже сделал автоматически

| # | Шаг | Статус |
|---|---|---|
| 1 | `npm install` (255 пакетов) | ✅ выполнено |
| 2 | Сгенерирован seed из `documentation/Flashcards (1) (2).csv` (`npm run seed`) | ✅ 4 колоды (1 с тремя примерами карточек, 3 пустых) |
| 3 | Авто-импорт seed на первом запуске (если ты ещё не подключил Git) | ✅ встроено в код |
| 4 | Production-сборка (`npm run build`) | ✅ 10 статических страниц в `out/` |
| 5 | TypeScript-проверка | ✅ без ошибок |
| 6 | Smoke dev-сервера на `:3210` | ✅ `/` и `/settings` отдают 200 |
| 7 | Bat-файлы для Windows: `start-dev.bat`, `start-prod.bat`, `build-android.bat` | ✅ |
| 8 | PWA-манифест и SVG-иконки | ✅ `public/manifest.json` + `icon-{192,512}.svg` |
| 9 | Конфиг Capacitor для Android (`capacitor.config.ts`) | ✅ |

В отличие от `quiz-admin-panel` / `personal-finances`, тут **нет** `.env.local` — данные лежат
не в Google Sheets / Firebase, а в Git-репозитории, и креды Git хранятся в браузере
(localStorage) через UI настроек, а не в env-переменных.

## 🟦 Что осталось со стороны пользователя

### 1. Запустить и пощупать локально (5 секунд)

Двойной клик по **`start-dev.bat`** в корне проекта.

Скрипт сам:
- проверит зависимости и доустановит при необходимости,
- сгенерирует seed-данные если их нет,
- запустит dev-сервер на `http://localhost:3210`,
- откроет браузер.

При первом запуске увидишь 4 колоды-примера: «Пример: Бизнес» (с 3 карточками cat/apple/song
из твоего CSV), плюс пустые «Психология», «GameDev», «Личный бренд». Можешь добавлять/менять/
удалять что угодно — данные сохраняются в IndexedDB браузера.

### 2. Создать пустой Git-репозиторий (2 минуты, разово)

1. Зайди на **https://github.com/new** → создай **пустой** репо (без README), например `flashcards-data`.
   Тип — **Private**, иначе твои данные будут публичными.
2. Запиши URL: `https://github.com/<твой-логин>/flashcards-data.git`.

### 3. Получить Personal Access Token (3 минуты, разово)

1. https://github.com/settings/personal-access-tokens/new — **Fine-grained tokens**.
2. Заполни:
   - Token name: `flashcards-editor`
   - Expiration: 1 год (или дольше)
   - **Repository access**: «Only select repositories» → выбери созданный репо
   - **Permissions** → **Repository permissions** → **Contents**: **Read and write**
3. Жми **Generate token** и **сохрани** строку `github_pat_...` — она показывается один раз.

### 4. Подключить репо к приложению (30 секунд)

В приложении: шестерёнка (правый верхний угол) → **Настройки**:
- **URL репозитория**: `https://github.com/<логин>/flashcards-data.git`
- **Ветка**: `main` (или `master`, как у тебя в репо по умолчанию)
- **Имя пользователя**: твой GitHub-логин
- **E-mail**: любой, попадёт в коммиты
- **Personal Access Token**: вставь строку `github_pat_...`

Жми **Сохранить настройки** → **Sync (pull + push)**. Первый коммит уйдёт со всем seed-контентом.
Дальше — просто кнопка «Синхронизация» внизу главного экрана.

### 5. Подключиться с другого устройства (телефон)

Вариант А — **PWA через браузер** (без сборки APK, работает прямо сейчас):

1. На телефоне открой `http://<IP-компьютера>:3210` (когда `start-dev.bat` запущен)
   или задеплой `out/` на любой статический хостинг (GitHub Pages / Vercel / Netlify) —
   получишь публичный URL.
2. В Chrome → меню → «Установить приложение» / «Добавить на главный экран».
3. Открой → шестерёнка → введи те же URL + PAT → **Клонировать** → готово.

Вариант Б — **нативный APK** (нужен Android Studio):

1. Установи **Android Studio** (https://developer.android.com/studio) и **JDK 17**.
2. Один раз: запусти `build-android.bat`. Он сделает `cap add android`, `cap sync` и откроет
   Android Studio.
3. В Android Studio: **Build → Generate Signed Bundle / APK** → APK → Release → создай keystore
   (один раз) → собирай.
4. Готовый `app-release.apk` лежит в `android/app/build/outputs/apk/release/`. Перекинь на
   телефон, разреши «установка из неизвестных источников», установи.
5. В приложении на телефоне: Настройки → URL + PAT → **Клонировать**.

### 6. Деплой сайта в интернет (опционально)

После `npm run build` папка `out/` — статический сайт. Положить можно куда угодно:

**GitHub Pages (бесплатно):**
- Создай отдельный репо `flashcards-site`.
- Закоммить туда содержимое `out/`.
- Settings → Pages → Source: `main` branch, root.
- Через минуту: `https://<логин>.github.io/flashcards-site/`.

**Netlify drag&drop**: https://app.netlify.com/drop — кинуть `out/` в окно браузера.

**Vercel**: подключить репо, framework Next.js, build cmd `npm run build`, output `out`.

> Важно: где бы ни был развёрнут сайт, он работает в браузере пользователя. Сервер ничего
> не хранит — все данные ходят только между браузером и твоим Git-репо.

## 📁 Что лежит в проекте

```
flashcards-editor/
├── README.md                  главная документация
├── SETUP.md                   ← этот файл
├── start-dev.bat              запуск разработки (двойной клик)
├── start-prod.bat             прод-сборка + локальный preview
├── build-android.bat          сборка APK через Capacitor
├── package.json               скрипты: dev, build, seed, preview, cap:*
├── next.config.ts             output: "export" — статический сайт
├── tailwind.config.ts         тёмная тема под скриншоты
├── capacitor.config.ts        Android-обёртка
├── app/                       страницы Next.js
│   ├── page.tsx               главная (список колод)
│   ├── deck/page.tsx          колода + список карточек
│   ├── card/page.tsx          редактор карточки
│   ├── study/page.tsx         тест-режим
│   ├── options/page.tsx       опции колоды
│   ├── settings/page.tsx      Git-настройки
│   └── search/page.tsx        глобальный поиск
├── components/                переиспользуемые UI-кирпичи
├── lib/
│   ├── types.ts               Zod-схемы
│   ├── fs.ts                  виртуальная FS поверх IndexedDB
│   ├── repository.ts          CRUD по колодам/карточкам
│   ├── git.ts                 isomorphic-git (clone/commit/pull/push)
│   ├── csv.ts                 импорт/экспорт CSV
│   ├── media.ts               запись аудио, конвертация файлов
│   ├── settings.ts            GitConfig в localStorage
│   └── seed.ts                автозагрузка примера на первом старте
├── public/
│   ├── manifest.json          PWA-манифест
│   ├── icon-{192,512}.svg     иконки
│   └── seed-data/             пример колод — генерируется npm run seed
├── scripts/seed.mjs           генератор seed-data из documentation/CSV
├── documentation/             твои скриншоты и исходный CSV
└── out/                       результат npm run build (статический сайт)
```

## 🆘 Если что-то пошло не так

| Симптом | Что проверить |
|---|---|
| `start-dev.bat` пишет «node не найден» | Установи Node.js 20+ с https://nodejs.org/ и перезапусти терминал |
| Sync падает с `401 Unauthorized` | Не тот PAT или истёк / нет права Contents:Write на репо |
| Sync падает с `MergeNotSupportedError` | Кто-то другой запушил быстрее — нажми «Sync» ещё раз (внутри: pull → push) |
| Seed-колоды не появились | Ты уже синкался с пустым репо. Удалить можно через шестерёнка → «Удалить локальные данные», потом перезагрузить страницу |
| Аудиозапись не работает | Браузеру нужен HTTPS или localhost. На IP по сети - не разрешит микрофон, разворачивай через `localhost`, ngrok или Cloudflare tunnel |
| Картинки в Git раздуваются | Норм для пары сотен карточек. Если разрастётся — Git LFS или сменить media-стор на S3 (см. README → «Дальнейшие планы») |
