import { describe, it, expect } from "vitest";
import { escapeHtml } from "./html";

describe("escapeHtml", () => {
  it("escapa los 5 metacaracteres de HTML", () => {
    expect(escapeHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("neutraliza un payload de <script>", () => {
    const out = escapeHtml("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("neutraliza un nombre de paciente con onerror (vector real del form público)", () => {
    const out = escapeHtml(`<img src=x onerror="fetch('//evil')">`);
    expect(out).not.toMatch(/<img/);
    expect(out).not.toContain('"');
  });

  it("null/undefined → cadena vacía (no 'null'/'undefined' literal)", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("texto y números normales pasan intactos (incluye acentos/ñ)", () => {
    expect(escapeHtml("Ana Núñez")).toBe("Ana Núñez");
    expect(escapeHtml(42000)).toBe("42000");
  });
});
