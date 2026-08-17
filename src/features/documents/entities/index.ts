import { Document } from './Document.entity';
import { DocumentVersion } from './DocumentVersion.entity';
import { DocumentFolder } from './DocumentFolder.entity';
import { FolderDocument } from './FolderDocument.entity';

export { Document, DocumentVersion, DocumentFolder, FolderDocument };
export const DOCUMENTS_ENTITIES = [
  Document,
  DocumentVersion,
  DocumentFolder,
  FolderDocument,
];
