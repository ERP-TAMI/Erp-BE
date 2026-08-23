import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { destination, multistream } from 'pino';

const logsDirectory = join(process.cwd(), 'logs');
mkdirSync(logsDirectory, { recursive: true });

@Global()
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        stream: multistream([
          { stream: process.stdout },
          {
            stream: destination({
              dest: join(logsDirectory, 'app.log'),
              mkdir: true,
              sync: false,
            }),
          },
        ]),
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'res.headers["set-cookie"]',
        ],
      },
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
