import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { App } from 'supertest/types';

describe('Execution Service (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/execution/health/live (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/execution/health/live')
      .expect(200, { status: 'ok' });
  });

  it('/api/execution/health/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/execution/health/ready')
      .expect(200, { status: 'ok' });
  });
});
