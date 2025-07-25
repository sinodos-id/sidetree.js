import {
  IBlockchain,
  IVersionManager,
  IOperationStore,
  ITransactionStore,
  IUnresolvableTransactionStore,
} from '@sidetree/common';
import {
  HistoricalSyncConfig,
  SyncState,
} from './historical-sync-config';

export default class Observer {
  private syncState: SyncState = {
    phase: 'historical',
    lastSyncedBlock: 0,
    targetBlock: 0,
    contractDeploymentBlock: 0,
    isComplete: false,
  };

  private historicalSyncConfig: HistoricalSyncConfig;

  public constructor(
    _versionManager: IVersionManager,
    _blockchain: IBlockchain,
    _maxConcurrentDownloads: number,
    _operationStore: IOperationStore,
    _transactionStore: ITransactionStore,
    _unresolvableTransactionStore: IUnresolvableTransactionStore,
    _observingIntervalInSeconds: number,
    historicalSyncConfig?: Partial<HistoricalSyncConfig>
  ) {
    this.historicalSyncConfig = {
      batchSize: 1000,
      rateLimitDelayMs: 100,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...historicalSyncConfig,
    };
  }

  public getSyncState(): SyncState {
    return this.syncState;
  }

  public updateHistoricalSyncConfig(config: Partial<HistoricalSyncConfig>): void {
    this.historicalSyncConfig = { ...this.historicalSyncConfig, ...config };
  }

  public async startPeriodicProcessing() {
    // No-op for tests
  }

  public stopPeriodicProcessing() {
    // No-op for tests
  }
}