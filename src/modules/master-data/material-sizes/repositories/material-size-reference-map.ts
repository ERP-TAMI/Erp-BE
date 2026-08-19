import { Injectable } from '@nestjs/common';

@Injectable()
export class MaterialSizeReferenceMap {
  async hasReference(materialSizeId: string): Promise<boolean> {
    // No current entity owns a material_size_id foreign key. Keep this seam so
    // each future consumer must be registered before hard delete is allowed.
    void materialSizeId;
    return false;
  }
}
