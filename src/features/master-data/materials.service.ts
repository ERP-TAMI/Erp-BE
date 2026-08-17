import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class MaterialsService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(MaterialsService.name);
  }
}
