export function extractBadges(readme: string): string[] {
  const badgeRegex = /\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g;
  const inputCap = 100000;
  const input = readme.length > inputCap ? readme.slice(0, inputCap) : readme;
  return input.match(badgeRegex) || [];
}

export function extractBuildSteps(readme: string): string {
  const sections = ['installation', 'getting started', 'setup', 'building', 'development'];
  const lines = readme.split('\n');
  let capturing = false;
  const steps: string[] = [];

  for (const line of lines) {
    const lower = line.replace(/^ {0,3}/, '').trimEnd().toLowerCase();
    if (sections.some((s) => lower === `## ${s}` || lower === `### ${s}`)) {
      capturing = true;
      continue;
    }
    if (capturing && (lower.startsWith('## ') || lower.startsWith('### '))) break;
    if (capturing) steps.push(line);
  }

  return steps.join('\n');
}

const ENV_VAR_STOPWORDS = new Set([
  'TODO', 'NOTE', 'API', 'HTTP', 'HTTPS', 'JSON', 'MIT', 'CI', 'CD', 'README',
  'URL', 'URI', 'ID', 'OK', 'EOF', 'NULL', 'TRUE', 'FALSE', 'OR', 'AND',
]);

export function extractEnvVarMentions(readme: string): string[] {
  const envVarRegex = /process\.env\.([A-Z_][A-Z0-9_]*)|\$([A-Z_][A-Z0-9_]*)\b|\b([A-Z][A-Z0-9_]{2,})\b/g;
  const vars = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = envVarRegex.exec(readme)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (name && !ENV_VAR_STOPWORDS.has(name)) {
      vars.add(name);
    }
  }

  return Array.from(vars);
}
