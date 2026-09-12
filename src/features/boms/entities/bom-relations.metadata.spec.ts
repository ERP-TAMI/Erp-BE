import { getMetadataArgsStorage } from 'typeorm';
import { FitBomRevision } from '../../fit-boms/entities/FitBomRevision.entity';
import { FitBomLine } from '../../fit-boms/entities/FitBomLine.entity';
import { BomRevision } from './BomRevision.entity';
import { BillOfMaterials } from './BillOfMaterials.entity';
import { BillOfMaterialLine } from './BillOfMaterialLine.entity';
import { Style } from '../../styles/entities/Style.entity';

describe('BOM and Revision Entities Metadata & Relations', () => {
  const metadata = getMetadataArgsStorage();

  describe('FitBomLine metadata', () => {
    const fblColumns = metadata.columns.filter((c) => c.target === FitBomLine);
    const fblRelations = metadata.relations.filter(
      (r) => r.target === FitBomLine,
    );

    it('has revisionId column mapped to revision_id', () => {
      const col = fblColumns.find((c) => c.propertyName === 'revisionId');
      expect(col).toBeDefined();
      expect(col?.options.name).toBe('revision_id');
      expect(col?.options.type).toBe('uuid');
    });

    it('does not have old styleId column', () => {
      const col = fblColumns.find((c) => c.propertyName === 'styleId');
      expect(col).toBeUndefined();
    });

    it('has ManyToOne relation to FitBomRevision', () => {
      const rel = fblRelations.find((r) => r.propertyName === 'revision');
      expect(rel).toBeDefined();
      expect(rel?.relationType).toBe('many-to-one');
    });
  });

  describe('FitBomRevision metadata', () => {
    const fbrColumns = metadata.columns.filter(
      (c) => c.target === FitBomRevision,
    );
    const fbrRelations = metadata.relations.filter(
      (r) => r.target === FitBomRevision,
    );

    it('has styleId column mapped to style_id', () => {
      const col = fbrColumns.find((c) => c.propertyName === 'styleId');
      expect(col).toBeDefined();
      expect(col?.options.name).toBe('style_id');
    });

    it('has ManyToOne relation to Style', () => {
      const rel = fbrRelations.find((r) => r.propertyName === 'style');
      expect(rel).toBeDefined();
      expect(rel?.relationType).toBe('many-to-one');
    });

    it('has OneToMany relation to FitBomLine', () => {
      const rel = fbrRelations.find((r) => r.propertyName === 'lines');
      expect(rel).toBeDefined();
      expect(rel?.relationType).toBe('one-to-many');
    });
  });

  describe('BillOfMaterialLine metadata', () => {
    const bmlColumns = metadata.columns.filter(
      (c) => c.target === BillOfMaterialLine,
    );
    const bmlRelations = metadata.relations.filter(
      (r) => r.target === BillOfMaterialLine,
    );

    it('has revisionId column mapped to revision_id', () => {
      const col = bmlColumns.find((c) => c.propertyName === 'revisionId');
      expect(col).toBeDefined();
      expect(col?.options.name).toBe('revision_id');
      expect(col?.options.type).toBe('uuid');
    });

    it('does not have old billOfMaterialId column', () => {
      const col = bmlColumns.find((c) => c.propertyName === 'billOfMaterialId');
      expect(col).toBeUndefined();
    });

    it('has ManyToOne relation to BomRevision', () => {
      const rel = bmlRelations.find((r) => r.propertyName === 'revision');
      expect(rel).toBeDefined();
      expect(rel?.relationType).toBe('many-to-one');
    });
  });

  describe('BomRevision metadata', () => {
    const brColumns = metadata.columns.filter((c) => c.target === BomRevision);
    const brRelations = metadata.relations.filter(
      (r) => r.target === BomRevision,
    );

    it('has billOfMaterialId and sourceFitBomRevisionId columns', () => {
      const bomIdCol = brColumns.find(
        (c) => c.propertyName === 'billOfMaterialId',
      );
      expect(bomIdCol).toBeDefined();
      expect(bomIdCol?.options.name).toBe('bill_of_material_id');

      const sourceCol = brColumns.find(
        (c) => c.propertyName === 'sourceFitBomRevisionId',
      );
      expect(sourceCol).toBeDefined();
      expect(sourceCol?.options.name).toBe('source_fit_bom_revision_id');
      expect(sourceCol?.options.nullable).toBe(true);
    });

    it('has ManyToOne relation to BillOfMaterials', () => {
      const rel = brRelations.find((r) => r.propertyName === 'billOfMaterial');
      expect(rel).toBeDefined();
      expect(rel?.relationType).toBe('many-to-one');
    });

    it('has ManyToOne relation to FitBomRevision (traceability)', () => {
      const rel = brRelations.find(
        (r) => r.propertyName === 'sourceFitBomRevision',
      );
      expect(rel).toBeDefined();
      expect(rel?.relationType).toBe('many-to-one');
    });

    it('has OneToMany relation to BillOfMaterialLine', () => {
      const rel = brRelations.find((r) => r.propertyName === 'lines');
      expect(rel).toBeDefined();
      expect(rel?.relationType).toBe('one-to-many');
    });
  });

  describe('BillOfMaterials and Style parent relations', () => {
    const bomRelations = metadata.relations.filter(
      (r) => r.target === BillOfMaterials,
    );
    const styleRelations = metadata.relations.filter((r) => r.target === Style);

    it('BillOfMaterials has OneToMany relation to BomRevision', () => {
      const rel = bomRelations.find((r) => r.propertyName === 'revisions');
      expect(rel).toBeDefined();
      expect(rel?.relationType).toBe('one-to-many');
    });

    it('Style has OneToMany relation to FitBomRevision', () => {
      const rel = styleRelations.find(
        (r) => r.propertyName === 'fitBomRevisions',
      );
      expect(rel).toBeDefined();
      expect(rel?.relationType).toBe('one-to-many');
    });
  });
});
