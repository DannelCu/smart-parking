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

describe('ParkingSpots (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  let adminToken: string;
  let empleadoToken: string;
  let clienteToken: string;
  let parkingSpotId: string;

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
    await dataSource.query('DELETE FROM users');
    await dataSource.query('DELETE FROM parking_spots');

    const hashedPassword = await bcrypt.hash('password123', 10);

    await dataSource.query(
      `INSERT INTO users (id, name, email, password, role)
       VALUES (gen_random_uuid(), 'Admin Test', 'admin-spots@parking.com', $1, 'admin')`,
      [hashedPassword],
    );

    await dataSource.query(
      `INSERT INTO users (id, name, email, password, role)
       VALUES (gen_random_uuid(), 'Empleado Test', 'empleado-spots@parking.com', $1, 'empleado')`,
      [hashedPassword],
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin-spots@parking.com', password: 'password123' });
    adminToken = (adminLogin.body as { access_token: string }).access_token;

    const empleadoLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'empleado-spots@parking.com', password: 'password123' });
    empleadoToken = (empleadoLogin.body as { access_token: string })
      .access_token;

    await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Cliente Test',
      email: 'cliente-spots@parking.com',
      password: '123456',
    });

    const clienteLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'cliente-spots@parking.com', password: '123456' });
    clienteToken = (clienteLogin.body as { access_token: string }).access_token;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM parking_spots');
    await dataSource.query('DELETE FROM users');
    await app.close();
  });

  describe('POST /parking-spots', () => {
    it('admin debe poder crear una plaza', async () => {
      const response = await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'A1', type: 'auto' })
        .expect(201);

      const body = response.body as { id: string; code: string };
      expect(body.code).toBe('A1');
      parkingSpotId = body.id;
    });

    it('debe fallar si el code ya existe', async () => {
      await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'A1', type: 'auto' })
        .expect(409);
    });

    it('empleado debe recibir 403', async () => {
      await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${empleadoToken}`)
        .send({ code: 'A2', type: 'auto' })
        .expect(403);
    });

    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({ code: 'A3', type: 'auto' })
        .expect(403);
    });
  });

  describe('GET /parking-spots', () => {
    it('admin debe poder listar plazas', async () => {
      const response = await request(app.getHttpServer())
        .get('/parking-spots')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('empleado debe poder listar plazas', async () => {
      await request(app.getHttpServer())
        .get('/parking-spots')
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(200);
    });

    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .get('/parking-spots')
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });
  });

  describe('GET /parking-spots/:id', () => {
    it('admin/empleado debe poder ver una plaza específica', async () => {
      const response = await request(app.getHttpServer())
        .get(`/parking-spots/${parkingSpotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as { id: string };
      expect(body.id).toBe(parkingSpotId);
    });

    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .get(`/parking-spots/${parkingSpotId}`)
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });

    it('debe fallar con 404 si no existe', async () => {
      await request(app.getHttpServer())
        .get('/parking-spots/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PUT /parking-spots/:id', () => {
    it('admin debe poder actualizar una plaza', async () => {
      const response = await request(app.getHttpServer())
        .put(`/parking-spots/${parkingSpotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      const body = response.body as { isActive: boolean };
      expect(body.isActive).toBe(false);
    });

    it('empleado debe recibir 403', async () => {
      await request(app.getHttpServer())
        .put(`/parking-spots/${parkingSpotId}`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .send({ isActive: true })
        .expect(403);
    });

    it('debe fallar con 409 si el nuevo code ya existe en otra plaza', async () => {
      // crea una segunda plaza
      const segunda = await request(app.getHttpServer())
        .post('/parking-spots')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'B1', type: 'auto' })
        .expect(201);

      const segundaId = (segunda.body as { id: string }).id;

      // intenta renombrarla al code de la primera plaza
      await request(app.getHttpServer())
        .put(`/parking-spots/${segundaId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'A1' })
        .expect(409);
    });
  });

  describe('DELETE /parking-spots/:id', () => {
    it('empleado debe recibir 403', async () => {
      await request(app.getHttpServer())
        .delete(`/parking-spots/${parkingSpotId}`)
        .set('Authorization', `Bearer ${empleadoToken}`)
        .expect(403);
    });

    it('admin debe poder eliminar una plaza', async () => {
      await request(app.getHttpServer())
        .delete(`/parking-spots/${parkingSpotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});
