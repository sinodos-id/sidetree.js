import {
  Config,
  Observer,
  VersionManager,
  DownloadManager,
} from '@sidetree/core';
import {
  ITransactionStore,
  IOperationStore,
  IUnresolvableTransactionStore,
} from '@sidetree/common';
import TransactionProcessingStatus from '@sidetree/common/src/enums/TransactionProcessingStatus';
import IpfsCas from '../../../cas-ipfs/src/IpfsCas';
import ZksyncLedger from '../ZksyncLedger';
import { web3 } from './web3';
import { Wallet } from 'zksync-web3';
const sidetreeTestNode = require('./sidetree-test-node-config.json');
import { versions } from '@sidetree/core/src/versions';
import * as dotenv from 'dotenv';

dotenv.config();

jest.setTimeout(60 * 1000);

describe('Observer.processTransaction', () => {
  let observer: Observer;
  let versionManager: VersionManager;
  let downloadManager: DownloadManager;
  let cas: IpfsCas;
  let ledger: ZksyncLedger;
  let transactionStore: ITransactionStore;
  let operationStore: IOperationStore;
  let unresolvableTransactionStore: IUnresolvableTransactionStore;

  const fromBlock = 18377000;
  const toBlock = 18378000;

  beforeAll(async () => {
    const config: Config = {
      maxConcurrentDownloads: 10,
      mongoDbConnectionString: 'mongodb://localhost:27017/',
      databaseName: 'sidetree-test',
      batchingIntervalInSeconds: 1,
      didMethodName: 'sidetree',
      observingIntervalInSeconds: 1,
      blockchainServiceUri: 'http://localhost:3009',
    };

    const wallet = new Wallet(process.env.PRIVATE_KEY!, web3);
    ledger = new ZksyncLedger(
      wallet,
      '0xe0055B74422Bec15cB1625792C4aA0beDcC61AA7'
    );
    await ledger.initialize();

    cas = new IpfsCas(sidetreeTestNode.ipfsHttpApiEndpoint);
    downloadManager = new DownloadManager(config.maxConcurrentDownloads, cas);
    downloadManager.start();

    const sidetreeCoreVersions = [
      {
        startingBlockchainTime: 0,
        version: '1.0',
        protocols: versions['1.0'],
      },
    ];

    transactionStore = {
      addTransaction: jest.fn(),
      getLastTransaction: jest.fn(),
      getExponentiallySpacedTransactions: jest.fn(),
      removeTransactionsLaterThan: jest.fn(),
      getTransactionsLaterThan: jest.fn(),
      getTransaction: jest.fn(),
      getTransactionsStartingFrom: jest.fn(),
    };

    operationStore = {
      insertOrReplace: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      deleteUpdatesEarlierThan: jest.fn(),
    };

    versionManager = new VersionManager(config, sidetreeCoreVersions);
    await versionManager.initialize(
      ledger,
      cas,
      downloadManager,
      operationStore,
      {} as any, // resolver
      transactionStore
    );

    unresolvableTransactionStore = {
      recordUnresolvableTransactionFetchAttempt: jest.fn(),
      removeUnresolvableTransaction: jest.fn(),
      getUnresolvableTransactionsDueForRetry: jest.fn(),
      removeUnresolvableTransactionsLaterThan: jest.fn(),
    };

    observer = new Observer(
      versionManager,
      ledger,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      unresolvableTransactionStore,
      config.observingIntervalInSeconds
    );
  });

  afterAll(async () => {
    downloadManager.stop();
  });

  it('should fetch a transaction from the ledger and process it', async () => {
    const transactions = await ledger._getTransactions(fromBlock, toBlock, {
      omitTimestamp: false,
    });
    expect(transactions.length).toBeGreaterThan(0);
    const transaction = transactions[0];

    const transactionUnderProcessing = {
      transaction: transaction,
      processingStatus: TransactionProcessingStatus.Pending,
    };

    // Use a type assertion to access the private method
    await (observer as any).processTransaction(
      transaction,
      transactionUnderProcessing
    );

    expect(transactionUnderProcessing.processingStatus).toBe(
      TransactionProcessingStatus.Processed
    );
  });
});
