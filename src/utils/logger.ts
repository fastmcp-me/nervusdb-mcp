import { type Logger, pino } from 'pino';

let _logger: Logger | null = null;

function getLogger(): Logger {
  // 单例模式：只有在第一次调用时才创建实例
  if (!_logger) {
    // ✅ 此时，stdio.ts 中的 process.env.MCP_TRANSPORT 已经被正确设置
    const isStdioMode = process.env.MCP_TRANSPORT === 'stdio';
    const isDevelopment = process.env.NODE_ENV !== 'production';

    // 在 stdio 模式下，pino-pretty 必须被禁用或强制输出到 stderr
    // 禁用是更简单、更安全的选择，因为 pino-pretty 的主要价值是开发时控制台可读性
    const transport =
      isDevelopment && !isStdioMode
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined;

    _logger = pino(
      {
        level: process.env.LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info'),
        // 基础日志信息，有助于调试
        base: {
          env: process.env.NODE_ENV ?? 'development',
        },
        transport,
      },
      // ✅ 关键：在 stdio 模式下，日志流必须是 stderr
      isStdioMode ? process.stderr : process.stdout,
    );

    _logger.info({ isStdioMode }, 'Logger initialized.');
  }
  return _logger;
}

// 使用 Proxy 导出一个"虚拟"的 logger 对象
// 所有对它的方法调用都会被 get trap 拦截，并转发到真正的 logger 实例上
export const logger: Logger = new Proxy({} as Logger, {
  get(_target, prop: keyof Logger) {
    const realLogger = getLogger();
    const value = realLogger[prop];

    // 确保方法在正确的上下文（this）中被调用
    return typeof value === 'function' ? value.bind(realLogger) : value;
  },
});

// 如果你的代码库中有使用 child logger 的地方，也需要一个封装
export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}
