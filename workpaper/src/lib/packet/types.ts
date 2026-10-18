/** Packet types — mirrors the supplied JSON without inventing fields. */

export type PacketMeta = {
  name: string;
  version: string;
  generated: string;
  client_id: string;
};

export type PrintedPage = {
  page: number;
  printed_content: string;
};

export type DocumentRecord = {
  id: string;
  title: string;
  document_type: string;
  issuer: string;
  belongs_to: string;
  tax_year: number;
  received_at: string;
  uploaded_by: string;
  file_name: string;
  page_count: number;
  extraction: {
    status: string;
    values: number;
    reason: string | null;
  };
  pages: PrintedPage[];
  supersedes?: string;
  superseded_by?: string;
};

export type ExtractedValue = {
  id: string;
  document_id: string;
  page: number;
  field: string;
  label: string;
  value: unknown;
  value_type: string;
  text_as_read: string;
  position: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
};

export type ReturnLine = {
  key: string;
  jurisdiction: string;
  form: string;
  line: string;
  label: string;
  value: unknown;
  rule: string;
  inputs: string[];
  sources: string[];
};

export type AssetRecord = {
  asset_id: string;
  [key: string]: unknown;
};

export type ReturnVersion = {
  version: string;
  computed_at: string;
  trigger: string;
  documents_used: string[];
  documents_superseded: string[];
  summary: {
    federal: Record<string, number>;
    california: Record<string, number>;
  };
  tax_effect_rates: Record<string, unknown>;
  carryovers_out: unknown;
  assets: AssetRecord[];
  diagnostics: unknown[];
  changes_from_previous: unknown;
  lines: ReturnLine[];
};

export type HouseholdPerson = {
  id: string;
  role: string;
  name?: string;
  legal_name?: string;
  [key: string]: unknown;
};

export type FirmStaff = {
  id: string;
  name: string;
  role: string;
  credential: string | null;
  sensitive_data_clearance: boolean;
  active_from: string;
  note?: string;
};

export type TaxPacket = {
  packet: PacketMeta;
  readme: Record<string, unknown>;
  household: {
    filing_status: string;
    tax_year: number;
    people: HouseholdPerson[];
    [key: string]: unknown;
  };
  documents: DocumentRecord[];
  extracted_values: ExtractedValue[];
  client: {
    questionnaire: Array<{ id: string; [key: string]: unknown }>;
    messages: Array<{ id: string; [key: string]: unknown }>;
    call_notes: Array<{ id: string; [key: string]: unknown }>;
  };
  firm: {
    name: string;
    staff: FirmStaff[];
    client_users: Array<{ id: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  prior_years: Record<string, unknown>;
  tax_agency_records: Record<string, unknown>;
  timeline: Array<{ id: string; [key: string]: unknown }>;
  engine_reference: {
    parameters: Record<string, unknown>;
    rules: Record<string, string>;
  };
  return_versions: ReturnVersion[];
  what_if: Record<string, unknown>;
  planning_reference_2026: Record<string, unknown>;
  post_filing_rates: Record<string, unknown>;
  fx_rates: Record<string, unknown>;
};

export type LoadedPacket = {
  bytes: Buffer;
  sha256: string;
  byteLength: number;
  packet: TaxPacket;
  loadedAt: string;
};

export type EvidenceLocator = {
  documentId: string;
  page: number;
  fieldKey?: string;
  extractedValueId?: string;
  textAnchor?: { start: number; end: number };
  rectangle?: { x0: number; y0: number; x1: number; y1: number };
  /** Present when locator came from locatePrintedText. */
  resolution?:
    | "resolved_match"
    | "resolved_mismatch"
    | "resolved_blank"
    | "unresolved";
  highlightedText?: string | null;
};

export type ResolvedRef =
  | { kind: "extracted_value"; ref: string; value: ExtractedValue }
  | { kind: "document"; ref: string; value: DocumentRecord }
  | { kind: "document_page"; ref: string; document: DocumentRecord; page: number }
  | { kind: "line"; ref: string; version: string; value: ReturnLine }
  | { kind: "questionnaire"; ref: string; value: Record<string, unknown> }
  | { kind: "message"; ref: string; value: Record<string, unknown> }
  | { kind: "call_note"; ref: string; value: Record<string, unknown> }
  | { kind: "prior_year"; ref: string; pointer: string; value: unknown }
  | { kind: "agency"; ref: string; pointer: string; value: unknown }
  | { kind: "asset"; ref: string; version?: string; value: AssetRecord }
  | { kind: "household"; ref: string; value: HouseholdPerson }
  | { kind: "param"; ref: string; name: string; value: unknown }
  | { kind: "fx"; ref: string; rateKey: string; value: unknown }
  | { kind: "timeline"; ref: string; value: Record<string, unknown> }
  | { kind: "missing"; ref: string; reason: string };
