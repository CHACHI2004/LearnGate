import CFB from "cfb";
import { describe, expect, it } from "vitest";
import { extractDocument } from "../src/services/document-extraction.js";
import {
  generatedQuestionsResponseSchema,
  generationOptionsSchema,
} from "../src/validators/ai-generation.validators.js";
import {
  flashcardGenerationOptionsSchema,
  generatedFlashcardsResponseSchema,
  updateFlashcardDeckSchema,
} from "../src/validators/flashcard.validators.js";

function createPdf(pages: string[]) {
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageReferences: string[] = [];
  for (const [index, text] of pages.entries()) {
    const pageObject = 4 + index * 2;
    const contentObject = pageObject + 1;
    const content = `BT /F1 12 Tf 20 250 Td (${text}) Tj ET`;
    pageReferences.push(`${pageObject} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${pageReferences.join(" ")}] /Count ${pages.length} >>`;

  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document, "binary"));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document, "binary");
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, "binary");
}

function createPptRecord(type: number, body: Buffer, version = 0) {
  const header = Buffer.alloc(8);
  header.writeUInt16LE(version, 0);
  header.writeUInt16LE(type, 2);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function createLegacyPpt(text: string) {
  const textAtom = createPptRecord(0x0fa0, Buffer.from(text, "utf16le"));
  const clientTextbox = createPptRecord(0xf00d, textAtom, 0xf);
  const shape = createPptRecord(0xf004, clientTextbox, 0xf);
  const shapeGroup = createPptRecord(0xf003, shape, 0xf);
  const drawing = createPptRecord(0x040c, createPptRecord(0xf002, shapeGroup, 0xf));
  const slide = createPptRecord(0x03ee, drawing);
  const editBody = Buffer.alloc(16);
  editBody.writeUInt32LE(slide.length + 24, 12);
  const document = Buffer.concat([
    slide,
    createPptRecord(0x0ff5, editBody),
    createPptRecord(0x1772, Buffer.alloc(0)),
  ]);
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "Current User", createPptRecord(0x0ff6, Buffer.alloc(12)));
  CFB.utils.cfb_add(container, "PowerPoint Document", document);
  return CFB.write(container, { type: "buffer" });
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files: Array<{ name: string; content: string }>) {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let localOffset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const content = Buffer.from(file.content);
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    const localRecord = Buffer.concat([localHeader, name, content]);
    localRecords.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralRecords.push(Buffer.concat([centralHeader, name]));
    localOffset += localRecord.length;
  }
  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

function createPptx() {
  return createZip([
    {
      name: "ppt/presentation.xml",
      content: "<p:presentation xmlns:p=\"p\" xmlns:r=\"r\"><p:sldIdLst><p:sldId id=\"256\" r:id=\"rId1\"/><p:sldId id=\"257\" r:id=\"rId2\"/></p:sldIdLst></p:presentation>",
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      content: "<Relationships><Relationship Id=\"rId1\" Target=\"slides/slide2.xml\"/><Relationship Id=\"rId2\" Target=\"slides/slide1.xml\"/></Relationships>",
    },
    {
      name: "ppt/slides/slide1.xml",
      content: "<p:sld xmlns:p=\"p\" xmlns:a=\"a\"><a:t>First slide learning material includes a sufficiently long explanation of the core learning objective.</a:t></p:sld>",
    },
    {
      name: "ppt/slides/slide2.xml",
      content: "<p:sld xmlns:p=\"p\" xmlns:a=\"a\"><a:t>Second slide learning material includes a sufficiently long explanation of the supporting learning objective.</a:t></p:sld>",
    },
    {
      name: "ppt/slides/slide3.xml",
      content: "<p:sld xmlns:p=\"p\" xmlns:a=\"a\"><a:t>Third slide learning material includes a sufficiently long explanation of another learning objective.</a:t></p:sld>",
    },
  ]);
}

describe("document text extraction", () => {
  it("extracts PDF text with 1-based page references", async () => {
    const units = await extractDocument(createPdf([
      "Page one learning material with enough text.",
      "Page two learning material with enough text.",
    ]), "pdf");
    expect(units.map(({ kind, number }) => [kind, number])).toEqual([["page", 1], ["page", 2]]);
    expect(units[1].text).toContain("Page two");
  });

  it("extracts PPTX text with slide references", async () => {
    const units = await extractDocument(createPptx(), "pptx");
    expect(units.map(({ kind, number }) => [kind, number])).toEqual([["slide", 1], ["slide", 2]]);
    expect(units[0].text).toContain("Second slide learning material");
  });

  it("extracts legacy PPT text with slide references", async () => {
    const units = await extractDocument(createLegacyPpt(
      "Legacy PowerPoint extraction contains sufficient educational slide text for this parser integration test.",
    ), "ppt");
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ kind: "slide", number: 1 });
    expect(units[0].text).toContain("Legacy PowerPoint extraction");
  });

  it("rejects malformed legacy PPT files with a bounded extraction error", async () => {
    const invalidOleFile = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(64),
    ]);
    await expect(extractDocument(invalidOleFile, "ppt")).rejects.toThrow("legacy PowerPoint file could not be read");
  });

  it("rejects damaged or image-only source documents", async () => {
    await expect(extractDocument(Buffer.from("not a pdf"), "pdf")).rejects.toThrow("could not be read");
    await expect(extractDocument(createZip([
      {
        name: "ppt/presentation.xml",
        content: "<p:presentation xmlns:p=\"p\" xmlns:r=\"r\"><p:sldIdLst><p:sldId id=\"256\" r:id=\"rId1\"/></p:sldIdLst></p:presentation>",
      },
      {
        name: "ppt/_rels/presentation.xml.rels",
        content: "<Relationships><Relationship Id=\"rId1\" Target=\"slides/slide1.xml\"/></Relationships>",
      },
      { name: "ppt/slides/slide1.xml", content: "<p:sld/>" },
    ]), "pptx")).rejects.toThrow("No readable text");
  });
});

describe("AI response validation", () => {
  it("validates citations, supported question types, and answer choices", () => {
    const result = generatedQuestionsResponseSchema.safeParse({
      questions: [{
        type: "mcq",
        questionText: "Which concept is explained on slide one?",
        choices: ["A", "B", "C"],
        correctChoiceIndex: 1,
        explanation: "The slide defines this concept.",
        sourceReference: { kind: "slide", number: 1 },
      }],
    });
    expect(result.success).toBe(true);
    expect(generatedQuestionsResponseSchema.safeParse({
      questions: [{
        type: "mcq",
        questionText: "Which concept is correct?",
        choices: ["A", "B"],
        correctChoiceIndex: 2,
        explanation: "An explanation.",
        sourceReference: { kind: "slide", number: 1 },
        extra: "unexpected",
      }],
    }).success).toBe(false);
  });

  it("limits generation controls to the configured question range", () => {
    expect(generationOptionsSchema.safeParse({ questionCount: 5, difficulty: "medium" }).success).toBe(true);
    expect(generationOptionsSchema.safeParse({ questionCount: 21, difficulty: "medium" }).success).toBe(false);
    expect(generationOptionsSchema.parse({
      questionCount: 5,
      difficulty: "medium",
      questionType: "mcq",
      prompt: "Focus on practical scenarios",
    })).toMatchObject({ questionType: "mcq", prompt: "Focus on practical scenarios" });
    expect(generationOptionsSchema.safeParse({ questionCount: 5, difficulty: "medium", questionType: "essay" }).success).toBe(false);
    expect(generationOptionsSchema.safeParse({ questionCount: 5, difficulty: "medium", prompt: "x".repeat(1001) }).success).toBe(false);
  });

  it("validates generated flashcards and editable deck limits", () => {
    const card = {
      front: "What is active recall?",
      back: "Retrieving information from memory to strengthen learning.",
      sourceReference: { kind: "slide", number: 2 },
    };
    expect(generatedFlashcardsResponseSchema.safeParse({ cards: [card, card, card] }).success).toBe(true);
    expect(generatedFlashcardsResponseSchema.safeParse({ cards: [{ ...card, sourceReference: { kind: "page", number: 1 } }] }).success).toBe(false);
    expect(flashcardGenerationOptionsSchema.safeParse({ cardCount: 30 }).success).toBe(true);
    expect(flashcardGenerationOptionsSchema.safeParse({ cardCount: 31 }).success).toBe(false);
    expect(updateFlashcardDeckSchema.safeParse({ title: "Study set", cards: [card] }).success).toBe(true);
  });
});
