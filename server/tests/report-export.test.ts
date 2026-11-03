import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import readXlsxFile from "read-excel-file/node";
import { createXlsxWorkbook } from "../../client/src/features/reports/xlsx-export.js";

describe("Excel score-matrix export", () => {
  it("creates a valid workbook archive with escaped strings and wide topic columns", () => {
    const workbook = createXlsxWorkbook([
      { name: "Summary", rows: [["Subject", "Biology & Ecology"]] },
      {
        name: "Score matrix",
        rows: [
          ["Student", ...Array.from({ length: 27 }, (_, index) => `Topic ${index + 1}`)],
          ["<Ari>", ...Array.from({ length: 27 }, () => " =1+1")],
        ],
      },
    ]);
    const files = unzipSync(workbook);
    const workbookXml = strFromU8(files["xl/workbook.xml"] ?? new Uint8Array());
    const matrixXml = strFromU8(files["xl/worksheets/sheet2.xml"] ?? new Uint8Array());

    expect(workbookXml).toContain('name="Score matrix"');
    expect(files["[Content_Types].xml"]).toBeDefined();
    expect(files["xl/_rels/workbook.xml.rels"]).toBeDefined();
    expect(matrixXml).toContain('ref="A1:AB2"');
    expect(matrixXml).toContain("&lt;Ari&gt;");
    expect(matrixXml).toContain("xml:space=\"preserve\"> =1+1</t>");
  });

  it("can be opened by the application's XLSX reader", async () => {
    const workbook = createXlsxWorkbook([
      { name: "Summary", rows: [["Subject", "Biology"], ["Score", "91%"]] },
      { name: "Matrix", rows: [["Student", "Topic"], ["Jamie", 91]] },
    ]);
    const sheets = await readXlsxFile(Buffer.from(workbook));
    expect(sheets.map(({ sheet }) => sheet)).toEqual(["Summary", "Matrix"]);
    expect(sheets[1]?.data).toEqual([["Student", "Topic"], ["Jamie", 91]]);
  });
});
