/**
 * 一个会按指定间隔 re-render 的当前时间戳 hook。
 * 仅用于大厅底部时间卡片的实时显示（HH:mm、YYYY/MM/DD、星期）。
 *
 * - 默认 30 秒一次（够用，过细会浪费 CPU）。
 * - 组件卸载时自动 clearInterval，不会泄漏。
 */
import { useEffect, useState } from 'react';

export function useTickingClock(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}