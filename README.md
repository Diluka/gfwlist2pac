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
| `--user-rules <file>` | 用户规则文件 |

## 输出

生成的 `pac.txt` 中 `proxy` 变量为 `__PROXY__` 占位符，使用前替换为实际配置：

```javascript
var proxy = "SOCKS5 127.0.0.1:1080; DIRECT";
```

## 用户规则

通过 `--user-rules` 添加自定义规则（AdBlock 语法）：

```
||google.com          # 域名后缀匹配
|https://example.com  # 精确 URL
@@||direct.com        # 白名单（直连）
keyword               # 关键词匹配
```
