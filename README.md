# gfwlist2pac

将 GFWList 转换为 PAC 文件。单文件 Deno 脚本。

## 使用

```powershell
# 默认使用 socks5://127.0.0.1:1080 代理下载 GFWList
deno run -A gfwlist2pac.ts

# 指定下载代理
deno run -A gfwlist2pac.ts -p "http://127.0.0.1:7890"

# 使用本地文件
deno run -A gfwlist2pac.ts -i gfwlist.txt
```

## 选项

| 参数 | 说明 |
|------|------|
| `-i, --input <file>` | 本地 GFWList 文件 |
| `-o, --output <file>` | 输出文件（默认：`pac.txt`） |
| `-p, --proxy <url>` | 下载代理（默认：`socks5://127.0.0.1:1080`，支持 `HTTP_PROXY` 环境变量） |
| `--user-rules <file>` | 用户规则文件（默认自动加载执行目录下的 `user-rules.txt`） |

## 输出

生成的 `pac.txt` 采用标准 PAC 格式，兼容各种代理客户端：

```javascript
var proxy = '__PROXY__';
var rules = [
    [
        [/* 白名单域名 */],
        [/* 代理域名 */]
    ],
    [[], []]
];

function FindProxyForURL(url, host) { ... }
function testHost(host, index) { ... }
```

### 使用说明

1. 将 `__PROXY__` 替换为实际代理配置：
   ```javascript
   var proxy = 'SOCKS5 127.0.0.1:1080; DIRECT';
   // 或
   var proxy = 'PROXY 127.0.0.1:8080; DIRECT';
   ```

2. 域名匹配规则：
   - 精确匹配：`host == domain`
   - 后缀匹配：`host.endsWith('.' + domain)`

3. 规则结构：`rules[i][0]` 为白名单，`rules[i][1]` 为代理名单

## 用户规则

通过 `--user-rules` 添加自定义规则（AdBlock 语法）：

```
||google.com          # 域名后缀匹配
|https://example.com  # 精确 URL
@@||direct.com        # 白名单（直连）
keyword               # 关键词匹配
```

默认会自动加载执行目录下的 `user-rules.txt` 文件（如果存在）。

## 测试

```powershell
deno test --allow-read
```
