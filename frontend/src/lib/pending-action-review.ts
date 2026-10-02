import { z } from "zod";

export const pendingActionReviewSchema = z.object({
  entityLabel: z.string().trim().min(1),
  currentState: z.record(z.string(), z.unknown()),
  proposedChange: z.record(z.string(), z.unknown()),
  amount: z.string().optional(),
  currency: z.string().optional(),
  impact: z.array(z.string()).min(1),
  observedVersion: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type PendingActionReview = z.infer<typeof pendingActionReviewSchema>;

export function parsePendingActionReview(value: unknown): PendingActionReview {
  return pendingActionReviewSchema.parse(value);
}

export function reviewExpired(
  review: PendingActionReview,
  now = Date.now(),
): boolean {
  return new Date(review.expiresAt).getTime() <= now;
}
