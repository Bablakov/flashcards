#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const docDir = path.join(root, "documentation");
const outDir = path.join(root, "public", "seed-data");

function nowIso() {
  return new Date().toISOString();
}

function nano() {
  return Math.random().toString(36).slice(2, 12);
}

async function readCsv(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const cells = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') {
          inQ = false;
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQ = true;
      } else if (c === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  };

  const header = cells(lines[0]).map((s) => s.trim());
  const frontIdx = header.findIndex((h) => /front/i.test(h));
  const backIdx = header.findIndex((h) => /back/i.test(h));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const r = cells(lines[i]);
    const front = (r[frontIdx] ?? "").trim();
    const back = (r[backIdx] ?? "").trim();
    if (!front && !back) continue;
    if (/^Этот столбец/.test(front)) continue;
    rows.push({ front, back });
  }
  return rows;
}

async function buildBusinessDeck() {
  const csvFile = (await fs.readdir(docDir)).find((f) => /\.csv$/i.test(f));
  if (!csvFile) throw new Error("Не нашёл CSV в documentation/");
  const rows = await readCsv(path.join(docDir, csvFile));

  const deckId = "sample-business";
  const now = nowIso();
  const deck = {
    id: deckId,
    name: "Пример: Бизнес",
    color: "#e36b6b",
    settings: {
      frontLanguage: "en",
      backLanguage: "ru",
      frontSpeechSpeed: 1,
      backSpeechSpeed: 1,
      flipDelay: 0,
      nextDelay: 0,
    },
    cardCount: rows.length,
    createdAt: now,
    updatedAt: now,
  };

  const cards = rows.map((r) => ({
    id: nano(),
    front: { text: r.front, image: null, audio: null },
    back: { text: r.back, image: null, audio: null },
    level: 0,
    tags: ["sample"],
    createdAt: now,
    updatedAt: now,
  }));

  const dir = path.join(outDir, "decks", deckId);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(dir, "media"), { recursive: true });
  await fs.writeFile(path.join(dir, "deck.json"), JSON.stringify(deck, null, 2));
  await fs.writeFile(path.join(dir, "cards.json"), JSON.stringify(cards, null, 2));

  return { deckId, cardCount: cards.length };
}

async function buildStarterDecks() {
  const starters = [
    { id: "psychology", name: "Психология", color: "#7c3aed" },
    { id: "gamedev", name: "GameDev", color: "#06b6d4" },
    { id: "personal-brand", name: "Личный бренд", color: "#f59e0b" },
  ];
  const out = [];
  const now = nowIso();
  for (const s of starters) {
    const deck = {
      id: s.id,
      name: s.name,
      color: s.color,
      settings: {
        frontLanguage: "ru",
        backLanguage: "ru",
        frontSpeechSpeed: 1,
        backSpeechSpeed: 1,
        flipDelay: 0,
        nextDelay: 0,
      },
      cardCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const dir = path.join(outDir, "decks", s.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "media"), { recursive: true });
    await fs.writeFile(path.join(dir, "deck.json"), JSON.stringify(deck, null, 2));
    await fs.writeFile(path.join(dir, "cards.json"), JSON.stringify([], null, 2));
    out.push({ deckId: s.id, cardCount: 0 });
  }
  return out;
}

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const summary = [];
  summary.push(await buildBusinessDeck());
  summary.push(...(await buildStarterDecks()));

  const manifest = {
    generatedAt: nowIso(),
    decks: summary.map((s) => s.deckId),
    note:
      "Этот seed подгружается приложением только если у пользователя ещё нет ни одной колоды. После Git-синхронизации он не перезаписывается.",
  };
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log("[seed] generated decks:");
  for (const s of summary) {
    console.log(`  - ${s.deckId} (${s.cardCount} cards)`);
  }
  console.log(`[seed] output: ${path.relative(root, outDir)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
