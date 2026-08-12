import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'erp-be',
      timestamp: new Date().toISOString(),
    };
  }
}
