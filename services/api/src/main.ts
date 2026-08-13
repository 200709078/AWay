import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  const corsOrigin = (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const usesWildcardOrigin = corsOrigin.length === 1 && corsOrigin[0] === '*';
  const includesWildcardOrigin = corsOrigin.includes('*');

  if (includesWildcardOrigin && !usesWildcardOrigin) {
    throw new Error('CORS_ORIGIN, * ile başka originleri birlikte içeremez.');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    (usesWildcardOrigin || corsOrigin.length === 0)
  ) {
    throw new Error(
      'Production ortamında CORS_ORIGIN açık bir web origin listesi olmalıdır.',
    );
  }

  app.enableCors(
    usesWildcardOrigin
      ? { origin: '*' }
      : {
          origin: corsOrigin,
          credentials: true,
        },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);
}

void bootstrap();
