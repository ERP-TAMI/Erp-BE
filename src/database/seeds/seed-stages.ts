import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';

export type StageSeed = {
  stageCode: string;
  stageName: string;
  description: string;
  ssv: string;
};

const stage = (stageCode: string, stageName: string): StageSeed => ({
  stageCode,
  stageName,
  description: stageName,
  ssv: '10',
});

export const STAGE_SEEDS: readonly StageSeed[] = [
  stage('GD-KANSAI-LAI', 'Kansai lai'),
  stage('GD-UI-TP', 'Ủi TP'),
  stage('GD-UI-TP-PHA-HOI', 'Ủi TP + phà hơi'),
  stage('GD-UI-TP-UI-LY-SONG', 'Ủi TP + ủi ly + sóng'),
  stage('GD-GAP-XEP', 'Gấp xếp'),
  stage('GD-BAN-DAN-DAY-NIT', 'Bắn đạn dây nịt'),
  stage('GD-XO-THAT-DAY-NIT', 'Xỏ thắt dây nịt'),
  stage('GD-LUOT-NHAN-XUONG-CAT', 'Lượt nhãn – XƯỞNG CẮT'),
  stage('GD-GAN-NHAN', 'Gắn nhãn'),
  stage('GD-UI-CT-UI-GAP-LUNG-LOT-X2', 'Ủi CT – Ủi gấp lưng lót x2'),
  stage('GD-UI-CT-UI-KEO-THAN', 'Ủi CT – Ủi keo thân'),
  stage('GD-UI-CT-UI-KEO-THAN-SAU', 'Ủi CT – Ủi keo thân sau'),
  stage('GD-UI-CT-UI-KEO-TUI', 'Ủi CT – Ủi keo túi'),
  stage('GD-UI-CT-UI-KEO-NEP-TUI', 'Ủi CT – Ủi keo nẹp túi'),
  stage('GD-UI-CT-EP-KEO-NEP-TUI-SAU', 'Ủi CT – Ép keo nẹp túi sau'),
  stage('GD-UI-CT-UI-KEO-LUNG', 'Ủi CT – Ủi keo lưng'),
  stage('GD-UI-CT-UI-KEO-TS', 'Ủi CT – Ủi keo TS'),
  stage('GD-UI-CT-UI-KEO-NTS', 'Ủi CT – Ủi keo NTS'),
  stage('GD-UI-CT-UI-KEO-TT', 'Ủi CT – Ủi keo TT'),
  stage('GD-UI-CT-UI-KEO-PAGET', 'Ủi CT – Ủi keo paget'),
  stage('GD-UI-CT-UI-GAP-TUI', 'Ủi CT – Ủi gấp túi'),
  stage('GD-CHAY-CAT-DAY-PATSAN-X1-X2-X5', 'Chạy cắt dây patsan (X1, X2, X5)'),
  stage('GD-CHAY-CAT-PASSANT', 'Chạy + cắt passant'),
  stage('GD-CHAY-KANSAI-LUNG-CAT', 'Chạy kansai lưng + cắt'),
  stage('GD-CHAY-DAY-VIEN-LUNG', 'Chạy dây viền lưng'),
  stage('GD-MAY-LON-DAU-LUNG', 'May lộn đầu lưng'),
  stage('GD-MAY-LON-DAY-KHOEN', 'May lộn dây khoen'),
  stage('GD-DINH-LUNG-VAO-THUN', 'Đính lưng vào thun'),
  stage('GD-THUA-KHUY-DAU-LUNG', 'Thùa khuy đầu lưng'),
  stage('GD-DUC-LO', 'Đục lỗ'),
  stage('GD-LD-NUT', 'LD nút (làm dấu nút)'),
  stage('GD-DONG-NUT-X1-X2-NUT-PAT', 'Đóng nút (X1, X2, nút pat)'),
  stage('GD-LUON-DAY-QUA-CHUONG', 'Luồn dây qua chuông'),
  stage('GD-BE-DINH-DAU-DAY', 'Bẻ đính đầu dây'),
];

export async function seedStages(manager: EntityManager): Promise<void> {
  const placeholders = STAGE_SEEDS.map((_, index) => {
    const offset = index * 4;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, 'active'::record_status)`;
  }).join(',\n');
  const parameters = STAGE_SEEDS.flatMap((item) => [
    item.stageCode,
    item.stageName,
    item.description,
    item.ssv,
  ]);

  await manager.query(
    `INSERT INTO stages (stage_code, stage_name, description, default_ssv, status)
     VALUES ${placeholders}
     ON CONFLICT (stage_code) DO NOTHING`,
    parameters,
  );
}

export async function seedStageCatalog(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(seedStages);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await seedStageCatalog(AppDataSource);
    console.log(`Ensured ${STAGE_SEEDS.length} stage catalog rows.`);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed stages failed:', error);
    process.exitCode = 1;
  });
}
