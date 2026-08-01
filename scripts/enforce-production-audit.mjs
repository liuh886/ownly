import fs from 'node:fs';

const reportPath = process.argv[2] ?? 'npm-audit-production.json';

if (!fs.existsSync(reportPath)) {
  console.error(`[security audit] Missing production report: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const counts = report.metadata?.vulnerabilities ?? {};
const critical = Number(counts.critical ?? 0);
const high = Number(counts.high ?? 0);

if (critical > 0 || high > 0) {
  console.error(
    `[security audit] Production dependency gate failed: critical=${critical}, high=${high}.`,
  );
  process.exit(1);
}

console.log(
  `[security audit] Production dependency gate passed: critical=${critical}, high=${high}.`,
);
