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

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  let adminToken: string;
  let clienteToken: string;
  let clienteId: string;

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

    const hashedPassword = await bcrypt.hash('admin123', 10);
    await dataSource.query(
      `INSERT INTO users (id, name, email, password, role)
       VALUES (gen_random_uuid(), 'Admin Test', 'admin-test@parking.com', $1, 'admin')`,
      [hashedPassword],
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin-test@parking.com', password: 'admin123' });

    const adminBody = adminLogin.body as { access_token: string };
    adminToken = adminBody.access_token;

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Cliente Test',
        email: 'cliente-test@parking.com',
        password: '123456',
      });

    const registerBody = registerResponse.body as { id: string };
    clienteId = registerBody.id;

    const clienteLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'cliente-test@parking.com', password: '123456' });

    const clienteBody = clienteLogin.body as { access_token: string };
    clienteToken = clienteBody.access_token;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users');
    await app.close();
  });

  describe('POST /users', () => {
    it('admin debe poder crear un usuario con cualquier rol', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Empleado Test',
          email: 'empleado-test@parking.com',
          password: '123456',
          role: 'empleado',
        })
        .expect(201);

      const body = response.body as { role: string; password?: string };
      expect(body.role).toBe('empleado');
      expect(body.password).toBeUndefined();
    });

    it('cliente debe recibir 403 al intentar crear usuarios', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          name: 'Hacker',
          email: 'hacker-test@parking.com',
          password: '123456',
          role: 'admin',
        })
        .expect(403);
    });
  });

  describe('GET /users/profile', () => {
    it('debe devolver el perfil del usuario autenticado', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(200);

      const body = response.body as { email: string };
      expect(body.email).toBe('cliente-test@parking.com');
    });

    it('debe fallar sin token', async () => {
      await request(app.getHttpServer()).get('/users/profile').expect(401);
    });
  });

  describe('PATCH /users/change-password', () => {
    it('debe cambiar la contraseña con credenciales correctas', async () => {
      await request(app.getHttpServer())
        .patch('/users/change-password')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          currentPassword: '123456',
          newPassword: 'nuevapassword123',
        })
        .expect(200);
    });

    it('debe fallar si la contraseña actual es incorrecta', async () => {
      await request(app.getHttpServer())
        .patch('/users/change-password')
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({
          currentPassword: 'incorrecta',
          newPassword: 'otraPassword123',
        })
        .expect(401);
    });
  });

  describe('GET /users', () => {
    it('admin debe poder listar todos los usuarios', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as unknown[];
      expect(Array.isArray(body)).toBe(true);
    });

    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });
  });

  describe('GET /users/:id', () => {
    it('admin debe poder ver un usuario específico', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${clienteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as { id: string };
      expect(body.id).toBe(clienteId);
    });

    it('debe fallar con 404 si no existe', async () => {
      await request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('un usuario no admin debe recibir 403', async () => {
      await request(app.getHttpServer())
        .get(`/users/${clienteId}`)
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });
  });

  describe('PUT /users/:id', () => {
    it('admin debe poder actualizar un usuario', async () => {
      const response = await request(app.getHttpServer())
        .put(`/users/${clienteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Nombre Actualizado' })
        .expect(200);

      const body = response.body as { name: string };
      expect(body.name).toBe('Nombre Actualizado');
    });
  });

  describe('PATCH /users/:id/role', () => {
    it('admin debe poder cambiar el rol de un usuario', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${clienteId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'empleado' })
        .expect(200);

      const body = response.body as { role: string };
      expect(body.role).toBe('empleado');
    });

    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${clienteId}/role`)
        .set('Authorization', `Bearer ${clienteToken}`)
        .send({ role: 'admin' })
        .expect(403);
    });
  });

  describe('PATCH /users/:id/password', () => {
    it('admin debe poder resetear contraseña sin saber la actual', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${clienteId}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'passwordReseteado123' })
        .expect(200);
    });
  });

  describe('DELETE /users/:id', () => {
    it('cliente debe recibir 403', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${clienteId}`)
        .set('Authorization', `Bearer ${clienteToken}`)
        .expect(403);
    });

    it('admin debe poder eliminar un usuario', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${clienteId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});
