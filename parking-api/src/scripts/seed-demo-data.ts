import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../app.module';

const EMPLOYEE = {
  name: 'Empleado Demo',
  email: 'empleado@parking.com',
  password: 'empleado123',
};

const CLIENTS = [
  {
    name: 'Cliente Demo Uno',
    email: 'cliente1@parking.com',
    password: 'cliente123',
  },
  {
    name: 'Cliente Demo Dos',
    email: 'cliente2@parking.com',
    password: 'cliente123',
  },
];

const SPOTS = [
  { code: 'DEMO-A1', type: 'auto' },
  { code: 'DEMO-A2', type: 'auto' },
  { code: 'DEMO-C1', type: 'ciclo' },
  { code: 'DEMO-C2', type: 'ciclo' },
];

interface AuthResponse {
  access_token: string;
}

interface CreatedUser {
  id: string;
}

interface CreatedSpot {
  id: string;
  code: string;
}

interface CreatedReservation {
  id: string;
}

async function httpPost<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as T;

  if (!response.ok) {
    throw new Error(
      `POST ${path} falló (${response.status}): ${JSON.stringify(data)}`,
    );
  }

  return data;
}

async function httpPatch<T>(
  baseUrl: string,
  path: string,
  token: string,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await response.json()) as T;

  if (!response.ok) {
    throw new Error(
      `PATCH ${path} falló (${response.status}): ${JSON.stringify(data)}`,
    );
  }

  return data;
}

function pastDateRange(daysAgo: number): {
  startDate: string;
  endDate: string;
} {
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  start.setHours(9, 0, 0, 0);

  const end = new Date(start);
  end.setHours(18, 0, 0, 0);

  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function futureDateRange(daysFromNow: number): {
  startDate: string;
  endDate: string;
} {
  const start = new Date();
  start.setDate(start.getDate() + daysFromNow);
  start.setHours(9, 0, 0, 0);

  const end = new Date(start);
  end.setHours(18, 0, 0, 0);

  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

async function seedDemoData() {
  const app = await NestFactory.create(AppModule, { logger: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  await app.listen(0);

  const configService = app.get(ConfigService);
  const httpServer = app.getHttpServer() as { address: () => { port: number } };
  const port = httpServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const adminEmail = configService.get<string>('ADMIN_EMAIL');
  const adminPassword = configService.get<string>('ADMIN_PASSWORD');

  if (!adminEmail || !adminPassword) {
    console.error(
      'Faltan ADMIN_EMAIL / ADMIN_PASSWORD en el .env. Ejecuta primero "npm run seed:admin".',
    );
    await app.close();
    process.exit(1);
  }

  console.log('Iniciando seed de datos de demostración...\n');

  const adminLogin = await httpPost<AuthResponse>(baseUrl, '/auth/login', {
    email: adminEmail,
    password: adminPassword,
  });
  const adminToken = adminLogin.access_token;
  console.log('Admin autenticado.');

  await httpPost<CreatedUser>(
    baseUrl,
    '/users',
    { ...EMPLOYEE, role: 'empleado' },
    adminToken,
  );
  const employeeLogin = await httpPost<AuthResponse>(baseUrl, '/auth/login', {
    email: EMPLOYEE.email,
    password: EMPLOYEE.password,
  });
  const employeeToken = employeeLogin.access_token;
  console.log(`Empleado creado: ${EMPLOYEE.email}`);

  const clientTokens: string[] = [];
  const clientIds: string[] = [];

  for (const client of CLIENTS) {
    const created = await httpPost<CreatedUser>(
      baseUrl,
      '/auth/register',
      client,
    );
    const login = await httpPost<AuthResponse>(baseUrl, '/auth/login', {
      email: client.email,
      password: client.password,
    });
    clientTokens.push(login.access_token);
    clientIds.push(created.id);
    console.log(`Cliente creado: ${client.email}`);
  }

  const spotIds: Record<string, string> = {};

  for (const spot of SPOTS) {
    const created = await httpPost<CreatedSpot>(
      baseUrl,
      '/parking-spots',
      spot,
      adminToken,
    );
    spotIds[spot.code] = created.id;
    console.log(`Plaza creada: ${spot.code} (${spot.type})`);
  }

  console.log('\nCreando reservas de demostración...\n');

  const reservation1 = await httpPost<CreatedReservation>(
    baseUrl,
    '/reservations',
    {
      parkingSpotId: spotIds['DEMO-A1'],
      vehiclePlate: 'DEMO001',
      vehicleType: 'auto',
      ...futureDateRange(5),
    },
    clientTokens[0],
  );
  console.log(`Reserva creada en DEMO-A1 (cliente 1): ${reservation1.id}`);

  const reservation2 = await httpPost<CreatedReservation>(
    baseUrl,
    '/reservations',
    {
      parkingSpotId: spotIds['DEMO-A2'],
      vehiclePlate: 'DEMO002',
      vehicleType: 'auto',
      ...futureDateRange(7),
    },
    clientTokens[1],
  );
  console.log(`Reserva creada en DEMO-A2 (cliente 2): ${reservation2.id}`);

  await httpPatch(
    baseUrl,
    `/reservations/${reservation2.id}/cancel`,
    clientTokens[1],
  );
  console.log(`Reserva en DEMO-A2 cancelada por su dueño.`);

  const reservation3 = await httpPost<CreatedReservation>(
    baseUrl,
    '/reservations/admin',
    {
      userId: clientIds[0],
      parkingSpotId: spotIds['DEMO-C1'],
      vehiclePlate: 'DEMO003',
      vehicleType: 'ciclo',
      ...pastDateRange(1),
    },
    adminToken,
  );
  console.log(
    `Reserva creada en DEMO-C1 (cliente 1, vía admin): ${reservation3.id}`,
  );

  await httpPatch(
    baseUrl,
    `/reservations/${reservation3.id}/enter`,
    employeeToken,
  );
  console.log(`Entrada registrada en DEMO-C1 por el empleado.`);

  const reservation4 = await httpPost<CreatedReservation>(
    baseUrl,
    '/reservations/admin',
    {
      userId: clientIds[1],
      parkingSpotId: spotIds['DEMO-C2'],
      vehiclePlate: 'DEMO004',
      vehicleType: 'ciclo',
      ...pastDateRange(2),
    },
    adminToken,
  );
  console.log(
    `Reserva creada en DEMO-C2 (cliente 2, vía admin): ${reservation4.id}`,
  );

  await httpPatch(
    baseUrl,
    `/reservations/${reservation4.id}/enter`,
    employeeToken,
  );
  console.log(`Entrada registrada en DEMO-C2 por el empleado.`);

  await httpPatch(
    baseUrl,
    `/reservations/${reservation4.id}/exit`,
    employeeToken,
  );
  console.log(`Salida registrada en DEMO-C2 por el empleado.`);

  console.log('\nSeed de datos de demostración completado.');
  console.log(`  - 1 empleado: ${EMPLOYEE.email}`);
  console.log(`  - 2 clientes: ${CLIENTS.map((c) => c.email).join(', ')}`);
  console.log(`  - 4 plazas: ${SPOTS.map((s) => s.code).join(', ')}`);
  console.log(`  - 4 reservas, generando 8 entradas en el log de auditoría`);

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await app.close();
  process.exit(0);
}

seedDemoData().catch((error: unknown) => {
  console.error('Error al ejecutar el seed de datos de demostración:', error);
  process.exit(1);
});
