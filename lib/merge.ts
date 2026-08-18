/**
 * 3-way merge для Git-синхронизации (требование «ничего не теряется, всё через Git»).
 *
 * GitHub-конфликт по `cards.json` обычно решался бы last-write-wins на уровне файла —
 * правки одного устройства пропадали бы. Здесь мы сливаем массив карточек по `id`:
 * новейшая версия карты побеждает, удаления уважаются только когда вторая сторона
 * карту не трогала, а конфликт «удалено vs изменено» решается в пользу сохранения.
 *
 * Подключается как `mergeDriver` к `git.pull` (см. lib/git.ts). Драйвер вызывается
 * только когда ОБЕ стороны изменили один и тот же файл с момента общего предка.
 */

interface AnyCard {
  id: string;
  updatedAt?: string;
  [k: string]: unknown;
}

interface AnyDeck {
  id?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

function parseCards(s: string): AnyCard[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as AnyCard[]).filter((c) => c && typeof c.id === "string") : [];
  } catch {
    return [];
  }
}

function ts(c?: { updatedAt?: string }): number {
  if (!c?.updatedAt) return 0;
  const t = Date.parse(c.updatedAt);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Слияние массивов карточек по id.
 * @param base предок (общая точка), @param ours локальная версия, @param theirs удалённая.
 */
export function mergeCardArrays(base: AnyCard[], ours: AnyCard[], theirs: AnyCard[]): AnyCard[] {
  const b = new Map(base.map((c) => [c.id, c]));
  const o = new Map(ours.map((c) => [c.id, c]));
  const t = new Map(theirs.map((c) => [c.id, c]));

  const ids = new Set<string>([...o.keys(), ...t.keys(), ...b.keys()]);
  const kept = new Map<string, AnyCard>();

  for (const id of ids) {
    const oc = o.get(id);
    const tc = t.get(id);
    const bc = b.get(id);

    if (oc && tc) {
      // обе стороны имеют карту — берём новейшую (ничью отдаём локальной)
      kept.set(id, ts(tc) > ts(oc) ? tc : oc);
    } else if (oc && !tc) {
      // у них карты нет: удалена ли намеренно? только если у нас не менялась с предка
      if (bc && ts(oc) === ts(bc)) {
        // theirs удалили, ours не трогали → уважаем удаление
      } else {
        kept.set(id, oc); // ours изменили/создали → сохраняем (правка важнее удаления)
      }
    } else if (!oc && tc) {
      if (bc && ts(tc) === ts(bc)) {
        // ours удалили, theirs не трогали → уважаем удаление
      } else {
        kept.set(id, tc);
      }
    }
    // !oc && !tc — обе удалили → drop
  }

  // Порядок: сначала как у нас, затем новые карты из theirs.
  const order: string[] = [];
  const seen = new Set<string>();
  for (const c of ours) {
    if (kept.has(c.id) && !seen.has(c.id)) {
      order.push(c.id);
      seen.add(c.id);
    }
  }
  for (const c of theirs) {
    if (kept.has(c.id) && !seen.has(c.id)) {
      order.push(c.id);
      seen.add(c.id);
    }
  }
  return order.map((id) => kept.get(id)!);
}

function mergeDeckNewest(baseStr: string, ourStr: string, theirStr: string): string {
  let ours: AnyDeck = {};
  let theirs: AnyDeck = {};
  try {
    ours = JSON.parse(ourStr) as AnyDeck;
  } catch {
    return theirStr || ourStr;
  }
  try {
    theirs = JSON.parse(theirStr) as AnyDeck;
  } catch {
    return ourStr;
  }
  // Метаданные колоды целиком — новейшая по updatedAt побеждает.
  const winner = ts(theirs) > ts(ours) ? theirs : ours;
  return JSON.stringify(winner, null, 2);
}

/**
 * Журнал прогресса: файлы `journal/<устройство>/<месяц>.jsonl` только дописываются,
 * поэтому корректное слияние — объединение строк без потерь. Штатно конфликта
 * не бывает (у каждого устройства свой файл), но если он всё же случился —
 * ни одна строка не должна пропасть.
 */
function mergeJsonl(ourStr: string, theirStr: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const chunk of [ourStr, theirStr]) {
    for (const raw of chunk.split("\n")) {
      const line = raw.trim();
      if (!line || seen.has(line)) continue;
      seen.add(line);
      lines.push(line);
    }
  }
  lines.sort((a, b) => {
    const ta = /"t"\s*:\s*"([^"]+)"/.exec(a)?.[1] ?? "";
    const tb = /"t"\s*:\s*"([^"]+)"/.exec(b)?.[1] ?? "";
    return ta.localeCompare(tb) || a.localeCompare(b);
  });
  return `${lines.join("\n")}\n`;
}

/** meta.json: побеждает более высокая версия формата, иначе — более свежая запись. */
function mergeMeta(ourStr: string, theirStr: string): string {
  let ours: Record<string, unknown> = {};
  let theirs: Record<string, unknown> = {};
  try {
    ours = JSON.parse(ourStr);
  } catch {
    return theirStr || ourStr;
  }
  try {
    theirs = JSON.parse(theirStr);
  } catch {
    return ourStr;
  }
  const ov = Number(ours.formatVersion ?? 0);
  const tv = Number(theirs.formatVersion ?? 0);
  if (tv !== ov) return JSON.stringify(tv > ov ? theirs : ours, null, 2);
  return JSON.stringify(ts(theirs as AnyDeck) > ts(ours as AnyDeck) ? theirs : ours, null, 2);
}

export interface MergeDriverArgs {
  branches: string[];
  contents: string[]; // [base, ours, theirs]
  path: string;
}

export interface MergeDriverResult {
  mergedText: string;
  cleanMerge: boolean;
}

/**
 * mergeDriver для isomorphic-git. contents = [base, ours, theirs].
 */
export function flashcardsMergeDriver({ contents, path }: MergeDriverArgs): MergeDriverResult {
  const base = contents[0] ?? "";
  const ours = contents[1] ?? "";
  const theirs = contents[2] ?? "";

  // Формат 2: файл на объект — конфликт возможен только при правке ОДНОГО объекта
  // на двух устройствах, побеждает более свежий updatedAt.
  if (path.endsWith(".jsonl")) {
    return { mergedText: mergeJsonl(ours, theirs), cleanMerge: true };
  }
  if (path === "meta.json" || path.endsWith("/meta.json")) {
    return { mergedText: mergeMeta(ours, theirs), cleanMerge: true };
  }
  if (
    path.startsWith("cards/") ||
    path.startsWith("groups/") ||
    path === "settings.json" ||
    path.endsWith("/settings.json")
  ) {
    return { mergedText: mergeDeckNewest(base, ours, theirs), cleanMerge: true };
  }

  // Формат 1 (репозитории до миграции): массив карточек в одном файле.
  if (path.endsWith("cards.json")) {
    const merged = mergeCardArrays(parseCards(base), parseCards(ours), parseCards(theirs));
    return { mergedText: JSON.stringify(merged, null, 2), cleanMerge: true };
  }
  if (path.endsWith("deck.json")) {
    return { mergedText: mergeDeckNewest(base, ours, theirs), cleanMerge: true };
  }
  // Прочее (на практике — бинарные медиа при одновременной правке одной карты):
  // оставляем локальную версию, чтобы не превратить бинарник в мусор конфликт-маркерами.
  return { mergedText: ours, cleanMerge: true };
}
