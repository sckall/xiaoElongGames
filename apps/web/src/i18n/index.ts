/**
 * i18n 模块入口
 *
 * 当前仅支持 zh-CN；en-US 留接口（阶段 1+ 接入）。
 * 命名空间化字符串：`<namespace>.<key>`，例如 `home.title`、`hall.play`。
 *
 * 使用方式：
 * ```ts
 * import { t } from '../i18n';
 * <h1>{t('home.title')}</h1>
 * ```
 *
 * 缺失 key 的处理：
 * - 打印 console.warn（仅开发模式）
 * - 返回原 key 字符串，**不让 UI 显示空**
 * - 生产构建：可加 env check 静默 warn
 */
import { zhCN } from './zh-CN';
import { enUS } from './en-US';

export type Locale = 'zh-CN' | 'en-US';
export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en-US'];
export const DEFAULT_LOCALE: Locale = 'zh-CN';

const dictionaries: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

/** 当前 locale（v0.2 写死 zh-CN；阶段 1+ 接 localStorage + 自动检测） */
let currentLocale: Locale = DEFAULT_LOCALE;

/** 切换 locale（占位接口，未来实现） */
export function setLocale(loc: Locale): void {
  currentLocale = loc;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * 取翻译。找不到时：
 * - 在 dev 模式（import.meta.env.DEV）下 console.warn
 * - 返回 key 字符串（不显示空）
 */
export function t(key: string): string {
  const dict = dictionaries[currentLocale];
  const value = dict[key];
  if (value !== undefined) return value;
  // 兜底
  if (import.meta.env?.DEV) {
    console.warn(`[i18n] missing key: ${key} (locale: ${currentLocale})`);
  }
  return key;
}

/**
 * 插值：把 {varName} 替换为 params 中的值。
 * 用法：tFmt('hall.welcome', { name: '玩家' })
 */
export function tFmt(key: string, params: Record<string, string | number>): string {
  const raw = t(key);
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}