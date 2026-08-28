
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');

const dataDir = path.join(__dirname, '..', 'src', 'data');
const assetRoot = path.join(__dirname, '..', 'src', 'assets', 'donation-centers');
const masterAssetFolder = path.join(assetRoot, 'donatesmart-master-spreadsheet');
const imageMapPath = path.join(masterAssetFolder, 'mapping.json');
const outputPath = path.join(__dirname, '..', 'src', 'data', 'defaultDonationCenters.ts');

function cleanupStalePhotoFolders() {
  if (!fs.existsSync(assetRoot)) return;

  const folders = fs.readdirSync(assetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((folderName) =>
      folderName.startsWith('donatesmart-master-spreadsheet')
    );

  folders.forEach((folderName) => {
    const folderPath = path.join(assetRoot, folderName);

    if (folderPath !== masterAssetFolder) {
      fs.rmSync(folderPath, {
        recursive: true,
        force: true,
      });
    }
  });
}

function getSpreadsheetFiles() {
  const files = fs.existsSync(dataDir)
    ? fs.readdirSync(dataDir)
        .filter((file) =>
          /^DonateSmart Master Spreadsheet.*\.xlsx$/i.test(file)
        )
        .sort((a, b) => {
          const aMatch = a.match(/\(([^)]+)\)/);
          const bMatch = b.match(/\(([^)]+)\)/);

          const aNum = aMatch
            ? Number.parseInt(
                aMatch[1].match(/\d+/)?.[0] ?? '0',
                10
              )
            : 0;

          const bNum = bMatch
            ? Number.parseInt(
                bMatch[1].match(/\d+/)?.[0] ?? '0',
                10
              )
            : 0;

          if (aNum !== bNum) return aNum - bNum;

          return a.localeCompare(b);
        })
    : [];

  return files.map((file) => path.join(dataDir, file));
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .trim();
}

function normalizeAcceptedCategories(rawValue) {
  if (!rawValue) return [];

  return String(rawValue)
    .split(';')
    .flatMap((segment) => {
      const cleaned = normalizeText(segment);

      if (!cleaned) return [];

      const commaIndex = cleaned.indexOf(',');
      const greaterThanIndex = cleaned.indexOf(' > ');

      if (
        commaIndex !== -1 &&
        greaterThanIndex !== -1 &&
        commaIndex > greaterThanIndex
      ) {
        return cleaned
          .split(/,\s*(?=[A-Z])/)
          .map((part) => normalizeText(part));
      }

      return [cleaned];
    })
    .map((item) =>
      item
        .replace(/\s*>\s*/g, ' > ')
        .replace(/\s+/g, ' ')
    )
    .filter(Boolean)
    .filter(
      (value, index, arr) =>
        arr.indexOf(value) === index
    );
}

function getMasterPhotoFolder() {
  fs.mkdirSync(masterAssetFolder, {
    recursive: true,
  });

  const existingFiles = fs.existsSync(masterAssetFolder)
    ? fs
        .readdirSync(masterAssetFolder)
        .filter((file) =>
          file.toLowerCase().endsWith('.png')
        )
    : [];

  existingFiles.forEach((file) => {
    fs.unlinkSync(
      path.join(masterAssetFolder, file)
    );
  });

  return masterAssetFolder;
}

/**
 * Extracts the image associated with each spreadsheet row.
 *
 * IMPORTANT:
 * Excel drawing row indexes are zero-based.
 *
 * If the spreadsheet has:
 *
 *   Excel row 1 = headers
 *   Excel row 2 = first donation center
 *
 * then:
 *
 *   drawing row 1 -> data row 0
 *   drawing row 2 -> data row 1
 *
 * Therefore the conversion is:
 *
 *   localRowIndex = excelRow - 1
 *
 * NOT excelRow - 2.
 */
function buildImageMapFromSpreadsheet(
  workbookPath,
  rowCount,
  rowOffset
) {
  const zip = new AdmZip(workbookPath);

  const drawingPath = 'xl/drawings/drawing1.xml';
  const relsPath =
    'xl/drawings/_rels/drawing1.xml.rels';

  if (!zip.getEntry(drawingPath)) {
    console.log(
      `No drawing found in ${path.basename(workbookPath)}`
    );

    return {};
  }

  if (!zip.getEntry(relsPath)) {
    console.log(
      `No drawing relationships found in ${path.basename(workbookPath)}`
    );

    return {};
  }

  const drawingXml = zip.readAsText(drawingPath);
  const relsXml = zip.readAsText(relsPath);

  /**
   * Map relationship IDs to image targets.
   *
   * Example:
   * rId1 -> ../media/image1.png
   */
  const relMap = {};

  const relRegex =
    /<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"/g;

  let relMatch;

  while ((relMatch = relRegex.exec(relsXml)) !== null) {
    relMap[relMatch[1]] = relMatch[2];
  }

  const rowToImages = {};

  /**
   * Excel can store pictures as either:
   *
   * <xdr:oneCellAnchor>
   *
   * or
   *
   * <xdr:twoCellAnchor>
   *
   * Handle both.
   */
  const anchorRegex =
    /<xdr:(?:oneCellAnchor|twoCellAnchor)>[\s\S]*?<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/g;

  let anchorMatch;

  while (
    (anchorMatch = anchorRegex.exec(drawingXml)) !== null
  ) {
    const excelRowNumber = Number(anchorMatch[1]);
    const relId = anchorMatch[2];

    const target = relMap[relId];

    if (!target) continue;

    /**
     * THIS IS THE IMPORTANT FIX.
     *
     * Excel's drawing rows are zero-based.
     *
     * Excel:
     *   row 0 = spreadsheet row 1 (header)
     *   row 1 = spreadsheet row 2 (first data row)
     *
     * sheet_to_json() gives:
     *   index 0 = first data row
     *
     * Therefore:
     *
     *   data index = Excel drawing row - 1
     */
    const rowIndex = excelRowNumber - 1;

    if (
      !Number.isInteger(rowIndex) ||
      rowIndex < 0 ||
      rowIndex >= rowCount
    ) {
      console.warn(
        `Ignoring image anchored to Excel row ${excelRowNumber} because it does not map to a data row.`
      );

      continue;
    }

    if (!rowToImages[rowIndex]) {
      rowToImages[rowIndex] = [];
    }

    rowToImages[rowIndex].push(target);
  }

  const mapping = {};

  for (
    let localRowIndex = 0;
    localRowIndex < rowCount;
    localRowIndex += 1
  ) {
    const imageFiles =
      rowToImages[localRowIndex] ?? [];

    const globalRowIndex =
      rowOffset + localRowIndex;

    mapping[String(globalRowIndex)] =
      imageFiles.map(
        (mediaTarget, imageIndex) => {
          const sourceFileName =
            path.basename(mediaTarget);

          const targetFileName =
            `donatesmart-master-spreadsheet-r${
              globalRowIndex + 1
            }-i${imageIndex + 1}.png`;

          const mediaPath =
            `xl/media/${sourceFileName}`;

          const sourceEntry = zip.getEntry(mediaPath);

          if (!sourceEntry) {
            console.warn(
              `Could not find ${mediaPath} in ${path.basename(workbookPath)}`
            );

            return targetFileName;
          }

          const sourceBuffer =
            zip.readFile(mediaPath);

          if (sourceBuffer) {
            fs.writeFileSync(
              path.join(
                masterAssetFolder,
                targetFileName
              ),
              sourceBuffer
            );
          }

          return targetFileName;
        }
      );
  }

  return mapping;
}

function readImagePaths(index, imageMap) {
  const fileNames =
    imageMap[String(index)] ?? [];

  return fileNames.map(
    (fileName) =>
      `require('./../assets/donation-centers/donatesmart-master-spreadsheet/${fileName}')`
  );
}

function buildCenterEntry(center) {
  const lines = [
    '  {',
    `    id: ${JSON.stringify(center.id)},`,
    `    name: ${JSON.stringify(center.name)},`,
    `    address: ${JSON.stringify(center.address)},`,
    `    description: ${JSON.stringify(center.description)},`,
    `    acceptedCategories: ${JSON.stringify(center.acceptedCategories)},`,
    `    photos: [${center.photos.join(', ')}],`,
    `    hours: ${
      center.hours
        ? JSON.stringify(center.hours)
        : 'undefined'
    },`,
    `    phone: ${
      center.phone
        ? JSON.stringify(center.phone)
        : 'undefined'
    },`,
    `    latitude: ${center.latitude},`,
    `    longitude: ${center.longitude},`,
    '  },',
  ];

  return lines.join('\n');
}

function main() {
  cleanupStalePhotoFolders();

  const spreadsheetFiles =
    getSpreadsheetFiles();

  if (spreadsheetFiles.length === 0) {
    throw new Error(
      'No spreadsheet files matching "DonateSmart Master Spreadsheet*.xlsx" were found in src/data.'
    );
  }

  getMasterPhotoFolder();

  let globalOffset = 0;

  const combinedImageMap = {};
  const outputRows = [];

  spreadsheetFiles.forEach(
    (workbookPath) => {
      const workbook =
        XLSX.readFile(workbookPath);

      const firstSheetName =
        Object.keys(workbook.Sheets)[0];

      const sheet =
        workbook.Sheets['Donation Centers'] ??
        workbook.Sheets[firstSheetName];

      const rows =
        XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          raw: false,
          blankrows: false,
        });

      console.log(
        `Processing ${path.basename(workbookPath)}: ${rows.length} rows`
      );

      const imageMap =
        buildImageMapFromSpreadsheet(
          workbookPath,
          rows.length,
          globalOffset
        );

      Object.assign(
        combinedImageMap,
        imageMap
      );

      rows.forEach(
        (row, localIndex) => {
          const index =
            globalOffset + localIndex;

          const name =
            normalizeText(row.Name);

          const description =
            normalizeText(row.Description);

          const address =
            normalizeText(row.Address);

          const acceptedCategories =
            normalizeAcceptedCategories(
              row[
                'Items Accepted (Google Product Taxonomy)'
              ]
            );

          const hours =
            normalizeText(row['Hours ']);

          const phone =
            normalizeText(row.Phone);

          const latitude =
            Number(row.Latitude);

          const longitude =
            Number(row.Longitude);

          const photos =
            readImagePaths(
              index,
              combinedImageMap
            );

          outputRows.push({
            id: `default-${index + 1}`,
            name,
            description,
            address,
            acceptedCategories,
            photos,
            hours: hours || undefined,
            phone: phone || undefined,
            latitude:
              Number.isFinite(latitude)
                ? latitude
                : 0,
            longitude:
              Number.isFinite(longitude)
                ? longitude
                : 0,
          });
        }
      );

      globalOffset += rows.length;
    }
  );

  const output = [
    "import type { DonationCenter } from '@/constants/types';",
    '',
    'export const DEFAULT_DONATION_CENTERS: DonationCenter[] = [',
    outputRows
      .map(buildCenterEntry)
      .join('\n'),
    '];',
    '',
  ].join('\n');

  fs.writeFileSync(
    imageMapPath,
    JSON.stringify(
      combinedImageMap,
      null,
      2
    ),
    'utf8'
  );

  fs.writeFileSync(
    outputPath,
    output,
    'utf8'
  );

  console.log(
    `Generated ${outputRows.length} donation-center entries across ${spreadsheetFiles.length} spreadsheet files into the master photo folder.`
  );

  console.log(
    `Generated ${Object.values(combinedImageMap).filter(
      (images) => images.length > 0
    ).length} rows with photos.`
  );
}

main();
