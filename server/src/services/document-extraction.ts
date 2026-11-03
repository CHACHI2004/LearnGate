import { XMLParser } from "fast-xml-parser";
import PPT from "ppt-to-text";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import yauzl from "yauzl";

export type ExtractedSourceUnit = {
  kind: "slide" | "page";
  number: number;
  text: string;
};

const MAX_SOURCE_UNITS = 300;
const MAX_EXTRACTED_CHARACTERS = 80_000;
const MAX_UNCOMPRESSED_ZIP_BYTES = 60 * 1024 * 1024;
const MAX_SLIDE_XML_BYTES = 5 * 1024 * 1024;
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true });

export class DocumentExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

function boundedUnits(units: ExtractedSourceUnit[]) {
  const result: ExtractedSourceUnit[] = [];
  let remaining = MAX_EXTRACTED_CHARACTERS;
  for (const unit of units) {
    if (remaining <= 0) break;
    const text = unit.text.slice(0, remaining).trim();
    if (text) result.push({ ...unit, text });
    remaining -= text.length;
  }
  const totalLength = result.reduce((sum, unit) => sum + unit.text.length, 0);
  if (totalLength < 80) {
    throw new DocumentExtractionError(
      "No readable text was found. Scanned or image-only documents are not supported; upload a text-based PDF or presentation.",
    );
  }
  return result;
}

function readZipEntry(zip: yauzl.ZipFile, entry: yauzl.Entry) {
  return new Promise<Buffer>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("Could not read the presentation slide"));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_SLIDE_XML_BYTES) {
          stream.destroy(new DocumentExtractionError("A presentation slide contains too much XML data."));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function collectNodes(value: unknown, matches: (key: string, node: Record<string, unknown>) => boolean) {
  const found: Record<string, unknown>[] = [];
  const visit = (current: unknown) => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    const record = objectValue(current);
    if (!record) return;
    for (const [key, child] of Object.entries(record)) {
      const childRecords = (Array.isArray(child) ? child : [child])
        .map(objectValue)
        .filter((node): node is Record<string, unknown> => node !== undefined);
      for (const childRecord of childRecords) {
        if (matches(key, childRecord)) found.push(childRecord);
      }
      visit(child);
    }
  };
  visit(value);
  return found;
}

function getXmlAttribute(node: Record<string, unknown>, name: string) {
  const attribute = Object.entries(node).find(([key]) => key.toLowerCase() === `@_${name.toLowerCase()}`);
  return attribute?.[1];
}

function extractPptx(buffer: Buffer): Promise<ExtractedSourceUnit[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, {
      lazyEntries: true,
      autoClose: false,
      decodeStrings: true,
      strictFileNames: true,
      validateEntrySizes: true,
    }, (openError, zip) => {
      if (openError || !zip) {
        reject(new DocumentExtractionError("The PowerPoint file could not be opened."));
        return;
      }
      if (zip.entryCount > 5000) {
        zip.close();
        reject(new DocumentExtractionError("The presentation contains too many embedded files."));
        return;
      }

      let entriesSeen = 0;
      let uncompressedBytes = 0;
      let hasPresentation = false;
      let presentationXml: string | undefined;
      let relationshipsXml: string | undefined;
      let settled = false;
      const slides = new Map<string, string>();
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(error);
      };
      const readAndContinue = (entry: yauzl.Entry, onRead: (xml: string) => void) => {
        void readZipEntry(zip, entry).then((xmlBuffer) => {
          if (settled) return;
          try {
            onRead(xmlBuffer.toString("utf8"));
            zip.readEntry();
          } catch {
            fail(new DocumentExtractionError("Text could not be read from the PowerPoint presentation."));
          }
        }).catch(() => fail(new DocumentExtractionError("A PowerPoint file could not be decompressed safely.")));
      };

      zip.on("error", () => fail(new DocumentExtractionError("The PowerPoint archive is damaged or invalid.")));
      zip.on("entry", (entry) => {
        entriesSeen += 1;
        uncompressedBytes += entry.uncompressedSize;
        if (entriesSeen > 5000 || uncompressedBytes > MAX_UNCOMPRESSED_ZIP_BYTES) {
          fail(new DocumentExtractionError("The PowerPoint archive exceeds safe extraction limits."));
          return;
        }
        const name = entry.fileName;
        if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
          fail(new DocumentExtractionError("The PowerPoint archive contains an invalid path."));
          return;
        }
        if ((entry.generalPurposeBitFlag & 1) !== 0) {
          fail(new DocumentExtractionError("Password-protected presentations are not supported."));
          return;
        }
        if (name === "ppt/presentation.xml") {
          hasPresentation = true;
          readAndContinue(entry, (xml) => { presentationXml = xml; });
          return;
        }
        if (name === "ppt/_rels/presentation.xml.rels") {
          readAndContinue(entry, (xml) => { relationshipsXml = xml; });
          return;
        }
        const slideMatch = /^ppt\/slides\/slide(\d+)\.xml$/.exec(name);
        if (!slideMatch) {
          zip.readEntry();
          return;
        }
        if (entry.uncompressedSize > MAX_SLIDE_XML_BYTES || slides.size >= MAX_SOURCE_UNITS) {
          fail(new DocumentExtractionError("The presentation exceeds the slide or extraction size limit."));
          return;
        }
        readAndContinue(entry, (xml) => {
          const tree: unknown = parser.parse(xml);
          const parts: string[] = [];
          const collectText = (value: unknown) => {
            if (Array.isArray(value)) {
              for (const item of value) collectText(item);
              return;
            }
            const record = objectValue(value);
            if (!record) return;
            for (const [key, child] of Object.entries(record)) {
              if (key === "a:t") {
                if (typeof child === "string") parts.push(child);
                else {
                  const text = objectValue(child)?.["#text"];
                  if (typeof text === "string") parts.push(text);
                }
              } else {
                collectText(child);
              }
            }
          };
          collectText(tree);
          slides.set(name, parts.join(" ").replace(/\s+/g, " ").trim());
        });
      });
      zip.on("end", () => {
        if (settled) return;
        if (!hasPresentation || !presentationXml || !relationshipsXml || slides.size === 0) {
          settled = true;
          zip.close();
          reject(new DocumentExtractionError("The file is not a valid PowerPoint presentation or contains no slides."));
          return;
        }
        try {
          const presentationTree: unknown = parser.parse(presentationXml);
          const relationshipTree: unknown = parser.parse(relationshipsXml);
          const relationships = new Map<string, string>();
          for (const relationship of collectNodes(relationshipTree, (key) => key === "Relationship")) {
            const id = getXmlAttribute(relationship, "Id");
            const target = getXmlAttribute(relationship, "Target");
            if (typeof id === "string" && typeof target === "string") relationships.set(id, target);
          }
          const orderedSlides = collectNodes(
            presentationTree,
            (key) => key === "p:sldId" || key === "sldId",
          ).flatMap((slideId, index) => {
            const relationshipId = getXmlAttribute(slideId, "r:id") ?? getXmlAttribute(slideId, "rId");
            if (typeof relationshipId !== "string") return [];
            const target = relationships.get(relationshipId);
            if (!target || !/^slides\/slide\d+\.xml$/.test(target)) return [];
            const slidePath = `ppt/${target}`;
            const text = slides.get(slidePath);
            return text !== undefined ? [{ kind: "slide" as const, number: index + 1, text }] : [];
          });
          if (orderedSlides.length === 0) {
            throw new DocumentExtractionError("The presentation does not contain readable slide references.");
          }
          const result = boundedUnits(orderedSlides);
          settled = true;
          zip.close();
          resolve(result);
        } catch (error) {
          settled = true;
          zip.close();
          reject(error instanceof DocumentExtractionError
            ? error
            : new DocumentExtractionError("Text could not be read from the PowerPoint presentation."));
        }
      });
      zip.readEntry();
    });
  });
}

async function extractPdf(buffer: Buffer): Promise<ExtractedSourceUnit[]> {
  let document: Awaited<ReturnType<typeof getDocument>["promise"]> | undefined;
  try {
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    });
    document = await loadingTask.promise;
    if (document.numPages > MAX_SOURCE_UNITS) {
      throw new DocumentExtractionError(`PDFs are limited to ${MAX_SOURCE_UNITS} pages.`);
    }
    const units: ExtractedSourceUnit[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .flatMap((item) => "str" in item && typeof item.str === "string" ? [item.str] : [])
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      units.push({ kind: "page", number: pageNumber, text });
      page.cleanup();
      if (units.reduce((sum, unit) => sum + unit.text.length, 0) >= MAX_EXTRACTED_CHARACTERS) break;
    }
    return boundedUnits(units);
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError(
      "The PDF could not be read. Check that it is not damaged or password-protected.",
    );
  } finally {
    await document?.destroy();
  }
}

function extractPpt(buffer: Buffer): ExtractedSourceUnit[] {
  try {
    const presentation = PPT.readBuffer(buffer);
    const slides = PPT.utils.to_text(presentation);
    return boundedUnits(slides.map((text, index) => ({
      kind: "slide" as const,
      number: index + 1,
      text: text.replace(/\s+/g, " ").trim(),
    })).slice(0, MAX_SOURCE_UNITS));
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError(
      "The legacy PowerPoint file could not be read. Check that it is not damaged or password-protected.",
    );
  }
}

export async function extractDocument(buffer: Buffer, fileType: "pdf" | "ppt" | "pptx") {
  if (fileType === "pdf") return extractPdf(buffer);
  if (fileType === "ppt") return extractPpt(buffer);
  return extractPptx(buffer);
}
