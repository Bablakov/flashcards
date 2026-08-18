/**
 * Проверки чистой логики формата 2: журнал → прогресс, слияние файлов, дерево групп.
 * Запуск: npm run test:model
 *
 * Это самая ответственная часть — от неё зависит, не потеряются ли данные при
 * синхронизации двух устройств, поэтому проверки живут в репозитории, а не «ad hoc».
 */

import {
  replay,
  reviewsByDay,
  currentStreak,
  bestStreak,
  forecast,
  EMPTY_PROGRESS,
  type CardProgress,
} from "../lib/progress";
import { flashcardsMergeDriver } from "../lib/merge";
import { childrenOf, descendantIds, pathTo, canReparent } from "../lib/store";
import { affectsProgress, buildSession, firstSide, poolStats, type StudyItem } from "../lib/session";
import type { JournalEvent } from "../lib/model";
import type { Group } from "../lib/model";

let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
  }
}

function ev(over: Partial<JournalEvent>): JournalEvent {
  return { k: "rate", t: "2026-08-18T10:00:00Z", card: "c1", ...over } as JournalEvent;
}

function group(id: string, parentId: string | null, order = 0): Group {
  return {
    id,
    name: id,
    parentId,
    order,
    color: "#000",
    cover: null,
    description: "",
    settings: { frontLanguage: "ru", backLanguage: "en", flipDelay: 0, nextDelay: 0 },
    deleted: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

console.log("\nЖурнал → прогресс (FSRS)");
{
  const st = replay([
    ev({ rating: "good" }),
    ev({ rating: "good", t: "2026-08-19T10:00:00Z" }),
    ev({ rating: "good", t: "2026-08-27T10:00:00Z" }),
  ]);
  const c = st.get("c1")!;
  check("серия «хорошо» растит стабильность", c.stability > 7);
  check("уровень поднимается вместе со стабильностью", c.box >= 4);
  check("дата следующего повтора назначена", !!c.due && c.due > "2026-08-27");
  check("счётчики накапливаются", c.goodCount === 3 && c.reviewCount === 3);
  check("время последнего ответа сохраняется", c.lastReviewedAt === "2026-08-27T10:00:00Z");
}
{
  const grown = replay([
    ev({ rating: "good" }),
    ev({ rating: "good", t: "2026-08-19T10:00:00Z" }),
    ev({ rating: "good", t: "2026-08-27T10:00:00Z" }),
  ]).get("c1")!;
  const lapsed = replay([
    ev({ rating: "good" }),
    ev({ rating: "good", t: "2026-08-19T10:00:00Z" }),
    ev({ rating: "good", t: "2026-08-27T10:00:00Z" }),
    ev({ rating: "bad", t: "2026-09-10T10:00:00Z" }),
  ]).get("c1")!;
  check("«не помню» роняет стабильность", lapsed.stability < grown.stability);
  check("«не помню» опускает уровень", lapsed.box < grown.box);
  check("ошибка учтена в счётчике", lapsed.badCount === 1);
}
{
  const hard = replay([
    ev({ rating: "good" }),
    ev({ rating: "neutral", t: "2026-08-19T10:00:00Z" }),
  ]).get("c1")!;
  const good = replay([
    ev({ rating: "good" }),
    ev({ rating: "good", t: "2026-08-19T10:00:00Z" }),
  ]).get("c1")!;
  check("«что-то помню» растит слабее, чем «хорошо»", hard.stability < good.stability);
}
{
  const st = replay([
    { k: "set", t: "2026-08-01T00:00:00Z", card: "c1", box: 4, good: 7, bad: 1, rev: 8 },
  ]);
  const c = st.get("c1")!;
  check("миграция переносит уровень", c.box === 4);
  check("миграция переносит счётчики", c.goodCount === 7 && c.reviewCount === 8);
  check("после миграции карточка не «новая»", c.state === "review");
}
{
  const st = replay([ev({ card: "a", rating: "good" }), ev({ card: "b", rating: "bad" })]);
  check("карточки не влияют друг на друга", st.get("a")!.box >= st.get("b")!.box);
}
{
  const st = replay([ev({ rating: "good" })], 0.95);
  const st9 = replay([ev({ rating: "good" })], 0.9);
  check(
    "выше целевая удерживаемость — повтор не позже",
    (st.get("c1")!.due ?? "") <= (st9.get("c1")!.due ?? ""),
  );
}

console.log("\nОтчёт");
{
  const byDay = reviewsByDay([
    ev({ t: "2026-08-16T10:00:00Z" }),
    ev({ t: "2026-08-17T10:00:00Z" }),
    ev({ t: "2026-08-18T10:00:00Z" }),
    ev({ t: "2026-08-18T11:00:00Z" }),
  ]);
  check("ответы группируются по дням", byDay["2026-08-18"] === 2 && byDay["2026-08-16"] === 1);
  check("серия считается подряд", currentStreak(byDay, new Date("2026-08-18T20:00:00Z")) === 3);
  check("пропуск обрывает серию", currentStreak(byDay, new Date("2026-08-20T20:00:00Z")) === 0);
  check(
    "вчерашний повтор серию сохраняет",
    currentStreak(byDay, new Date("2026-08-19T20:00:00Z")) === 3,
  );
  check("лучшая серия за всю историю", bestStreak(byDay) === 3);

  const f = forecast(
    [
      { ...EMPTY_PROGRESS, due: "2026-08-18T10:00:00Z" },
      { ...EMPTY_PROGRESS, due: "2026-08-19T10:00:00Z" },
      { ...EMPTY_PROGRESS, due: "2026-08-19T18:00:00Z" },
      { ...EMPTY_PROGRESS, due: "2027-01-01T00:00:00Z" },
    ],
    7,
    new Date("2026-08-18T00:00:00Z"),
  );
  check("прогноз нагрузки по дням", f["2026-08-19"] === 2 && f["2026-08-18"] === 1);
  check("далёкие повторы в недельный прогноз не попадают", Object.values(f).reduce((a, b) => a + b, 0) === 3);
}

console.log("\nСборка сессии");
{
  const mk = (id: string, p: Partial<CardProgress>): StudyItem => ({
    card: {
      id,
      front: { text: id, image: null, audio: null },
      back: { text: id, image: null, audio: null },
      box: (p.box ?? 1) as never,
      goodCount: p.goodCount ?? 0,
      badCount: p.badCount ?? 0,
      reviewCount: p.reviewCount ?? 0,
      lastReviewedAt: p.lastReviewedAt ?? null,
      tags: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    groupId: "g1",
    progress: { ...EMPTY_PROGRESS, ...p },
  });

  const now = new Date("2026-08-18T12:00:00Z");
  const pool: StudyItem[] = [
    mk("due1", { box: 2, state: "review", reviewCount: 3, due: "2026-08-17T00:00:00Z", stability: 2 }),
    mk("due2", { box: 3, state: "review", reviewCount: 5, due: "2026-08-10T00:00:00Z", stability: 5, badCount: 2 }),
    mk("later", { box: 4, state: "review", reviewCount: 4, due: "2026-09-01T00:00:00Z", stability: 14 }),
    mk("fresh", {}),
    mk("fresh2", {}),
  ];

  const review = buildSession(pool, { mode: "review" }, now);
  check("режим «повторение» берёт только созревшие", review.length === 2);
  check(
    "самая просроченная идёт первой",
    review[0].card.id === "due2",
  );
  check(
    "новые карточки в повторение не попадают",
    !review.some((i) => i.card.id.startsWith("fresh")),
  );

  const fresh = buildSession(pool, { mode: "new" }, now);
  check("режим «новые» берёт только непоказанные", fresh.length === 2);
  check("дневной лимит новых работает", buildSession(pool, { mode: "new", newLimit: 1 }, now).length === 1);

  const training = buildSession(pool, { mode: "training" }, now);
  check("тренировка берёт всё", training.length === 5);
  check("тренировка не меняет прогресс", !affectsProgress("training"));
  check("повторение меняет прогресс", affectsProgress("review"));

  check(
    "фильтр по уровням",
    buildSession(pool, { mode: "training", levels: [3] }, now).length === 1,
  );
  check(
    "фильтр «только с ошибками»",
    buildSession(pool, { mode: "training", onlyErrors: true }, now).length === 1,
  );
  check("ограничение количества", buildSession(pool, { mode: "training", count: 2 }, now).length === 2);
  check(
    "порядок «слабые первыми»",
    buildSession(pool, { mode: "training", order: "weak" }, now)[0].progress.stability === 0,
  );

  const stats = poolStats(pool, now);
  check("сводка пула", stats.total === 5 && stats.due === 2 && stats.new === 2 && stats.learned === 1);
  check("направление «вперемешку» чередует стороны", firstSide("mixed", 0) === "front" && firstSide("mixed", 1) === "back");
  check("направление «обратная» фиксировано", firstSide("back", 0) === "back" && firstSide("back", 5) === "back");
}

console.log("\nСлияние файлов при синхронизации");
{
  const ours = '{"k":"rate","t":"2026-08-18T10:00:00Z","card":"a"}';
  const theirs = '{"k":"rate","t":"2026-08-18T09:00:00Z","card":"b"}';
  const res = flashcardsMergeDriver({
    branches: [],
    contents: ["", ours, theirs],
    path: "journal/dev1/2026-08.jsonl",
  });
  const lines = res.mergedText.trim().split("\n");
  check("журнал объединяется без потерь", lines.length === 2);
  check("журнал сортируется по времени", lines[0].includes('"b"'));
  const again = flashcardsMergeDriver({
    branches: [],
    contents: ["", res.mergedText, ours],
    path: "journal/dev1/2026-08.jsonl",
  });
  check("повторное слияние не дублирует строки", again.mergedText.trim().split("\n").length === 2);
}
{
  const older = JSON.stringify({ id: "c1", updatedAt: "2026-08-01T00:00:00Z", text: "старое" });
  const newer = JSON.stringify({ id: "c1", updatedAt: "2026-08-18T00:00:00Z", text: "новое" });
  check(
    "карточка: побеждает более свежая версия",
    flashcardsMergeDriver({ branches: [], contents: ["", older, newer], path: "cards/c1.json" })
      .mergedText.includes("новое"),
  );
  check(
    "группа: побеждает более свежая версия",
    flashcardsMergeDriver({ branches: [], contents: ["", newer, older], path: "groups/g1.json" })
      .mergedText.includes("новое"),
  );
  check(
    "настройки: побеждает более свежая версия",
    flashcardsMergeDriver({ branches: [], contents: ["", older, newer], path: "settings.json" })
      .mergedText.includes("новое"),
  );
}
{
  const v2 = JSON.stringify({ formatVersion: 2, updatedAt: "2026-08-01T00:00:00Z" });
  const v3 = JSON.stringify({ formatVersion: 3, updatedAt: "2026-07-01T00:00:00Z" });
  const merged = flashcardsMergeDriver({
    branches: [],
    contents: ["", v2, v3],
    path: "meta.json",
  }).mergedText;
  check("meta: побеждает более новый формат данных", JSON.parse(merged).formatVersion === 3);
}

console.log("\nДерево групп");
{
  const groups = [
    group("health", null),
    group("bio", "health"),
    group("anat", "health", 1),
    group("bones", "anat"),
  ];
  check(
    "прямые потомки в порядке order",
    childrenOf(groups, "health")
      .map((g) => g.id)
      .join(",") === "bio,anat",
  );
  check(
    "вся ветка вниз",
    descendantIds(groups, "health").sort().join(",") === "anat,bio,bones,health",
  );
  check(
    "хлебные крошки",
    pathTo(groups, "bones")
      .map((g) => g.id)
      .join("/") === "health/anat/bones",
  );
  check("нельзя перенести группу внутрь своего потомка", !canReparent(groups, "health", "bones"));
  check("перенос в соседнюю ветку разрешён", canReparent(groups, "bones", "bio"));
  check("перенос в корень разрешён", canReparent(groups, "bones", null));
  check("цикл в данных не зацикливает обход", descendantIds([group("a", "b"), group("b", "a")], "a").length === 2);
}

console.log(failed === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ\n" : `\nПРОВАЛЕНО ПРОВЕРОК: ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
