#!/usr/bin/env -S deno run --allow-net=raw.githubusercontent.com,127.0.0.1:1080,127.0.0.1:10808,127.0.0.1:10809,127.0.0.1:7890,127.0.0.1:7891 --allow-read=. --allow-write=. --allow-env=HTTP_PROXY,HTTPS_PROXY,ALL_PROXY,http_proxy,https_proxy,all_proxy
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
 *   -p, --proxy <url>      下载 GFWList 时使用的代理
 *                          默认自动检测本地代理端口 (1080, 10809, 10808, 7890, 7891)
 *                          支持环境变量: HTTP_PROXY / HTTPS_PROXY / ALL_PROXY
 *   --user-rules <file>    用户自定义规则文件（AdBlock 格式）
 *   -h, --help             显示帮助信息
 *
 * 输出说明:
 *   生成的 PAC 文件中 proxy 变量为 __PROXY__ 占位符，
 *   使用前请替换为实际代理配置，如: SOCKS5 127.0.0.1:1080; DIRECT
 *
 * 示例:
 *   # 自动检测代理下载 GFWList
 *   deno run -A gfwlist2pac.ts
 *
 *   # 指定下载代理
 *   deno run -A gfwlist2pac.ts -p "http://127.0.0.1:7890"
 *
 *   # 使用本地 GFWList 文件（无需网络）
 *   deno run --allow-read --allow-write gfwlist2pac.ts -i gfwlist.txt
 *
 *   # 添加用户自定义规则
 *   deno run -A gfwlist2pac.ts --user-rules user-rules.txt
 */

// GFWList 默认下载地址
const GFWLIST_URL =
  "https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt";

// PAC 文件中 proxy 变量的占位符（固定值）
const PAC_PROXY_PLACEHOLDER = "__PROXY__";

interface ParsedRules {
  whitelistDomains: string[];
  whitelistUrlPatterns: string[];
  whitelistRegex: string[];
  proxyDomains: string[];
  proxyUrlPatterns: string[];
  proxyRegex: string[];
  proxyIps: string[];
  proxyCidrs: string[];
}

interface Options {
  input?: string;
  output: string;
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
                         默认自动检测本地代理端口
                         支持环境变量: HTTP_PROXY / HTTPS_PROXY / ALL_PROXY
  --user-rules <file>    用户自定义规则文件（AdBlock 格式）
  -h, --help             显示帮助信息

输出说明:
  生成的 PAC 文件中 proxy 变量为 __PROXY__ 占位符，
  使用前请替换为实际代理配置，如: SOCKS5 127.0.0.1:1080; DIRECT

示例:
  # 自动检测代理下载 GFWList
  deno run -A gfwlist2pac.ts

  # 指定下载代理
  deno run -A gfwlist2pac.ts -p "http://127.0.0.1:7890"

  # 使用本地 GFWList 文件（无需网络）
  deno run --allow-read --allow-write gfwlist2pac.ts -i gfwlist.txt

  # 添加用户自定义规则
  deno run -A gfwlist2pac.ts --user-rules user-rules.txt
`);
}

function parseOptions(): Options {
  const args = Deno.args;
  const options: Options = {
    output: "pac.txt",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-i":
      case "--input":
        options.input = args[++i];
        break;
      case "-o":
      case "--output":
        options.output = args[++i];
        break;
      case "-p":
      case "--proxy":
        options.proxy = args[++i];
        break;
      case "--user-rules":
        options.userRules = args[++i];
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        if (args[i].startsWith("-")) {
          console.error(`未知选项: ${args[i]}`);
          printHelp();
          Deno.exit(1);
        }
    }
  }

  // 优先级: 命令行参数 > 环境变量
  if (!options.proxy) {
    options.proxy = Deno.env.get("HTTPS_PROXY") ||
      Deno.env.get("HTTP_PROXY") ||
      Deno.env.get("ALL_PROXY") ||
      Deno.env.get("https_proxy") ||
      Deno.env.get("http_proxy") ||
      Deno.env.get("all_proxy");
  }

  return options;
}

async function detectProxy(): Promise<string | undefined> {
  for (const port of [1080, 10809, 10808, 7890, 7891]) {
    try {
      const conn = await Deno.connect({ hostname: "127.0.0.1", port });
      conn.close();
      return `http://127.0.0.1:${port}`;
    } catch {
      continue;
    }
  }
  return undefined;
}

function isIP(s: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s);
}

function isCIDR(s: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(s);
}

async function fetchGFWList(proxyUrl?: string): Promise<string> {
  console.log(`正在从 ${GFWLIST_URL} 下载 GFWList...`);

  if (proxyUrl) {
    console.log(`使用代理: ${proxyUrl}`);
    Deno.env.set("HTTP_PROXY", proxyUrl);
    Deno.env.set("HTTPS_PROXY", proxyUrl);
  }

  const response = await fetch(GFWLIST_URL);
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`);
  }
  const base64Content = await response.text();
  console.log("下载完成，正在解码...");

  const binStr = atob(base64Content.trim());
  const codeUnits = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    codeUnits[i] = binStr.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(codeUnits);
}

async function readLocalGFWList(filePath: string): Promise<string> {
  console.log(`正在读取本地文件: ${filePath}`);
  const content = await Deno.readTextFile(filePath);
  const trimmed = content.trim();

  // 判断是否是 base64 编码
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && !trimmed.includes("||")) {
    console.log("检测到 Base64 编码，正在解码...");
    const binStr = atob(trimmed.replace(/\s/g, ""));
    const codeUnits = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      codeUnits[i] = binStr.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(codeUnits);
  }
  return content;
}

async function readUserRules(filePath: string): Promise<string[]> {
  console.log(`正在读取用户规则: ${filePath}`);
  const content = await Deno.readTextFile(filePath);
  return content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("!"));
}

function parseGfwlist(text: string, isUserRule: boolean): ParsedRules {
  const rules: ParsedRules = {
    whitelistDomains: [],
    whitelistUrlPatterns: [],
    whitelistRegex: [],
    proxyDomains: [],
    proxyUrlPatterns: [],
    proxyRegex: [],
    proxyIps: [],
    proxyCidrs: [],
  };

  const lines = text.split("\n");
  let processedCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 跳过注释和节头
    if (line.startsWith("!") || (line.startsWith("[") && line.endsWith("]"))) {
      continue;
    }

    processedCount++;

    // 用户规则若不包含特殊标记，直接视为域名
    if (isUserRule && !line.startsWith("@@") && !line.startsWith("||") &&
        !line.startsWith("|") && !line.startsWith("/") && !line.startsWith(".") &&
        !line.includes("*") && !line.includes("^")) {
      const domain = line.replace(/\^$/, "");
      if (isValidDomain(domain)) {
        rules.proxyDomains.push(domain.toLowerCase());
      }
      continue;
    }

    const isWhitelist = line.startsWith("@@");
    const content = isWhitelist ? line.slice(2).trim() : line;

    // 正则: /pattern/
    const regexMatch = content.match(/^\/(.+)\/$/);
    if (regexMatch) {
      if (isWhitelist) {
        rules.whitelistRegex.push(regexMatch[1]);
      } else {
        rules.proxyRegex.push(regexMatch[1]);
      }
      continue;
    }

    // 去掉尾部的 ^ (AutoProxy 分隔符)
    const rule = content.replace(/\^$/, "");

    // IP / CIDR
    if (isCIDR(rule)) {
      rules.proxyCidrs.push(rule);
      continue;
    }
    if (isIP(rule)) {
      rules.proxyIps.push(rule);
      continue;
    }

    // ||domain.com 或 ||domain.com/path
    if (rule.startsWith("||")) {
      const rest = rule.slice(2);
      const slashIdx = rest.indexOf("/");
      if (slashIdx === -1) {
        // ||domain.com — 纯域名
        const d = rest.replace(/\|$/, "");
        if (isValidDomain(d) || isIP(d)) {
          if (isWhitelist) {
            rules.whitelistDomains.push(d.toLowerCase());
          } else {
            rules.proxyDomains.push(d.toLowerCase());
          }
        }
      } else {
        // ||domain.com/path — URL 模式
        const domainPart = rest.slice(0, slashIdx);
        const pathPart = rest.slice(slashIdx);
        if (isValidDomain(domainPart)) {
          const pattern = "*" + domainPart + pathPart;
          if (isWhitelist) {
            rules.whitelistUrlPatterns.push(pattern);
          } else {
            rules.proxyUrlPatterns.push(pattern);
          }
        }
      }
      continue;
    }

    // 以 . 开头: .domain.com
    if (rule.startsWith(".")) {
      const domain = rule.slice(1).split("/")[0];
      if (domain && isValidDomain(domain)) {
        if (isWhitelist) {
          rules.whitelistDomains.push(domain.toLowerCase());
        } else {
          rules.proxyDomains.push(domain.toLowerCase());
        }
      }
      continue;
    }

    // 以 | 开头: |domain.com 或 |http://...
    if (rule.startsWith("|")) {
      const r = rule.slice(1);
      const exact = r.replace(/\|$/, "");
      if (isValidDomain(exact)) {
        if (isWhitelist) {
          rules.whitelistDomains.push(exact.toLowerCase());
        } else {
          rules.proxyDomains.push(exact.toLowerCase());
        }
      } else {
        // |http://... — 完整 URL 模式
        let p = r;
        if (p.endsWith("|")) p = p.slice(0, -1);
        if (isWhitelist) {
          rules.whitelistUrlPatterns.push(p);
        } else {
          rules.proxyUrlPatterns.push(p);
        }
      }
      continue;
    }

    // 纯域名 domain.com
    if (isValidDomain(rule)) {
      if (isWhitelist) {
        rules.whitelistDomains.push(rule.toLowerCase());
      } else {
        rules.proxyDomains.push(rule.toLowerCase());
      }
      continue;
    }

    // 以 http 开头的 URL
    if (rule.startsWith("http://") || rule.startsWith("https://")) {
      if (isWhitelist) {
        rules.whitelistUrlPatterns.push(rule);
      } else {
        rules.proxyUrlPatterns.push(rule);
      }
      continue;
    }

    // 包含 * 或 ? 的模式
    if (rule.includes("*") || rule.includes("?")) {
      const pattern = rule.startsWith("http://") || rule.startsWith("https://")
        ? rule
        : "*" + rule;
      if (isWhitelist) {
        rules.whitelistUrlPatterns.push(pattern);
      } else {
        rules.proxyUrlPatterns.push(pattern);
      }
      continue;
    }

    // 关键词形式的域名
    if (/^[a-zA-Z0-9][-a-zA-Z0-9]*$/.test(rule)) {
      rules.proxyDomains.push(rule.toLowerCase());
    }
  }

  // 去重并排序
  for (const key of Object.keys(rules) as (keyof ParsedRules)[]) {
    rules[key] = [...new Set(rules[key])].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }

  console.log(`处理了 ${processedCount} 条规则`);
  console.log(`  - 代理域名: ${rules.proxyDomains.length}`);
  console.log(`  - 代理 URL 模式: ${rules.proxyUrlPatterns.length}`);
  console.log(`  - 代理正则: ${rules.proxyRegex.length}`);
  console.log(`  - 代理 IP: ${rules.proxyIps.length}`);
  console.log(`  - 代理 CIDR: ${rules.proxyCidrs.length}`);
  console.log(`  - 白名单域名: ${rules.whitelistDomains.length}`);
  console.log(`  - 白名单 URL 模式: ${rules.whitelistUrlPatterns.length}`);
  console.log(`  - 白名单正则: ${rules.whitelistRegex.length}`);

  return rules;
}

function isValidDomain(domain: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(domain);
}

function cidrToNetmask(cidr: string): [string, string] {
  const [ip, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr);
  const mask = ~0 << (32 - prefix);
  const parts = [
    (mask >>> 24) & 0xFF,
    (mask >>> 16) & 0xFF,
    (mask >>> 8) & 0xFF,
    mask & 0xFF,
  ];
  return [ip, parts.join(".")];
}

function generatePAC(rules: ParsedRules): string {
  const lines: string[] = [];

  lines.push(`var proxy = '${PAC_PROXY_PLACEHOLDER}';`);
  lines.push("");

  // 生成各规则类型的 JS 数组
  lines.push(`var whitelistDomains = ${JSON.stringify(rules.whitelistDomains)};`);
  lines.push(`var whitelistUrlPatterns = ${JSON.stringify(rules.whitelistUrlPatterns)};`);
  lines.push(`var whitelistRegex = ${JSON.stringify(rules.whitelistRegex)};`);
  lines.push(`var proxyDomains = ${JSON.stringify(rules.proxyDomains)};`);
  lines.push(`var proxyUrlPatterns = ${JSON.stringify(rules.proxyUrlPatterns)};`);
  lines.push(`var proxyRegex = ${JSON.stringify(rules.proxyRegex)};`);
  lines.push(`var proxyIps = ${JSON.stringify(rules.proxyIps)};`);

  // CIDR 规则
  const cidrEntries = rules.proxyCidrs.map((c) => {
    const [ip, mask] = cidrToNetmask(c);
    return `["${ip}","${mask}"]`;
  });
  lines.push(`var proxyCidrs = [${cidrEntries.join(",")}];`);
  lines.push("");

  // FindProxyForURL 函数
  lines.push("function FindProxyForURL(url, host) {");

  // 白名单 URL 模式
  if (rules.whitelistUrlPatterns.length > 0) {
    lines.push("  for (var i = 0; i < whitelistUrlPatterns.length; i++) {");
    lines.push("    if (shExpMatch(url, whitelistUrlPatterns[i])) return 'DIRECT';");
    lines.push("  }");
    lines.push("");
  }

  // 白名单正则
  if (rules.whitelistRegex.length > 0) {
    lines.push("  for (var i = 0; i < whitelistRegex.length; i++) {");
    lines.push("    if (new RegExp(whitelistRegex[i]).test(url)) return 'DIRECT';");
    lines.push("  }");
    lines.push("");
  }

  // 白名单域名
  if (rules.whitelistDomains.length > 0) {
    lines.push("  for (var i = 0; i < whitelistDomains.length; i++) {");
    lines.push("    var d = whitelistDomains[i];");
    lines.push("    if (host == d || host.endsWith('.' + d)) return 'DIRECT';");
    lines.push("  }");
    lines.push("");
  }

  // 代理正则
  if (rules.proxyRegex.length > 0) {
    lines.push("  for (var i = 0; i < proxyRegex.length; i++) {");
    lines.push("    if (new RegExp(proxyRegex[i]).test(url)) return proxy;");
    lines.push("  }");
    lines.push("");
  }

  // 代理 URL 模式
  if (rules.proxyUrlPatterns.length > 0) {
    lines.push("  for (var i = 0; i < proxyUrlPatterns.length; i++) {");
    lines.push("    if (shExpMatch(url, proxyUrlPatterns[i])) return proxy;");
    lines.push("  }");
    lines.push("");
  }

  // 代理域名
  if (rules.proxyDomains.length > 0) {
    lines.push("  for (var i = 0; i < proxyDomains.length; i++) {");
    lines.push("    var d = proxyDomains[i];");
    lines.push("    if (host == d || host.endsWith('.' + d)) return proxy;");
    lines.push("  }");
    lines.push("");
  }

  // 代理 IP
  if (rules.proxyIps.length > 0) {
    lines.push("  if (host.indexOf('.') !== -1) {");
    lines.push("    for (var i = 0; i < proxyIps.length; i++) {");
    lines.push("      if (host == proxyIps[i]) return proxy;");
    lines.push("    }");
    lines.push("  }");
    lines.push("");
  }

  // CIDR
  if (rules.proxyCidrs.length > 0) {
    lines.push("  if (host.indexOf('.') !== -1) {");
    lines.push("    var ip = dnsResolve(host);");
    lines.push("    if (ip) {");
    lines.push("      for (var i = 0; i < proxyCidrs.length; i++) {");
    lines.push("        if (isInNet(ip, proxyCidrs[i][0], proxyCidrs[i][1])) return proxy;");
    lines.push("      }");
    lines.push("    }");
    lines.push("  }");
    lines.push("");
  }

  lines.push("  return 'DIRECT';");
  lines.push("}");
  lines.push("");

  // String.prototype.endsWith polyfill
  lines.push(
    "if (!String.prototype.endsWith) { String.prototype.endsWith = function(s,p) { var t=this.toString(); if(typeof p!=='number'||!isFinite(p)||Math.floor(p)!==p||p>t.length) p=t.length; p-=s.length; var i=t.indexOf(s,p); return i!==-1&&i===p; }; }",
  );

  return lines.join("\n");
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
      // 自动检测代理
      if (!options.proxy) {
        const detected = await detectProxy();
        if (detected) {
          console.log(`自动检测到本地代理: ${detected}`);
          options.proxy = detected;
        }
      }
      gfwlistContent = await fetchGFWList(options.proxy);
    }

    // 读取用户自定义规则
    const userRulesPath = options.userRules ?? "user-rules.txt";
    let userRulesContent: string[] = [];

    try {
      await Deno.stat(userRulesPath);
      userRulesContent = await readUserRules(userRulesPath);
    } catch {
      if (options.userRules) {
        throw new Error(`用户规则文件不存在: ${userRulesPath}`);
      }
      // 默认文件不存在，静默跳过
    }

    // 解析 GFWList 规则
    console.log("正在解析 GFWList 规则...");
    const rules = parseGfwlist(gfwlistContent, false);

    // 解析用户规则（合并）
    if (userRulesContent.length > 0) {
      console.log("正在解析用户规则...");
      const userRules = parseGfwlist(userRulesContent.join("\n"), true);
      // 合并用户规则到主规则集
      for (const key of Object.keys(rules) as (keyof ParsedRules)[]) {
        rules[key].push(...userRules[key]);
        rules[key] = [...new Set(rules[key])].sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase())
        );
      }
    }

    // 生成 PAC 文件
    console.log("正在生成 PAC 文件...");
    const pacContent = generatePAC(rules);

    // 写入文件
    await Deno.writeTextFile(options.output, pacContent);
    console.log(`PAC 文件已生成: ${options.output}`);
    console.log(`文件大小: ${(pacContent.length / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error("错误:", error instanceof Error ? error.message : error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
