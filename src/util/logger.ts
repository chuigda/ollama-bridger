import type { LogLevel } from "../config/schema.js";

const order: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const paint = (c: string, s: string) => `\x1b[${c}m${s}\x1b[0m`;

export class Logger {
  constructor(private readonly level: LogLevel = "info") {}
  private emit(l: LogLevel, tag: string, args: unknown[]) {
    if (order[l] < order[this.level]) return;
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(paint("90", ts), tag, ...args);
  }
  debug(...a: unknown[]) { this.emit("debug", paint("90", "DBG"), a); }
  info(...a: unknown[])  { this.emit("info",  paint("36", "INF"), a); }
  warn(...a: unknown[])  { this.emit("warn",  paint("33", "WRN"), a); }
  error(...a: unknown[]) { this.emit("error", paint("31", "ERR"), a); }
}