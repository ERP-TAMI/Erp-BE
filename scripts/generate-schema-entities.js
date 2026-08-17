const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'db/database-schema-postgresql15.sql'), 'utf8');
const outputRoot = path.join(root, 'src/features');
const featureNames = {
  auth: 'Auth', 'master-data': 'MasterData', documents: 'Documents', styles: 'Styles', 'draft-boms': 'DraftBoms',
  'purchase-orders': 'PurchaseOrders', boms: 'Boms', production: 'Production', notifications: 'Notifications', audit: 'Audit', platform: 'Platform',
};
const enumTypes = {
  record_status: 'RecordStatus',
  po_status: 'PoStatus',
  product_status: 'ProductStatus',
  style_status: 'StyleStatus',
  sample_status: 'SampleStatus',
  production_doc_status: 'ProductionDocStatus',
  upload_status: 'UploadStatus',
  document_purpose: 'DocumentPurpose',
  bom_status: 'BomStatus',
  notification_channel: 'NotificationChannel',
  notification_delivery_status: 'NotificationDeliveryStatus',
  audit_event_type: 'AuditEventType',
};

const featureMap = {
  users: 'auth', roles: 'auth', permissions: 'auth', user_roles: 'auth', role_permissions: 'auth', user_sessions: 'auth',
  customers: 'master-data', material_groups: 'master-data', units: 'master-data', materials: 'master-data', material_sizes: 'master-data',
  stages: 'master-data', stage_groups: 'master-data', stage_group_items: 'master-data', workshops: 'master-data', size_charts: 'master-data', size_chart_items: 'master-data',
  documents: 'documents', document_versions: 'documents', document_folders: 'documents', folder_documents: 'documents',
  styles: 'styles', style_documents: 'styles', style_operation_steps: 'styles', style_sample_rounds: 'styles', style_sample_images: 'styles',
  draft_bom_families: 'draft-boms', draft_bom_versions: 'draft-boms', draft_bom_lines: 'draft-boms',
  purchase_orders: 'purchase-orders', purchase_order_status_history: 'purchase-orders', purchase_order_documents: 'purchase-orders',
  purchase_order_products: 'purchase-orders', purchase_order_product_status_history: 'purchase-orders', purchase_order_product_documents: 'purchase-orders',
  purchase_order_product_colors: 'purchase-orders', purchase_order_product_color_sizes: 'purchase-orders', purchase_order_product_operation_steps: 'purchase-orders',
  purchase_order_product_sample_rounds: 'purchase-orders', purchase_order_product_sample_images: 'purchase-orders', product_color_cards: 'purchase-orders', product_color_card_versions: 'purchase-orders',
  bills_of_materials: 'boms', bill_of_material_lines: 'boms', bill_of_material_status_history: 'boms',
  production_documents: 'production', production_document_sections: 'production', production_document_size_rows: 'production', production_document_images: 'production', production_document_revisions: 'production', production_plans: 'production', production_plan_days: 'production',
  notification_catalog: 'notifications', notification_catalog_roles: 'notifications', notification_preferences: 'notifications', notifications: 'notifications', notification_deliveries: 'notifications',
  idempotency_keys: 'platform', outbox_events: 'platform', audit_events: 'audit', audit_event_changes: 'audit',
};

const classNames = {
  users: 'User', roles: 'Role', permissions: 'Permission', user_roles: 'UserRole', role_permissions: 'RolePermission', user_sessions: 'UserSession',
  material_groups: 'MaterialGroup', materials: 'Material', material_sizes: 'MaterialSize', size_charts: 'SizeChart', size_chart_items: 'SizeChartItem',
  stage_groups: 'StageGroup', stage_group_items: 'StageGroupItem', purchase_orders: 'PurchaseOrder', purchase_order_products: 'PurchaseOrderProduct',
  bills_of_materials: 'BillOfMaterials', bill_of_material_lines: 'BillOfMaterialLine', bill_of_material_status_history: 'BillOfMaterialStatusHistory',
  audit_events: 'AuditEvent', audit_event_changes: 'AuditEventChange', idempotency_keys: 'IdempotencyKey', outbox_events: 'OutboxEvent',
};

function pascal(value) {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function className(table) {
  return classNames[table] || pascal(table.replace(/s$/, ''));
}

function splitTopLevel(value) {
  const items = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'") quote = !quote;
    if (!quote && char === '(') depth += 1;
    if (!quote && char === ')') depth -= 1;
    if (!quote && depth === 0 && char === ',') {
      items.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(value.slice(start).trim());
  return items.filter(Boolean);
}

function tableBlocks() {
  const result = [];
  const matcher = /CREATE TABLE\s+(\w+)\s*\(/gi;
  let match;
  while ((match = matcher.exec(sql))) {
    const open = matcher.lastIndex - 1;
    let depth = 0;
    let close = -1;
    for (let index = open; index < sql.length; index += 1) {
      if (sql[index] === '(') depth += 1;
      if (sql[index] === ')') {
        depth -= 1;
        if (depth === 0) { close = index; break; }
      }
    }
    result.push({ table: match[1], body: sql.slice(open + 1, close) });
  }
  return result;
}

function typeInfo(definition) {
  const rawType = definition.trim().match(/^([a-zA-Z_]\w*)/)?.[1]?.toLowerCase();
  if (rawType && enumTypes[rawType]) {
    const options = [`type: 'enum'`, `enum: ${enumTypes[rawType]}`, `enumName: '${rawType}'`];
    if (!/NOT NULL/i.test(definition)) options.push('nullable: true');
    return { type: 'enum', tsEnum: enumTypes[rawType], options };
  }
  const type = definition.match(/\b(uuid|varchar|char|text|date|timestamptz|timestamp|inet|jsonb|numeric|decimal|bigint|smallint|integer|int|boolean)\b/i)?.[1]?.toLowerCase() || 'text';
  const map = { varchar: 'varchar', char: 'char', text: 'text', uuid: 'uuid', date: 'date', timestamptz: 'timestamptz', timestamp: 'timestamp', inet: 'inet', jsonb: 'jsonb', numeric: 'numeric', decimal: 'numeric', bigint: 'bigint', smallint: 'smallint', integer: 'int', int: 'int', boolean: 'boolean' };
  const ormType = map[type];
  const options = [`type: '${ormType}'`];
  const length = definition.match(/(?:varchar|char)\((\d+)\)/i)?.[1];
  const numeric = definition.match(/(?:numeric|decimal)\((\d+),(\d+)\)/i);
  if (length) options.push(`length: ${length}`);
  if (numeric) options.push(`precision: ${numeric[1]}`, `scale: ${numeric[2]}`);
  if (/DEFAULT\s+NULL/i.test(definition) || !/NOT NULL/i.test(definition)) options.push('nullable: true');
  const defaultValue = definition.match(/DEFAULT\s+([^\s,]+)/i)?.[1];
  if (defaultValue && !/^gen_random_uuid\(\)$/i.test(defaultValue)) {
    if (/^(true|false)$/i.test(defaultValue)) options.push(`default: ${defaultValue.toLowerCase()}`);
    else if (/^-?\d+(\.\d+)?$/.test(defaultValue)) options.push(`default: ${defaultValue}`);
  }
  return { type: ormType, options };
}

function entitySource(table, body) {
  const parts = splitTopLevel(body);
  const primary = parts.find((part) => /^PRIMARY KEY/i.test(part) || /^CONSTRAINT\s+\S+\s+PRIMARY KEY/i.test(part));
  const composite = primary?.match(/PRIMARY KEY\s*\(([^)]+)\)/i)?.[1]?.split(',').map((item) => item.trim()) || [];
  const columns = parts.filter((part) => !/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)/i.test(part));
  const parsed = columns.map((definition) => {
    const match = definition.match(/^([a-zA-Z_]\w*)\s+(.+)$/s);
    if (!match) return null;
    const [, name, rest] = match;
    return { name, rest, pk: /PRIMARY KEY/i.test(rest), generated: /GENERATED ALWAYS AS IDENTITY|DEFAULT\s+gen_random_uuid\(\)/i.test(rest), ...typeInfo(rest) };
  }).filter(Boolean);
  const pkNames = composite.length ? composite : parsed.filter((item) => item.pk).map((item) => item.name);
  const imports = ['Entity'];
  if (parsed.some((item) => !pkNames.includes(item.name))) imports.push('Column');
  if (pkNames.some((name) => parsed.find((item) => item.name === name)?.generated)) imports.push('PrimaryGeneratedColumn');
  if (pkNames.some((name) => !parsed.find((item) => item.name === name)?.generated)) imports.push('PrimaryColumn');
  const enumImports = [...new Set(parsed.filter((item) => item.tsEnum).map((item) => item.tsEnum))];
  const lines = [`import { ${imports.join(', ')} } from 'typeorm';`];
  if (enumImports.length) lines.push(`import { ${enumImports.join(', ')} } from '../../../common/enums/database.enums';`);
  lines.push('', `@Entity('${table}')`, `export class ${className(table)} {`);
  for (const column of parsed) {
    const property = column.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    if (pkNames.includes(column.name)) {
      if (column.generated && column.type === 'bigint') lines.push(`  @PrimaryGeneratedColumn('increment', { type: 'bigint' })`);
      else if (column.generated && column.type === 'uuid') lines.push(`  @PrimaryGeneratedColumn('uuid')`);
      else lines.push(`  @PrimaryColumn({ type: '${column.type}' })`);
    } else {
      const options = [...column.options];
      if (column.name !== property) options.push(`name: '${column.name}'`);
      lines.push(`  @Column({ ${options.join(', ')} })`);
    }
    const tsType = column.tsEnum || (column.type === 'boolean' ? 'boolean' : column.type === 'int' || column.type === 'smallint' || column.type === 'bigint' || column.type === 'numeric' ? 'number' : column.type === 'date' || column.type.includes('timestamp') ? 'Date' : 'string');
    lines.push(`  ${property}: ${tsType};`, '');
  }
  lines.push('}', '');
  return lines.join('\n');
}

const grouped = new Map();
for (const { table, body } of tableBlocks()) {
  const feature = featureMap[table] || 'platform';
  if (!grouped.has(feature)) grouped.set(feature, []);
  grouped.get(feature).push({ table, body });
}

for (const [feature, tables] of grouped) {
  const directory = path.join(outputRoot, feature, 'entities');
  fs.mkdirSync(directory, { recursive: true });
  const exports = tables.map(({ table }) => className(table));
  for (const { table, body } of tables) {
    fs.writeFileSync(path.join(directory, `${className(table)}.entity.ts`), entitySource(table, body));
  }
  const entityConstant = `${featureNames[feature].toUpperCase()}_ENTITIES`;
  const imports = tables.map(({ table }) => `import { ${className(table)} } from './${className(table)}.entity';`).join('\n');
  fs.writeFileSync(path.join(directory, 'index.ts'), `${imports}\n\nexport { ${exports.join(', ')} };\nexport const ${entityConstant} = [${exports.join(', ')}];\n`);
  const featureClass = `${featureNames[feature]}Module`;
  const featureService = `${featureNames[feature]}Service`;
  const featureController = `${featureNames[feature]}Controller`;
  fs.mkdirSync(path.join(root, 'src/features', feature), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/features', feature, `${feature}.service.ts`), `import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class ${featureService} {}\n`);
  fs.writeFileSync(path.join(root, 'src/features', feature, `${feature}.controller.ts`), `import { Controller } from '@nestjs/common';\n\n@Controller('${feature}')\nexport class ${featureController} {}\n`);
  fs.writeFileSync(path.join(root, 'src/features', feature, `${feature}.module.ts`), `import { Module } from '@nestjs/common';\nimport { TypeOrmModule } from '@nestjs/typeorm';\nimport { ${entityConstant} } from './entities';\nimport { ${featureController} } from './${feature}.controller';\nimport { ${featureService} } from './${feature}.service';\n\n@Module({\n  imports: [TypeOrmModule.forFeature(${entityConstant})],\n  controllers: [${featureController}],\n  providers: [${featureService}],\n  exports: [${featureService}],\n})\nexport class ${featureClass} {}\n`);
}

console.log(`Generated entities for ${tableBlocks().length} tables.`);
