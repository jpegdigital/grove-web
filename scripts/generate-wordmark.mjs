import opentype from "opentype.js";
import { writeFileSync } from "fs";
import { join } from "path";
import https from "https";

const COLORS = ["#58CC02", "#FF4B4B", "#FFC800", "#1CB0F6", "#CE82FF"];
const TEXT = "PradoTube";
const FONT_SIZE = 120;
const LETTER_SPACING = 2;

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  console.log("Downloading Fredoka SemiBold from Google Fonts...");
  const fontUrl =
    "https://fonts.gstatic.com/s/fredoka/v17/X7nP4b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3OLyXMFg.ttf";
  const fontBuffer = await download(fontUrl);
  const font = opentype.parse(fontBuffer.buffer);

  const PAD = 16;
  let x = PAD;
  const letterData = [];

  for (const ch of TEXT) {
    const glyph = font.charToGlyph(ch);
    const scale = FONT_SIZE / font.unitsPerEm;
    const advanceWidth = glyph.advanceWidth * scale;

    const path = font.getPath(ch, x, FONT_SIZE, FONT_SIZE, { features: { wght: 600 } });
    const svgPath = path.toSVG();

    letterData.push({ char: ch, svg: svgPath, x, width: advanceWidth });
    x += advanceWidth + LETTER_SPACING;
  }

  x += PAD - LETTER_SPACING;
  const height = FONT_SIZE + PAD;

  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(x)} ${Math.ceil(height)}">\n`;
  letterData.forEach((l, i) => {
    const color = COLORS[i % COLORS.length];
    const pathMatch = l.svg.match(/d="([^"]+)"/);
    if (pathMatch) {
      svgContent += `  <path fill="${color}" d="${pathMatch[1]}"/>\n`;
    }
  });
  svgContent += `</svg>\n`;

  const outPath = join(import.meta.dirname, "..", "public", "wordmark.svg");
  writeFileSync(outPath, svgContent);
  console.log(`Wrote ${outPath}`);

  const rootCopy = join(import.meta.dirname, "..", "wordmark.svg");
  writeFileSync(rootCopy, svgContent);
  console.log(`Wrote ${rootCopy}`);
}

main().catch(console.error);
