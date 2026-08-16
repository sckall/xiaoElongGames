# 🔒 服务端安全边界与加固说明

> 面向开发者与运维：上线前先读一遍。本项目是无账号、无数据库的轻量游戏大厅，
> 威胁模型以“刷房间/刷连接/输入洪泛/信息伪造”为主。

## 1. 已实现的防护（apps/server）

| 防护 | 位置 | 说明 |
|------|------|------|
| 每 IP 连接/建房限流 | `index.ts` | 8 连接、5 房间/每 IP、全局 200 房间 |
| XFF 信任开关 | `security.ts` + `TRUST_PROXY` | **默认忽略 X-Forwarded-For**；仅在可信反代后置 `TRUST_PROXY=1` |
| Socket 载荷上限 | `index.ts` | `maxHttpBufferSize: 64KB`（正常输入远小于此值） |
| 房间码裁剪 | `security.ts` | 只保留字母数字、限 16 字符 |
| 昵称/密码裁剪 | `room.ts` | 昵称 12 字符、密码 16 字符 |
| 房间设置白名单 | `security.ts` | `aiSpeed/autopilot` 之外全部忽略并钳制 |
| 引擎动作白名单 | 游戏引擎 | `apply/applyInput` 对全部动作与数值域校验，非法安全拒绝 |
| realtime 输入洪泛保护 | `realtime-room.ts` | 每玩家每秒最多 240 条输入（正常客户端已按 60Hz 节流），超限丢弃并回执 |
| CORS 同源默认 | `index.ts` | 默认拒绝跨域 Socket.IO；`CORS_ORIGIN` 白名单 |
| 异常兜底 | `index.ts` | 所有事件 handler 包 `guard()`，坏消息不会打崩进程 |
| 空房自动回收 | `Room/RealtimeRoom` | 所有真人断开后自动关闭并释放资源 |

单测：`apps/server/test/security.test.ts`（IP 信任、房间码、设置白名单、输入限流等）。

## 2. 部署必读

- **反向代理**：只有请求会经过你自己的 Nginx/Caddy 时，才设 `TRUST_PROXY=1`；
  直连暴露 8787 时保持默认（否则客户端可伪造 XFF 绕过限流）。
- **公网建议**：把服务端放在 HTTPS 反代之后，并设置 `CORS_ORIGIN=https://你的域名`。
- 房间密码是休闲级防护（明文存储于内存、仅用于好友约局），不要依赖它保护敏感信息。
- 重连 token 是服务端生成的 UUID，仅存于玩家浏览器 localStorage，同源脚本才可读取；
  若房间被公开分享，请另设密码。
- 全局没有数据库/账号/支付，对局即开即散，数据泄露面有限。

## 3. 已知取舍（MVP 边界）

- 房间列表公开房间码与人数（大厅设计如此）；
- 限流按 IP 计数（家庭/公司 NAT 下多人共用出口时可能触发，可调 `MAX_*` 常量）；
- turn-based 房间动作无逐消息限流（每个动作只作用于当前回合，滥用面小）；
- 快照目前为全量下发（2-7 人规模足够），公网大规模再升级差量（见 `REALTIME.md`）。

## 4. 上线前安全回归

```bash
pnpm --filter @tm/server test
node apps/server/scripts/smoke.mjs           # 含恶意 payload 用例
node apps/server/scripts/smoke-realtime.mjs  # 含非法输入/重连/终局用例
```
