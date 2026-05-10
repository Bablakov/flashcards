"use client";

import Papa from "papaparse";
import { Card } from "./types";

export interface CsvRow {
  front: string;
  back: string;
  level?: string;
  tags?: string;
}

export async function parseCsv(text: string): Promise<CsvRow[]> {
  return await new Promise<CsvRow[]>((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows: CsvRow[] = (res.data ?? []).map((r) => {
          const front =
            r["Лицевая сторона"] ??
            r["Front side"] ??
            r["front"] ??
            r["Front"] ??
            r["Лицевая"] ??
            "";
          const back =
            r["Обратная сторона"] ??
            r["Back side"] ??
            r["back"] ??
            r["Back"] ??
            r["Обратная"] ??
            "";
          return { front, back, level: r["level"], tags: r["tags"] ?? r["Теги"] };
        });
        resolve(
          rows.filter(
            (r) =>
              (r.front || r.back) &&
              r.front !== "Этот столбец будет добавлен как текст лицевой стороны.",
          ),
        );
      },
      error: (err: Error) => reject(err),
    });
  });
}

export function cardsToCsv(cards: Card[]): string {
  const data = cards.map((c) => ({
    "Лицевая сторона": c.front.text,
    "Обратная сторона": c.back.text,
  }));
  return Papa.unparse(data, {
    quotes: true,
    header: true,
    newline: "\r\n",
  });
}
