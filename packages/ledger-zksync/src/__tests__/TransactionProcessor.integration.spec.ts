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
  jest.setTimeout(30 * 1000);

  const wallet = new Wallet(process.env.PRIVATE_KEY!, web3);
  const ledger = new ZksyncLedger(wallet);
  const cas = new IpfsCas('https://ipfs.io/ipfs');
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

  it('should process a known historical transaction with a recoveryCommitment array', async () => {
    // Arrange: Fetch transactions from the block range provided in the logs.
    const startBlock = 40422734;
    const endBlock = 40423234;
    const transactions = await (ledger as any)._getTransactions(
      startBlock,
      endBlock,
      { omitTimestamp: false }
    );

    // Find the specific transaction we need to test.
    const targetAnchorPrefix =
      '1.QmS3HpAv4zuT4qGqyvjxggzw5k3RHRJWJLykJbkWjwh83e';
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
});
