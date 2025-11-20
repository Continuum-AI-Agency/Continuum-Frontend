import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeStorageFileName } from "../sanitize";

test("sanitizes emojis and smart punctuation while preserving extension", () => {
  const input = '🚀 PROJECT BRIEF — “Continuum TrendSense”.pdf';
  const result = sanitizeStorageFileName(input);
  assert.equal(result, "project-brief-continuum-trendsense.pdf");
});

test("removes diacritics and trims whitespace", () => {
  const input = "  Résumé 2024 .docx ";
  const result = sanitizeStorageFileName(input);
  assert.equal(result, "resume-2024.docx");
});

test("strips path separators and collapses punctuation", () => {
  const input = "bad/../path..final!!.png";
  const result = sanitizeStorageFileName(input);
  assert.equal(result, "bad-path.final.png");
});

test("provides fallback name when input is only extension", () => {
  const input = ".env";
  const result = sanitizeStorageFileName(input);
  assert.equal(result, "file.env");
});

test("returns fallback without extension when none present", () => {
  const result = sanitizeStorageFileName("  ");
  assert.equal(result, "file");
});


