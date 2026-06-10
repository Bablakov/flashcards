# Flashcards CORS-прокси (вариант B)

Собственный CORS-прокси для Git-синхронизации. Нужен, потому что GitHub не отдаёт
CORS-заголовки на git-smart-HTTP, и `isomorphic-git` из браузера / Android WebView
не может напрямую делать `clone/pull/push`.

Прокси крутится на **твоём** Cloudflare-аккаунте (бесплатный план) — токен проходит
только через твою инфраструктуру, никаких сторонних публичных прокси.

## Деплой (один раз, ~5 минут)

1. Зарегистрируйся на [Cloudflare](https://dash.cloudflare.com/sign-up) (бесплатно).
2. В этой папке:
   ```bash
   cd cors-proxy
   npm install
   npx wrangler login        # откроет браузер, подтверди доступ
   npx wrangler deploy
   ```
3. Wrangler выведет URL воркера, например:
   ```
   https://flashcards-cors-proxy.ТВОЙ-СУБДОМЕН.workers.dev
   ```
4. Вставь этот URL в приложении: **Настройки → CORS-прокси**.

Готово. Теперь `Клонировать` и `Sync` работают и на сайте, и в Android-сборке.

## Проверка

Открой URL воркера в браузере — должно ответить `flashcards cors-proxy: ok`.

## Безопасность

- Прокси пропускает только git-хосты из белого списка `ALLOW_HOSTS`
  (`src/index.js`): github.com, gitlab.com, bitbucket.org, codeberg.org.
  Это не «открытый релей» — добавляй хост вручную, если нужен свой GitLab/Gitea.
- Токен (PAT) проходит через воркер в заголовке `Authorization`. Воркер его не
  логирует и не хранит, но это твой сервер — поэтому вариант B и выбран
  (в отличие от публичного `cors.isomorphic-git.org`).

## Локальная отладка

```bash
npx wrangler dev      # поднимет на http://localhost:8787
```
В приложении временно укажи `http://localhost:8787` как CORS-прокси.

## Альтернатива без Cloudflare

Тот же протокол реализует официальный пакет — на любом Node-хосте (Railway/Render/VPS):
```bash
npx @isomorphic-git/cors-proxy start -p 9999
```
Тогда в «CORS-прокси» вставляешь URL этого сервиса. Cloudflare-вариант предпочтительнее:
бесплатный, без холодного старта и без своего сервера.
