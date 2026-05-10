# Tekushcheye sostoyanie proekta — handoff dlya sleduyushchego chata

> **Komu:** sleduyushchemu instansu Claude / pol'zovatelyu, kto vozvrashchaetsya
> v proekt cherez paru dnej.
> **Ot:** sessiya 2026-05-10.
> **Pravilo proekta:** pol'zovatel' prosit otvechat' po-russki latinitsej
> (translit). Posle vypolneniya zadach pisat' otdel'nyj `docs/YYYY-MM-DD-*.md`
> s razdelami «chto / zachem / chto eshchyo».

---

## Gde ostanovilis'

Posledniy zafiksirovannyy progress — **UX-dorabotka po pyati napravleniyam**:
karty kolod, eksport CSV, sohraneniye karty, ekran nastrojki testa, edinyy
razmer izucha­emoj kartochki. Vsyo opisano v
[`docs/2026-05-10-ux-improvements.md`](./2026-05-10-ux-improvements.md) —
**eto pervyj fajl, kotoryj nuzhno prochitat'**.

`npx tsc --noEmit` prohodit chisto. Live-test v brauzere pol'zovatel' eshchyo
ne delal — tol'ko prosil sohranit' i opisat'.

## Chto sdelano v etoj sessii (kratko)

| Fajl | Smysl izmeneniya |
|---|---|
| `components/DeckCard.tsx` | Yarkiy gradient vmesto serogo, menyu otkryvaetsya vverh |
| `lib/csv.ts` | Eksport s russkimi zagolovkami `Litsevaya storona` / `Obratnaya storona`; parser sovmestim so starymi CSV |
| `app/card/page.tsx` | Dve nizhnie knopki: `Sohranit' i vernut'sya` / `Sohranit' i dobavit' eshchyo` |
| `app/study/page.tsx` | Polnostyu pereveden na potok «ekran nastrojki -> sessiya»; kartochka zafiksirovana `60vh / min 360px` |
| `lib/srs.ts` | Dobavlen flag `preserveOrder` dlya rezhima «po poryadku» |
| `docs/2026-05-10-ux-improvements.md` | Detal'nyy otchyot |

## Chto _ne_ sdelano (specially) i pochemu

Polnyy spisok otkrytyh voprosov — v razdele
«**Chto eshchyo nuzhno sdelat'**» fajla
[`2026-05-10-ux-improvements.md`](./2026-05-10-ux-improvements.md). Glavnye
punkty:

1. **Oblozhka kolody bol'she/zametnee** — pol'zovatel' upomyanul, no v scope
   sessii ne voshlo. Vozmozhnye varianty: krupnye plitki na glavnoj /
   ispol'zovat' oblozhku kak fon kartochki v rezhime testa.
2. **Eksport s media (kartinki, audio)** — sejchas tol'ko tekst v CSV. Nado
   pridumat' format (zip s `media/`?) ili polagat'sya na Git sync.
3. **Mobil'naya raskladka knopok karty** — sejchas `grid-cols-1 sm:grid-cols-2`,
   nado proverit' na real'nom telefone.
4. **Vizual'nyj progress-bar v sessii** — sejchas tol'ko schyotchik
   `idx + 1 / total`.
5. **Dopolnitel'nye presety rezhima testa** (naprimer, «blits» — tol'ko Box
   1+2 na skorost').

## Stek i vazhnye soglasheniya

- **Next.js 15 + React 19**, TypeScript strict, Tailwind 3.
- **Hranenie**: `lightning-fs` v brauzere, sinhronizatsiya cherez
  `isomorphic-git` (CHTO U pol'zovatelya nastraivayetsya v `/settings`).
- **Kartochki/kolody** lezhat v `/repo/decks/<deckId>/{deck.json,cards.json,media/}`.
  Sm. `lib/repository.ts` i `lib/fs.ts`.
- **Tipy** v `lib/types.ts` (Zod-shemy s defaults i preprocess).
- **SRS-logika** (Leitner box 1..5) v `lib/srs.ts`.
- **TTS** cherez Web Speech API v `lib/tts.ts`.
- **Tema** dark/light cherez `ThemeProvider`, klassy `theme-light` / `dark`
  na `<html>`.
- **Yazyk obshcheniya s pol'zovatelem**: russkiy translit (sm.
  `~/.claude/projects/.../memory/feedback_response_style.md`).

## Vhodnye tochki dlya issledovaniya

- Glavnaya: `app/page.tsx` -> spisok kolod (`components/DeckCard.tsx`).
- Kolody: `app/deck/page.tsx` -> spisok kart (`components/CardPreview.tsx`).
- Redaktor karty: `app/card/page.tsx`.
- Test/izucheniye: `app/study/page.tsx` (dva komponenta: `StudySetup`,
  `StudySession`).
- Nastrojki kolody (TTS, taymingi): `app/options/page.tsx`.
- Globalnye nastroyki + Git: `app/settings/page.tsx`.
- Stili: `app/globals.css` (CSS vars + komponentnye klassy `deck-card`,
  `card-tile`, `pill-button`, `field`, `menu-panel`, `flip-card/inner/face`).

## Komandy razrabotki

```
npm run dev        # next dev --port 3210
npm run build      # next build (prod)
npm run lint       # next lint
npx tsc --noEmit   # type check (proshyel chisto na konetz sessii)
```

## Memory (pamyat' assistenta dlya etogo proekta)

`C:\Users\Kirill\.claude\projects\D---UsingFiles--Job--Services-flashcards-editor\memory\`

Aktual'nye zapisi:
- `feedback_response_style.md` — otvechat' translitom.
- `feedback_session_summary_doc.md` — pisat' `docs/YYYY-MM-DD-*.md` posle
  zadach.

## Sleduyushchiy logichnyj shag

Pol'zovatel' eshchyo ne provel ruchnoj test izmeneniy v brauzere. Posle togo
kak on ego sdelaet, ozhidayem novye pravki tipa:
- «menyu vsyo eshchyo obrezayetsya» -> proverit' `overflow` / `z-index` na
  `.deck-card`;
- «kartochka v teste skachet» -> ottyuningovat' procenty `35%` / `flex-1` v
  `CardFace`;
- novye trebovaniya iz spiska otkrytyh voprosov.

Esli pol'zovatel' prosit «prodolzhi», ne pridumyvaj svoyu zadachu — pereyti
k samomu prioritetnomu otkrytomu voprosu (oblozhka kolody krupno) i utochni
formulirovku.
