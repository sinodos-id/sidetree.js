import { IOperationStore, TransactionModel } from '@sidetree/common';
import { DownloadManager, TransactionProcessor } from '@sidetree/core';
import { IpfsCas } from '@sidetree/cas-ipfs';
import { Wallet } from 'zksync-web3';
import { ZksyncLedger } from '..';
import { web3 } from './web3';
import * as dotenv from 'dotenv';
dotenv.config();

// NOTE: The test I created previously in packages/core/src/test can be deleted.
describe('TransactionProcessor Integration', () => {
  // Using a longer timeout for real network calls
  jest.setTimeout(30 * 10000);

  const wallet = new Wallet(process.env.PRIVATE_KEY!, web3);
  const ledger = new ZksyncLedger(
    wallet,
    '0xe0055B74422Bec15cB1625792C4aA0beDcC61AA7'
  );
  const cas = new IpfsCas('http://localhost:5001');
  const downloadManager = new DownloadManager(5, cas);

  const operationStore: IOperationStore = {
    insertOrReplace: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    deleteUpdatesEarlierThan: jest.fn(),
  };

  // Mock dependencies not under test
  const blockchain = {
    getValueTimeLock: jest
      .fn()
      .mockResolvedValue({ amount: 1, unlockTransactionTime: 0 }),
    getFee: jest.fn(),
    getServiceVersion: jest.fn(),
  } as any;

  const versionMetadataFetcher = {
    getVersionMetadata: jest.fn(),
  };

  const transactionProcessor = new TransactionProcessor(
    downloadManager,
    operationStore,
    blockchain,
    versionMetadataFetcher
  );

  beforeAll(async () => {
    await ledger.initialize();
    downloadManager.start();
  });

  afterAll(() => {
    downloadManager.stop();
  });

  beforeEach(() => {
    // Reset mocks before each test to ensure test independence
    (operationStore.insertOrReplace as jest.Mock).mockClear();
  });

  it('should process a known historical transaction with a recoveryCommitment array', async () => {
    // Arrange: Fetch transactions from the block range provided in the logs.
    const startBlock = 40625124;
    const endBlock = 40625624;
    const transactions = await (ledger as any)._getTransactions(
      startBlock,
      endBlock,
      { omitTimestamp: false }
    );
    console.log(transactions);

    // Find the specific transaction we need to test.
    const targetAnchorPrefix =
      '3.QmbcmBQkTASq3vMfAHYFU1S6HcXuEaXR8Qmn8Ak13yzmNj';
    const targetTransaction = transactions.find((tx: TransactionModel) =>
      tx.anchorString.startsWith(targetAnchorPrefix)
    );

    // Ensure we found the transaction to test.
    expect(targetTransaction).toBeDefined();
    if (!targetTransaction) {
      console.log(
        `Transaction with anchor prefix ${targetAnchorPrefix} not found in block range ${startBlock}-${endBlock}. Skipping test.`
      );
      return;
    }

    // Act: Process the real transaction.
    const result = await transactionProcessor.processTransaction(
      targetTransaction
    );

    // Assert: The transaction was processed successfully and the operation was stored.
    expect(result).toBe(true);
    expect(operationStore.insertOrReplace).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          didUniqueSuffix: expect.any(String),
          type: 'create',
        }),
      ])
    );
  });
  it.skip('should gracefully fail a transaction with a delta exceeding the size limit', async () => {
    // Arrange: Fetch transactions from the block range provided in the new logs.
    const startBlock = 40471945;
    const endBlock = 40472445;
    const transactions = await (ledger as any)._getTransactions(
      startBlock,
      endBlock,
      { omitTimestamp: false }
    );

    // Find the specific transaction we need to test.
    const targetAnchorPrefix =
      '1.QmS69CmTSaak23FrbTHWPiZw8EtwzN4fKiAikidfDmVJ56';
    const targetTransaction = transactions.find((tx: TransactionModel) =>
      tx.anchorString.startsWith(targetAnchorPrefix)
    );

    // Ensure we found the transaction to test.
    expect(targetTransaction).toBeDefined();
    if (!targetTransaction) {
      console.log(
        `Transaction with anchor prefix ${targetAnchorPrefix} not found in block range ${startBlock}-${endBlock}. Skipping test.`
      );
      return;
    }

    // Act: Process the real transaction.
    const result = await transactionProcessor.processTransaction(
      targetTransaction
    );

    // Assert: The transaction processing should fail gracefully and not be retried.
    expect(result).toBe(false);
    // The operation should not have been stored because the batch is discarded.
    expect(operationStore.insertOrReplace).not.toHaveBeenCalled();
  });
});
