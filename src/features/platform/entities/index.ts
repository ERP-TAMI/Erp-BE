import { IdempotencyKey } from './IdempotencyKey.entity';
import { OutboxEvent } from './OutboxEvent.entity';

export { IdempotencyKey, OutboxEvent };
export const PLATFORM_ENTITIES = [IdempotencyKey, OutboxEvent];
