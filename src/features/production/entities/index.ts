import { ProductionDocument } from './ProductionDocument.entity';
import { ProductionDocumentSection } from './ProductionDocumentSection.entity';
import { ProductionDocumentSizeRow } from './ProductionDocumentSizeRow.entity';
import { ProductionDocumentImage } from './ProductionDocumentImage.entity';
import { ProductionDocumentRevision } from './ProductionDocumentRevision.entity';
import { ProductionPlan } from './ProductionPlan.entity';
import { ProductionPlanDay } from './ProductionPlanDay.entity';

export {
  ProductionDocument,
  ProductionDocumentSection,
  ProductionDocumentSizeRow,
  ProductionDocumentImage,
  ProductionDocumentRevision,
  ProductionPlan,
  ProductionPlanDay,
};
export const PRODUCTION_ENTITIES = [
  ProductionDocument,
  ProductionDocumentSection,
  ProductionDocumentSizeRow,
  ProductionDocumentImage,
  ProductionDocumentRevision,
  ProductionPlan,
  ProductionPlanDay,
];
