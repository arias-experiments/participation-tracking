import { createCanvas } from '@napi-rs/canvas';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

export class RosterError extends Error {}

// The source system exports a grid of portrait images with text captions below.
// Associate captions by geometry, not PDF text order (which mixes columns).
export async function parseRoster(buffer) {
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new RosterError('Choose a valid PDF file.');
  }
  let document;
  try {
    document = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
    if (document.numPages > 20) throw new RosterError('Please upload a roster with 20 pages or fewer.');
    const students = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      if (viewport.width > 1200 || viewport.height > 1600) {
        throw new RosterError('This PDF page size does not match the roster format.');
      }
      const operators = await page.getOperatorList();
      let matrix = [1, 0, 0, 1, 0, 0];
      const stack = [];
      const portraits = [];
      for (let i = 0; i < operators.fnArray.length; i++) {
        const op = operators.fnArray[i];
        const args = operators.argsArray[i];
        if (op === OPS.save) stack.push([...matrix]);
        else if (op === OPS.restore) matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (op === OPS.transform) matrix = Util.transform(matrix, args);
        else if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject) {
          const points = [[0, 0], [1, 0], [0, 1], [1, 1]].map((point) =>
            { Util.applyTransform(point, matrix); Util.applyTransform(point, viewport.transform); return point; });
          const x = Math.min(...points.map((p) => p[0]));
          const y = Math.min(...points.map((p) => p[1]));
          const width = Math.max(...points.map((p) => p[0])) - x;
          const height = Math.max(...points.map((p) => p[1])) - y;
          if (width >= 35 && width <= 150 && height >= 45 && height <= 200) portraits.push({ x, y, width, height });
        }
      }
      if (!portraits.length) throw new RosterError(`No student portraits were found on page ${number}. Use the original system's roster PDF, not a scan.`);
      const text = (await page.getTextContent()).items.filter((item) => item.str?.trim()).map((item) => {
        const [, , , , x, y] = Util.transform(viewport.transform, item.transform);
        return { text: item.str, x, y, width: item.width };
      });
      // Small vertical differences within each row reflect portrait aspect ratios.
      const rows = [];
      for (const portrait of portraits.sort((a, b) => a.y - b.y || a.x - b.x)) {
        let row = rows.find((candidate) => Math.abs(candidate.y - portrait.y) < 18);
        if (!row) { row = { y: portrait.y, items: [] }; rows.push(row); }
        row.items.push(portrait);
      }
      const scale = 2;
      const canvas = createCanvas(Math.ceil(viewport.width * scale), Math.ceil(viewport.height * scale));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale }) }).promise;
      for (const row of rows) {
        row.items.sort((a, b) => a.x - b.x);
        for (let index = 0; index < row.items.length; index++) {
          const portrait = row.items[index];
          const right = row.items[index + 1]?.x ?? portrait.x + 112;
          const bottom = portrait.y + portrait.height;
          const nextRow = rows.find((candidate) => candidate.y > row.y + 18);
          const limit = Math.min(bottom + 38, nextRow?.y ?? viewport.height);
          const caption = text.filter((item) => item.x >= portrait.x - 3 && item.x < right - 2 && item.y >= bottom - 2 && item.y < limit)
            .sort((a, b) => Math.abs(a.y - b.y) < 3 ? a.x - b.x : a.y - b.y)
            .map((item) => item.text).join(' ');
          const name = caption.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
          if (!name.includes(',') || name.length > 180 || /\d/.test(name)) {
            throw new RosterError(`A student caption on page ${number} could not be read reliably. No roster was saved.`);
          }
          const photo = createCanvas(Math.ceil(portrait.width * scale), Math.ceil(portrait.height * scale));
          photo.getContext('2d').drawImage(canvas, portrait.x * scale, portrait.y * scale,
            portrait.width * scale, portrait.height * scale, 0, 0, photo.width, photo.height);
          students.push({ name, photo: photo.toBuffer('image/png') });
          if (students.length > 500) throw new RosterError('The roster exceeds the 500-student limit.');
        }
      }
      page.cleanup();
    }
    return students;
  } catch (error) {
    if (error instanceof RosterError) throw error;
    throw new RosterError('The PDF could not be read. Upload an unencrypted roster exported by the original system.', { cause: error });
  } finally {
    await document?.destroy();
  }
}
