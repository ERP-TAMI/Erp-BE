import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  async getReadiness() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  getHealth() {
    return {
      status: 'ok',
      service: 'erp-be',
      timestamp: new Date().toISOString(),
    };
  }
}
