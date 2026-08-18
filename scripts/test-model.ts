/**
 * Проверки чистой логики формата 2: журнал → прогресс, слияние файлов, дерево групп.
 * Запуск: npm run test:model
 *
 * Это самая ответственная часть — от неё зависит, не потеряются ли данные при
 * синхронизации двух устройств, поэтому проверки живут в репозитории, а не «ad hoc».
 */

import { replay, reviewsByDay, currentStreak } from "../lib/progress";
import { flashcardsMergeDriver } from "../lib/merge";
import { childrenOf, descendantIds, pathTo, canReparent } from "../lib/store";
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

console.log("\nЖурнал → прогресс");
{
  const st = replay([
    ev({ rating: "good" }),
    ev({ rating: "good", t: "2026-08-18T10:01:00Z" }),
    ev({ rating: "bad", t: "2026-08-18T10:02:00Z" }),
  ]);
  const c = st.get("c1")!;
  check("«плохо» возвращает в уровень 1", c.box === 1);
  check("счётчики накапливаются", c.goodCount === 2 && c.badCount === 1 && c.reviewCount === 3);
  check("время последнего ответа сохраняется", c.lastReviewedAt === "2026-08-18T10:02:00Z");
}
{
  const st = replay([ev({ rating: "good" }), ev({ rating: "neutral", t: "2026-08-18T10:01:00Z" })]);
  check("«нейтрально» оставляет уровень на месте", st.get("c1")!.box === 2);
}
{
  const st = replay([
    { k: "set", t: "2026-08-01T00:00:00Z", card: "c1", box: 4, good: 7, bad: 1, rev: 8 },
    ev({ rating: "good", t: "2026-08-02T00:00:00Z" }),
  ]);
  const c = st.get("c1")!;
  check("миграция задаёт уровень, дальше он растёт", c.box === 5 && c.goodCount === 8);
}
{
  const many = Array.from({ length: 8 }, (_, i) =>
    ev({ rating: "good", t: `2026-08-18T1${i}:00:00Z` }),
  );
  check("уровень не превышает 5", replay(many).get("c1")!.box === 5);
}
{
  const st = replay([ev({ card: "a", rating: "good" }), ev({ card: "b", rating: "bad" })]);
  check("карточки не влияют друг на друга", st.get("a")!.box === 2 && st.get("b")!.box === 1);
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
