import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConditionalSerializerInterceptor } from './common/interceptors/conditional-serializer.interceptor';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(
    new ConditionalSerializerInterceptor(app.get(Reflector)),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
