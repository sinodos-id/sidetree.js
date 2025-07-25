import Observer from './Observer';
import ZksyncLedger from './ZksyncLedger';

// =============================================================================
// Configuration Interfaces
// =============================================================================

export interface HistoricalSyncConfig {
  /** Number of blocks to process in each batch (default: 1000) */
  batchSize: number;
  
  /** Delay between batches in milliseconds (default: 100) */
  rateLimitDelayMs: number;
  
  /** Maximum number of retries for failed batches (default: 3) */
  maxRetries: number;
  
  /** Delay between retries in milliseconds (default: 1000) */
  retryDelayMs: number;
}

export interface PaginationConfig {
  /** Default batch size for pagination (default: 1000) */
  defaultBatchSize: number;
  
  /** Maximum allowed batch size (default: 10000) */
  maxBatchSize: number;
}

export interface SyncState {
  /** Current sync phase */
  phase: 'historical' | 'live';
  
  /** Last synchronized block number */
  lastSyncedBlock: number;
  
  /** Target block number for historical sync */
  targetBlock: number;
  
  /** Block where the contract was deployed */
  contractDeploymentBlock: number;
  
  /** Whether historical sync is complete */
  isComplete: boolean;
}

// =============================================================================
// Configuration Presets
// =============================================================================

export const SYNC_PRESETS = {
  // Conservative settings for slower RPCs or limited bandwidth
  CONSERVATIVE: {
    historicalSync: {
      batchSize: 500,
      rateLimitDelayMs: 500,
      maxRetries: 5,
      retryDelayMs: 2000,
    },
    pagination: {
      defaultBatchSize: 500,
      maxBatchSize: 5000,
    },
  },

  // Balanced settings for most use cases
  BALANCED: {
    historicalSync: {
      batchSize: 1000,
      rateLimitDelayMs: 100,
      maxRetries: 3,
      retryDelayMs: 1000,
    },
    pagination: {
      defaultBatchSize: 1000,
      maxBatchSize: 10000,
    },
  },

  // Aggressive settings for fast RPCs and high bandwidth
  AGGRESSIVE: {
    historicalSync: {
      batchSize: 2000,
      rateLimitDelayMs: 50,
      maxRetries: 2,
      retryDelayMs: 500,
    },
    pagination: {
      defaultBatchSize: 2000,
      maxBatchSize: 20000,
    },
  },
};

export class HistoricalSyncMonitor {
  private observer: Observer;
  private blockchain: ZksyncLedger;
  private progressInterval!: NodeJS.Timeout;

  constructor(observer: Observer, blockchain: ZksyncLedger) {
    this.observer = observer;
    this.blockchain = blockchain;
  }

  public startMonitoring(intervalMs: number = 10000): void {
    this.progressInterval = setInterval(async () => {
      await this.getSyncStatistics();
    }, intervalMs);
  }

  public stopMonitoring(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
  }

  public async getSyncStatistics(): Promise<{
    syncState: SyncState;
    totalTransactions: number;
    progressPercentage: number;
  }> {
    const syncState = this.observer.getSyncState();
    const totalTransactions = await this.blockchain.getTotalTransactionCount();
    const progressPercentage =
      syncState.targetBlock > 0
        ? (syncState.lastSyncedBlock / syncState.targetBlock) * 100
        : 0;

    return {
      syncState,
      totalTransactions,
      progressPercentage,
    };
  }
}