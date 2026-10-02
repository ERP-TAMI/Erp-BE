import { Document } from './Document.entity';
import { DocumentVersion } from './DocumentVersion.entity';
import { DocumentFolder } from './DocumentFolder.entity';
import { FolderDocument } from './FolderDocument.entity';
import { DocumentPin } from './DocumentPin.entity';

export {
  Document,
  DocumentVersion,
  DocumentFolder,
  FolderDocument,
  DocumentPin,
};
export const DOCUMENTS_ENTITIES = [
  Document,
  DocumentVersion,
  DocumentFolder,
  FolderDocument,
  DocumentPin,
];
