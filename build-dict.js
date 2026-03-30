#!/usr/bin/env node

/**
 * build-dict.js
 * 
 * 阅读伴侣 - 离线词库构建脚本
 * 
 * 功能：
 * 1. 从 GitHub 下载 ECDICT 开源英汉词典 CSV
 * 2. 解析并提取关键字段（单词、音标、中英文释义、词频、时态）
 * 3. 按首字母分片为 26 个 JSON 文件
 * 4. 生成索引文件
 * 
 * 用法：node build-dict.js
 * 
 * 依赖：无（纯 Node.js 标准库）
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");
const { createInterface } = require("readline");

// ECDICT CSV 下载地址（GitHub Release）
const ECDICT_URL = "https://github.com/skywind3000/ECDICT/releases/download/1.0.28/ecdict-csv.zip";
const DICT_DIR = path.join(__dirname, "dict");
const TEMP_DIR = path.join(__dirname, ".temp");
const ZIP_PATH = path.join(TEMP_DIR, "ecdict.zip");

// ============================================================
// 工具函数
// ============================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`📥 正在下载 ECDICT 词库...`);
    console.log(`   来源: ${url}`);

    const follow = (url, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error("重定向次数过多"));

      const lib = url.startsWith("https") ? https : require("http");
      lib.get(url, { headers: { "User-Agent": "reading-companion-builder" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log(`   ↪ 重定向中...`);
          return follow(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`下载失败: HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        let downloaded = 0;
        const file = fs.createWriteStream(dest);

        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (totalBytes > 0) {
            const pct = ((downloaded / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\r   下载进度: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
          }
        });

        res.pipe(file);
        file.on("finish", () => {
          file.close();
          console.log("\n   ✅ 下载完成");
          resolve();
        });
        file.on("error", reject);
      }).on("error", reject);
    };

    follow(url);
  });
}

async function unzip(zipPath, destDir) {
  console.log("📦 正在解压...");

  // 使用 Node.js 内置的方式读取 ZIP
  // ZIP 格式比较简单，我们直接用 child_process 调用系统 unzip
  const { execSync } = require("child_process");
  try {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: "pipe" });
    console.log("   ✅ 解压完成");
  } catch (e) {
    // 如果系统没有 unzip，尝试 python
    try {
      execSync(
        `python3 -c "import zipfile; zipfile.ZipFile('${zipPath}').extractall('${destDir}')"`,
        { stdio: "pipe" }
      );
      console.log("   ✅ 解压完成 (via python3)");
    } catch (e2) {
      throw new Error(
        "解压失败：需要系统安装 unzip 或 python3。\n" +
        "Mac 用户可运行: brew install unzip\n" +
        "或者手动解压 .temp/ecdict.zip 到 .temp/ 目录"
      );
    }
  }
}

// ============================================================
// CSV 解析（不依赖第三方库）
// ============================================================

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("=".repeat(50));
  console.log("📖 阅读伴侣 - 离线词库构建工具");
  console.log("=".repeat(50));
  console.log("");

  ensureDir(TEMP_DIR);
  ensureDir(DICT_DIR);

  // Step 1: 下载
  if (!fs.existsSync(ZIP_PATH)) {
    await downloadFile(ECDICT_URL, ZIP_PATH);
  } else {
    console.log("📥 发现已下载的 ZIP 文件，跳过下载");
  }

  // Step 2: 解压
  const csvCandidates = ["ecdict.csv", "stardict.csv", "ECDICT/ecdict.csv", "ECDICT/stardict.csv"];
  let csvPath = null;

  for (const candidate of csvCandidates) {
    const p = path.join(TEMP_DIR, candidate);
    if (fs.existsSync(p)) { csvPath = p; break; }
  }

  if (!csvPath) {
    await unzip(ZIP_PATH, TEMP_DIR);
    // 查找解压后的 CSV 文件
    const findCSV = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith(".csv")) return full;
        if (entry.isDirectory()) {
          const found = findCSV(full);
          if (found) return found;
        }
      }
      return null;
    };
    csvPath = findCSV(TEMP_DIR);
  }

  if (!csvPath) {
    console.error("❌ 找不到 CSV 文件，请检查 .temp/ 目录");
    process.exit(1);
  }

  console.log(`\n📄 使用 CSV: ${path.basename(csvPath)}`);

  // Step 3: 解析 CSV 并分片
  console.log("🔧 正在解析词库并分片...\n");

  const shards = {};
  for (let i = 0; i < 26; i++) {
    shards[String.fromCharCode(97 + i)] = {};
  }
  shards["other"] = {};

  // 读取 CSV 头部确定列索引
  const fileStream = fs.createReadStream(csvPath, { encoding: "utf-8" });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  let count = 0;
  let skipped = 0;

  const colIndex = {};

  for await (const line of rl) {
    if (!headers) {
      headers = parseCSVLine(line).map((h) => h.trim().toLowerCase());
      // ECDICT 的列: word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange
      headers.forEach((h, i) => { colIndex[h] = i; });
      console.log(`   CSV 列: ${headers.join(", ")}`);
      continue;
    }

    const cols = parseCSVLine(line);
    const word = (cols[colIndex["word"]] || "").trim().toLowerCase();

    if (!word || word.length === 0) { skipped++; continue; }

    // 跳过包含空格的词组（只保留单词和连字符词）
    // 但保留常见短语动词（2个词以内）
    const wordCount = word.split(/\s+/).length;
    if (wordCount > 2) { skipped++; continue; }

    const phonetic = (cols[colIndex["phonetic"]] || "").trim();
    const definition = (cols[colIndex["definition"]] || "").trim(); // English
    const translation = (cols[colIndex["translation"]] || "").trim(); // Chinese
    const pos = (cols[colIndex["pos"]] || "").trim();
    const exchange = (cols[colIndex["exchange"]] || "").trim(); // 时态变化
    const frq = parseInt(cols[colIndex["frq"]] || "0", 10) || 0;
    const collins = parseInt(cols[colIndex["collins"]] || "0", 10) || 0;

    // 跳过没有任何释义的条目
    if (!definition && !translation) { skipped++; continue; }

    // 构建精简的词条对象
    const entry = {};
    if (phonetic) entry.p = phonetic;
    if (definition) entry.d = definition;
    if (translation) entry.t = translation;
    if (pos) entry.o = pos;
    if (exchange) entry.e = exchange;
    if (frq > 0) entry.f = frq;
    if (collins > 0) entry.c = collins;

    // 按首字母分片
    const firstChar = word[0];
    if (firstChar >= "a" && firstChar <= "z") {
      shards[firstChar][word] = entry;
    } else {
      shards["other"][word] = entry;
    }

    count++;
    if (count % 50000 === 0) {
      process.stdout.write(`\r   已处理: ${count.toLocaleString()} 条`);
    }
  }

  console.log(`\r   已处理: ${count.toLocaleString()} 条 (跳过: ${skipped.toLocaleString()} 条)\n`);

  // Step 4: 写入 JSON 分片
  console.log("💾 正在写入 JSON 分片...\n");

  const indexData = {};
  let totalSize = 0;

  for (const [key, words] of Object.entries(shards)) {
    const wordCount = Object.keys(words).length;
    if (wordCount === 0) continue;

    const filePath = path.join(DICT_DIR, `${key}.json`);
    const json = JSON.stringify(words);
    fs.writeFileSync(filePath, json, "utf-8");

    const fileSize = Buffer.byteLength(json, "utf-8");
    totalSize += fileSize;

    indexData[key] = { count: wordCount, size: fileSize };
    console.log(`   ${key}.json: ${wordCount.toLocaleString()} 词 (${(fileSize / 1024).toFixed(0)} KB)`);
  }

  // Step 5: 写入索引
  const indexPath = path.join(DICT_DIR, "index.json");
  fs.writeFileSync(
    indexPath,
    JSON.stringify({ totalWords: count, shards: indexData, version: "1.0" }),
    "utf-8"
  );

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ 词库构建完成！`);
  console.log(`   总词条: ${count.toLocaleString()}`);
  console.log(`   总大小: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   输出目录: ${DICT_DIR}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`\n下一步：git add . && git commit -m "add dictionary" && git push`);

  // 清理提示
  console.log(`\n💡 提示：构建完成后可以删除 .temp/ 目录节省空间：`);
  console.log(`   rm -rf .temp`);
}

main().catch((err) => {
  console.error(`\n❌ 错误: ${err.message}`);
  process.exit(1);
});
