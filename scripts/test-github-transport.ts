/**
 * Проверка транспорта «git через GitHub API» на настоящем репозитории.
 *
 *   npx tsx scripts/test-github-transport.ts             — только чтение: clone и сверка
 *   npx tsx scripts/test-github-transport.ts --write     — плюс запись во временную ветку
 *
 * Токен — из GITHUB_TOKEN или `gh auth token`, репозиторий — FLASHCARDS_REPO
 * (по умолчанию Bablakov/flashcards-data). При записи создаётся ветка
 * web-transport-test-<время>, в конце она удаляется; ветку main тест не трогает,
 * и это проверяется на каждом запросе, а не только обещается.
 *
 * Сверка идёт с настоящим git: он клонирует ту же ветку, гоняет fsck и
 * сравнивает хеши — то есть проверяется ровно то, что увидят ПК и телефон.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";
import * as git from "isomorphic-git";
import type { HttpClient } from "isomorphic-git";
import { githubApiRequest } from "../lib/github-api-transport";

const write = process.argv.includes("--write");
const repoName = process.env.FLASHCARDS_REPO ?? "Bablakov/flashcards-data";
const token = process.env.GITHUB_TOKEN ?? execSync("gh auth token").toString().trim();
const url = `https://github.com/${repoName}.git`;
const branch = `web-transport-test-${Date.now()}`;
const author = { name: "Flashcards Web Test", email: "web-test@flashcards.local", timezoneOffset: -180 };

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failed++;
}

let requests = 0;
function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  requests++;
  const u = String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : "";
  if (method !== "GET" && u.includes("/git/refs") && !u.includes(branch) && !body.includes(branch)) {
    throw new Error(`ЗАЩИТА: попытка изменить чужую ветку: ${method} ${u} ${body}`);
  }
  // В Node у fetch нет HTTP-кэша браузера, параметр cache ему не нужен.
  const { cache: _ignored, ...rest } = init ?? {};
  return fetch(input, rest);
}

function httpFor(dir: string): HttpClient {
  return {
    request: (req) =>
      githubApiRequest(req, {
        fetch: guardedFetch as typeof fetch,
        hasObject: async (oid) => {
          try {
            await git.readObject({ fs, dir, oid, format: "deflated" });
            return true;
          } catch {
            return false;
          }
        },
        onProgress: (m) => console.log(`        · ${m}`),
      }),
  };
}

const onAuth = () => ({ username: "x-access-token", password: token });

function sh(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

async function api(pathname: string, method = "GET"): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repoName}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fc-transport-"));
  process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
  const dirA = path.join(tmp, "a");
  const dirB = path.join(tmp, "b");
  console.log(`Репозиторий ${repoName}, папка ${tmp}`);

  console.log("1. clone --depth 1 через API");
  const t0 = Date.now();
  await git.clone({ fs, http: httpFor(dirA), dir: dirA, url, ref: "main", singleBranch: true, depth: 1, onAuth });
  const headA = await git.resolveRef({ fs, dir: dirA, ref: "HEAD" });
  const remoteMain = ((await (await api("/git/ref/heads/main")).json()) as { object: { sha: string } }).object.sha;
  check("HEAD совпадает с main на GitHub", headA === remoteMain, `${headA.slice(0, 7)}, ${requests} запросов, ${Date.now() - t0} мс`);
  const matrix = await git.statusMatrix({ fs, dir: dirA });
  check("рабочая копия чистая", matrix.every(([, h, w, s]) => h === 1 && w === 1 && s === 1), `${matrix.length} файлов`);

  const realMain = path.join(tmp, "real-main");
  const auth = `-c http.extraHeader="Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}"`;
  sh(`git ${auth} clone --quiet --depth 1 --branch main ${url} "${realMain}"`);
  check("настоящий git видит тот же коммит", sh("git rev-parse HEAD", realMain) === headA);
  const realFiles = sh("git ls-files", realMain).split("\n").length;
  check("число файлов совпадает", realFiles === matrix.length, `${realFiles}`);

  if (!write) {
    console.log(failed ? `\nПровалено: ${failed}` : "\nЧтение работает. Для проверки записи: --write");
    process.exit(failed ? 1 : 0);
  }

  try {
    console.log(`2. push во временную ветку ${branch}`);
    await git.branch({ fs, dir: dirA, ref: branch, checkout: true });
    fs.mkdirSync(path.join(dirA, "web-test", "вложенная"), { recursive: true });
    fs.writeFileSync(path.join(dirA, "web-test", "a.json"), JSON.stringify({ from: "web", n: 1 }, null, 2));
    fs.writeFileSync(path.join(dirA, "web-test", "вложенная", "тест.txt"), "кириллица в имени и тексте\n");
    fs.writeFileSync(path.join(dirA, "web-test", "bin.dat"), Buffer.from(Array.from({ length: 70000 }, (_, i) => (i * 7919) % 256)));
    for (const f of ["web-test/a.json", "web-test/вложенная/тест.txt", "web-test/bin.dat"]) {
      await git.add({ fs, dir: dirA, filepath: f });
    }
    const c1 = await git.commit({ fs, dir: dirA, message: "web: первый коммит", author });
    requests = 0;
    await git.push({ fs, http: httpFor(dirA), dir: dirA, remote: "origin", ref: branch, onAuth });
    const remoteBranch = async () =>
      ((await (await api(`/git/ref/heads/${branch}`)).json()) as { object: { sha: string } }).object.sha;
    check("ветка на GitHub = локальный коммит", (await remoteBranch()) === c1, `${requests} запросов`);

    sh(`git ${auth} clone --quiet --branch ${branch} ${url} "${dirB}"`);
    check("настоящий git: тот же коммит", sh("git rev-parse HEAD", dirB) === c1);
    sh("git fsck --full --strict", dirB);
    check("git fsck без ошибок", true);
    check(
      "двоичный файл цел",
      Buffer.compare(fs.readFileSync(path.join(dirB, "web-test", "bin.dat")), fs.readFileSync(path.join(dirA, "web-test", "bin.dat"))) === 0,
    );

    console.log("3. параллельные правки: настоящий git и веб, затем pull со слиянием");
    fs.writeFileSync(path.join(dirB, "web-test", "a.json"), JSON.stringify({ from: "pc", n: 2 }, null, 2));
    sh('git -c user.name=PC -c user.email=pc@local commit --quiet -am "pc: правка"', dirB);
    sh(`git ${auth} push --quiet origin ${branch}`, dirB);
    const pcCommit = sh("git rev-parse HEAD", dirB);

    fs.writeFileSync(path.join(dirA, "web-test", "web-only.json"), "{}\n");
    await git.add({ fs, dir: dirA, filepath: "web-test/web-only.json" });
    await git.commit({ fs, dir: dirA, message: "web: своя правка", author });
    requests = 0;
    await git.pull({ fs, http: httpFor(dirA), dir: dirA, ref: branch, singleBranch: true, fastForward: true, author, onAuth });
    const merged = await git.resolveRef({ fs, dir: dirA, ref: "HEAD" });
    const mergeCommit = await git.readCommit({ fs, dir: dirA, oid: merged });
    check("pull сделал слияние", mergeCommit.commit.parent.length === 2 && mergeCommit.commit.parent.includes(pcCommit), `${requests} запросов`);
    check("правка с ПК доехала", fs.readFileSync(path.join(dirA, "web-test", "a.json"), "utf8").includes('"pc"'));

    requests = 0;
    await git.push({ fs, http: httpFor(dirA), dir: dirA, remote: "origin", ref: branch, onAuth });
    check("слияние отправлено", (await remoteBranch()) === merged, `${requests} запросов`);
    sh(`git ${auth} pull --quiet --ff-only origin ${branch}`, dirB);
    check("настоящий git получил то же слияние", sh("git rev-parse HEAD", dirB) === merged);
    sh("git fsck --full --strict", dirB);
    check("git fsck после слияния без ошибок", true);

    console.log("4. отказ при устаревшей ветке (кто-то успел раньше)");
    fs.writeFileSync(path.join(dirB, "web-test", "late.json"), "1\n");
    sh("git add -A", dirB);
    sh('git -c user.name=PC -c user.email=pc@local commit --quiet -m "pc: вперёд"', dirB);
    sh(`git ${auth} push --quiet origin ${branch}`, dirB);
    fs.writeFileSync(path.join(dirA, "web-test", "web2.json"), "2\n");
    await git.add({ fs, dir: dirA, filepath: "web-test/web2.json" });
    await git.commit({ fs, dir: dirA, message: "web: опоздавшая", author });
    let rejected = false;
    try {
      await git.push({ fs, http: httpFor(dirA), dir: dirA, remote: "origin", ref: branch, onAuth });
    } catch (e) {
      rejected = /fast-forward|fetch first|rejected|PushRejected|GitPushError/i.test(`${(e as Error).name} ${(e as Error).message}`);
    }
    check("push отклонён, чужой коммит не затёрт", rejected && (await remoteBranch()) === sh("git rev-parse HEAD", dirB));
  } finally {
    const res = await api(`/git/refs/heads/${branch}`, "DELETE");
    console.log(`Временная ветка удалена: HTTP ${res.status}`);
    const mainAfter = ((await (await api("/git/ref/heads/main")).json()) as { object: { sha: string } }).object.sha;
    check("main не изменился", mainAfter === remoteMain);
  }

  console.log(failed ? `\nПровалено: ${failed}` : "\nВсё прошло");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
