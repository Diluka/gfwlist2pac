/**
 * PAC 文件有效性测试
 *
 * 运行测试:
 *   deno test --allow-read gfwlist2pac_test.ts
 */

import { assertEquals } from "@std/assert";

// 模拟 PAC 运行环境并执行 FindProxyForURL
function createPacContext(pacContent: string): (url: string, host: string) => string {
  // 在隔离环境中执行 PAC 脚本
  const fn = new Function(pacContent + ";return FindProxyForURL;")();
  return fn as (url: string, host: string) => string;
}

Deno.test("PAC 文件语法有效性", async () => {
  const pacContent = await Deno.readTextFile("pac.txt");

  // 验证 PAC 文件不为空
  assertEquals(pacContent.length > 0, true, "PAC 文件不应为空");

  // 验证包含必要的函数定义
  assertEquals(
    pacContent.includes("FindProxyForURL"),
    true,
    "PAC 文件应包含 FindProxyForURL 函数"
  );

  // 验证可以解析为有效的 JavaScript
  let parseError: Error | null = null;
  try {
    new Function(pacContent);
  } catch (e) {
    parseError = e as Error;
  }
  assertEquals(parseError, null, `PAC 文件应为有效的 JavaScript: ${parseError?.message}`);
});

Deno.test("PAC FindProxyForURL 函数可执行", async () => {
  const pacContent = await Deno.readTextFile("pac.txt");
  const findProxy = createPacContext(pacContent);

  // 验证函数存在且可调用
  assertEquals(typeof findProxy, "function", "FindProxyForURL 应为函数");

  // 验证返回值格式
  const result = findProxy("http://example.com/", "example.com");
  assertEquals(
    typeof result,
    "string",
    "FindProxyForURL 应返回字符串"
  );
  assertEquals(
    result === "DIRECT" || result === "__PROXY__",
    true,
    `FindProxyForURL 应返回 DIRECT 或 __PROXY__，实际返回: ${result}`
  );
});

Deno.test("本地地址应直连", async () => {
  const pacContent = await Deno.readTextFile("pac.txt");
  const findProxy = createPacContext(pacContent);

  const localHosts = [
    "localhost",
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "mypc.local",
  ];

  for (const host of localHosts) {
    const result = findProxy(`http://${host}/`, host);
    assertEquals(result, "DIRECT", `本地地址 ${host} 应直连`);
  }
});

Deno.test("GFWList 中的域名应走代理", async () => {
  const pacContent = await Deno.readTextFile("pac.txt");
  const findProxy = createPacContext(pacContent);

  // 这些是 GFWList 中常见的被封锁域名
  const blockedDomains = [
    "google.com",
    "www.google.com",
    "youtube.com",
    "facebook.com",
    "twitter.com",
    "wikipedia.org",
    "instagram.com",
  ];

  for (const domain of blockedDomains) {
    const result = findProxy(`https://${domain}/`, domain);
    assertEquals(result, "__PROXY__", `被封锁域名 ${domain} 应走代理`);
  }
});

Deno.test("子域名应继承父域名规则", async () => {
  const pacContent = await Deno.readTextFile("pac.txt");
  const findProxy = createPacContext(pacContent);

  // 子域名测试
  const subdomains = [
    "www.youtube.com",
    "m.facebook.com",
    "en.wikipedia.org",
    "www.twitter.com",
  ];

  for (const domain of subdomains) {
    const result = findProxy(`https://${domain}/`, domain);
    assertEquals(result, "__PROXY__", `子域名 ${domain} 应走代理`);
  }
});

Deno.test("白名单域名应直连", async () => {
  const pacContent = await Deno.readTextFile("pac.txt");
  const findProxy = createPacContext(pacContent);

  // 常见的白名单域名（国内可直连）
  const whitelistDomains = [
    "baidu.com",
    "qq.com",
    "taobao.com",
    "aliyun.com",
  ];

  for (const domain of whitelistDomains) {
    const result = findProxy(`https://${domain}/`, domain);
    assertEquals(result, "DIRECT", `白名单域名 ${domain} 应直连`);
  }
});

Deno.test("用户规则域名应走代理", async () => {
  const pacContent = await Deno.readTextFile("pac.txt");
  const findProxy = createPacContext(pacContent);

  // 用户规则中添加的域名（来自 user-rules.txt）
  const userRuleDomains = [
    "www.bing.com",
    "sydney.bing.com",
    "copilot.microsoft.com",
  ];

  for (const domain of userRuleDomains) {
    const result = findProxy(`https://${domain}/`, domain);
    assertEquals(result, "__PROXY__", `用户规则域名 ${domain} 应走代理`);
  }
});

Deno.test("未知域名应直连", async () => {
  const pacContent = await Deno.readTextFile("pac.txt");
  const findProxy = createPacContext(pacContent);

  // 随机的未知域名
  const unknownDomains = [
    "random-unknown-domain-12345.com",
    "my-internal-server.corp",
  ];

  for (const domain of unknownDomains) {
    const result = findProxy(`https://${domain}/`, domain);
    assertEquals(result, "DIRECT", `未知域名 ${domain} 应直连`);
  }
});

Deno.test("PAC 变量结构完整性", async () => {
  const pacContent = await Deno.readTextFile("pac.txt");

  // 验证必要的变量存在
  assertEquals(pacContent.includes('var P='), true, "应包含代理变量 P");
  assertEquals(pacContent.includes('D="DIRECT"'), true, "应包含直连变量 D");
  assertEquals(pacContent.includes('E='), true, "应包含精确域名表 E");
  assertEquals(pacContent.includes('W='), true, "应包含白名单表 W");
  assertEquals(pacContent.includes('S='), true, "应包含后缀表 S");
  assertEquals(pacContent.includes('T='), true, "应包含白名单后缀表 T");
  assertEquals(pacContent.includes('K='), true, "应包含关键词数组 K");
});
