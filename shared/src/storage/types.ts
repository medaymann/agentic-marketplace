export interface PresignedUpload {
  url: string;
  finalUrl: string;
  key: string;
  expiresAt: Date;
}

export interface PresignedDownload {
  url: string;
  key: string;
  expiresAt: Date;
}

export interface StorageObject {
  key: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Hash-bound deliverable file. Persisted on `deliverables.files` and used by
 * the judge to decide what to fetch and inline into the Gemini prompt.
 */
export interface DeliverableFile {
  key: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  finalUrl: string;
}

/**
 * Off-platform reference attached to a deliverable. Not hash-bound and not
 * fetched by the judge; rendered as context in the prompt and as a clickable
 * link in the UI.
 */
export interface ExternalLink {
  url: string;
  label?: string | undefined;
}
