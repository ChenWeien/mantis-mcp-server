# 更新日誌

## [Unreleased] - 2026-10-02

### 改進
- `create_issue` / `update_issue` 同時接受 `customFields` 與 `custom_fields`
- 自訂欄位陣列同時接受 MCP 形狀（`fieldId` / `fieldName`）與 Mantis REST 形狀（`field.id` / `field.name`），避免 agent 因鍵名或形狀不同而寫入失敗


2026-09-30

### 文件
- README 說明如何用 `update_issue` 的 `customFields` 更新自訂欄位 395（MCP Tool）
- 參數名稱是 `customFields`（`fieldId` 395 或 `fieldName` `"MCP Tool"`，加上 `value`）。傳 REST 形狀的 `custom_fields` 會被 schema 丟掉，issue 不會更新該欄位

## [0.4.9] - 2026-09-21

### 新增
- `update_issue` 支援 `versionId` 與 `versionAction`（`add` / `remove`），可把 issue 加入或移出 Mantis target version（roadmap）
- `remove` 只在目前 target version 等於指定 `versionId` 時才清空，避免誤清其他版本

## [0.4.0] - 2024-03-29

### 改進
- 重構代碼，提取重複的 Mantis API 配置檢查邏輯到 `withMantisConfigured` 高階函數
- 優化錯誤處理，增加更清晰的錯誤標識和響應格式
- 增強日誌記錄，提供更詳細的錯誤上下文信息
- 優化 JSON 資料壓縮功能，根據資料大小自動判斷是否需要壓縮

### 重構
- 統一所有工具的實現方式，減少代碼重複
- 改進函數型別定義，使代碼更加類型安全
- 優化錯誤處理流程，提高代碼的可維護性

## [0.2.0] - 2024-03-21

### 新增
- 添加 `withMantisConfigured` 高階函數來處理共用的檢查邏輯
- 添加結構化的錯誤響應格式，包含 `isError` 標記

### 改進
- 優化所有工具的回傳型別以符合 MCP SDK 要求
- 改進錯誤處理機制，提供更詳細的錯誤信息
- 優化 `get_issues` 工具的壓縮功能
- 統一化所有工具的錯誤處理和日誌記錄

### 修復
- 修正工具回傳型別不符合 MCP SDK 要求的問題
- 修正錯誤響應格式不一致的問題

## [0.1.0] - 2024-03-20

### 新增
- 初始版本發布
- 實現基本的 Mantis API 集成
- 添加問題管理、用戶管理、專案管理等基本功能
- 實現統計分析功能
- 添加效能優化功能（欄位選擇、分頁處理、自動壓縮） 