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

生成的 `pac.txt` 采用性能优化格式：

- 使用哈希表实现 O(1) 域名查找
- 单行压缩输出，最小化文件体积
- `__PROXY__` 占位符，使用前替换为实际代理配置

### 变量说明

| 变量 | 说明 |
|------|------|
| `P` | 代理返回值（`__PROXY__` 占位符） |
| `D` | 直连返回值（`DIRECT`） |
| `E` | 精确域名匹配表（完全匹配） |
| `W` | 白名单域名表（直连） |
| `S` | 域名后缀匹配表（`\|\|domain.com`） |
| `T` | 白名单后缀表 |
| `K` | 关键词匹配数组 |

```javascript
// 使用前替换 __PROXY__ 占位符，例如：
// SOCKS5 127.0.0.1:1080; DIRECT
// PROXY 127.0.0.1:8080; DIRECT
```

## 用户规则

通过 `--user-rules` 添加自定义规则（AdBlock 语法）：

```
||google.com          # 域名后缀匹配
|https://example.com  # 精确 URL
@@||direct.com        # 白名单（直连）
keyword               # 关键词匹配
```
