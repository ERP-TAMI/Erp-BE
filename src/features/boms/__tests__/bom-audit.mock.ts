export function createBomAuditServiceMock() {
  return {
    recordHeaderChange: jest.fn().mockResolvedValue(undefined),
    recordRevisionCreated: jest.fn().mockResolvedValue(undefined),
    recordPromote: jest.fn().mockResolvedValue(undefined),
    recordWorkflow: jest.fn().mockResolvedValue(undefined),
    recordLinesSaved: jest.fn().mockResolvedValue(undefined),
    recordLinesCopied: jest.fn().mockResolvedValue(undefined),
    recordCostsSaved: jest.fn().mockResolvedValue(undefined),
    recordSingleLineChange: jest.fn().mockResolvedValue(undefined),
    recordLineEvent: jest.fn().mockResolvedValue(undefined),
  };
}
