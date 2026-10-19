export interface User {
  id: string;
  email: string;
  isActive: boolean;
  isAdmin: boolean;
  requirePasswordReset: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  isShared: boolean;
  sharedWith: string[] | null;
  tags?: string[] | null;
}

export interface Quota {
  generationType: string;
  quotaType: string;
  quotaLimit: number | null;
  quotaUsed: number;
  quotaRemaining: number | null;
  quotaResetAt: string | null;
}

export interface UserWithQuotas extends User {
  quotas: Quota[];
}

export type QuotaType = 'limited' | 'unlimited';

/** Quota payload sent to the backend. */
export interface QuotaSetting {
  type: QuotaType;
  limit: number | null;
}

/** Pending inline edit of a single quota cell. */
export interface QuotaEdit {
  type: QuotaType;
  limit: number | null;
  hasChanges: boolean;
}

export const GENERATION_TYPES = ['image', 'video', 'speech', 'text'] as const;
export type GenerationType = (typeof GENERATION_TYPES)[number];

export const DEFAULT_LIMITS: Record<GenerationType, number> = {
  image: 100,
  video: 50,
  speech: 100,
  text: 200,
};

export const parseTags = (value: string): string[] =>
  value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

/** Build the quota payload for every generation type from string limits typed in a form. */
export const buildQuotaSettings = (
  quotaType: QuotaType,
  limits: Record<GenerationType, string>,
): Record<GenerationType, QuotaSetting> => {
  const result = {} as Record<GenerationType, QuotaSetting>;
  for (const type of GENERATION_TYPES) {
    result[type] =
      quotaType === 'unlimited'
        ? { type: 'unlimited', limit: null }
        : { type: 'limited', limit: parseInt(limits[type]) || DEFAULT_LIMITS[type] };
  }
  return result;
};
