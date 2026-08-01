import fs from 'node:fs';

const reportPath = process.argv[2];
const label = process.argv[3] ?? 'dependency audit';

if (!reportPath || !fs.existsSync(reportPath)) {
  console.error(`[security audit] Missing report: ${reportPath ?? '(not provided)'}`);
  process.exitCode = 1;
} else {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const vulnerabilities = report.vulnerabilities ?? {};
  const metadata = report.metadata?.vulnerabilities ?? {};

  console.log(`\n## ${label}`);
  console.log(
    `total=${metadata.total ?? Object.keys(vulnerabilities).length} ` +
      `critical=${metadata.critical ?? 0} high=${metadata.high ?? 0} ` +
      `moderate=${metadata.moderate ?? 0} low=${metadata.low ?? 0}`,
  );

  const entries = Object.entries(vulnerabilities).sort(([, left], [, right]) => {
    const rank = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 };
    return (rank[right.severity] ?? 0) - (rank[left.severity] ?? 0);
  });

  if (entries.length === 0) {
    console.log('No vulnerabilities reported.');
  }

  for (const [name, vulnerability] of entries) {
    const via = (vulnerability.via ?? [])
      .map((item) => (typeof item === 'string' ? item : `${item.title} (${item.url})`))
      .join('; ');
    const effects = (vulnerability.effects ?? []).join(', ') || 'none';
    const nodes = (vulnerability.nodes ?? []).join(', ') || 'not reported';
    const fix =
      vulnerability.fixAvailable === true
        ? 'compatible fix available'
        : vulnerability.fixAvailable && typeof vulnerability.fixAvailable === 'object'
          ? `${vulnerability.fixAvailable.name}@${vulnerability.fixAvailable.version}` +
            (vulnerability.fixAvailable.isSemVerMajor ? ' (major)' : '')
          : 'no automated fix';

    console.log(`\n- ${name}`);
    console.log(`  severity: ${vulnerability.severity}`);
    console.log(`  direct: ${Boolean(vulnerability.isDirect)}`);
    console.log(`  vulnerable range: ${vulnerability.range ?? 'not reported'}`);
    console.log(`  via: ${via || 'not reported'}`);
    console.log(`  effects: ${effects}`);
    console.log(`  nodes: ${nodes}`);
    console.log(`  fix: ${fix}`);
  }
}
