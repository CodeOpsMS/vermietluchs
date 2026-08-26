export type SettlementRequest = {
  propertyId: number;
  tenancyId: number;
  year: number;
};

export type SettlementCloseRequest = SettlementRequest & {
  expectedCalculationToken: string;
  correctionSnapshotId?: number;
  correctionRevision?: number;
};

export type SettlementArchiveItem = {
  snapshotId: number;
  propertyId: number;
  tenancyId: number;
  year: number;
  closedAt: string;
  revision: number;
};
