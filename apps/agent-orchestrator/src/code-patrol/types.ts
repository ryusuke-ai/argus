// Code Patrol v2 - Type definitions

export interface AuditAdvisory {
  name: string;
  severity: string;
  title: string;
  url: string;
}

export interface SecretFinding {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

export interface TypeErrorFinding {
  file: string;
  line: number;
  code: string;
  message: string;
}

export interface ScanResult {
  audit: {
    vulnerabilities: {
      total: number;
      critical: number;
      high: number;
      moderate: number;
      low: number;
    };
    advisories: AuditAdvisory[];
  };
  secrets: SecretFinding[];
  typeErrors: TypeErrorFinding[];
  scannedAt: string;
}

export interface RemediationAction {
  category: "type-error" | "secret-leak" | "dependency" | "other";
  filesChanged: string[];
  description: string;
}

export interface FileDiff {
  file: string;
  additions: number;
  deletions: number;
}

export interface VerificationResult {
  buildPassed: boolean;
  testsPassed: boolean;
  errorOutput?: string;
}

export interface QualityFinding {
  category: "pattern" | "structure" | "best-practice";
  severity: "warning" | "info";
  file: string;
  title: string;
  suggestion: string;
}

export interface QualityAnalysis {
  findings: QualityFinding[];
  overallScore: number;
  summary: string;
}

export interface PatrolReport {
  date: string;
  riskLevel: "critical" | "high" | "medium" | "low" | "clean";
  summary: string;
  findings: ScanResult;
  afterFindings: ScanResult | null;
  remediations: RemediationAction[];
  diffSummary: FileDiff[];
  verification: VerificationResult | null;
  costUsd: number;
  toolCallCount: number;
  recommendations: string[];
  rolledBack: boolean;
  qualityAnalysis: QualityAnalysis | null;
}
