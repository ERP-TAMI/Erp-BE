import { ExpectedRowVersionDto } from './expected-row-version.dto';

/** Optimistic lock token required when deleting a discontinued BOM. */
export class DeleteBomDto extends ExpectedRowVersionDto {}
