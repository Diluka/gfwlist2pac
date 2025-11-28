/**
 * GFWList to PAC 转换工具
 * 将 GFWList 转换为 PAC (Proxy Auto-Config) 文件
 *
 * 使用方法:
 *   deno run --allow-net --allow-read --allow-write --allow-env gfwlist2pac.ts [options]
 *
 * 选项:
 *   -i, --input <file>     本地 GFWList 文件路径（可选，默认从网络获取）
 *   -o, --output <file>    输出 PAC 文件路径（默认: pac.txt）
 *   -p, --proxy <url>      下载 GFWList 时使用的代理（默认: socks5://127.0.0.1:1080，支持环境变量 HTTP_PROXY/HTTPS_PROXY）
 *   --user-rules <file>    用户自定义规则文件
 *   -h, --help             显示帮助信息
 */

import { parseArgs } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// GFWList 默认下载地址
const GFWLIST_URL =
  "https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt";

// 下载时使用的默认代理
const DEFAULT_DOWNLOAD_PROXY = "socks5://127.0.0.1:1080";

// PAC 文件中 proxy 变量的占位符（固定值）
const PAC_PROXY_PLACEHOLDER = "__PROXY__";

interface ParsedRules {
  domains: Set<string>;
  domainSuffixes: Set<string>;
  domainKeywords: Set<string>;
  urlPatterns: Set<string>;
  regexPatterns: Set<string>;
  whiteDomains: Set<string>;
  whiteDomainSuffixes: Set<string>;
}

interface Options {
  input?: string;
  output: string;
  /** 下载 GFWList 时使用的代理 URL */
  proxy?: string;
  userRules?: string;
  help: boolean;
}

function printHelp(): void {
  console.log(`
GFWList to PAC 转换工具

使用方法:
  deno run --allow-net --allow-read --allow-write --allow-env gfwlist2pac.ts [options]

选项:
  -i, --input <file>     本地 GFWList 文件路径（可选，默认从网络获取）
  -o, --output <file>    输出 PAC 文件路径（默认: pac.txt）
  -p, --proxy <url>      下载 GFWList 时使用的代理 URL
                         默认: socks5://127.0.0.1:1080
                         支持环境变量: HTTP_PROXY / HTTPS_PROXY / ALL_PROXY
  --user-rules <file>    用户自定义规则文件（AdBlock 格式）
  -h, --help             显示帮助信息

输出说明:
  生成的 PAC 文件中 proxy 变量为 __PROXY__ 占位符，
  使用前请替换为实际代理配置，如: SOCKS5 127.0.0.1:1080; DIRECT

示例:
  # 使用默认代理下载 GFWList
  deno run -A gfwlist2pac.ts

  # 指定下载代理
  deno run -A gfwlist2pac.ts -p "http://127.0.0.1:7890"

  # 使用本地 GFWList 文件（无需网络）
  deno run --allow-read --allow-write gfwlist2pac.ts -i gfwlist.txt

  # 添加用户自定义规则
  deno run -A gfwlist2pac.ts --user-rules user-rules.txt
`);
}

function getProxyFromEnv(): string | undefined {
  return Deno.env.get("HTTPS_PROXY") ||
    Deno.env.get("HTTP_PROXY") ||
    Deno.env.get("ALL_PROXY") ||
    Deno.env.get("https_proxy") ||
    Deno.env.get("http_proxy") ||
    Deno.env.get("all_proxy");
}

function parseOptions(): Options {
  const { values } = parseArgs({
    args: Deno.args,
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o", default: "pac.txt" },
      proxy: { type: "string", short: "p" },
      "user-rules": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  // 优先级: 命令行参数 > 环境变量 > 默认值
  const proxy = (values.proxy as string | undefined) ??
    getProxyFromEnv() ??
    DEFAULT_DOWNLOAD_PROXY;

  return {
    input: values.input as string | undefined,
    output: values.output as string,
    proxy,
    userRules: values["user-rules"] as string | undefined,
    help: values.help as boolean,
  };
}

async function fetchGFWList(url: string, proxyUrl?: string): Promise<string> {
  console.log(`正在从 ${url} 下载 GFWList...`);
  if (proxyUrl) {
    console.log(`使用代理: ${proxyUrl}`);
  }

  const fetchOptions: RequestInit = {};

  // Deno 原生支持通过环境变量或 Deno.createHttpClient 设置代理
  // 这里通过设置环境变量的方式让 fetch 自动使用代理
  if (proxyUrl) {
    Deno.env.set("HTTP_PROXY", proxyUrl);
    Deno.env.set("HTTPS_PROXY", proxyUrl);
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`);
  }
  const base64Content = await response.text();
  console.log("下载完成，正在解码...");
  return atob(base64Content.trim());
}

async function readLocalGFWList(filePath: string): Promise<string> {
  console.log(`正在读取本地文件: ${filePath}`);
  const content = await fs.readFile(filePath, { encoding: "utf-8" });
  // 判断是否是 base64 编码
  const trimmed = content.trim();
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && !trimmed.includes("||")) {
    console.log("检测到 Base64 编码，正在解码...");
    return atob(trimmed.replace(/\s/g, ""));
  }
  return content;
}

async function readUserRules(filePath: string): Promise<string[]> {
  console.log(`正在读取用户规则: ${filePath}`);
  const content = await fs.readFile(filePath, { encoding: "utf-8" });
  return content.split("\n").filter((line) => line.trim());
}

function parseGFWListRules(content: string): ParsedRules {
  const rules: ParsedRules = {
    domains: new Set(),
    domainSuffixes: new Set(),
    domainKeywords: new Set(),
    urlPatterns: new Set(),
    regexPatterns: new Set(),
    whiteDomains: new Set(),
    whiteDomainSuffixes: new Set(),
  };

  const lines = content.split("\n");
  let processedCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // 跳过空行和注释
    if (!line || line.startsWith("!") || line.startsWith("[")) {
      continue;
    }

    processedCount++;
    let rule = line;
    let isWhite = false;

    // 处理白名单规则
    if (rule.startsWith("@@")) {
      isWhite = true;
      rule = rule.substring(2);
    }

    // 处理正则表达式规则
    if (rule.startsWith("/") && rule.endsWith("/")) {
      rules.regexPatterns.add(rule.slice(1, -1));
      continue;
    }

    // 处理域名后缀规则: ||domain.com
    if (rule.startsWith("||")) {
      const domain = rule.substring(2).split("/")[0].split("^")[0];
      if (domain && isValidDomain(domain)) {
        if (isWhite) {
          rules.whiteDomainSuffixes.add(domain.toLowerCase());
        } else {
          rules.domainSuffixes.add(domain.toLowerCase());
        }
      }
      continue;
    }

    // 处理精确域名规则: |http://domain.com
    if (rule.startsWith("|")) {
      const urlMatch = rule.substring(1).match(
        /^https?:\/\/([^\/\^]+)/i
      );
      if (urlMatch) {
        const domain = urlMatch[1];
        if (isValidDomain(domain)) {
          if (isWhite) {
            rules.whiteDomains.add(domain.toLowerCase());
          } else {
            rules.domains.add(domain.toLowerCase());
          }
        }
      }
      continue;
    }

    // 处理关键词规则（纯字母数字和点的简单模式）
    if (/^[a-zA-Z0-9][-a-zA-Z0-9.]*[a-zA-Z0-9]$/.test(rule)) {
      if (isValidDomain(rule)) {
        if (isWhite) {
          rules.whiteDomainSuffixes.add(rule.toLowerCase());
        } else {
          rules.domainSuffixes.add(rule.toLowerCase());
        }
      } else {
        rules.domainKeywords.add(rule.toLowerCase());
      }
      continue;
    }

    // 其他 URL 模式
    const domainMatch = rule.match(
      /^(?:\*\.)?([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,})/
    );
    if (domainMatch) {
      const domain = domainMatch[1];
      if (isWhite) {
        rules.whiteDomainSuffixes.add(domain.toLowerCase());
      } else {
        rules.domainSuffixes.add(domain.toLowerCase());
      }
    }
  }

  console.log(`处理了 ${processedCount} 条规则`);
  console.log(`  - 域名后缀: ${rules.domainSuffixes.size}`);
  console.log(`  - 精确域名: ${rules.domains.size}`);
  console.log(`  - 关键词: ${rules.domainKeywords.size}`);
  console.log(`  - 白名单域名后缀: ${rules.whiteDomainSuffixes.size}`);
  console.log(`  - 白名单精确域名: ${rules.whiteDomains.size}`);

  return rules;
}

function isValidDomain(domain: string): boolean {
  // 简单的域名验证
  return /^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}$/.test(domain);
}

function generatePAC(rules: ParsedRules): string {
  // 构建精确域名哈希表（O(1) 查找）
  const exactSet: Record<string, 1> = {};
  for (const d of rules.domains) {
    exactSet[d] = 1;
  }

  // 构建白名单精确域名哈希表
  const whiteExactSet: Record<string, 1> = {};
  for (const d of rules.whiteDomains) {
    whiteExactSet[d] = 1;
  }

  // 构建域名后缀哈希表（预计算所有后缀）
  const suffixSet: Record<string, 1> = {};
  for (const domain of rules.domainSuffixes) {
    // 添加域名本身
    suffixSet[domain] = 1;
  }

  // 构建白名单域名后缀哈希表
  const whiteSuffixSet: Record<string, 1> = {};
  for (const domain of rules.whiteDomainSuffixes) {
    whiteSuffixSet[domain] = 1;
  }

  const keywords = Array.from(rules.domainKeywords);

  // 生成压缩的 PAC 脚本（性能优化版）
  const pac = `var P="${PAC_PROXY_PLACEHOLDER}",D="DIRECT",E=${JSON.stringify(exactSet)},W=${JSON.stringify(whiteExactSet)},S=${JSON.stringify(suffixSet)},T=${JSON.stringify(whiteSuffixSet)},K=${JSON.stringify(keywords)};function FindProxyForURL(_,h){h=h.toLowerCase();if(h.indexOf(".")<0||h.slice(-6)===".local"||h.slice(0,4)==="127."||h.slice(0,3)==="10."||h.slice(0,8)==="192.168."||h.slice(0,7)==="172.16."||h.slice(0,7)==="172.17."||h.slice(0,7)==="172.18."||h.slice(0,7)==="172.19."||h.slice(0,7)==="172.20."||h.slice(0,7)==="172.21."||h.slice(0,7)==="172.22."||h.slice(0,7)==="172.23."||h.slice(0,7)==="172.24."||h.slice(0,7)==="172.25."||h.slice(0,7)==="172.26."||h.slice(0,7)==="172.27."||h.slice(0,7)==="172.28."||h.slice(0,7)==="172.29."||h.slice(0,7)==="172.30."||h.slice(0,7)==="172.31.")return D;if(W[h])return D;for(var i=0,p=h;;){if(T[p])return D;i=h.indexOf(".",i);if(i<0)break;p=h.slice(++i)}if(E[h])return P;for(i=0,p=h;;){if(S[p])return P;i=h.indexOf(".",i);if(i<0)break;p=h.slice(++i)}for(i=0;i<K.length;i++)if(h.indexOf(K[i])>=0)return P;return D}`;

  return pac;
}

async function main(): Promise<void> {
  const options = parseOptions();

  if (options.help) {
    printHelp();
    Deno.exit(0);
  }

  try {
    // 获取 GFWList 内容
    let gfwlistContent: string;
    if (options.input) {
      gfwlistContent = await readLocalGFWList(options.input);
    } else {
      gfwlistContent = await fetchGFWList(GFWLIST_URL, options.proxy);
    }

    // 读取用户自定义规则
    let userRulesContent: string[] = [];
    if (options.userRules) {
      userRulesContent = await readUserRules(options.userRules);
    }

    // 合并规则
    const allContent =
      gfwlistContent + "\n" + userRulesContent.join("\n");

    // 解析规则
    console.log("正在解析规则...");
    const rules = parseGFWListRules(allContent);

    // 生成 PAC 文件
    console.log("正在生成 PAC 文件...");
    const pacContent = generatePAC(rules);

    // 写入文件
    const outputPath = path.resolve(options.output);
    await fs.writeFile(outputPath, pacContent, { encoding: "utf-8" });
    console.log(`PAC 文件已生成: ${outputPath}`);

    // 输出统计信息
    const stats = await fs.stat(outputPath);
    console.log(`文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error("错误:", error instanceof Error ? error.message : error);
    Deno.exit(1);
  }
}

main();
