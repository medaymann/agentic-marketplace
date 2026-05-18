export { getPresignedUploadUrl, getPresignedDownloadUrl } from "./presigned";
export { fetchObjectBytes } from "./fetch";
export type { FetchedObject } from "./fetch";
export { isMockMode, getPublicBase } from "./client";
// Note: `PresignedUpload` is re-exported by the domain module via the Zod
// schema (`presignedUploadSchema`). Avoid re-exporting the runtime interface
// here to keep the top-level `@basira/shared` surface unambiguous.
export type {
  StorageObject,
  PresignedDownload,
  DeliverableFile,
  ExternalLink,
} from "./types";
