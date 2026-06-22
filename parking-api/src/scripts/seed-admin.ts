import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const configService = app.get(ConfigService);
  const usersService = app.get(UsersService);

  const name = configService.get<string>('ADMIN_NAME');
  const email = configService.get<string>('ADMIN_EMAIL');
  const password = configService.get<string>('ADMIN_PASSWORD');

  if (!name || !email || !password) {
    console.error(
      'Faltan variables de entorno: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD',
    );
    await app.close();
    process.exit(1);
  }

  const existingAdmin = await usersService.findByEmail(email);

  if (existingAdmin) {
    console.log(`El admin con email "${email}" ya existe.`);
    await app.close();
    return;
  }

  await usersService.create({
    name,
    email,
    password,
    role: UserRole.ADMIN,
  });

  console.log(`Admin creado correctamente: ${email}`);

  await app.close();
}

seedAdmin().catch((error: unknown) => {
  console.error('Error al crear el admin:', error);
  process.exit(1);
});
