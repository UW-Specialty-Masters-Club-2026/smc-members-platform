import { pino, type DestinationStream, type Logger } from 'pino';
import { redactForLog } from './mask';

/**
 * Application logger. Every logged object and message passes through
 * `redactForLog`, so email addresses are masked before they reach any sink.
 */
export function createLogger(
  options: { level?: string; name?: string } = {},
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      name: options.name ?? 'smc',
      level: options.level ?? 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', '*.apiKey', '*.password'],
        censor: '[redacted]',
      },
      hooks: {
        logMethod(args, method) {
          method.apply(this, args.map((arg) => redactForLog(arg)) as Parameters<typeof method>);
        },
      },
    },
    destination,
  );
}
