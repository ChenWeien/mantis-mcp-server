# 當前上下文

## 當前重點
- `create_issue` / `update_issue` 的自訂欄位參數同時接受 `customFields` 與 `custom_fields`，並相容 MCP / REST 兩種元素形狀
- 添加單元測試和整合測試
- 準備發布含此相容性修復的版本
- 優化錯誤處理

## 最近更改
- `customFields.ts`：新增 `custom_fields` 別名、REST 形狀解析、`resolveCustomFieldsParam`
- README / CHANGELOG 更新為「兩者皆可」
- `update_issue` 新增 `versionId`、`versionAction`（`add` / `remove`），對應 REST `target_version`
- remove 會先讀目前 target version，只有相同 versionId 才清空為 `{ id: 0, name: "" }`
- 版本號目前仍為 0.4.9（相容性修復尚未 bump / publish）

## 待處理事項
- 發布含 custom_fields 別名的新版本（需 bump + build + commit + publish）
- 添加單元測試
- 添加整合測試
- 添加更多的錯誤處理和邊緣情況
- 優化緩存機制

## 架構決策
- 基於 MCP SDK 開發的 MCP Server
- 利用 TypeScript 和 Zod 進行類型驗證和參數處理
- 使用 Axios 進行 Mantis API 調用
- 實作模組化設計，便於功能擴展
- 添加環境變數和配置管理
- 實作緩存機制提高性能
- 實現統計功能支持多種維度分析
- Roadmap 指派走 Mantis `target_version`，不清 product version / fixed_in_version
- 自訂欄位對外同時暴露 camelCase 與 snake_case，降低 agent 誤用 REST 鍵名的成本

## Recent Completions
- create_issue / update_issue 同時接受 customFields 與 custom_fields has been completed and archived. Next focus is on 發布新版本.

## 最近完成
- 完成基礎架構建設
- 完成 Mantis API 整合
- 實現 6 個核心工具功能
- 添加認證機制
- 實現錯誤處理和緩存
- 實現統計功能
- 完成文檔撰寫
- `update_issue` 支援 roadmap version 加入 / 移出
