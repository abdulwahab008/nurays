/**
 * A rider who can take a job from the open pool right now: approved, active and on duty. This is the
 * dispatcher's own candidate filter, and it decides who is told about jobs in the pool (an off-duty rider
 * cannot claim one, so announcing it to them only makes their dashboard reload for nothing).
 */
export const ON_DUTY_RIDER = { verificationStatus: 'approved', status: 'active', isAvailable: true } as const;

export function canTakePoolJobs(rider: { verificationStatus?: string | null; status?: string | null; isAvailable?: boolean | null } | null | undefined): boolean {
  return !!rider && rider.verificationStatus === ON_DUTY_RIDER.verificationStatus && rider.status === ON_DUTY_RIDER.status && rider.isAvailable === ON_DUTY_RIDER.isAvailable;
}
