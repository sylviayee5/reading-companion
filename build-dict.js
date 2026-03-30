#!/usr/bin/env node

/**
 * build-dict.js (v2)
 * 读取本地 ecdict.csv，按首字母分片为 JSON 文件
 */

const fs = require("fs");
const path = require("path");
const { createInterface } = require("readline");

const CSV_PATH = path.join(__dirname, "ecdict.csv");
const DICT_DIR = path.join(__dirname, "dict");

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

async function main() {
  console.log("=".repeat(50));
  console.log("📖 阅读伴侣 - 离线词库构建工具 v2");
  console.log("=".repeat(50));

  if (!fs.existsSync(CSV_PATH)) {
    console.error("\n❌ 找不到 ecdict.csv");
    console.error("请先运行: curl -L -o ecdict.csv \"https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv\"");
    process.exit(1);
  }

  if (!fs.existsSync(DICT_DIR)) fs.mkdirSync(DICT_DIR, { recursive: true });

  console.log(`\n📄 读取 ${CSV_PATH}`);
  console.log("🔧 解析中...\n");

  const shards = {};
  for (let i = 0; i < 26; i++) shards[String.fromCharCode(97 + i)] = {};
  shards["other"] = {};

  const rl = createInterface({ input: fs.createReadStream(CSV_PATH, { encoding: "utf-8" }), crlfDelay: Infinity });
  let headers = null, colIndex = {}, count = 0, skipped = 0;

  for await (const line of rl) {
    if (!headers) {
      headers = parseCSVLine(line).map(h => h.trim().toLowerCase());
      headers.forEach((h, i) => { colIndex[h] = i; });
      console.log(`   列: ${headers.join(", ")}`);
      continue;
    }

    const cols = parseCSVLine(line);
    const word = (cols[colIndex["word"]] || "").trim().toLowerCase();
    if (!word) { skipped++; continue; }
    if (word.split(/\s+/).length > 2) { skipped++; continue; }

    const phonetic = (cols[colIndex["phonetic"]] || "").trim();
    const definition = (cols[colIndex["definition"]] || "").trim();
    const translation = (cols[colIndex["translation"]] || "").trim();
    const pos = (cols[colIndex["pos"]] || "").trim();
    const exchange = (cols[colIndex["exchange"]] || "").trim();
    const frq = parseInt(cols[colIndex["frq"]] || "0", 10) || 0;

    if (!definition && !translation) { skipped++; continue; }

    const entry = {};
    if (phonetic) entry.p = phonetic;
    if (definition) entry.d = definition;
    if (translation) entry.t = translation;
    if (pos) entry.o = pos;
    if (exchange) entry.e = exchange;
    if (frq > 0) entry.f = frq;

    const fc = word[0];
    if (fc >= "a" && fc <= "z") shards[fc][word] = entry;
    else shards["other"][word] = entry;

    count++;
    if (count % 50000 === 0) process.stdout.write(`\r   已处理: ${count.toLocaleString()} 条`);
  }

  console.log(`\r   已处理: ${count.toLocaleString()} 条 (跳过: ${skipped.toLocaleString()})\n`);
  console.log("💾 写入 JSON 分片...\n");

  const indexData = {};
  let totalSize = 0;

  for (const [key, words] of Object.entries(shards)) {
    const wc = Object.keys(words).length;
    if (wc === 0) continue;
    const json = JSON.stringify(words);
    fs.writeFileSync(path.join(DICT_DIR, `${key}.json`), json, "utf-8");
    const sz = Buffer.byteLength(json, "utf-8");
    totalSize += sz;
    indexData[key] = { count: wc, size: sz };
    console.log(`   ${key}.json: ${wc.toLocaleString()} 词 (${(sz / 1024).toFixed(0)} KB)`);
  }

  fs.writeFileSync(path.join(DICT_DIR, "index.json"), JSON.stringify({ totalWords: count, shards: indexData, version: "1.0" }), "utf-8");

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 完成！${count.toLocaleString()} 词，${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   输出: ${DICT_DIR}`);
  console.log(`${"=".repeat(50)}`);
}

main().catch(e => { console.error(`\n❌ ${e.message}`); process.exit(1); });
