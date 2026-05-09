# Flashcards Editor

Редактор флешкарт с **синхронизацией через Git**. Работает как **сайт** (PWA) и
**Android-приложение** (через Capacitor) — обе стороны подключаются к одному
Git-репозиторию и синхронизируют данные.

## Стек

- **Next.js 15** (App Router, статический экспорт) + **React 19** + **TypeScript**
- **Tailwind CSS** для UI
- **isomorphic-git** + **@isomorphic-git/lightning-fs** — Git клиент и виртуальная FS поверх IndexedDB
- **Zod** — валидация данных
- **PapaParse** — импорт/экспорт CSV
- **Lucide-react** — иконки
- **Capacitor 7** — обёртка в Android APK

## Возможности

- Колоды с цветовой меткой, прогрессом запоминания и количеством карточек
- Карточки с **двумя сторонами**: текст + изображение + аудио
- Запись голоса прямо из браузера, выбор изображения с камеры или из файлов
- Уровни запоминания 1-6 + не установлен (как в референсном приложении)
- Сортировка (созд., алф., уровень, перемешать), поиск по всем карточкам
- Опции колоды: язык сторон, скорость озвучки, задержки переворота
- Тестовый режим: переворот, озвучка через `SpeechSynthesis`, переоценка уровня
- Импорт CSV в формате `Front side,Back side` (как в Excel-шаблоне)
- Экспорт колоды в CSV
- **Git-синхронизация** одной кнопкой: pull → commit → push (HTTPS + Personal Access Token)

## Формат данных в репозитории

```
decks/
  <deckId>/
    deck.json        # имя, цвет, настройки, таймстемпы
    cards.json       # массив карточек
    media/
      <cardId>_front_image.<ext>
      <cardId>_back_image.<ext>
      <cardId>_front_audio.<ext>
      <cardId>_back_audio.<ext>
```

`deck.json`:

```json
{
  "id": "abc123",
  "name": "Бизнес",
  "color": "#e36b6b",
  "settings": {
    "frontLanguage": "ru",
    "backLanguage": "ru",
    "frontSpeechSpeed": 1,
    "backSpeechSpeed": 1,
    "flipDelay": 0,
    "nextDelay": 0
  },
  "cardCount": 12,
  "createdAt": "...",
  "updatedAt": "..."
}
```

`cards.json`:

```json
[
  {
    "id": "x1",
    "front": { "text": "cat", "image": "media/x1_front_image.jpg", "audio": null },
    "back":  { "text": "animal", "image": null, "audio": null },
    "level": 3,
    "tags": ["english"],
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

## Запуск (dev)

```powershell
npm install
npm run dev
```

Открой http://localhost:3210.

## Сборка статического сайта

```powershell
npm run build
```

Готовый сайт лежит в `out/`. Можно деплоить как угодно (GitHub Pages, Netlify, Vercel, локальный nginx, IPFS).

## Настройка Git-синхронизации

1. Создай **пустой** репозиторий на GitHub (например, `flashcards`).
2. GitHub → **Settings → Developer settings → Personal access tokens (Fine-grained)**.
   Создай токен с доступом `Contents: Read and write` к этому репозиторию.
3. Зайди в приложение → шестерёнка в правом верхнем углу → введи URL и токен.
4. Нажми **Клонировать** (если репо ещё пустой — оставь, потом сделай первый push).
5. Добавляй колоды/карточки и жми **Sync** — изменения уйдут в Git.
6. На втором устройстве введи те же креды и нажми **Sync** — данные подтянутся.

> CORS: GitHub разрешает push с любого origin'а, токен передаётся в Authorization header.
> Для self-hosted Gitea/Forgejo поменяй URL и используй пароль/токен как токен.

## Сборка APK (Android)

```powershell
npm install
npm run build              # создаёт out/
npm run cap:add:android    # один раз — добавляет проект android/
npm run cap:sync           # копирует out/ в android/
npm run cap:open:android   # открывает Android Studio
```

В Android Studio: Build → Generate Signed Bundle/APK.

> Альтернатива (без Capacitor): открой PWA в Chrome на телефоне → меню → «Установить
> приложение». Получишь иконку на рабочем столе и режим без адресной строки. Git-sync
> работает так же, только данные хранятся в IndexedDB браузера.

## Структура проекта

```
app/
  page.tsx                # главный экран — список колод
  deck/page.tsx           # экран колоды (карточки)
  card/page.tsx           # редактор карточки
  study/page.tsx          # тест-режим
  options/page.tsx        # опции колоды
  settings/page.tsx       # Git-настройки
  search/page.tsx         # глобальный поиск
components/               # переиспользуемые UI
lib/
  types.ts                # zod-схемы Deck/Card/GitConfig
  fs.ts                   # обёртка над LightningFS
  repository.ts           # CRUD для колод/карточек
  git.ts                  # isomorphic-git: clone/commit/pull/push/syncAll
  csv.ts                  # PapaParse импорт/экспорт
  media.ts                # запись аудио, конвертация файлов
  settings.ts             # GitConfig в localStorage
public/
  manifest.json           # PWA-манифест
  icon-{192,512}.svg
capacitor.config.ts       # настройки Android-обёртки
```

## Известные ограничения

- **Конфликты слияния** не разрешаются автоматически: при гонке коммитов с двух устройств
  второй пуш отклоняется — нужно вручную сделать pull, затем повторить sync.
  Для одного пользователя это редкость; по-уму можно прикрутить three-way merge на
  уровне `cards.json`, но это уже v2.
- **Бинари в Git**: изображения и аудио раздувают репо. Для большой коллекции стоит
  вынести media в Git LFS или хранить в отдельном бакете (S3/R2). Пока — в self-hosted
  репозитории всё ок.
- **Голосовая запись** в браузере зависит от поддержки `MediaRecorder`: в Chrome/Edge ок,
  в Safari (iOS) ограничения на форматы (MP4 fallback включён).

## Дальнейшие планы

- Расписание повторений (SRS, как Anki) — сейчас уровень редактируется вручную
- Three-way merge для `cards.json` чтобы не было ручных конфликтов
- Capacitor Filesystem plugin: хранить media в реальной папке на телефоне (а не в IndexedDB)
- Тёмная/светлая тема, кастомизация фона колоды
