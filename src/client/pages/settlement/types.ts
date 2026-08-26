export type SettlementRequest = {
  propertyId: number;
  tenancyId: number;
  year: number;
  roundingDifference: number;
  roundingGroup: string;
};

export type SettlementArchiveItem = {
  snapshotId: number;
  propertyId: number;
  tenancyId: number;
  year: number;
  closedAt: string;
};
