/**
 * 英文文案（en-US）
 *
 * 占位实现：阶段 1+ 才正式翻译。当前为所有 zh-CN key 提供 fallback 字符串（key 本身），
 * 让 setLocale('en-US') 切换时不会显示空白。
 *
 * 实际翻译工作在阶段 1「联机强化 + 海外社区」任务中做。
 */
import { zhCN } from './zh-CN';

/** 阶段 0：fallback 到 zhCN，让 UI 不显示空白 */
export const enUS: Record<string, string> = { ...zhCN };