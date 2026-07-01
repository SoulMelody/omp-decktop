# WebSocket 重连强化 — 实现计划（已完成：无需代码变更）

> **状态：** 已验证 — 现有基础设施已覆盖设计规格的所有重连需求。无需代码变更。

**目标：** 强化 WebSocket 连接断开后的自动重连，支持页面刷新后 session 状态恢复、流式传输中断后自动重连与同步。

**结论：** omp-decktop 的现有重连基础设施已经完整覆盖设计规格中的需求：

| 需求 | 实现位置 | 状态 |
|---|---|---|
| mount 时检测 `streaming` 状态并自动重连 | `store.ts` bootstrap() L458-462 — 页面加载时重新订阅 active session | 已存在 |
| 重连后同步状态（thinkingLevel, modelId, isCompacting） | `subscribed` 帧处理 L812-818 → `initSession(snapshot)` — snapshot 包含完整状态 | 已存在 |
| WS 断连自动重连 | `ws.ts` 指数退避重连 scheduleReconnect L170-178 | 已存在 |
| 心跳检测僵尸连接 | `ws.ts` resetHeartbeatTimer / forceReconnect L78-92, L141-155 | 已存在 |
| Tab 可见性恢复 | `store.ts` visibilitychange handler L466-498 | 已存在 |
| `hello` 帧后重新订阅 | `store.ts` handleFrame case "hello" L804-810 | 已存在 |
| UI dialog 重放 | `ws.ts` handleSubscribe → subscribeUiFrames L181-186 | 已存在 |
| Plan mode 重放 | `ws.ts` handleSubscribe → subscribePlanModeFrames L187-193 | 已存在 |
| compaction_start / auto_compaction_start | `reducer.ts` L201-237 — 处理 auto_compaction_start/end | 已存在 |

**架构分析：**
- `ws.ts`：已有心跳看门狗、指数退避重连、forceReconnect
- `store.ts`：bootstrap() 已重新订阅 active session，visibilitychange 检测僵尸连接
- `reducer.ts`：initSession(snapshot) 正确映射 isStreaming → status，applyEvent 处理 compaction 状态机
- `ws.ts`（服务端）：handleSubscribe 已发送完整 snapshot + 重放 UI/plan 帧

**不需要的操作：**
- 不需要新增 `ws-sync.ts` 模块 — subscribed 帧已提供完整状态同步
- 不需要修改 `ws.ts` — 心跳和重连已完备
- 不需要新增 `SessionResumeEvent` — reducer 通过 initSession 处理状态替换
- 不需要创建 `useSession` hook — store 直接通过 subscribe 管理 session 生命周期
- 不需要后端事件日志 — subscribed snapshot 是权威状态源

---

## 原计划（保留供参考）

以下为原计划内容，经代码审查后发现所有需求已由现有代码满足。保留作为设计上下文。

---

## 任务 1：增强 `ws.ts` 重连逻辑 — **跳过**

- [x] **步骤 1：分析当前 ws.ts 重连机制** — 已有心跳看门狗 + 指数退避 + forceReconnect
- [x] **步骤 2：修改 ws.ts** — 不需要：ping/pong 已有（heartbeat timer），resumeFrom 不需要（subscribed snapshot 替代）

## 任务 2：新增重连事件类型（reducer.ts） — **跳过**

- [x] **步骤 1：在 reducer.ts 中新增 SessionResumeEvent** — 不需要：initSession(snapshot) 已处理完整状态替换

## 任务 3：创建 ws-sync.ts — **跳过**

- [x] **步骤 1：创建 ws-sync.ts** — 不需要：subscribed 帧已提供完整状态同步

## 任务 4：修改 useSession hook — **跳过**

- [x] **步骤 1：增强 useSession.ts** — 不需要：store 直接通过 subscribe 管理 session 生命周期，bootstrap() 已处理 mount 恢复

## 任务 5：后端 resumeFrom — **跳过**

- [x] **步骤 1：后端 WebSocket resumeFrom** — 不需要：subscribed snapshot 是权威状态源
