import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type Finding = {
  severity: "error" | "warn";
  file: string;
  line?: number;
  message: string;
};

type EnvEntry = {
  file: string;
  line: number;
  name: string;
  value: string;
};

const root = process.cwd();
const includeBuildOutput = process.env.SCAN_BUILD_OUTPUT === "1";

const skippedDirs = new Set([
  ".git",
  "node_modules",
  ".vercel",
  ...(includeBuildOutput ? [] : [".next"]),
]);

const allowedPublicEnvNames = new Set([
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_GOOGLE_ADS_ID",
  "NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL",
  "NEXT_PUBLIC_SITE_URL",
]);

const sensitiveNamePattern =
  /(ANTHROPIC|GEMINI|SARVAM|ELEVEN|SUPABASE|RAZORPAY|UPSTASH|LOOPS|META|GOOGLE_ADS|SENTRY_AUTH|CUSTOM_LLM|SECRET|TOKEN|PASSWORD|API_KEY|SERVICE_ROLE)/i;

const publicOrIdentifierNamePattern =
  /(^|_)URL$|_DOMAIN$|_ID$|CUSTOMER_ID$|PIXEL_ID$|NEXT_PUBLIC_/i;

const secretValuePatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: "Anthropic API key", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { label: "Google API key", pattern: /AIza[0-9A-Za-z_-]{25,}/g },
  { label: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9._-]{20,}/g },
  { label: "Private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

const forbiddenPathPatterns = [
  /(^|[\\/])vercel-env[^\\/]*\.txt$/i,
  /(^|[\\/])[^\\/]*(?:secret|secrets)[^\\/]*\.txt$/i,
];

const findings: Finding[] = [];

function rel(filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function isEnvFile(filePath: string): boolean {
  return path.basename(filePath).startsWith(".env");
}

function isPlaceholder(value: string): boolean {
  const v = value.trim().replace(/^['"]|['"]$/g, "");
  return (
    v === "" ||
    /^(true|false|\d+(\.\d+)?)$/i.test(v) ||
    /^(your_|placeholder|example|dummy|test_|xxx|sk-ant-\.\.\.|\.\.\.)/i.test(v) ||
    /^<.*>$/.test(v)
  );
}

function parseEnvLine(line: string): { name: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const name = trimmed.slice(0, eq).trim();
  const value = trimmed
    .slice(eq + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");
  return { name, value };
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function isProbablyBinary(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skippedDirs.has(entry.name)) continue;
      walk(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function readText(filePath: string): string | null {
  const stat = statSync(filePath);
  if (stat.size > 8 * 1024 * 1024) return null;
  const buffer = readFileSync(filePath);
  if (isProbablyBinary(buffer)) return null;
  return buffer.toString("utf8");
}

function collectEnvEntries(files: string[]): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (const file of files.filter(isEnvFile)) {
    const text = readText(file);
    if (text === null) continue;
    text.split(/\r?\n/).forEach((line, index) => {
      const parsed = parseEnvLine(line);
      if (!parsed) return;
      entries.push({ file, line: index + 1, ...parsed });
    });
  }
  return entries;
}

function checkEnvEntries(entries: EnvEntry[]): void {
  for (const entry of entries) {
    if (
      entry.name.startsWith("NEXT_PUBLIC_") &&
      sensitiveNamePattern.test(entry.name) &&
      !allowedPublicEnvNames.has(entry.name)
    ) {
      findings.push({
        severity: "error",
        file: rel(entry.file),
        line: entry.line,
        message: `${entry.name} is public but looks sensitive`,
      });
    }

    if (
      /^(CUSTOM_LLM_KEY|.*_CRON_SECRET|.*WEBHOOK_SECRET|NOTIFY_SECRET|SENTRY_TEST_SECRET)$/i.test(
        entry.name,
      ) &&
      !isPlaceholder(entry.value) &&
      entry.value.length < 32
    ) {
      findings.push({
        severity: "warn",
        file: rel(entry.file),
        line: entry.line,
        message: `${entry.name} is shorter than 32 characters; rotate to a high-entropy value`,
      });
    }
  }
}

function secretEntries(entries: EnvEntry[]): EnvEntry[] {
  return entries.filter(
    (entry) =>
      sensitiveNamePattern.test(entry.name) &&
      !publicOrIdentifierNamePattern.test(entry.name) &&
      !entry.name.startsWith("NEXT_PUBLIC_") &&
      !isPlaceholder(entry.value) &&
      entry.value.length >= 12,
  );
}

function scanFiles(files: string[], envSecrets: EnvEntry[]): void {
  for (const file of files) {
    const relative = rel(file);
    if (forbiddenPathPatterns.some((pattern) => pattern.test(relative))) {
      findings.push({
        severity: "error",
        file: relative,
        message: "plaintext secret export file must not exist in the workspace",
      });
    }

    const text = readText(file);
    if (text === null) continue;

    if (!isEnvFile(file)) {
      for (const { label, pattern } of secretValuePatterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          findings.push({
            severity: "error",
            file: relative,
            line: lineNumberAt(text, match.index),
            message: `${label} literal found outside env files`,
          });
        }
      }
    }

    for (const secret of envSecrets) {
      if (file === secret.file) continue;
      const index = text.indexOf(secret.value);
      if (index !== -1) {
        findings.push({
          severity: "error",
          file: relative,
          line: lineNumberAt(text, index),
          message: `exact value of ${secret.name} appears outside its env file`,
        });
      }
    }
  }
}

if (!existsSync(root)) {
  throw new Error(`Root does not exist: ${root}`);
}

const files = walk(root);
const envEntries = collectEnvEntries(files);
checkEnvEntries(envEntries);
scanFiles(files, secretEntries(envEntries));

for (const finding of findings) {
  const prefix = finding.severity === "error" ? "ERROR" : "WARN";
  const loc =
    finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  console.log(`${prefix} ${loc} ${finding.message}`);
}

const errorCount = findings.filter((f) => f.severity === "error").length;
const warningCount = findings.filter((f) => f.severity === "warn").length;
if (errorCount > 0) {
  console.error(
    `Secret scan failed: ${errorCount} error(s), ${warningCount} warning(s).`,
  );
  process.exit(1);
}

console.log(
  `Secret scan passed: ${files.length} files checked, ${warningCount} warning(s).`,
);
