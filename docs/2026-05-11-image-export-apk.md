# Sessiya 2026-05-11 — kartinki, eksport s media, APK CI

> Predydushchaya sessiya: [`2026-05-10-ux-improvements.md`](./2026-05-10-ux-improvements.md).
> Pamyat' / pravila: pisat' otvety translitom, posle zadach pisat' takie docs.
> Novoe pravilo (2026-05-11): pol'zovatel' ne ispol'zuet `AskUserQuestion`,
> vse arxitekturnye/scope resheniya prinimayu sam.

---

## Chto

1. **Kartinki vezde sokhranyayut proporcii** (`object-cover` → `object-contain`)
   v chetyrek mestakh:
   - `components/ImageInput.tsx` (preview pri dobavlenii kartinki v kartochku)
   - `components/DeckEditorModal.tsx` (preview oblozhki kolody)
   - `components/DeckCard.tsx` (oblozhka kolody na glavnom ekrane)
   - `components/CardPreview.tsx` (mini-tile kartinki v spiske kart kolody)

   Pod kazhdym `<img>` teper' fonovaya plitka (`bg-bg-soft` + ring) — pustoe
   prostranstvo pri uzkoj/vysokoj kartinke ne vyglyadit kak dyra.
   V `DeckCard` esli est' kartinka — fon = gradient bazovogo cveta kolody,
   chtoby `object-contain` vsyo ravno smotrelos' gotovo k publikatsii.

2. **Eksport s kartinkami** — novyj format `.fcdeck` (JSON s base64-vlozheniyami):
   - `lib/pack.ts` — pack/unpack logika. Format:
     ```json
     {
       "format": "flashcards-editor.deck",
       "version": 1,
       "withMedia": true,
       "deck": { "name": "...", "color": "...", "settings": {...}, "image": "..." },
       "cards": [{ "id": "...", "front": {"text", "imageRef", "audioRef"}, ... }],
       "media": { "<refPath>": { "ext": "jpg", "mime": "...", "data": "<base64>" } }
     }
     ```
   - V `app/deck/page.tsx` knopka **Eksport** otkryvaet modalku s 3 variantami:
     - CSV (tol'ko tekst, sovmestim s Excel)
     - `.fcdeck` tol'ko tekst — vse polya kart (teg, prog­ress, box), bez media
     - `.fcdeck` polnyy paket s kartinkami i audio
   - **Import** v `app/deck/page.tsx` i `app/page.tsx` avto-raspoznayot CSV vs
     JSON po pervomu simvolu. JSON proveryaetsya po polyu `format`.

3. **APK avto-bilds cherez GitHub Actions** — `.github/workflows/android.yml`:
   - Trigger: push v `main`, PR, `workflow_dispatch`.
   - Steps: setup Node 20 + JDK 17 + Android SDK → `npm ci` → `npm run seed`
     (continue-on-error) → `npm run build` → `cap add android` (esli net) →
     `cap sync android` → `./gradlew assembleDebug` → upload APK kak artefakt.
   - Pri push s tegom `v*` — sozdaet GitHub Release s pristegnutym APK.
   - **Effekt:** pol'zovatelyu ne nuzhno stavit' Android Studio na PC.
     Zachekauti­l, otkryl Actions → Artifacts → skachal APK → ustanovil na
     telefon.

4. **README obnovlyon** — razdel «Sborka APK (Android)» perepisan: snachala
   CI (rekomenduemyy put'), potom lokal'no cherez Android Studio kak alternativa.

5. **Idei dlya razvitiya** — `docs/2026-05-11-ideas.md` (sgenerirovan otdel'nym
   agentom): konkurentnyy analiz Anki/Quizlet/Memrise/Brainscape/Mochi/RemNote
   i prioritizirovannyj spisok 20+ idey.

## Zachem

- **Kartinki:** pol'zovatel' ognevoy obratnoy svyaz'yu — kartinki obrezayutsya,
  hochet `contain` povsemestno.
- **Eksport s media:** edinstvennaya boyazn' pol'zovatelya po fiche eksporta —
  «pri perenose tepryaem kartinki». Edinyy `.fcdeck` reshает: odin fayl,
  oblicovannyy, prosto kuda-libo zakinut'.
- **APK CI:** pol'zovatel' yavno poprosil «chtoby u menya sobiralsya bild».
  Capacitor uzhe nastroen, no trebuet Android Studio. CI iz GitHub Actions —
  besplatnyy i ne trebuet lokal'nogo SDK.
- **Idei:** otdel'naya prosba na researce.

## Chto eshchyo nuzhno sdelat'

### Sechass aktual'no

1. **Test APK na real'nom telefone.** CI sobiraet debug-APK, no kak ono
   vyglyadit/rabotaet na ustrojstve — TBD. Vozmozhny problemy:
   - `lightning-fs` v IndexedDB v APK kontekste (file:// vs https://). Capacitor
     po umolchaniyu daet `https://localhost`, dolzhno rabotat'.
   - Razresheniya: camera, microphone, storage. V `AndroidManifest.xml`
     dobavyatsya avtomaticheski cherez `cap sync`.
2. **Splash / app icon.** Sejchas - defaultnye Capacitor (zhyolto-belaya ikonka).
   Sleduyushchaya sessiya: dobavit' ikonku iz `public/icon-512.svg` cherez
   `npx cordova-res android` ili `capacitor-assets`.
3. **Ozvuchka v APK.** Web Speech API rabotaet ne na vsekh prosivkakh Android.
   Esli ne rabotaet — perehod na native plugin TTS (`@capacitor-community/text-to-speech`).
4. **Razmer fayla `.fcdeck` s kartinkami.** Base64 razduvaet ishodnyy razmer
   primerno na 33%. Esli kolody bol'shie (100+ kart s kartinkami) — fayl mozhet
   byt' 50+ MB. Sleduyushchij shag: izuchit' `jszip` (~30 KB minified) i sdelat'
   alt format `.fcdeck.zip` s media v podkatalogah.
5. **Importom dolzhna byt' opciya «merge» vs «sozdat' novuyu»**. Sejchas pri
   importe `.fcdeck` v `app/page.tsx` vsegda sozdaetsya novaya kolody. Esli
   user import s ekrana deck, mozhno bylo by «dobavit' karty k tekushchey kolode».
   Otmechu kak nice-to-have.

### Po idejam (cm. `docs/2026-05-11-ideas.md`)

Tam podrobnyy roadmap s prioritetami. Glavnye kandidaty na sleduyushchuyu
sessiyu:
- Cloze deletion (`{{c1::word}}` syntax) — banal'no nuzhno dlya yazykov.
- AI-generaciya kart iz teksta — Claude API, prosto inpostavit' v `app/deck/page.tsx`
  novuyu knopku «Sozdat' iz teksta».
- Native TTS plugin dlya stabil'noj ozvuchki v APK.

## Tip-chek i sborka

```
npx tsc --noEmit   # chisto
npm run build      # ✓ Compiled successfully in 45s
```

Linting takzhe chistyy, nichego ne lomalos'.

## Fajly izmenenyi v etoj sessii

| Fajl | Smysl |
|---|---|
| `components/ImageInput.tsx` | `object-cover` → `object-contain` + fonovaya plitka |
| `components/DeckEditorModal.tsx` | `object-cover` → `object-contain` + fonovaya plitka |
| `components/DeckCard.tsx` | `object-cover` → `object-contain` + gradient-fon |
| `components/CardPreview.tsx` | `object-cover` → `object-contain` + ring/bg |
| `lib/pack.ts` *novyy* | Pack/unpack kolody → `.fcdeck` (s media ili bez) |
| `app/deck/page.tsx` | Modalka vybora eksporta (CSV / fcdeck text / fcdeck media); avto-detect formata pri importe |
| `app/page.tsx` | Knopka «Import» — load `.fcdeck` na glavnom ekrane |
| `README.md` | Razdel sborki APK perepisan — snachala CI |
| `.github/workflows/android.yml` *novyy* | Avto-bild debug APK na push, release na teg |
| `docs/2026-05-11-image-export-apk.md` *novyy* | Etot fajl |
| `docs/2026-05-11-ideas.md` *novyy* | Konkurentnyy analiz + idei |
| `memory/feedback_no_questions.md` *novyy* | Ne ispol'zovat' AskUserQuestion |
| `memory/MEMORY.md` | Index obnovlen |

## Prinyatye resheniya (bez user-questions)

Pol'zovatel' otmenil `AskUserQuestion`, poetomu vsye resheniya prinyaty samostoyatel'no:

| Vopros | Vybor | Pochemu |
|---|---|---|
| APK build | GitHub Actions CI | Besplatno, ne trebuet Android Studio, ostavlyaet lokal'nyy variant kak alternativu. RN/Expo bylo by perepisyvaniem — slishkom dorogo. |
| Format eksporta s media | `.fcdeck` (JSON + base64) | Odin fajl, ne nuzhna dop. lib (`jszip`); base64-overhead priemlemyy dlya 95% kolod. ZIP — TODO esli kolody stanut bolshimi. |
| Karta v `CardPreview` (20×20 tile) | `object-contain` s bg | Pol'zovatel' skazal «vse kartinki» — tile s bg vyglyadit normal'no. |
| Idei | Otdel'nyy agent + MD-doc | Pol'nyy analiz s WebSearch lutshe chem moi guesses; agent v background ne blokiruet glavnuyu rabotu. |

## Sleduyushchij shag (esli user vernyotsya s «prodolzhi»)

1. **Skachat'/sobrat' APK** — pomoch' nastroit' repo na GitHub, pushnut',
   pokazat' Actions.
2. **Test na telefone** — vyyavit' bagi (microphone permission, TTS, sync).
3. **Vzyat' top-1 ideyu iz `2026-05-11-ideas.md`** i nachat' realizatsiyu.

Esli vse rabotaet — perekhod k AI-generaciji kart (Claude API), eto naibol'shij
uplift po obrasovaniyu pol'zovatelya na vremeni.
