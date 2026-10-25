/**
 * Saved placeholder values ("{{CONTEXT}}" → a paragraph about the user's company).
 * Personal to each user; managed under Profile → My placeholders.
 */

export interface Placeholder {
  id: string;
  userId: string;
  name: string;
  value: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlaceholderRequest {
  name: string;
  value: string;
  description?: string | null;
}

export interface UpdatePlaceholderRequest {
  name?: string;
  value?: string;
  description?: string | null;
}

export interface UpsertPlaceholderRequest {
  value: string;
  description?: string | null;
}

/** Limits enforced by the backend. */
export const PLACEHOLDER_LIMITS = {
  maxNameLength: 64,
  maxValueLength: 20000,
  maxDescriptionLength: 500,
  maxPerUser: 100,
} as const;
