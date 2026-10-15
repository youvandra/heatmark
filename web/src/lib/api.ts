// Thin client for the Heatmark API (served under /api).

export interface Installation {
  id: `0x${string}`;
  name: string;
  country: string;
  registry_id: string;
  operator: `0x${string}`;
  route: string;
}

export type ReportStatus = "draft" | "submitted" | "rejected" | "attested";

export interface ReportRow {
  id: number;
  installation_id: string;
  installation_name?: string;
  year: number;
  cn_code: string;
  status: ReportStatus;
  bundle_hash: string | null;
  submitted_at: string | null;
  rejection: string | null;
  attestation_id: number | null;
  attest_tx: string | null;
  created_at: string;
}

export interface Doc {
  id: number;
  filename: string;
  media_type: string;
  sha256: string;
  size: number;
  extracted_at: string | null;
  documentType: string | null;
  warnings: string[];
  servedBy: string | null;
}

export interface Field {
  id: number;
  report_id: number;
  document_id: number | null;
  key: string;
  value: number;
  page: number | null;
  snippet: string | null;
  reference: string | null;
  source: "model" | "operator";
  check_result: "verified" | "snippet_not_found" | "value_not_in_snippet" | null;
  confirmed: number;
  corrected_from: number | null;
}

export interface ReportDetail extends ReportRow {
  installation: Installation;
  documents: Doc[];
  fields: Field[];
}

export interface PassportView {
  id: number;
  cnCode: string;
  massKg: string;
  consumedKg: string;
  see: number;
  depth: number;
  declared: boolean;
  status: "valid" | "revoked" | "ancestor_revoked";
  holder: { kind: "installation"; id: string; name: string } | { kind: "importer" };
  docHash: string;
  attestation: {
    id: number;
    year: number;
    route: string;
    ownIntensity: number;
    capKg: string;
    issuedKg: string;
    reportHash: string;
    verifier: string;
    operator: string;
    revoked: boolean;
    reportId: number | null;
  };
  installation: { id: string; name: string; country: string } | null;
  precursors: (PassportView & { usedKg: string })[];
  savings: {
    year: number;
    defaultSee: number;
    certsDefault: number;
    certsActual: number;
    eurPerTonne: number;
    eurShipment: number;
    price: { eur: number; label: string };
  } | null;
}

export interface AttestationRow {
  attestationId: number;
  reportId: number;
  year: number;
  cnCode: string;
  ownIntensity: number;
  capKg: string;
  issuedKg: string;
  revoked: boolean;
  tx: string;
}

export interface Config {
  chainId: number;
  rpcUrl: string;
  explorer: string;
  contracts: Record<"Accreditation" | "Attestations" | "Passports", { address: `0x${string}`; id: string }>;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  config: () => call<Config>("GET", "/config"),
  installations: () => call<Installation[]>("GET", "/installations"),
  createInstallation: (b: { name: string; country: string; registryId: string; operator: string; route: string }) =>
    call<Installation>("POST", "/installations", b),
  attestations: (installationId: string) => call<AttestationRow[]>("GET", `/installations/${installationId}/attestations`),
  reports: (status?: ReportStatus) => call<ReportRow[]>("GET", `/reports${status ? `?status=${status}` : ""}`),
  report: (id: number) => call<ReportDetail>("GET", `/reports/${id}`),
  createReport: (b: { installationId: string; year: number; cnCode: string }) => call<ReportRow>("POST", "/reports", b),
  upload: (reportId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<Doc>("POST", `/reports/${reportId}/documents`, form);
  },
  extract: (reportId: number, docId: number) => call<unknown>("POST", `/reports/${reportId}/documents/${docId}/extract`),
  addField: (reportId: number, b: { key: string; value: number; documentId?: number | null; page?: number | null; snippet?: string | null }) =>
    call<Field>("POST", `/reports/${reportId}/fields`, b),
  updateField: (fieldId: number, b: { value?: number; confirmed: boolean }) => call<Field>("PATCH", `/fields/${fieldId}`, b),
  deleteField: (fieldId: number) => call<void>("DELETE", `/fields/${fieldId}`),
  submit: (reportId: number) => call<{ bundleHash: string }>("POST", `/reports/${reportId}/submit`),
  bundleText: async (reportId: number) => {
    const res = await fetch(`/api/reports/${reportId}/bundle`);
    if (!res.ok) throw new ApiError(res.status, "no bundle");
    return res.text();
  },
  reject: (reportId: number, b: { reason: string; address: string; signature: string }) => call<unknown>("POST", `/reports/${reportId}/reject`, b),
  attested: (reportId: number, tx: string) => call<{ attestationId: number }>("POST", `/reports/${reportId}/attested`, { tx }),
  passports: () => call<PassportView[]>("GET", "/passports"),
  passport: (id: number) => call<PassportView>("GET", `/passports/${id}`),
};

export const blobUrl = (sha: string) => `/api/blobs/${sha}`;
