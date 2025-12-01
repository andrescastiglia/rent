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

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

        userRepository = moduleFixture.get(getRepositoryToken(User));

        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    afterEach(async () => {
        // Clean up test data
        await userRepository.query('DELETE FROM users WHERE email LIKE \'%@test-e2e.com\'');
    });

    describe('/auth/register (POST)', () => {
        it('should register a new user', () => {
            const registerDto = {
                email: 'newuser@test-e2e.com',
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
                    expect(res.body).toHaveProperty('access_token');
                    expect(res.body.user.email).toBe(registerDto.email);
                    expect(res.body.user).not.toHaveProperty('passwordHash');
                });
        });

        it('should fail with duplicate email', async () => {
            const registerDto = {
                email: 'duplicate@test-e2e.com',
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
            return request(app.getHttpServer())
                .post('/auth/register')
                .send(registerDto)
                .expect(409);
        });

        it('should fail with invalid email', () => {
            const registerDto = {
                email: 'invalid-email',
                password: 'Password123!',
                firstName: 'Test',
                lastName: 'User',
                role: 'owner',
            };

            return request(app.getHttpServer())
                .post('/auth/register')
                .send(registerDto)
                .expect(400);
        });

        it('should fail with weak password', () => {
            const registerDto = {
                email: 'weakpass@test-e2e.com',
                password: '123',
                firstName: 'Test',
                lastName: 'User',
                role: 'owner',
            };

            return request(app.getHttpServer())
                .post('/auth/register')
                .send(registerDto)
                .expect(400);
        });
    });

    describe('/auth/login (POST)', () => {
        const testUser = {
            email: 'login-test@test-e2e.com',
            password: 'Password123!',
            firstName: 'Login',
            lastName: 'Test',
            role: 'owner',
        };

        beforeEach(async () => {
            // Register user for login tests
            await request(app.getHttpServer())
                .post('/auth/register')
                .send(testUser);
        });

        it('should login with valid credentials', () => {
            return request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200)
                .expect((res) => {
                    expect(res.body).toHaveProperty('access_token');
                    expect(res.body).toHaveProperty('user');
                    expect(res.body.user.email).toBe(testUser.email);
                });
        });

        it('should fail with invalid password', () => {
            return request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: testUser.email,
                    password: 'WrongPassword',
                })
                .expect(401);
        });

        it('should fail with non-existent user', () => {
            return request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: 'nonexistent@test-e2e.com',
                    password: 'Password123!',
                })
                .expect(401);
        });
    });

    describe('Protected Routes', () => {
        let accessToken: string;
        const testUser = {
            email: 'protected@test-e2e.com',
            password: 'Password123!',
            firstName: 'Protected',
            lastName: 'Test',
            role: 'owner',
        };

        beforeEach(async () => {
            // Register and login to get token
            const registerRes = await request(app.getHttpServer())
                .post('/auth/register')
                .send(testUser);

            accessToken = registerRes.body.access_token;
        });

        it('should access protected route with valid token', () => {
            return request(app.getHttpServer())
                .get('/auth/profile')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200)
                .expect((res) => {
                    expect(res.body.email).toBe(testUser.email);
                });
        });

        it('should fail to access protected route without token', () => {
            return request(app.getHttpServer())
                .get('/auth/profile')
                .expect(401);
        });

        it('should fail to access protected route with invalid token', () => {
            return request(app.getHttpServer())
                .get('/auth/profile')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);
        });

        it('should fail to access protected route with malformed header', () => {
            return request(app.getHttpServer())
                .get('/auth/profile')
                .set('Authorization', accessToken) // Missing "Bearer"
                .expect(401);
        });
    });
});
