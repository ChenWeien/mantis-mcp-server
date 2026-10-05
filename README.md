# Mantis MCP Server

這是一個讓 Codex 透過 MCP 存取 Mantis Bug Tracker 的外掛。你可以用它來查 issues、看 issue 詳細內容、建立或更新 issue、加 note，以及查看專案和指派統計。

## 在 Codex 安裝

這個專案是「本機外掛」形式，不是公開雲端商店連結，所以安裝前要先把 repo 下載到你的電腦上。

### 安裝步驟

1. 先下載或 clone 這個 repo。
2. 把專案放到 Codex 可讀到的外掛來源資料夾。
   - 預設位置是「你的使用者家目錄」底下的 `plugins\mantis-mcp-server`
   - Windows 範例：`C:\Users\<你的使用者名稱>\plugins\mantis-mcp-server`
3. 打開 Codex。
4. 打開外掛頁。
5. 找到 `mantis-mcp-server`。
6. 按安裝。
7. 安裝完成後，開一個新的 Codex thread。
8. 到外掛資料夾的 `.env` 設定 Mantis 連線資訊。
9. 回到新 thread，直接用 Mantis 工具測試。

### 這個外掛怎麼出現在 Codex

Codex 會讀你「使用者家目錄」底下的本機 marketplace 檔案 `.agents\plugins\marketplace.json`。
這個檔案裡有一筆 `mantis-mcp-server` 入口，指向本機的外掛資料夾：

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "mantis-mcp-server",
      "source": {
        "source": "local",
        "path": "./plugins/mantis-mcp-server"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}

```

如果你是從零開始做自己的電腦，這個入口可以用 Codex 的 plugin scaffold 或 marketplace 設定建立，然後再讓 Codex 讀到它。

### `.env` 放哪裡

外掛資料夾的 `.env` 在這裡：

```bash
C:\Users\<你的使用者名稱>\plugins\mantis-mcp-server\.env
```

如果你也想保留一份本機開發用設定，repo 內也有一份：

```bash
./.env
```

### 安裝後沒看到工具

1. 先確認有沒有開新的 Codex thread。
2. 再確認 `.env` 裡的 `MANTIS_API_URL` 是否包含 `/api/rest`。
3. 最後確認外掛資料夾是不是放在你的使用者家目錄底下，例如 `C:\Users\<你的使用者名稱>\plugins\mantis-mcp-server`。

## `.env` 設定範例

```bash
MANTIS_API_URL=http://qa-server-2/mantisbt/api/rest
MANTIS_API_KEY=your_api_key_here
NODE_ENV=production
LOG_LEVEL=info
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300
ENABLE_FILE_LOGGING=false
```

## 可用功能

- 查 issues
- 依 ID 讀取 issue
- 用使用者名稱找 user
- 列出專案
- 查看 issue 統計
- 查看指派統計
- 列出專案中的使用者
- 建立 issue
- 更新 issue（含加入 / 移出 target version / roadmap：`versionId` + `versionAction`；自訂欄位：`customFields`）
- 建立 / 更新 issue 時寫入任意自訂欄位（以 `fieldName` 或 `fieldId` + `value`）
- 新增 issue note

## 更新自訂欄位 395（MCP Tool）

`update_issue` 與 `create_issue` 同時接受 `customFields` 與 `custom_fields`（兩者等價，可擇一）。若兩個都傳，會合併後一併寫入。

每一筆可用 MCP 形狀或 Mantis REST 形狀：

| 形狀 | 範例 |
|------|------|
| MCP | `{ "fieldId": 395, "fieldName": "MCP Tool", "value": "render_image" }` |
| REST | `{ "field": { "id": 395, "name": "MCP Tool" }, "value": "render_image" }` |

欄位 395 的顯示名稱是 `MCP Tool`。每一筆至少要有 `value`，再加上 id 或名稱（`fieldId`/`fieldName`，或 REST 的 `field.id`/`field.name`）。

把 bug 100413 的 MCP Tool 設成 `render_image`：

```json
{
  "issueId": 100413,
  "customFields": [
    { "fieldId": 395, "fieldName": "MCP Tool", "value": "render_image" }
  ]
}
```

`custom_fields` 鍵與 REST 形狀也可以：

```json
{
  "issueId": 100413,
  "custom_fields": [
    { "field": { "id": 395 }, "value": "render_image" }
  ]
}
```

只給 id 或只給名稱也可以：

```json
{ "issueId": 100413, "customFields": [{ "fieldId": 395, "value": "render_image" }] }
```

```json
{ "issueId": 100413, "customFields": [{ "fieldName": "MCP Tool", "value": "render_image" }] }
```

寫完後用 `get_issue_by_id` 讀回該 issue，確認 `custom_fields` 裡 id 395 的 `value` 已是新值。

## 本機開發

如果你想在本機直接跑這個 server：

```bash
npm install
npm run build
npm start
```

## Mantis API Key 設定

1. 登入你的 MantisBT。
2. 到使用者設定中建立或複製 API token。
3. 把 token 寫進 `.env` 的 `MANTIS_API_KEY`。
4. `MANTIS_API_URL` 請指向 REST API 端點，通常是：

```bash
http://qa-server-2/mantisbt/api/rest
```

## 環境變數

- `MANTIS_API_URL`：Mantis REST API URL
- `MANTIS_API_KEY`：Mantis API key
- `NODE_ENV`：通常用 `production`
- `LOG_LEVEL`：`error`、`warn`、`info`、`debug`
- `CACHE_ENABLED`：`true` 或 `false`
- `CACHE_TTL_SECONDS`：快取秒數
- `ENABLE_FILE_LOGGING`：`true` 或 `false`

## 更新外掛

如果你改了外掛內容，要讓 Codex 看到新版，請重新 build，更新 plugin cachebuster，然後開一個新的 Codex thread。

## 授權

MIT
