# Tekushcheye sostoyanie proekta — handoff dlya sleduyushchey sessii

> **Ot:** sessiya 2026-10-06, versiya **1.1.4** (sborka dlya iOS).
> **Pravilo proekta:** otvechat' pol'zovatelyu po-russki latinitsej (translit),
> posle zadach pisat' `docs/YYYY-MM-DD-*.md` s razdelami «chto / zachem / chto eshchyo».
>
> Etot fajl do 2026-08-19 opisyval maj'skuyu versiyu s raskladkoj
> `/repo/decks/<id>/cards.json` i komponentom `DeckCard` — nichego etogo bol'she
> net. Esli vstretish' ssylki na nih v starykh dokumentakh, veryay kodu.

## Chto eto

Tri prilozheniya iz odnoj kodovoy bazy: **PK** (Electron, NSIS-ustanovshchik,
avtozapusk, trej), **Android** (Capacitor, podpisannyy APK) i **iOS**
(Capacitor, nepodpisannyy IPA — stavitsya cherez Sideloadly besplatnym
Apple ID, sm. [`2026-10-06-ios-build.md`](./2026-10-06-ios-build.md)). Vsyo — kartochki,
progress, nastroyki — sinhroniziruetsya cherez lichnyy privatnyy repozitoriy
GitHub. Golosovykh funktsiy net i ne budet (resheniye 2026-08-18).

## S chego nachat' chteniye

1. [`2026-08-18-scope-reset.md`](./2026-08-18-scope-reset.md) — spetsifikatsiya:
   trebovaniya, format dannykh, algoritm povtoreniy, politika sinhronizatsii.
2. [`2026-08-19-releases-and-fixes.md`](./2026-08-19-releases-and-fixes.md) —
   razbor vsekh polevykh polomok 1.0.0 → 1.0.11 i ikh nastoyashchikh prichin.
3. [`2026-08-19-design-overhaul.md`](./2026-08-19-design-overhaul.md) —
   dizayn-sistema i razbor shesti ekranov (versiya 1.1.0).

## Ustroystvo

- **Next.js 15** (`output: "export"`), React 19, TypeScript strict, Tailwind 3.
- **Format dannykh 2**, odin fayl na obyekt: `meta.json`, `settings.json`,
  `groups/<id>.json`, `cards/<id>.json`, `media/<hash>.<ext>`,
  `journal/<device>/<YYYY-MM>.jsonl`. Ierarkhiya — cherez `parentId`,
  udaleniye myagkoye. Sm. `lib/model.ts` i `lib/store.ts`.
- **Progress** — FSRS (`ts-fsrs`), sobirayetsya proigryvaniyem zhurnala
  otvetov (`lib/progress.ts`). Urovni 1–5 vyvodyatsya iz stabil'nosti.
- **Sinhronizatsiya** — `isomorphic-git` poverkh `lightning-fs`; transport
  vybirayetsya po platforme v `lib/git-http.ts` (PK → IPC, Android i iOS →
  nativnyy HTTP-plagin). **CORS-proksi ne nuzhen**, pole v nastroykakh ostayotsya pustym.
- **Dizayn-sistema** — klassy v `app/globals.css` (`.row`, `.surface`,
  `.section-title`, `.btn-primary`, `.segmented`, `.chip`, `.level-dot`).
  Novyye ekrany sobirat' iz nikh, a ne pisat' svoi razmery.

## Grabli, na kotorye uzhe nastupali

- **Zapis' v khranilishche nado sbrasyvat' yavno.** `lightning-fs` otkladyvayet
  zapis' dereva katalogov na 500 ms i sbrasyvayet tajmer pri kazhdoy sleduyushchey
  zapisi, poetomu seriya zapisey (kartochka + kartinka + obyekty git) ne
  perezhivala perezagruzku. Kazhdaya zapis' v `lib/store.ts` zovyot `flushFs()`
  iz `lib/fs.ts` — ne ubirat'.
- **Global'nyy patch `fetch` ot Capacitor vyklyuchen namerenno** — on lomayet
  dvoichnye tela git-protokola.
- **Papki `android/` i `ios/` ne khranyatsya v repozitorii** — ikh sozdayot CI
  iz shablona Capacitor. Vsyo nativnoye (razresheniya v manifeste i Info.plist,
  versiya, ikonki) dopisyvayetsya shagami workflow, a ne pravkoy faylov.
- **iOS ne sobirayetsya na Windows** — tol'ko `ios.yml` na macOS-runnere.
- **electron-builder ne publikuyet reliz sam** (`--publish never`): on sozdaval
  svoy chernovik, i `.exe` s `latest.yml` ne popadali v opublikovannyy reliz.
  Fayly dokladyvayet otdel'nyy shag workflow.

## Proverki pered kommitom

```bash
npx tsc --noEmit
npm run test:model   # 53 proverki
npm run build
```

## Vypusk versii

1. Podnyat' versiyu v `package.json` (i `package-lock.json`).
2. Kommit → `git push origin main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z` — po tegu sobirayutsya tri
   workflow: Android APK sozdayot reliz, Desktop dokladyvayet `.exe` i `latest.yml`,
   iOS — `.ipa` (on samyy dolgiy).
4. Skachat' vse tri fayla v `Desktop\flashcards-builds\` (ustanovshchik Windows
   bystree sobrat' lokal'no: `npm run desktop:dist`, ~2 min).

## Chto ne sdelano

- **iOS ni razu ne zapuskalsya na zhivom iPhone** — sborka proveryayetsya tol'ko
  kompilyatsiyey v CI. Sinkhronizatsiya, kamera i uvedomleniya na iOS zhdut
  pervogo progona (spisok proverok — v `2026-10-06-ios-build.md`).

- **Zhivoy progon dizayna na telefone** — plotnost', popadaniye po knopkam,
  chitayemost' na solntse proveryayutsya tol'ko na ustroystve.
- **Uvedomleniya po raspisaniyu** ni razu ne srabatyvali vzhivuyu. V nastroykakh
  yest' knopka «Proverit' cherez 15 sekund» i stroka sostoyaniya raspisaniya —
  eto i yest' sposob proverit'.
- **Bokovoye derevo grupp** na shirokom ekrane — vybran variant s dvumya
  kolonkami.
- **Testy zapisi v IndexedDB** — proverki formata i sliyaniya yest', zapis'
  v Node ne progonyayetsya. Otladochnyy dostup `window.__fsDebug` ostavlen
  v rezhime razrabotki, chtoby takoye izmeryat', a ne predpolagat'.
