import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

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
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    await dataSource.query('DELETE FROM users');
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users');
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('debe registrar un usuario correctamente', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'test@parking.com',
          password: '123456',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', 'test@parking.com');
      expect(response.body).toHaveProperty('role', 'cliente');
      expect(response.body).not.toHaveProperty('password');
    });

    it('debe fallar si el email ya existe', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'test@parking.com',
          password: '123456',
        })
        .expect(409);
    });

    it('debe fallar si faltan campos requeridos', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test2@parking.com',
        })
        .expect(400);
    });

    it('debe fallar si el email es inválido', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'emailinvalido',
          password: '123456',
        })
        .expect(400);
    });

    it('debe ignorar el rol y asignar cliente por defecto', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Hacker',
          email: 'hacker@parking.com',
          password: '123456',
          role: 'admin',
        })
        .expect(201);

      const body = response.body as { role: string };
      expect(body.role).toBe('cliente');
    });
  });

  describe('POST /auth/login', () => {
    it('debe hacer login y devolver un access_token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@parking.com',
          password: '123456',
        })
        .expect(200);

      const body = response.body as {
        access_token: string;
        user: Record<string, unknown>;
      };
      expect(body).toHaveProperty('access_token');
      expect(body).toHaveProperty('user');
      expect(body.user).not.toHaveProperty('password');
    });

    it('debe fallar con password incorrecto', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@parking.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('debe fallar si el usuario no existe', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'noexiste@parking.com',
          password: '123456',
        })
        .expect(401);
    });
  });
});
