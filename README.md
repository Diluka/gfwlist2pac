# gfwlist2pac

将 GFWList 转换为 PAC 文件。单文件 Deno 脚本，无外部依赖。

## 使用

```powershell
# 自动检测本地代理端口下载 GFWList
deno run -P gfwlist2pac.ts

# 指定下载代理
deno run -P gfwlist2pac.ts -p "http://127.0.0.1:7890"

# 使用本地文件（无需网络）
deno run --allow-read --allow-write gfwlist2pac.ts -i gfwlist.txt
```

## 选项

| 参数 | 说明 |
|------|------|
| `-i, --input <file>` | 本地 GFWList 文件（base64 或明文自动识别） |
| `-o, --output <file>` | 输出文件（默认：`pac.txt`） |
| `-p, --proxy <url>` | 下载代理（默认自动检测本地代理端口，支持 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` 环境变量） |
| `--user-rules <file>` | 用户规则文件（默认自动加载执行目录下的 `user-rules.txt`） |

## 输出

生成的 `pac.txt` 是未经压缩的可读 JavaScript，直出可用的 PAC 脚本，无额外构建步骤。

### 使用说明

将 `__PROXY__` 替换为实际代理配置：

```javascript
// 查找并替换 __PROXY__ 为：
'SOCKS5 127.0.0.1:1080; DIRECT'
// 或
'PROXY 127.0.0.1:8080; DIRECT'
```

### 匹配规则

PAC 文件支持 8 类规则，按以下优先级判断：

| 优先级 | 规则类型 | 说明 |
|--------|----------|------|
| 1 | 白名单 URL 模式 | `shExpMatch(url, pattern)` |
| 2 | 白名单正则 | `RegExp.test(url)` |
| 3 | 白名单域名 | `host == domain` 或 `host.endsWith('.' + domain)` |
| 4 | 代理正则 | `RegExp.test(url)` |
| 5 | 代理 URL 模式 | `shExpMatch(url, pattern)` |
| 6 | 代理域名 | `host == domain` 或 `host.endsWith('.' + domain)` |
| 7 | 代理 IP | `host == ip` |
| 8 | 代理 CIDR | `isInNet(ip, net, mask)` |

所有规则都不匹配时，默认返回 `DIRECT`。

### 功能特性

- 完整支持 GFWList 所有规则类型：域名、URL 模式、正则、IP、CIDR、白名单
- 包含 `String.prototype.endsWith` polyfill，兼容旧版浏览器/PAC 引擎
- 不含 `npm:terser` 等外部依赖，避免压缩带来的兼容性问题

## 用户规则

通过 `--user-rules` 添加自定义规则（AdBlock Plus 语法）：

```
||google.com              # 域名后缀匹配
||example.com/path        # URL 模式匹配
|https://example.com      # 精确 URL
@@||direct.com            # 白名单（直连）
/pattern/                 # 正则表达式
```

默认会自动加载执行目录下的 `user-rules.txt` 文件（如果存在）。

## 测试

```powershell
deno test --allow-read
```
