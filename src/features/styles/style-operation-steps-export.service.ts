import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { StyleOperationStep } from './entities/StyleOperationStep.entity';

export type OperationStepExportInput = {
  styleCode: string;
  styleName?: string;
  category?: string | null;
  material?: string | null;
  imageUrl?: string | null;
  as3bCmBaseDays?: number | null;
  steps: StyleOperationStep[];
};

@Injectable()
export class StyleOperationStepsExportService {
  async buildExcelBuffer(input: OperationStepExportInput): Promise<Buffer> {
    const templatePath = this.resolveTemplatePath();
    const WorkbookClass =
      ExcelJS.Workbook || (ExcelJS as any).default?.Workbook;
    const workbook = new WorkbookClass();
    await workbook.xlsx.readFile(templatePath);

    const sheet = workbook.getWorksheet(1);
    if (!sheet) {
      throw new Error('Không tìm thấy worksheet trong template Excel');
    }

    const sortedSteps = [...(input.steps || [])].sort(
      (a, b) => Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0),
    );
    const mainSteps = this.buildMainExportRows(sortedSteps);
    const rowCount = Math.max(mainSteps.length, 1);
    const baseDataRows = 11;
    const lastDataRow = 1 + Math.max(rowCount, baseDataRows);
    const totalRow = lastDataRow + 1;

    this.prepareSheetForRows(sheet, Math.max(rowCount, baseDataRows));
    this.fillMergedIdentityColumns(
      sheet,
      input,
      mainSteps,
      lastDataRow,
      totalRow,
    );
    this.fillMainSteps(sheet, mainSteps, input, lastDataRow, totalRow);
    this.fillGroupSteps(sheet, sortedSteps, mainSteps, '1k', 12, lastDataRow);
    this.fillGroupSteps(
      sheet,
      sortedSteps,
      mainSteps,
      'vat-so',
      15,
      lastDataRow,
    );

    if (input.imageUrl) {
      await this.addStructureImage(workbook, sheet, input.imageUrl);
    }

    const output = await workbook.xlsx.writeBuffer();
    return Buffer.from(output as ArrayBuffer);
  }

  private resolveTemplatePath(): string {
    const candidates = [
      path.join(
        process.cwd(),
        'src',
        'TemplateMau',
        'TemplateBangCongDoan.xlsx',
      ),
      path.join(
        process.cwd(),
        'dist',
        'TemplateMau',
        'TemplateBangCongDoan.xlsx',
      ),
      path.join(process.cwd(), 'TemplateMau', 'TemplateBangCongDoan.xlsx'),
      path.join(
        __dirname,
        '..',
        '..',
        'TemplateMau',
        'TemplateBangCongDoan.xlsx',
      ),
    ];
    const templatePath = candidates.find((candidate) =>
      fs.existsSync(candidate),
    );
    if (!templatePath) {
      throw new NotFoundException(
        'Không tìm thấy file TemplateMau/TemplateBangCongDoan.xlsx',
      );
    }
    return templatePath;
  }

  private prepareSheetForRows(
    sheet: ExcelJS.Worksheet,
    dataRows: number,
  ): void {
    this.unmergeIfExists(sheet, 'A2:A13');
    this.unmergeIfExists(sheet, 'B2:B12');
    this.unmergeIfExists(sheet, 'C2:C12');
    this.unmergeIfExists(sheet, 'H2:H12');
    this.unmergeIfExists(sheet, 'I2:I12');

    const extraRows = Math.max(0, dataRows - 11);
    if (extraRows > 0) {
      sheet.spliceRows(13, 0, ...Array.from({ length: extraRows }, () => []));
      for (let rowNumber = 13; rowNumber < 13 + extraRows; rowNumber += 1) {
        this.copyRowStyle(sheet, 12, rowNumber);
      }
    }

    const lastDataRow = 1 + dataRows;
    const totalRow = lastDataRow + 1;

    for (let row = 2; row <= lastDataRow; row += 1) {
      for (let col = 1; col <= 17; col += 1) {
        sheet.getCell(row, col).value = null;
      }
      this.copyRowStyle(sheet, row === 2 ? 2 : 12, row);
    }

    sheet.mergeCells(`A2:A${totalRow}`);
    sheet.mergeCells(`B2:B${lastDataRow}`);
    sheet.mergeCells(`C2:C${lastDataRow}`);
    sheet.mergeCells(`I2:I${lastDataRow}`);
  }

  private fillMergedIdentityColumns(
    sheet: ExcelJS.Worksheet,
    input: OperationStepExportInput,
    mainSteps: StyleOperationStep[],
    _lastDataRow: number,
    totalRow: number,
  ): void {
    sheet.getCell('A2').value = input.styleCode || '';
    sheet.getCell('C2').value = [input.category, input.material]
      .filter(Boolean)
      .join(' - ');

    sheet.getCell('A2').alignment = {
      ...(sheet.getCell('A2').alignment || {}),
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    sheet.getCell('B2').alignment = {
      ...(sheet.getCell('B2').alignment || {}),
      vertical: 'middle',
      horizontal: 'center',
    };
    sheet.getCell('C2').alignment = {
      ...(sheet.getCell('C2').alignment || {}),
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };

    const totalTime = mainSteps.reduce(
      (sum, row) => sum + Number(row.timePerPiece || 0),
      0,
    );
    const productPerPersonDay = totalTime > 0 ? (3600 / totalTime) * 8 : 0;
    const cmValue =
      productPerPersonDay > 0
        ? Number(input.as3bCmBaseDays || 30) / productPerPersonDay
        : 0;

    sheet.getCell('I2').value =
      cmValue > 0 ? `$ ${this.formatViNumber(cmValue, 2)}` : '';
    sheet.getCell('I2').font = {
      ...(sheet.getCell('I2').font || {}),
      bold: true,
      size: 18,
    };
    sheet.getCell('I2').alignment = {
      ...(sheet.getCell('I2').alignment || {}),
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };

    sheet.getCell(`E${totalRow}`).value = totalTime || null;
    sheet.getCell(`F${totalRow}`).value = totalTime > 0 ? '100%' : '';
    sheet.getCell(`G${totalRow}`).value =
      productPerPersonDay > 0 ? Math.round(productPerPersonDay) : null;
    sheet.getCell(`K${totalRow}`).value = '';
  }

  private fillMainSteps(
    sheet: ExcelJS.Worksheet,
    steps: StyleOperationStep[],
    input: OperationStepExportInput,
    lastDataRow: number,
    totalRow: number,
  ): void {
    const totalTime = steps.reduce(
      (sum, step) => sum + Number(step.timePerPiece || 0),
      0,
    );
    const productPerPersonDay = totalTime > 0 ? (3600 / totalTime) * 8 : 0;
    const cmValue =
      productPerPersonDay > 0
        ? Number(input.as3bCmBaseDays || 30) / productPerPersonDay
        : 0;

    for (let index = 0; index < steps.length; index += 1) {
      const rowNumber = 2 + index;
      const step = steps[index];
      const time = Number(step.timePerPiece || 0);
      const targetTotal = Number(step.targetTotal || 0);
      const spPerHour = time > 0 ? 3600 / time : 0;
      const people =
        targetTotal > 0 && spPerHour > 0 ? targetTotal / (spPerHour * 8) : 0;

      sheet.getCell(rowNumber, 4).value = step.stepName || '';
      sheet.getCell(rowNumber, 5).value = time || null;
      sheet.getCell(rowNumber, 6).value =
        time > 0 && totalTime > 0
          ? `${Math.round((time / totalTime) * 100)}%`
          : '';
      sheet.getCell(rowNumber, 7).value =
        spPerHour > 0 ? this.round(spPerHour, 2) : null;
      sheet.getCell(rowNumber, 8).value = step.note || '';
      sheet.getCell(rowNumber, 9).value =
        cmValue > 0 ? `$ ${this.formatViNumber(cmValue, 2)}` : '';
      sheet.getCell(rowNumber, 10).value =
        people > 0 ? this.round(people, 2) : null;
      sheet.getCell(rowNumber, 11).value = targetTotal > 0 ? targetTotal : null;
    }

    for (
      let rowNumber = 2 + steps.length;
      rowNumber <= lastDataRow;
      rowNumber += 1
    ) {
      for (const col of [4, 5, 6, 7, 8, 10, 11]) {
        sheet.getCell(rowNumber, col).value = null;
      }
    }

    sheet.getCell(`D${totalRow}`).value = 'TỔNG';
    sheet.getCell(`E${totalRow}`).value = totalTime || null;
    sheet.getCell(`F${totalRow}`).value = totalTime > 0 ? '100%' : '';
    sheet.getCell(`G${totalRow}`).value =
      productPerPersonDay > 0 ? Math.round(productPerPersonDay) : null;
  }

  private buildMainExportRows(
    allSteps: StyleOperationStep[],
  ): StyleOperationStep[] {
    return allSteps
      .filter((step) => !step.parentStepId)
      .map((step) => {
        if (!step.isGroup) return step;

        const children = allSteps.filter(
          (child) => child.parentStepId === step.id && !child.isGroup,
        );
        const totalTime =
          children.length > 0
            ? children.reduce(
                (sum, child) => sum + Number(child.timePerPiece || 0),
                0,
              )
            : Number(step.timePerPiece || 0);
        const groupTarget = Number(step.targetTotal || 0);
        const childrenTarget = Number(
          children.find((child) => Number(child.targetTotal || 0) > 0)
            ?.targetTotal || 0,
        );

        return {
          ...step,
          timePerPiece: totalTime,
          targetTotal: groupTarget > 0 ? groupTarget : childrenTarget,
          note: step.note || '',
        } as StyleOperationStep;
      });
  }

  private fillGroupSteps(
    sheet: ExcelJS.Worksheet,
    allSteps: StyleOperationStep[],
    mainSteps: StyleOperationStep[],
    groupKind: '1k' | 'vat-so',
    startCol: number,
    lastDataRow: number,
  ): void {
    const groupRows = this.findGroupRows(allSteps, groupKind);
    const totalTime = mainSteps.reduce(
      (sum, step) => sum + Number(step.timePerPiece || 0),
      0,
    );

    for (let rowNumber = 2; rowNumber <= lastDataRow; rowNumber += 1) {
      sheet.getCell(rowNumber, startCol).value = null;
      sheet.getCell(rowNumber, startCol + 1).value = null;
      sheet.getCell(rowNumber, startCol + 2).value = null;
    }

    groupRows.forEach((step, index) => {
      const rowNumber = 2 + index;
      if (rowNumber > lastDataRow) return;
      const time = Number(step.timePerPiece || 0);
      sheet.getCell(rowNumber, startCol).value = step.stepName || '';
      sheet.getCell(rowNumber, startCol + 1).value = time || null;
      sheet.getCell(rowNumber, startCol + 2).value =
        time > 0 && totalTime > 0
          ? `${Math.round((time / totalTime) * 100)}%`
          : '';
    });
  }

  private findGroupRows(
    allSteps: StyleOperationStep[],
    groupKind: '1k' | 'vat-so',
  ): StyleOperationStep[] {
    const matchesGroup = (name: string) => {
      const normalized = this.normalize(name);
      if (groupKind === '1k') return normalized.includes('1k');
      return normalized.includes('vat so') || normalized.includes('vat-so');
    };

    const groups = allSteps.filter(
      (step) => step.isGroup && matchesGroup(step.stepName || ''),
    );
    const children = groups.flatMap((group) =>
      allSteps.filter(
        (step) =>
          step.parentStepId && step.parentStepId === group.id && !step.isGroup,
      ),
    );

    if (children.length > 0) return children;
    return allSteps.filter(
      (step) => !step.isGroup && matchesGroup(step.stepName || ''),
    );
  }

  private async addStructureImage(
    workbook: ExcelJS.Workbook,
    sheet: ExcelJS.Worksheet,
    imageUrl: string,
  ): Promise<void> {
    if (!imageUrl || imageUrl.startsWith('blob:')) return;

    let imageBuffer: Buffer | null = null;
    let extension: 'png' | 'jpeg' = 'png';

    try {
      if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('uploads/')) {
        const relativePath = imageUrl.startsWith('/')
          ? imageUrl.slice(1)
          : imageUrl;
        const localPath = path.join(process.cwd(), relativePath);
        if (fs.existsSync(localPath)) {
          imageBuffer = fs.readFileSync(localPath);
          const ext = path.extname(localPath).toLowerCase();
          extension =
            ext.includes('jpg') || ext.includes('jpeg') ? 'jpeg' : 'png';
        }
      } else if (
        imageUrl.startsWith('http://') ||
        imageUrl.startsWith('https://')
      ) {
        const response = await axios.get<ArrayBuffer>(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        const contentType = String(
          response.headers['content-type'] || '',
        ).toLowerCase();
        extension = contentType.includes('png') ? 'png' : 'jpeg';
        imageBuffer = Buffer.from(response.data);
      }

      if (!imageBuffer) return;

      const imageId = workbook.addImage({
        base64: imageBuffer.toString('base64'),
        extension,
      });
      sheet.addImage(imageId, {
        tl: { col: 1, row: 1 },
        br: { col: 2, row: 12 },
        editAs: 'oneCell',
      } as any);
    } catch (err) {
      console.error('Lỗi khi chèn ảnh cấu trúc vào Excel:', err);
    }
  }

  private copyRowStyle(
    sheet: ExcelJS.Worksheet,
    sourceRowNumber: number,
    targetRowNumber: number,
  ): void {
    const sourceRow = sheet.getRow(sourceRowNumber);
    const targetRow = sheet.getRow(targetRowNumber);
    targetRow.height = sourceRow.height;
    for (let col = 1; col <= 17; col += 1) {
      const sourceCell = sourceRow.getCell(col);
      const targetCell = targetRow.getCell(col);
      targetCell.style = this.cloneStyle(sourceCell.style);
    }
  }

  private unmergeIfExists(sheet: ExcelJS.Worksheet, range: string): void {
    try {
      sheet.unMergeCells(range);
    } catch {
      // Ignored
    }
  }

  private cloneStyle(style: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> {
    return JSON.parse(JSON.stringify(style || {}));
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  private round(value: number, digits: number): number {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
  }

  private formatViNumber(value: number, digits: number): string {
    return value.toLocaleString('vi-VN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
}
