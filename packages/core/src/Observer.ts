import {
  TransactionModel,
  IVersionManager,
  IUnresolvableTransactionStore,
  ITransactionStore,
  ITransactionProcessor,
  IOperationStore,
  IBlockchain,
  Logger,
  TransactionUnderProcessingModel,
  SidetreeError,
  SharedErrorCode,
} from '@sidetree/common';

import timeSpan from 'time-span';
import EventCode from './EventCode';
import EventEmitter from './EventEmitter';

import ThroughputLimiter from './ThroughputLimiter';

enum TransactionProcessingStatus {
  Error = 'error',
  Processing = 'processing',
  Processed = 'processed',
}

interface SyncState {
  phase: 'historical' | 'live';
  lastSyncedBlock: number;
  targetBlock: number;
  contractDeploymentBlock: number;
  isComplete: boolean;
}

interface HistoricalSyncConfig {
  batchSize: number;
  rateLimitDelayMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Class that performs periodic processing of batches of Sidetree operations anchored to the blockchain.
 */
export default class Observer {
  /**
   * Denotes if the periodic transaction processing should continue to occur.
   * Used mainly for test purposes.
   */
  private continuePeriodicProcessing = false;

  /**
   * The list of transactions that are being downloaded or processed.
   */
  private transactionsUnderProcessing: TransactionUnderProcessingModel[] = [];

  /**
   * This is the transaction that is used as a cursor/timestamp to fetch newer transaction.
   */
  private cursorTransaction: TransactionModel | undefined;

  private throughputLimiter: ThroughputLimiter;

  /**
   * Historical sync configuration with sensible defaults
   */
  private historicalSyncConfig: HistoricalSyncConfig = {
    batchSize: 500,
    rateLimitDelayMs: 100,
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  /**
   * Current sync state
   */
  private syncState: SyncState = {
    phase: 'historical',
    lastSyncedBlock: 0,
    targetBlock: 0,
    contractDeploymentBlock: 0,
    isComplete: false,
  };

  public constructor(
    private versionManager: IVersionManager,
    private blockchain: IBlockchain,
    private maxConcurrentDownloads: number,
    private operationStore: IOperationStore,
    private transactionStore: ITransactionStore,
    private unresolvableTransactionStore: IUnresolvableTransactionStore,
    private observingIntervalInSeconds: number,
    historicalSyncConfig?: Partial<HistoricalSyncConfig>
  ) {
    this.throughputLimiter = new ThroughputLimiter(versionManager);

    // Merge provided config with defaults
    if (historicalSyncConfig) {
      this.historicalSyncConfig = {
        ...this.historicalSyncConfig,
        ...historicalSyncConfig,
      };
    }
  }

  /**
   * The method that starts the periodic polling and processing of Sidetree operations.
   */
  public async startPeriodicProcessing() {
    Logger.info(`Starting periodic transactions processing.`);
    setImmediate(async () => {
      this.continuePeriodicProcessing = true;

      // Check if historical sync is needed before starting live processing
      await this.initializeSyncState();

      if (this.syncState.phase === 'historical' && !this.syncState.isComplete) {
        Logger.info(
          'Historical sync required. Starting historical sync phase...'
        );
        await this.performHistoricalSync();
      }

      // Transition to live processing
      this.syncState.phase = 'live';
      Logger.info('Historical sync complete. Starting live processing...');
      this.processTransactions();
    });
  }

  /**
   * Initialize sync state by checking existing transactions and blockchain state
   */
  private async initializeSyncState(): Promise<void> {
    try {
      // Get the latest blockchain time to determine target block
      const latestTime = await this.blockchain.getLatestTime();
      this.syncState.targetBlock = latestTime.time;

      // Check if we have any transactions stored
      const lastTransaction = await this.transactionStore.getLastTransaction();

      if (!lastTransaction) {
        // No transactions found - full historical sync needed
        this.syncState.phase = 'historical';
        this.syncState.lastSyncedBlock = 0;
        this.syncState.contractDeploymentBlock = await this.detectContractDeploymentBlock();
        this.syncState.isComplete = false;
        Logger.info(
          'No existing transactions found. Full historical sync required.'
        );
      } else {
        // Check if we're caught up or need to resume historical sync
        const lastTransactionBlockNumber = await (this
          .blockchain as any).getBlockNumberByHash(
          lastTransaction.transactionTimeHash
        );
        const gapSize = this.syncState.targetBlock - lastTransactionBlockNumber;

        console.log({
          targetBlocck: this.syncState.targetBlock,
          lastTransactionTransactionTime: lastTransaction.transactionTime,
          lastTransactionBlockNumber: lastTransactionBlockNumber,
          gap: gapSize,
          batchSize: this.historicalSyncConfig.batchSize,
        });

        if (gapSize > this.historicalSyncConfig.batchSize) {
          // Gap is significant - resume historical sync
          this.syncState.phase = 'historical';
          this.syncState.lastSyncedBlock = lastTransactionBlockNumber;
          this.syncState.contractDeploymentBlock = await this.detectContractDeploymentBlock();
          this.syncState.isComplete = false;
          Logger.info(
            `Gap of ${gapSize} blocks detected. Resuming historical sync from block ${this.syncState.lastSyncedBlock}`
          );
        } else {
          // Caught up - go directly to live processing
          this.syncState.phase = 'live';
          this.syncState.isComplete = true;
          Logger.info(
            'Node is caught up. Proceeding directly to live processing.'
          );
        }
      }
    } catch (error) {
      Logger.error(`Failed to initialize sync state: ${error}`);
      throw error;
    }
  }

  /**
   * Detect the contract deployment block (simplified implementation)
   * In production, this could be configurable or detected via contract events
   */
  private async detectContractDeploymentBlock(): Promise<number> {
    // For now, start from block 0. In production, this could be:
    // 1. Configurable parameter
    // 2. Detected by searching for contract creation transaction
    // 3. Stored in configuration based on known deployment block
    return 0;
  }

  /**
   * Perform historical sync in batches
   */
  private async performHistoricalSync(): Promise<void> {
    Logger.info('Starting historical sync process...');

    while (
      this.syncState.lastSyncedBlock < this.syncState.targetBlock &&
      this.continuePeriodicProcessing
    ) {
      const batchStartBlock = this.syncState.lastSyncedBlock;
      const batchEndBlock = Math.min(
        batchStartBlock + this.historicalSyncConfig.batchSize,
        this.syncState.targetBlock
      );

      Logger.info(
        `Processing historical batch: blocks ${batchStartBlock} to ${batchEndBlock}`
      );

      try {
        await this.processHistoricalBatch(batchStartBlock, batchEndBlock);
        this.syncState.lastSyncedBlock = batchEndBlock;

        // Log progress
        const progress = (
          (this.syncState.lastSyncedBlock / this.syncState.targetBlock) *
          100
        ).toFixed(2);
        Logger.info(
          `Historical sync progress: ${progress}% (${this.syncState.lastSyncedBlock}/${this.syncState.targetBlock})`
        );

        // Rate limiting to avoid overwhelming RPC/CAS
        if (this.historicalSyncConfig.rateLimitDelayMs > 0) {
          await this.sleep(this.historicalSyncConfig.rateLimitDelayMs);
        }
      } catch (error) {
        Logger.error(
          `Failed to process historical batch ${batchStartBlock}-${batchEndBlock}: ${error}`
        );

        // Implement retry logic
        let retryCount = 0;
        while (retryCount < this.historicalSyncConfig.maxRetries) {
          try {
            Logger.info(
              `Retrying batch ${batchStartBlock}-${batchEndBlock}, attempt ${retryCount +
                1}`
            );
            await this.sleep(
              this.historicalSyncConfig.retryDelayMs * (retryCount + 1)
            );
            await this.processHistoricalBatch(batchStartBlock, batchEndBlock);
            this.syncState.lastSyncedBlock = batchEndBlock;
            break;
          } catch (retryError) {
            retryCount++;
            if (retryCount >= this.historicalSyncConfig.maxRetries) {
              Logger.error(
                `Failed to process batch ${batchStartBlock}-${batchEndBlock} after ${this.historicalSyncConfig.maxRetries} retries: ${retryError}`
              );
              throw retryError;
            }
          }
        }
      }
    }

    this.syncState.isComplete = true;
    Logger.info('Historical sync completed successfully');
  }

  /**
   * Process a single historical batch
   */
  private async processHistoricalBatch(
    fromBlock: number,
    toBlock: number
  ): Promise<void> {
    // Use the enhanced blprocessHistoricalBatchockchain interface to get transactions for the block range
    const transactions = await (this.blockchain as any)._getTransactions(
      fromBlock,
      toBlock,
      {
        omitTimestamp: false,
      }
    );

    if (transactions.length === 0) {
      return; // No transactions in this range
    }

    // Sort transactions by transaction number to maintain ordering
    const sortedTransactions = transactions.sort(
      (a: TransactionModel, b: TransactionModel) => {
        return a.transactionNumber - b.transactionNumber;
      }
    );

    // Process each transaction sequentially to maintain order
    for (const transaction of sortedTransactions) {
      try {
        const transactionUnderProcessing = {
          transaction: transaction,
          processingStatus: TransactionProcessingStatus.Processing,
        };

        // Process the transaction using existing logic
        await this.processTransaction(transaction, transactionUnderProcessing);

        // If processing was successful, store the transaction immediately
        if (
          transactionUnderProcessing.processingStatus ===
          TransactionProcessingStatus.Processed
        ) {
          await this.transactionStore.addTransaction(transaction);
        }
      } catch (error) {
        Logger.error(
          `Failed to process historical transaction ${transaction.transactionNumber}: ${error}`
        );

        // For historical sync, we continue processing other transactions
        // but may want to record failed transactions for later retry
        try {
          await this.unresolvableTransactionStore.recordUnresolvableTransactionFetchAttempt(
            transaction
          );
        } catch (recordError) {
          Logger.error(
            `Failed to record unresolvable transaction ${transaction.transactionNumber}: ${recordError}`
          );
        }
      }
    }
  }

  /**
   * Helper method for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current sync state (useful for monitoring)
   */
  public getSyncState(): SyncState {
    return { ...this.syncState };
  }

  /**
   * Update historical sync configuration
   */
  public updateHistoricalSyncConfig(
    config: Partial<HistoricalSyncConfig>
  ): void {
    this.historicalSyncConfig = { ...this.historicalSyncConfig, ...config };
  }

  /**
   * Stops periodic transaction processing.
   * Mainly used for test purposes.
   */
  public stopPeriodicProcessing() {
    Logger.info(`Stopped periodic transactions processing.`);
    this.continuePeriodicProcessing = false;
  }

  /**
   * Processes new transactions if any, then reprocess a set of unresolvable transactions if any,
   * then schedules the next round of processing unless `stopPeriodicProcessing()` is invoked.
   */
  public async processTransactions() {
    try {
      // Optional update to store the processed transactions that completed in between the polling periods.
      await this.storeThenTrimConsecutiveTransactionsProcessed();

      // Keep fetching new Sidetree transactions from blockchain and processing them
      // until there are no more new transactions or there is a block reorganization.
      let moreTransactions = false;
      do {
        this.cursorTransaction = await this.transactionStore.getLastTransaction();
        const cursorTransactionNumber = this.cursorTransaction
          ? this.cursorTransaction.transactionNumber
          : undefined;
        const cursorTransactionTimeHash = this.cursorTransaction
          ? this.cursorTransaction.transactionTimeHash
          : undefined;
        const cursorTransactionTime = this.cursorTransaction
          ? this.cursorTransaction.transactionTime
          : 0;

        let invalidTransactionNumberOrTimeHash = false;
        let readResult;
        const endTimer = timeSpan(); // Measure time taken to go blockchain read.
        try {
          Logger.info(
            'Fetching Sidetree transactions from blockchain service...'
          );
          readResult = await this.blockchain.read(
            cursorTransactionNumber,
            cursorTransactionTimeHash
          );
          Logger.info(
            `Fetched ${
              readResult.transactions.length
            } Sidetree transactions from blockchain service in ${endTimer.rounded()} ms.`
          );
        } catch (error) {
          if (
            error instanceof SidetreeError &&
            error.code === SharedErrorCode.InvalidTransactionNumberOrTimeHash
          ) {
            Logger.info(
              `Invalid transaction number ${cursorTransactionNumber} or time hash ${cursorTransactionTimeHash} given to blockchain service.`
            );
            invalidTransactionNumberOrTimeHash = true;
          } else {
            throw error;
          }
        }

        const transactions = readResult ? readResult.transactions : [];
        moreTransactions = readResult ? readResult.moreTransactions : false;

        // Set the cursor for fetching of next transaction batch in the next loop.
        if (transactions.length > 0) {
          this.cursorTransaction = transactions[transactions.length - 1];
        }

        // Queue parallel downloading and processing of chunk files.
        let qualifiedTransactions = await this.throughputLimiter.getQualifiedTransactions(
          transactions
        );

        qualifiedTransactions = qualifiedTransactions.sort((a, b) => {
          return a.transactionNumber - b.transactionNumber;
        });
        for (const transaction of qualifiedTransactions) {
          const transactionUnderProcessing = {
            transaction: transaction,
            processingStatus: TransactionProcessingStatus.Processing,
          };
          this.transactionsUnderProcessing.push(transactionUnderProcessing);
          // Intentionally not awaiting on downloading and processing each operation batch.
          this.processTransaction(transaction, transactionUnderProcessing);
        }

        // NOTE: Blockchain reorg has happened for sure only if `invalidTransactionNumberOrTimeHash` AND
        // latest transaction time is less or equal to blockchain service time.
        // This check will prevent Core from reverting transactions if/when blockchain service is re-initializing its data itself.
        let blockReorganizationDetected = false;
        if (invalidTransactionNumberOrTimeHash) {
          const latestBlockchainTime = await this.blockchain.getLatestTime();
          if (cursorTransactionTime <= latestBlockchainTime.time) {
            blockReorganizationDetected = true;
            moreTransactions = true;
          } else {
            Logger.info(
              `Blockchain microservice blockchain time is behind last known transaction time, waiting for blockchain microservice to catch up...`
            );
          }
        }

        // If block reorg is detected, we must wait until no more operation processing is pending,
        // then revert invalid transaction and operations.
        if (blockReorganizationDetected) {
          Logger.info(`Block reorganization detected.`);
          EventEmitter.emit(EventCode.SidetreeObserverBlockReorganization);

          await Observer.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(
            this.transactionsUnderProcessing,
            0
          );
          await this.storeThenTrimConsecutiveTransactionsProcessed(); // This is an optional optimization to give best the chance of minimal revert dataset.

          Logger.info(`Reverting invalid transactions...`);
          await this.revertInvalidTransactions();
          Logger.info(`Completed reverting invalid transactions.`);

          this.cursorTransaction = undefined;
        } else {
          // Else it means all transactions fetched are good for processing.

          // We hold off from fetching more transactions if the list of transactions under processing gets too long.
          // We will wait for count of transaction being processed to fall to the maximum allowed concurrent downloads
          // before attempting further transaction fetches.
          await Observer.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(
            this.transactionsUnderProcessing,
            this.maxConcurrentDownloads
          );
          await this.storeThenTrimConsecutiveTransactionsProcessed();

          // If there is an error in processing a transaction that PREVENTS processing subsequent Sidetree transactions from the blockchain
          // (e.g. A DB outage/error that prevents us from recording a transaction for retries),
          // erase the entire list transactions under processing since processing MUST not advance beyond the transaction that failed processing.
          const hasErrorInTransactionProcessing = this.hasErrorInTransactionProcessing();
          if (hasErrorInTransactionProcessing) {
            // Step to defend against potential uncontrolled growth in `transactionsUnderProcessing` array size due to looping.
            await Observer.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(
              this.transactionsUnderProcessing,
              0
            );
            await this.storeThenTrimConsecutiveTransactionsProcessed();

            // Clear the the entire list of transactions under processing since we have cannot advance further due to error.
            this.transactionsUnderProcessing = [];
            this.cursorTransaction = undefined;
          }
        }
      } while (moreTransactions);

      Logger.info(
        'Successfully kicked off downloading/processing of all new Sidetree transactions.'
      );

      // Continue onto processing unresolvable transactions if any.
      await this.processUnresolvableTransactions();

      EventEmitter.emit(EventCode.SidetreeObserverLoopSuccess);
    } catch (error) {
      EventEmitter.emit(EventCode.SidetreeObserverLoopFailure);
      Logger.error(
        `Encountered unhandled and possibly fatal Observer error, must investigate and fix: ${error}`
      );
    } finally {
      if (this.continuePeriodicProcessing) {
        Logger.info(
          `Waiting for ${this.observingIntervalInSeconds} seconds before fetching and processing transactions again.`
        );
        setTimeout(
          async () => this.processTransactions(),
          this.observingIntervalInSeconds * 1000
        );
      }
    }
  }

  /**
   * Gets the total count of the transactions given that are still under processing.
   */
  private static getCountOfTransactionsUnderProcessing(
    transactionsUnderProcessing: TransactionUnderProcessingModel[]
  ): number {
    const countOfTransactionsUnderProcessing = transactionsUnderProcessing.filter(
      (transaction) =>
        transaction.processingStatus === TransactionProcessingStatus.Processing
    ).length;

    return countOfTransactionsUnderProcessing;
  }

  /**
   * Returns true if at least processing of one transaction resulted in an error that prevents advancement of transaction processing.
   */
  private hasErrorInTransactionProcessing(): boolean {
    const firstTransactionProcessingError = this.transactionsUnderProcessing.find(
      (transaction) =>
        transaction.processingStatus === TransactionProcessingStatus.Error
    );

    return firstTransactionProcessingError !== undefined;
  }

  private static async waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(
    transactionsUnderProcessing: TransactionUnderProcessingModel[],
    count: number
  ) {
    let countOfTransactionsUnderProcessing = Observer.getCountOfTransactionsUnderProcessing(
      transactionsUnderProcessing
    );
    while (countOfTransactionsUnderProcessing > count) {
      // Wait a little before checking again.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      countOfTransactionsUnderProcessing = Observer.getCountOfTransactionsUnderProcessing(
        transactionsUnderProcessing
      );
    }
  }

  /**
   * Attempts to fetch and process unresolvable transactions due for retry.
   * Waits until all unresolvable transactions due for retry are processed.
   */
  private async processUnresolvableTransactions() {
    Logger.info(`Processing previously unresolvable transactions if any...`);

    const endTimer = timeSpan();
    const unresolvableTransactions = await this.unresolvableTransactionStore.getUnresolvableTransactionsDueForRetry();
    Logger.info(
      `Fetched ${
        unresolvableTransactions.length
      } unresolvable transactions to retry in ${endTimer.rounded()} ms.`
    );

    // Download and process each unresolvable transactions.
    const unresolvableTransactionStatus = [];
    for (const transaction of unresolvableTransactions) {
      const awaitingTransaction = {
        transaction: transaction,
        processingStatus: TransactionProcessingStatus.Processing,
      };
      unresolvableTransactionStatus.push(awaitingTransaction);
      // Intentionally not awaiting on downloading and processing each operation batch.
      this.processTransaction(transaction, awaitingTransaction);
    }

    await Observer.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(
      unresolvableTransactionStatus,
      0
    );
  }

  /**
   * Goes through `transactionsUnderProcessing` in chronological order, records every consecutive processed transaction in the transaction store,
   * then remove them from `transactionsUnderProcessing` and update the in memory `lastConsecutivelyProcessedTransaction`.
   *
   * NOTE: this excludes transaction processing that resulted in `TransactionProcessingStatus.Error`,
   * because such error includes the case when the code fails to store the transaction to the retry table for future retry,
   * adding it to the transaction table means such transaction won't be processed again, resulting in missing operation data.
   * @returns The last transaction consecutively processed.
   */
  private async storeThenTrimConsecutiveTransactionsProcessed() {
    let lastConsecutivelyProcessedTransaction;
    let i = 0;
    while (
      i < this.transactionsUnderProcessing.length &&
      this.transactionsUnderProcessing[i].processingStatus ===
        TransactionProcessingStatus.Processed
    ) {
      lastConsecutivelyProcessedTransaction = this.transactionsUnderProcessing[
        i
      ].transaction;
      await this.transactionStore.addTransaction(
        lastConsecutivelyProcessedTransaction
      );
      i++;
    }

    // Trim off consecutive transactions that are processed successfully.
    this.transactionsUnderProcessing.splice(0, i);
  }

  /**
   * Processes the given transaction by passing the transaction to the right version of the transaction processor based on the transaction time.
   * The transaction processing generically involves first downloading DID operation data from CAS (Content Addressable Storage),
   * then storing the operations indexed/grouped by DIDs in the persistent operation DB.
   */
  private async processTransaction(
    transaction: TransactionModel,
    transactionUnderProcessing: TransactionUnderProcessingModel
  ) {
    let transactionProcessedSuccessfully;

    try {
      const transactionProcessor: ITransactionProcessor = this.versionManager.getTransactionProcessor(
        transaction.transactionTime
      );
      transactionProcessedSuccessfully = await transactionProcessor.processTransaction(
        transaction
      );
    } catch (error) {
      Logger.error(
        `Unhandled error encountered processing transaction '${transaction.transactionNumber}': ${error}`
      );
      transactionProcessedSuccessfully = false;
    }

    if (transactionProcessedSuccessfully) {
      Logger.info(
        `Removing transaction '${transaction.transactionNumber}' from unresolvable transactions if exists...`
      );
      this.unresolvableTransactionStore.removeUnresolvableTransaction(
        transaction
      ); // Skip await since failure is not a critical and results in a retry.
    } else {
      // Per user request, disabling retry for now.
      // When a transaction fails, we will not add it to the unresolvable store.
      Logger.info(
        `Transaction '${transaction.transactionNumber}' failed processing and will not be retried.`
      );
    }

    Logger.info(
      `Finished processing transaction '${transaction.transactionNumber}'.`
    );
    transactionUnderProcessing.processingStatus =
      TransactionProcessingStatus.Processed;
  }

  /**
   * Reverts invalid transactions. Used in the event of a block-reorganization.
   */
  private async revertInvalidTransactions() {
    // Compute a list of exponentially-spaced transactions with their index, starting from the last transaction of the processed transactions.
    const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();

    // Find a known valid Sidetree transaction that is prior to the block reorganization.
    const bestKnownValidRecentTransaction = await this.blockchain.getFirstValidTransaction(
      exponentiallySpacedTransactions
    );

    const bestKnownValidRecentTransactionNumber =
      bestKnownValidRecentTransaction === undefined
        ? undefined
        : bestKnownValidRecentTransaction.transactionNumber;
    Logger.info(
      `Best known valid recent transaction: ${bestKnownValidRecentTransactionNumber}`
    );

    // Revert all processed operations that came after the best known valid recent transaction.
    Logger.info('Reverting operations...');
    await this.operationStore.delete(bestKnownValidRecentTransactionNumber);

    await this.unresolvableTransactionStore.removeUnresolvableTransactionsLaterThan(
      bestKnownValidRecentTransactionNumber
    );

    // NOTE: MUST do steps below LAST in this particular order to handle incomplete operation rollback due to unexpected scenarios, such as power outage etc.
    await this.transactionStore.removeTransactionsLaterThan(
      bestKnownValidRecentTransactionNumber
    );
  }
}
