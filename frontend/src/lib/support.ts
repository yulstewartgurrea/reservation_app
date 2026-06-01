/**
 * Typed API client for `/api/support/` (ticketing module).
 *
 * Reuses the shared axios instance from `./api` so the JWT interceptor and
 * the same-origin/CORS-free base URL apply automatically.
 *
 * Errors should be displayed via `formatApiError` (DRF parses 429 + field
 * errors cleanly), never `JSON.stringify`.
 */

import { api } from "./api";

// -- enums --------------------------------------------------------------- //

export type TicketStatus =
  | "open"
  | "in_progress"
  | "awaiting_customer"
  | "resolved"
  | "closed";

export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type TicketCategory =
  | "bug"
  | "payment"
  | "booking"
  | "shop"
  | "account"
  | "feature"
  | "other";

export const TICKET_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "awaiting_customer",
  "resolved",
  "closed",
];

export const TICKET_PRIORITIES: TicketPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

export const TICKET_CATEGORIES: TicketCategory[] = [
  "bug",
  "payment",
  "booking",
  "shop",
  "account",
  "feature",
  "other",
];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  awaiting_customer: "Awaiting customer",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  bug: "Bug",
  payment: "Payment",
  booking: "Booking",
  shop: "Shop",
  account: "Account",
  feature: "Feature request",
  other: "Other",
};

/**
 * Status transitions the backend allows. Mirror of
 * `apps/support/services.py::STATUS_TRANSITIONS` — keep in sync.
 */
export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "awaiting_customer", "resolved", "closed"],
  in_progress: ["open", "awaiting_customer", "resolved", "closed"],
  awaiting_customer: ["open", "in_progress", "resolved", "closed"],
  resolved: ["open", "in_progress", "closed"],
  closed: ["open"],
};

// -- shapes -------------------------------------------------------------- //

export type MinimalUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "shop_owner" | "customer";
  display_name: string;
};

export type TicketAttachment = {
  id: number;
  file: string | null;
  original_name: string;
  content_type: string;
  size: number;
  uploaded_at: string;
};

export type TicketMessage = {
  id: number;
  author: MinimalUser | null;
  body: string;
  is_internal: boolean;
  created_at: string;
  attachments: TicketAttachment[];
};

export type TicketEvent = {
  id: number;
  event_type: string;
  actor: MinimalUser | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type RelatedReservation = { id: number; reference: string };
export type RelatedShop = { id: number; name: string };

export type TicketListItem = {
  id: number;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  submitter: MinimalUser | null;
  assigned_to: MinimalUser | null;
  last_message_at: string | null;
  created_at: string;
};

export type Ticket = TicketListItem & {
  body: string;
  related_reservation: RelatedReservation | null;
  related_shop: RelatedShop | null;
  messages: TicketMessage[];
  /**
   * `null` for non-admin viewers, an array for admins. Decide whether to
   * render the audit sidebar from this field directly — don't re-check
   * the user role.
   */
  events: TicketEvent[] | null;
  updated_at: string;
  resolved_at: string | null;
};

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

// -- list params --------------------------------------------------------- //

export type AdminAssignedFilter = "me" | "unassigned" | number | "";

export type AdminTicketFilters = {
  status?: TicketStatus | "";
  category?: TicketCategory | "";
  priority?: TicketPriority | "";
  q?: string;
  assigned_to?: AdminAssignedFilter;
  page?: number;
};

function toParams(filters: AdminTicketFilters | undefined): Record<string, string> {
  const params: Record<string, string> = {};
  if (!filters) return params;
  if (filters.status) params.status = filters.status;
  if (filters.category) params.category = filters.category;
  if (filters.priority) params.priority = filters.priority;
  if (filters.q) params.q = filters.q;
  if (filters.assigned_to !== "" && filters.assigned_to !== undefined && filters.assigned_to !== null) {
    params.assigned_to = String(filters.assigned_to);
  }
  if (filters.page) params.page = String(filters.page);
  return params;
}

// -- API functions ------------------------------------------------------- //

export async function listTickets(
  params?: { page?: number }
): Promise<Paginated<TicketListItem>> {
  const { data } = await api.get<Paginated<TicketListItem>>("/support/tickets/", {
    params,
  });
  return data;
}

export async function listAdminTickets(
  filters: AdminTicketFilters = {}
): Promise<Paginated<TicketListItem>> {
  const params = toParams(filters);
  const { data } = await api.get<Paginated<TicketListItem>>("/support/tickets/", {
    params: Object.keys(params).length ? params : undefined,
  });
  return data;
}

export async function getTicket(id: number | string): Promise<Ticket> {
  const { data } = await api.get<Ticket>(`/support/tickets/${id}/`);
  return data;
}

export type CreateTicketInput = {
  category: TicketCategory;
  subject: string;
  body: string;
  related_reservation?: number | null;
  related_shop?: number | null;
};

export async function createTicket(payload: CreateTicketInput): Promise<Ticket> {
  const { data } = await api.post<Ticket>("/support/tickets/", payload);
  return data;
}

export type PatchTicketInput = {
  // Submitter (while OPEN) — also allowed for admin.
  subject?: string;
  body?: string;
  // Admin only.
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: number | null;
};

export async function patchTicket(
  id: number | string,
  payload: PatchTicketInput
): Promise<Ticket> {
  const { data } = await api.patch<Ticket>(`/support/tickets/${id}/`, payload);
  return data;
}

export async function listMessages(
  ticketId: number | string
): Promise<TicketMessage[]> {
  const { data } = await api.get<TicketMessage[]>(
    `/support/tickets/${ticketId}/messages/`
  );
  return data;
}

export type PostMessageInput = {
  body: string;
  is_internal?: boolean;
  attachments?: File[];
};

export async function postMessage(
  ticketId: number | string,
  input: PostMessageInput
): Promise<TicketMessage> {
  const form = new FormData();
  form.append("body", input.body);
  if (input.is_internal) form.append("is_internal", "true");
  for (const file of input.attachments ?? []) {
    form.append("attachments", file);
  }
  const { data } = await api.post<TicketMessage>(
    `/support/tickets/${ticketId}/messages/`,
    form,
    {
      // Let the browser set the multipart boundary; we must override the
      // default JSON Content-Type from the axios instance.
      headers: { "Content-Type": "multipart/form-data" },
    }
  );
  return data;
}

export async function transitionTicket(
  id: number | string,
  new_status: TicketStatus
): Promise<Ticket> {
  const { data } = await api.post<Ticket>(`/support/tickets/${id}/transition/`, {
    new_status,
  });
  return data;
}

export async function assignTicket(
  id: number | string,
  assignee_id: number | null
): Promise<Ticket> {
  const { data } = await api.post<Ticket>(`/support/tickets/${id}/assign/`, {
    assignee_id,
  });
  return data;
}

// -- attachment client-side limits (mirror backend) ---------------------- //

export const ATTACHMENT_MAX_FILES = 5;
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
export const ATTACHMENT_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

export function validateAttachments(files: File[]): string | null {
  if (files.length > ATTACHMENT_MAX_FILES) {
    return `At most ${ATTACHMENT_MAX_FILES} files per message.`;
  }
  for (const f of files) {
    if (f.size > ATTACHMENT_MAX_BYTES) {
      return `${f.name} is larger than 5 MB.`;
    }
    if (!ATTACHMENT_ALLOWED_MIME.has(f.type)) {
      return `${f.name} is not a supported file type (PNG, JPEG, WebP, PDF).`;
    }
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// -- relative time helper ----------------------------------------------- //

const RTF = typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl
  ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  : null;

const DIVISIONS: { amount: number; name: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, name: "seconds" },
  { amount: 60, name: "minutes" },
  { amount: 24, name: "hours" },
  { amount: 7, name: "days" },
  { amount: 4.34524, name: "weeks" },
  { amount: 12, name: "months" },
  { amount: Number.POSITIVE_INFINITY, name: "years" },
];

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  if (!RTF) return new Date(iso).toLocaleString();
  const date = new Date(iso);
  let duration = (date.getTime() - Date.now()) / 1000;
  for (const div of DIVISIONS) {
    if (Math.abs(duration) < div.amount) {
      return RTF.format(Math.round(duration), div.name);
    }
    duration /= div.amount;
  }
  return new Date(iso).toLocaleString();
}
