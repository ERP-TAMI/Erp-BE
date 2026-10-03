import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';

describe('deployment readiness', () => {
  it('fails readiness when the database is unavailable while liveness remains OK', async () => {
    const database = {
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const service = new AppService(database as unknown as DataSource);
    await expect(service.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(service.getHealth().status).toBe('ok');
  });

  it('reports ready after a database query succeeds', async () => {
    const database = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    await expect(
      new AppService(database as unknown as DataSource).getReadiness(),
    ).resolves.toEqual({ status: 'ok' });
  });
});
