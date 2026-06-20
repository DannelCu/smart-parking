import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

const futureDate = (daysFromNow: number, hour = 10, minutes = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, minutes, 0, 0);
  return date.toISOString();
};

describe('Reservations (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  let adminToken: string;
  let empleadoToken: string;
  let empleadoId: string;
  let clienteToken: string;
  let cliente2Token: string;
  let clienteId: string;
  let cliente2Id: string;

  let spotCarA: string;
  let spotCarB: string;
  let spotCycleA: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
    );
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    await dataSource.query('DELETE FROM reservations');
    await dataSource.query('DELETE FROM parking_spots');
    await dataSource.query('DELETE FROM users');

    const hashedPassword = await bcrypt.hash('password123', 10);

    await dataSource.query(
      `INSERT INTO users (id, name, email, password, role)
       VALUES (gen_random_uuid(), 'Admin Test', 'admin-res@parking.com', $1, 'admin')`,
      [hashedPassword],
    );

    const empleadoRows: { id: string }[] = await dataSource.query(
      `INSERT INTO users (id, name, email, password, role)
       VALUES (gen_random_uuid(), 'Empleado Test', 'empleado-res@parking.com', $1, 'empleado')
         RETURNING id`,
      [hashedPassword],
    );
    empleadoId = empleadoRows[0].id;

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin-res@parking.com', password: 'password123' });
    adminToken = (adminLogin.body as { access_token: string }).access_token;

    const empleadoLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'empleado-res@parking.com', password: 'password123' });
    empleadoToken = (empleadoLogin.body as { access_token: string })
      .access_token;

    const cliente1Register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Cliente Uno',
        email: 'cliente1-res@parking.com',
        password: '123456',
      });
    clienteId = (cliente1Register.body as { id: string }).id;

    const cliente1Login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'cliente1-res@parking.com', password: '123456' });
    clienteToken = (cliente1Login.body as { access_token: string })
      .access_token;

    const cliente2Register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Cliente Dos',
        email: 'cliente2-res@parking.com',
        password: '123456',
      });
    cliente2Id = (cliente2Register.body as { id: string }).id;

    const cliente2Login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'cliente2-res@parking.com', password: '123456' });
    cliente2Token = (cliente2Login.body as { access_token: string })
      .access_token;

    const spotA = await request(app.getHttpServer())
      .post('/parking-spots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'RES-A1', type: 'auto' });
    spotCarA = (spotA.body as { id: string }).id;

    const spotB = await request(app.getHttpServer())
      .post('/parking-spots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'RES-A2', type: 'auto' });
    spotCarB = (spotB.body as { id: string }).id;

    const spotC = await request(app.getHttpServer())
      .post('/parking-spots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'RES-C1', type: 'ciclo' });
    spotCycleA = (spotC.body as { id: string }).id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM reservations');
    await dataSource.query('DELETE FROM parking_spots');
    await dataSource.query('DELETE FROM users');
    await app.close();
  });

  describe('POST /reservations', () => {
    it('cliente debe poder crear una reserva especificando plaza', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          parkingSpotId: spotCarA,
          vehiclePlate: 'ABC123',
          vehicleType: 'auto',
          startDate: futureDate(10, 10),
          endDate: futureDate(10, 18),
        })
        .expect(201);

      const body = response.body as { parkingSpotId: string };
      expect(body.parkingSpotId).toBe(spotCarA);
    });

    it('cliente debe poder crear una reserva sin especificar plaza', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          vehiclePlate: 'XYZ789',
          vehicleType: 'auto',
          startDate: futureDate(14, 10),
          endDate: futureDate(14, 18),
        })
        .expect(201);

      const body = response.body as { parkingSpotId: string };
      expect(body.parkingSpotId).toBeDefined();
    });

    it('debe fallar si startDate >= endDate', async () => {
      await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          parkingSpotId: spotCarB,
          vehiclePlate: 'DEF456',
          vehicleType: 'auto',
          startDate: futureDate(20, 18),
          endDate: futureDate(20, 10),
        })
        .expect(400);
    });

    it('debe fallar si la plaza no es del tipo de vehículo correcto', async () => {
      await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          parkingSpotId: spotCycleA,
          vehiclePlate: 'GHI789',
          vehicleType: 'auto',
          startDate: futureDate(22, 10),
          endDate: futureDate(22, 18),
        })
        .expect(400);
    });

    it('debe fallar si la plaza ya está ocupada en ese rango', async () => {
      await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${cliente2Token}`)
        .send({
          parkingSpotId: spotCarA,
          vehiclePlate: 'JKL012',
          vehicleType: 'auto',
          startDate: futureDate(10, 12),
          endDate: futureDate(10, 15),
        })
        .expect(400);
    });

    it('admin debe recibir 403 al intentar crear una reserva normal', async () => {
      await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          parkingSpotId: spotCarB,
          vehiclePlate: 'MNO345',
          vehicleType: 'auto',
          startDate: futureDate(25, 10),
          endDate: futureDate(25, 18),
        })
        .expect(403);
    });

    it('debe fallar si startDate es anterior al momento actual', async () => {
      await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          parkingSpotId: spotCarB,
          vehiclePlate: 'PAST001',
          vehicleType: 'auto',
          startDate: '2020-01-01T10:00:00Z',
          endDate: '2020-01-01T18:00:00Z',
        })
        .expect(400);
    });
  });

  describe('POST /reservations/admin', () => {
    it('admin debe poder crear una reserva a nombre de un cliente', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: cliente2Id,
          parkingSpotId: spotCarB,
          vehiclePlate: 'PQR678',
          vehicleType: 'auto',
          startDate: futureDate(30, 10),
          endDate: futureDate(30, 18),
        })
        .expect(201);

      const body = response.body as { userId: string };
      expect(body.userId).toBe(cliente2Id);
    });

    it('debe fallar si el userId no corresponde a un cliente', async () => {
      await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: empleadoId,
          vehiclePlate: 'STU901',
          vehicleType: 'ciclo',
          startDate: futureDate(31, 10),
          endDate: futureDate(31, 18),
        })
        .expect(400);
    });

    it('empleado debe recibir 403', async () => {
      await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${empleadoToken}`)
        .send({
          userId: clienteId,
          vehiclePlate: 'VWX234',
          vehicleType: 'auto',
          startDate: futureDate(32, 10),
          endDate: futureDate(32, 18),
        })
        .expect(403);
    });

    it('admin debe poder crear una reserva con fecha pasada para un cliente', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: cliente2Id,
          vehiclePlate: 'PASTADMIN01',
          vehicleType: 'ciclo',
          startDate: '2020-01-01T10:00:00Z',
          endDate: '2020-01-01T18:00:00Z',
        })
        .expect(201);

      const body = response.body as { startDate: string };
      expect(body.startDate).toBe('2020-01-01T10:00:00.000Z');
    });
  });

  describe('GET /reservations/my', () => {
    it('cliente debe ver solo sus propias reservas', async () => {
      const response = await request(app.getHttpServer())
        .get('/reservations/my')
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(200);

      const body = response.body as { userId: string }[];
      expect(body.every((r) => r.userId === clienteId)).toBe(true);
    });
  });

  describe('GET /reservations/occupancy', () => {
    it('admin debe poder ver la ocupación agrupada por tipo', async () => {
      const response = await request(app.getHttpServer())
        .get('/reservations/occupancy')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as {
        byType: Record<
          string,
          { totalSpots: number; occupiedSpots: number; pendingCheckIn: number }
        >;
      };
      expect(body.byType).toHaveProperty('auto');
      expect(body.byType).toHaveProperty('ciclo');
      expect(body.byType.auto).toHaveProperty('pendingCheckIn');
      expect(body.byType.auto).toHaveProperty('occupiedSpots');
    });

    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .get('/reservations/occupancy')
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });
  });

  describe('GET /reservations', () => {
    it('admin debe poder listar todas las reservas', async () => {
      const response = await request(app.getHttpServer())
        .get('/reservations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .get('/reservations')
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });
  });

  describe('GET /reservations/:id', () => {
    let reservationId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          vehiclePlate: 'DETAIL01',
          vehicleType: 'ciclo',
          startDate: futureDate(40, 10),
          endDate: futureDate(40, 18),
        });
      reservationId = (response.body as { id: string }).id;
    });

    it('el dueño debe poder ver su propia reserva', async () => {
      await request(app.getHttpServer())
        .get(`/reservations/${reservationId}`)
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(200);
    });

    it('admin debe poder ver cualquier reserva', async () => {
      await request(app.getHttpServer())
        .get(`/reservations/${reservationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('otro cliente no dueño debe recibir 403', async () => {
      await request(app.getHttpServer())
        .get(`/reservations/${reservationId}`)
        .set('Authorization', `Bearer ${cliente2Token}`)
        .expect(403);
    });

    it('debe fallar con 404 si no existe', async () => {
      await request(app.getHttpServer())
        .get('/reservations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /reservations/:id/cancel', () => {
    let cancelableId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          vehiclePlate: 'CANCEL01',
          vehicleType: 'ciclo',
          startDate: futureDate(45, 10),
          endDate: futureDate(45, 18),
        });
      cancelableId = (response.body as { id: string }).id;
    });

    it('otro cliente no dueño debe recibir 403', async () => {
      await request(app.getHttpServer())
        .patch(`/reservations/${cancelableId}/cancel`)
        .set('Authorization', `Bearer ${cliente2Token}`)
        .expect(403);
    });

    it('el dueño debe poder cancelar su reserva', async () => {
      await request(app.getHttpServer())
        .patch(`/reservations/${cancelableId}/cancel`)
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(200);
    });

    it('debe fallar si ya está cancelada', async () => {
      await request(app.getHttpServer())
        .patch(`/reservations/${cancelableId}/cancel`)
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(400);
    });
  });

  describe('PATCH /reservations/:id/exit', () => {
    let exitReservationId: string;
    let exitSpotId: string;

    beforeAll(async () => {
      const spot = await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'EXIT-A1', type: 'auto' });
      exitSpotId = (spot.body as { id: string }).id;

      const response = await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: clienteId,
          parkingSpotId: exitSpotId,
          vehiclePlate: 'EXIT001',
          vehicleType: 'auto',
          startDate: '2020-01-01T10:00:00Z',
          endDate: '2020-01-01T18:00:00Z',
        });
      exitReservationId = (response.body as { id: string }).id;
    });

    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .patch(`/reservations/${exitReservationId}/exit`)
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });

    it('empleado debe poder dar salida a un vehículo', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/reservations/${exitReservationId}/exit`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(200);

      const body = response.body as { actualExitDate: string | null };
      expect(body.actualExitDate).not.toBeNull();
    });

    it('debe fallar si ya tiene salida registrada', async () => {
      await request(app.getHttpServer())
        .patch(`/reservations/${exitReservationId}/exit`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(400);
    });

    it('la plaza debe quedar disponible después de la salida', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${cliente2Token}`)
        .send({
          parkingSpotId: exitSpotId,
          vehiclePlate: 'NEWCAR01',
          vehicleType: 'auto',
          startDate: futureDate(50, 10),
          endDate: futureDate(50, 18),
        })
        .expect(201);

      const body = response.body as { parkingSpotId: string };
      expect(body.parkingSpotId).toBe(exitSpotId);
    });
  });

  describe('PATCH /reservations/:id/enter', () => {
    let enterSpotId: string;
    let enterSpotEarlyId: string;
    let enterSpotNoShowId: string;
    let currentOccupantId: string;
    let earlyId: string;
    let freeSlotReservationId: string;

    beforeAll(async () => {
      const spot = await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'ENTER-A1', type: 'auto' });
      enterSpotId = (spot.body as { id: string }).id;

      const spotEarly = await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'ENTER-A2', type: 'auto' });
      enterSpotEarlyId = (spotEarly.body as { id: string }).id;

      const spotNoShow = await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'ENTER-A3', type: 'auto' });
      enterSpotNoShowId = (spotNoShow.body as { id: string }).id;

      await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: clienteId,
          parkingSpotId: enterSpotNoShowId,
          vehiclePlate: 'OLDNOSHOW',
          vehicleType: 'auto',
          startDate: '2020-01-01T08:00:00Z',
          endDate: '2020-01-01T10:00:00Z',
        })
        .expect(201);

      const currentOccupant = await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: clienteId,
          parkingSpotId: enterSpotId,
          vehiclePlate: 'OCCUPANT01',
          vehicleType: 'auto',
          startDate: '2020-06-01T08:00:00Z',
          endDate: futureDate(60, 10),
        })
        .expect(201);
      currentOccupantId = (currentOccupant.body as { id: string }).id;

      await request(app.getHttpServer())
        .patch(`/reservations/${currentOccupantId}/enter`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: cliente2Id,
          parkingSpotId: enterSpotEarlyId,
          vehiclePlate: 'FUTURENC',
          vehicleType: 'auto',
          startDate: futureDate(70, 7, 0),
          endDate: futureDate(70, 8, 59),
        })
        .expect(201);

      const early = await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: clienteId,
          parkingSpotId: enterSpotEarlyId,
          vehiclePlate: 'EARLY01',
          vehicleType: 'auto',
          startDate: futureDate(70, 9, 0),
          endDate: futureDate(70, 12, 0),
        })
        .expect(201);
      earlyId = (early.body as { id: string }).id;

      const freeSlot = await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: cliente2Id,
          parkingSpotId: enterSpotNoShowId,
          vehiclePlate: 'FREESLOT',
          vehicleType: 'auto',
          startDate: futureDate(80, 9),
          endDate: futureDate(80, 12),
        })
        .expect(201);
      freeSlotReservationId = (freeSlot.body as { id: string }).id;
    });

    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .patch(`/reservations/${freeSlotReservationId}/enter`)
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });

    it('debe fallar si la plaza está físicamente ocupada por otro vehículo', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: cliente2Id,
          parkingSpotId: enterSpotId,
          vehiclePlate: 'CONFLICT01',
          vehicleType: 'auto',
          startDate: futureDate(65, 9),
          endDate: futureDate(65, 11),
        })
        .expect(201);
      const conflictId = (response.body as { id: string }).id;

      const result = await request(app.getHttpServer())
        .patch(`/reservations/${conflictId}/enter`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(400);

      const body = result.body as { message: string };
      expect(body.message).toContain('físicamente ocupada');
    });

    it('debe fallar si hay otra reserva sin check-in que se solapa (llegó antes de tiempo)', async () => {
      const result = await request(app.getHttpServer())
        .patch(`/reservations/${earlyId}/enter`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(400);

      const body = result.body as { message: string };
      expect(body.message).toContain('antes de tiempo');
    });

    it('NO debe fallar por un no-show viejo ya expirado en la misma plaza', async () => {
      await request(app.getHttpServer())
        .patch(`/reservations/${freeSlotReservationId}/enter`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(200);
    });

    it('empleado debe poder dar entrada a un vehículo correctamente', async () => {
      const cleanSpot = await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'ENTER-CLEAN', type: 'auto' })
        .expect(201);
      const cleanSpotId = (cleanSpot.body as { id: string }).id;

      const response = await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: clienteId,
          parkingSpotId: cleanSpotId,
          vehiclePlate: 'CLEANENTRY',
          vehicleType: 'auto',
          startDate: futureDate(90, 9),
          endDate: futureDate(90, 17),
        })
        .expect(201);
      const cleanId = (response.body as { id: string }).id;

      const result = await request(app.getHttpServer())
        .patch(`/reservations/${cleanId}/enter`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(200);

      const body = result.body as { actualEntryDate: string | null };
      expect(body.actualEntryDate).not.toBeNull();
    });

    it('debe fallar si ya tiene entrada registrada', async () => {
      await request(app.getHttpServer())
        .patch(`/reservations/${currentOccupantId}/enter`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(400);
    });

    it('debe fallar si la reserva está cancelada', async () => {
      const response = await request(app.getHttpServer())
        .post('/reservations/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: clienteId,
          vehicleType: 'ciclo',
          vehiclePlate: 'CANCELLED01',
          startDate: futureDate(95, 9),
          endDate: futureDate(95, 17),
        })
        .expect(201);
      const cancelledId = (response.body as { id: string }).id;

      await request(app.getHttpServer())
        .patch(`/reservations/${cancelledId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/reservations/${cancelledId}/enter`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(400);
    });
  });
});
