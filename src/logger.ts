export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

export interface Logger {
  trace(msg: string): void;
  trace(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(
  level: LogLevel = 'info',
  bindings: Record<string, unknown> = {}
): Logger {
  const minLevel = LEVEL_ORDER[level];

  function log(
    lvl: LogLevel,
    argsOrMsg: Record<string, unknown> | string,
    msg?: string
  ): void {
    if (LEVEL_ORDER[lvl] < minLevel) return;

    const entry: Record<string, unknown> = {
      level: lvl,
      time: new Date().toISOString(),
      ...bindings,
    };

    if (typeof argsOrMsg === 'string') {
      entry.msg = argsOrMsg;
    } else {
      Object.assign(entry, argsOrMsg);
      if (msg) entry.msg = msg;
    }

    const fn =
      lvl === 'error'
        ? console.error
        : lvl === 'warn'
          ? console.warn
          : lvl === 'debug' || lvl === 'trace'
            ? console.debug
            : console.log;

    fn(JSON.stringify(entry));
  }

  const logger: Logger = {
    trace(...args: [Record<string, unknown>, string] | [string]) {
      if (args.length === 1) log('trace', args[0]);
      else log('trace', args[0], args[1]);
    },
    debug(...args: [Record<string, unknown>, string] | [string]) {
      if (args.length === 1) log('debug', args[0]);
      else log('debug', args[0], args[1]);
    },
    info(...args: [Record<string, unknown>, string] | [string]) {
      if (args.length === 1) log('info', args[0]);
      else log('info', args[0], args[1]);
    },
    warn(...args: [Record<string, unknown>, string] | [string]) {
      if (args.length === 1) log('warn', args[0]);
      else log('warn', args[0], args[1]);
    },
    error(...args: [Record<string, unknown>, string] | [string]) {
      if (args.length === 1) log('error', args[0]);
      else log('error', args[0], args[1]);
    },
    child(childBindings: Record<string, unknown>): Logger {
      return createLogger(level, { ...bindings, ...childBindings });
    },
  };

  return logger;
}
