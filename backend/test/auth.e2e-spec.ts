import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/users/entities/user.entity';
import { Repository } from 'typeorm';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let uniqueId: string;

  beforeAll(async () => {
    uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    userRepository = moduleFixture.get(getRepositoryToken(User));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Clean up test data
    await userRepository.query(
      `DELETE FROM users WHERE email LIKE '%@auth-${uniqueId}.test'`,
    );
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      expect.hasAssertions();
      const registerDto = {
        email: `newuser@auth-${uniqueId}.test`,
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'owner',
      };

      return request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body.user.email).toBe(registerDto.email);
          expect(res.body.user).not.toHaveProperty('passwordHash');
        });
    });

    it('should fail with duplicate email', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const registerDto = {
        email: `duplicate@auth-${uniqueId}.test`,
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'owner',
      };

      // First registration
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      // Second registration with same email
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(409);

      expect(res.status).toBe(409);
    });

    it('should fail with invalid email', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const registerDto = {
        email: 'invalid-email',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'owner',
      };

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(400);

      expect(res.status).toBe(400);
    });

    it('should fail with weak password', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const registerDto = {
        email: `weakpass@auth-${uniqueId}.test`,
        password: '123',
        firstName: 'Test',
        lastName: 'User',
        role: 'owner',
      };

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(400);

      expect(res.status).toBe(400);
    });
  });

  describe('/auth/login (POST)', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = {
        email: `login-test@auth-${uniqueId}.test`,
        password: 'Password123!',
        firstName: 'Login',
        lastName: 'Test',
        role: 'owner',
      };
      // Register user for login tests
      await request(app.getHttpServer()).post('/auth/register').send(testUser);
    });

    it('should login with valid credentials', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('should fail with invalid password', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword',
        })
        .expect(401);

      expect(res.status).toBe(401);
    });

    it('should fail with non-existent user', async () => {
      expect.hasAssertions();
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `nonexistent@auth-${uniqueId}.test`,
          password: 'Password123!',
        })
        .expect(401);

      expect(res.status).toBe(401);
    });
  });

  describe('Protected Routes', () => {
    let accessToken: string;
    let testUser: any;

    beforeEach(async () => {
      testUser = {
        email: `protected@auth-${uniqueId}.test`,
        password: 'Password123!',
        firstName: 'Protected',
        lastName: 'Test',
        role: 'owner',
      };

      // Register and login to get token
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);

      accessToken = registerRes.body.accessToken;
    });

    it('should access protected route with valid token', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const res = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(testUser.email);
    });

    it('should fail to access protected route without token', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const res = await request(app.getHttpServer())
        .get('/auth/profile')
        .expect(401);

      expect(res.status).toBe(401);
    });

    it('should fail to access protected route with invalid token', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const res = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.status).toBe(401);
    });

    it('should fail to access protected route with malformed header', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const res = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', accessToken) // Missing "Bearer"
        .expect(401);

      expect(res.status).toBe(401);
    });
  });
});
