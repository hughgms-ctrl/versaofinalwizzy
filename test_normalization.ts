
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const testCases = [
  { input: "Acúmulo", expected: "acumulo" },
  { input: "acúmulo", expected: "acumulo" },
  { input: "ACUMULO", expected: "acumulo" },
  { input: "  acúmulo  ", expected: "acumulo" },
  { input: "desvio", expected: "desvio" },
  { input: "Dêsvíó", expected: "desvio" },
];

let failed = 0;
testCases.forEach(({ input, expected }) => {
  const result = normalizeText(input);
  if (result === expected) {
    console.log(`✅ PASS: "${input}" -> "${result}"`);
  } else {
    console.log(`❌ FAIL: "${input}" -> "${result}" (expected "${expected}")`);
    failed++;
  }
});

if (failed === 0) {
  console.log("\nAll tests passed!");
} else {
  console.log(`\n${failed} tests failed.`);
  process.exit(1);
}
