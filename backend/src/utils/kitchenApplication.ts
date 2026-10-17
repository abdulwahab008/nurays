/**
 * What a kitchen's application still lacks before an administrator can approve it. A kitchen that signs up with "Cook & Sell"
 * starts with only a name; the community, the kitchen's place on the map and both sides of the CNIC are added afterwards.
 * An empty list means the application is complete. The same list decides whether the kitchen may still add to a pending
 * application, whether the administrator may approve it, and what the administrator's screen says is missing.
 */
export function kitchenApplicationGaps(
  seller: { communityId: string | null; latitude: unknown; longitude: unknown },
  documentTypes: readonly string[]
): string[] {
  const gaps: string[] = [];
  if (!seller.communityId) gaps.push('community');
  if (seller.latitude == null || seller.longitude == null) gaps.push('kitchen location');
  if (!documentTypes.includes('cnic_front') || !documentTypes.includes('cnic_back')) gaps.push('CNIC photos (both sides)');
  return gaps;
}
