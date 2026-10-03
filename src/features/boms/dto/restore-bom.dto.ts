import { ExpectedRowVersionDto } from './expected-row-version.dto';

/** Optimistic lock token required when restoring a discontinued BOM. */
export class RestoreBomDto extends ExpectedRowVersionDto {}
