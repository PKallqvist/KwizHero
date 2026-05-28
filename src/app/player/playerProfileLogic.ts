export function shouldShowFirstDiscoveryLabel(params: {
  discoveryBadgeCount: number;
  firstDiscoveryProfileLabelSeen: boolean;
}): boolean {
  return params.discoveryBadgeCount > 0 && !params.firstDiscoveryProfileLabelSeen;
}