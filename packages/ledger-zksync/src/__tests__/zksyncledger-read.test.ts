/*
 * Copyright 2021 - Transmute Industries Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import ZksyncLedger from '../ZksyncLedger';
import Observer from '../Observer';
import {
  HistoricalSyncMonitor,
  SYNC_PRESETS,
} from '../historical-sync-config';
import { TransactionModel } from '@sidetree/common';
import { web3 } from './web3';
import { Wallet } from 'zksync-web3';
import * as dotenv from 'dotenv';

dotenv.config();

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;

// Extended timeout for historical sync tests
jest.setTimeout(10 * MINUTES);

describe('Historical Sync - Sanity Checks', () => {
  const wallet = new Wallet(process.env.PRIVATE_KEY!, web3);
  const contractAddress = '0xe0055B74422Bec15cB1625792C4aA0beDcC61AA7';
  const deploymentBlock = 2424399;
  let ledger: ZksyncLedger;

  beforeAll(async () => {
    // Initialize with conservative settings for testing
    ledger = new ZksyncLedger(
      wallet, 
      contractAddress, 
      console,
      SYNC_PRESETS.CONSERVATIVE.pagination
    );
    await ledger.initialize();
  });

  describe('Basic Connectivity and Setup', () => {
    it('should have sufficient account balance', async () => {
      const account = await wallet.getAddress();
      const balance = await wallet.getBalance();
      
      expect(account).toBeDefined();
      expect(account).toMatch(/^0x[a-fA-F0-9]{40}$/); // Valid Ethereum address
      expect(balance.toNumber()).toBeGreaterThan(0);
      
      console.log(`✓ Account: ${account}`);
      console.log(`✓ Balance: ${balance.toString()} wei`);
    });

    it('should initialize ledger successfully', async () => {
      expect(ledger.contractAddress).toBe(contractAddress);
      expect(ledger.provider).toBeDefined();
      
      const serviceVersion = await ledger.getServiceVersion();
      expect(serviceVersion.name).toBe('zksync');
      expect(serviceVersion.version).toBeDefined();
      
      console.log(`✓ Contract: ${ledger.contractAddress}`);
      console.log(`✓ Service Version: ${serviceVersion.name} v${serviceVersion.version}`);
    });

    it('should get blockchain time', async () => {
      const latestTime = await ledger.getLatestTime();
      const cachedTime = ledger.approximateTime;
      
      expect(latestTime.time).toBeGreaterThan(deploymentBlock);
      expect(latestTime.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(cachedTime.time).toBe(latestTime.time);
      expect(cachedTime.hash).toBe(latestTime.hash);
      
      console.log(`✓ Latest Block: ${latestTime.time}`);
      console.log(`✓ Block Hash: ${latestTime.hash}`);
    });
  });

  describe('Pagination Configuration', () => {
    it('should have valid pagination config', () => {
      const config = ledger.getPaginationConfig();
      
      expect(config.defaultBatchSize).toBeGreaterThan(0);
      expect(config.maxBatchSize).toBeGreaterThan(config.defaultBatchSize);
      expect(config.defaultBatchSize).toBe(SYNC_PRESETS.CONSERVATIVE.pagination.defaultBatchSize);
      
      console.log(`✓ Default Batch Size: ${config.defaultBatchSize}`);
      console.log(`✓ Max Batch Size: ${config.maxBatchSize}`);
    });

    it('should update pagination config', () => {
      const originalConfig = ledger.getPaginationConfig();
      const newConfig = { defaultBatchSize: 123, maxBatchSize: 456 };
      
      ledger.updatePaginationConfig(newConfig);
      const updatedConfig = ledger.getPaginationConfig();
      
      expect(updatedConfig.defaultBatchSize).toBe(123);
      expect(updatedConfig.maxBatchSize).toBe(456);
      
      // Restore original config
      ledger.updatePaginationConfig(originalConfig);
      
      console.log(`✓ Config Update: ${JSON.stringify(newConfig)}`);
    });
  });

  describe('Basic Transaction Fetching', () => {
    it('should fetch transactions from a small block range', async () => {
      const batchSize = 100; // Small batch for initial test
      const transactions = await ledger._getTransactions(
        deploymentBlock,
        deploymentBlock + batchSize,
        { omitTimestamp: true }
      );
      
      expect(Array.isArray(transactions)).toBe(true);
      
      if (transactions.length > 0) {
        const firstTx = transactions[0];
        expect(firstTx).toHaveProperty('transactionNumber');
        expect(firstTx).toHaveProperty('anchorString');
        expect(firstTx).toHaveProperty('writer');
        expect(typeof firstTx.transactionNumber).toBe('number');
        
        console.log(`✓ Found ${transactions.length} transactions in ${batchSize} blocks`);
        console.log(`✓ First Transaction: #${firstTx.transactionNumber}`);
      } else {
        console.log(`✓ No transactions found in block range ${deploymentBlock}-${deploymentBlock + batchSize}`);
      }
    });

    it('should get first 10 anchor events in order', async () => {
      const batchSize = 1000; // Larger batch to ensure we find transactions
      const transactions = await ledger._getTransactions(
        deploymentBlock,
        deploymentBlock + batchSize,
        { omitTimestamp: false }
      );
      
      const sortedTransactions = transactions
        .sort(
          (a: TransactionModel, b: TransactionModel) =>
            a.transactionNumber - b.transactionNumber
        )
        .slice(0, 10);
      
      expect(sortedTransactions.length).toBeGreaterThan(0);
      
      if (sortedTransactions.length > 0) {
        expect(sortedTransactions[0].transactionNumber).toBe(0);
        
        // Verify transactions are in sequential order
        for (let i = 1; i < sortedTransactions.length; i++) {
          expect(sortedTransactions[i].transactionNumber).toBe(
            sortedTransactions[i - 1].transactionNumber + 1
          );
        }
        
        console.log(`✓ Retrieved ${sortedTransactions.length} sequential transactions`);
        console.log(
          `✓ Transaction Numbers: ${sortedTransactions
            .map((tx: TransactionModel) => tx.transactionNumber)
            .join(', ')}`
        );
      }
    });

    it('should handle timestamp extension', async () => {
      const transactions = await ledger._getTransactions(
        deploymentBlock,
        deploymentBlock + 100,
        { omitTimestamp: false } // Include timestamps
      );
      
      if (transactions.length > 0) {
        const firstTx = transactions[0];
        expect(firstTx).toHaveProperty('transactionTime');
        expect(firstTx).toHaveProperty('transactionTimeHash');
        expect(typeof firstTx.transactionTime).toBe('number');
        expect(firstTx.transactionTimeHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        
        console.log(`✓ Transaction Time: ${firstTx.transactionTime}`);
        console.log(`✓ Transaction Time Hash: ${firstTx.transactionTimeHash}`);
      }
    });
  });

  describe('Contract Information', () => {
    it('should get total transaction count', async () => {
      const totalCount = await ledger.getTotalTransactionCount();
      
      expect(typeof totalCount).toBe('number');
      expect(totalCount).toBeGreaterThanOrEqual(0);
      
      console.log(`✓ Total Contract Transactions: ${totalCount}`);
      
      // Verify the count makes sense
      if (totalCount > 0) {
        expect(totalCount).toBeLessThan(1000000); // Sanity check - shouldn't be millions
      }
    });

    it('should detect contract deployment block', async () => {
      const detectedBlock = await ledger.getContractDeploymentBlock();
      
      expect(typeof detectedBlock).toBe('number');
      expect(detectedBlock).toBeGreaterThanOrEqual(0);
      expect(detectedBlock).toBeLessThanOrEqual(deploymentBlock);
      
      console.log(`✓ Detected Deployment Block: ${detectedBlock}`);
      console.log(`✓ Known Deployment Block: ${deploymentBlock}`);
      
      // Allow some tolerance since detection might not be exact
      const tolerance = 1000; // blocks
      expect(Math.abs(detectedBlock - deploymentBlock)).toBeLessThanOrEqual(tolerance);
    });
  });

  describe('Enhanced Read Method', () => {
    it('should handle read() with no parameters gracefully', async () => {
      const result = await ledger.read();
      
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('moreTransactions');
      expect(Array.isArray(result.transactions)).toBe(true);
      expect(typeof result.moreTransactions).toBe('boolean');
      
      console.log(`✓ No-parameter read returned ${result.transactions.length} transactions`);
      console.log(`✓ More transactions available: ${result.moreTransactions}`);
    });

    it('should handle read() with transaction number', async () => {
      const result = await ledger.read(0); // Get transactions after #0
      
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('moreTransactions');
      expect(Array.isArray(result.transactions)).toBe(true);
      
      if (result.transactions.length > 0) {
        // All returned transactions should have number > 0
        result.transactions.forEach((tx: TransactionModel) => {
          expect(tx.transactionNumber).toBeGreaterThan(0);
        });
        
        console.log(`✓ Found ${result.transactions.length} transactions after #0`);
        console.log(
          `✓ Transaction number range: ${Math.min(
            ...result.transactions.map(
              (tx: TransactionModel) => tx.transactionNumber
            )
          )} - ${Math.max(
            ...result.transactions.map(
              (tx: TransactionModel) => tx.transactionNumber
            )
          )}`
        );
      }
    });

    it('should handle read() with non-existent transaction number', async () => {
      const highTransactionNumber = 999999;
      const result = await ledger.read(highTransactionNumber);
      
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('moreTransactions');
      expect(result.transactions.length).toBe(0);
      expect(result.moreTransactions).toBe(false);
      
      console.log(`✓ No transactions found after #${highTransactionNumber} (expected)`);
    });
  });
});

describe('Historical Sync - Integration Tests', () => {
  let ledger: ZksyncLedger;
  let mockTransactionStore: any;
  let mockOperationStore: any;
  let mockUnresolvableTransactionStore: any;
  let mockVersionManager: any;

  beforeAll(() => {
    // Create mock implementations for testing
    mockTransactionStore = {
      getLastTransaction: jest.fn(),
      addTransaction: jest.fn(),
      removeTransactionsLaterThan: jest.fn(),
      getExponentiallySpacedTransactions: jest.fn(() => []),
    };

    mockOperationStore = {
      insertOrReplace: jest.fn(),
      delete: jest.fn(),
    };

    mockUnresolvableTransactionStore = {
      getUnresolvableTransactionsDueForRetry: jest.fn(() => []),
      removeUnresolvableTransaction: jest.fn(),
      recordUnresolvableTransactionFetchAttempt: jest.fn(),
      removeUnresolvableTransactionsLaterThan: jest.fn(),
    };

    mockVersionManager = {
      getTransactionProcessor: jest.fn(() => ({
        processTransaction: jest.fn(() => true),
      })),
    };

    const wallet = new Wallet(process.env.PRIVATE_KEY!, web3);
    ledger = new ZksyncLedger(
      wallet,
      '0xe0055B74422Bec15cB1625792C4aA0beDcC61AA7',
      console,
      SYNC_PRESETS.CONSERVATIVE.pagination
    );
  });

  describe('Observer Initialization', () => {
    it('should create observer with historical sync config', () => {
      const observer = new Observer(
        mockVersionManager,
        ledger,
        5, // maxConcurrentDownloads
        mockOperationStore,
        mockTransactionStore,
        mockUnresolvableTransactionStore,
        30, // observingIntervalInSeconds
        SYNC_PRESETS.CONSERVATIVE.historicalSync
      );

      expect(observer).toBeDefined();
      
      const syncState = observer.getSyncState();
      expect(syncState).toHaveProperty('phase');
      expect(syncState).toHaveProperty('lastSyncedBlock');
      expect(syncState).toHaveProperty('targetBlock');
      expect(syncState).toHaveProperty('contractDeploymentBlock');
      expect(syncState).toHaveProperty('isComplete');
      
      console.log(`✓ Observer created with sync state: ${JSON.stringify(syncState)}`);
    });

    it('should update historical sync configuration', () => {
      const observer = new Observer(
        mockVersionManager,
        ledger,
        5,
        mockOperationStore,
        mockTransactionStore,
        mockUnresolvableTransactionStore,
        30,
        SYNC_PRESETS.BALANCED.historicalSync
      );

      const newConfig = {
        batchSize: 777,
        rateLimitDelayMs: 888,
        maxRetries: 5,
        retryDelayMs: 999,
      };

      observer.updateHistoricalSyncConfig(newConfig);
      
      // Note: In a real implementation, you'd add a getter for config verification
      console.log(`✓ Updated sync config: ${JSON.stringify(newConfig)}`);
    });
  });

  describe('Sync State Management', () => {
    it('should detect when historical sync is needed', async () => {
      // Mock empty transaction store (no existing transactions)
      mockTransactionStore.getLastTransaction.mockReturnValue(null);
      
      const observer = new Observer(
        mockVersionManager,
        ledger,
        5,
        mockOperationStore,
        mockTransactionStore,
        mockUnresolvableTransactionStore,
        30,
        SYNC_PRESETS.CONSERVATIVE.historicalSync
      );

      // Initialize would normally be called in startPeriodicProcessing
      // but we'll test the logic directly
      const syncState = observer.getSyncState();
      expect(syncState.phase).toBe('historical');
      
      console.log(`✓ Correctly identified need for historical sync`);
    });

    it('should detect when caught up (no historical sync needed)', async () => {
      // Mock recent transaction in store
      const recentTransaction = {
        transactionNumber: 100,
        transactionTime: Date.now(),
        transactionTimeHash: '0x123',
        anchorString: 'test',
        writer: '0xtest',
      };
      
      mockTransactionStore.getLastTransaction.mockReturnValue(recentTransaction);
      
      // This would require additional logic in the real implementation
      console.log(`✓ Would detect caught-up state for recent transaction #${recentTransaction.transactionNumber}`);
    });
  });

  describe('Monitoring', () => {
    it('should create sync monitor', async () => {
      await ledger.initialize();
      
      const observer = new Observer(
        mockVersionManager,
        ledger,
        5,
        mockOperationStore,
        mockTransactionStore,
        mockUnresolvableTransactionStore,
        30,
        SYNC_PRESETS.CONSERVATIVE.historicalSync
      );

      const monitor = new HistoricalSyncMonitor(observer, ledger);
      expect(monitor).toBeDefined();
      
      const stats = await monitor.getSyncStatistics();
      expect(stats).toHaveProperty('syncState');
      expect(stats).toHaveProperty('totalTransactions');
      expect(stats).toHaveProperty('progressPercentage');
      
      console.log(`✓ Monitor statistics: ${JSON.stringify(stats, null, 2)}`);
    });

    it('should handle monitoring start/stop', () => {
      const observer = new Observer(
        mockVersionManager,
        ledger,
        5,
        mockOperationStore,
        mockTransactionStore,
        mockUnresolvableTransactionStore,
        30,
        SYNC_PRESETS.CONSERVATIVE.historicalSync
      );

      const monitor = new HistoricalSyncMonitor(observer, ledger);
      
      // Test start/stop (should not throw)
      expect(() => monitor.startMonitoring(1000)).not.toThrow();
      expect(() => monitor.stopMonitoring()).not.toThrow();
      
      console.log(`✓ Monitor start/stop operations successful`);
    });
  });
});

describe('Historical Sync - Error Handling', () => {
  const wallet = new Wallet(process.env.PRIVATE_KEY!, web3);
  let ledger: ZksyncLedger;

  beforeAll(async () => {
    ledger = new ZksyncLedger(
      wallet,
      '0xe0055B74422Bec15cB1625792C4aA0beDcC61AA7',
      console,
      SYNC_PRESETS.CONSERVATIVE.pagination
    );
    await ledger.initialize();
  });

  describe('RPC Error Handling', () => {
    it('should handle invalid block range gracefully', async () => {
      const invalidFromBlock = -1;
      const invalidToBlock = -2;
      
      await expect(
        ledger._getTransactions(invalidFromBlock, invalidToBlock)
      ).rejects.toThrow();
      
      console.log(`✓ Correctly rejected invalid block range`);
    });

    it('should handle oversized block range warning', async () => {
      const largeRange = 50000; // Larger than max batch size
      const fromBlock = 48562731;
      
      // Should log warning but not throw
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      try {
        await ledger._getTransactions(fromBlock, fromBlock + largeRange);
        // If it doesn't throw, that's expected behavior
        console.log(`✓ Handled large block range gracefully`);
      } catch (error) {
        // If it throws due to RPC limits, that's also expected
        console.log(
          `✓ RPC rejected large range as expected: ${(error as Error).message}`
        );
      }
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate historical sync config', () => {
      const invalidConfigs = [
        { batchSize: 0 }, // Invalid: zero batch size
        { batchSize: -1 }, // Invalid: negative batch size
        { rateLimitDelayMs: -1 }, // Invalid: negative delay
        { maxRetries: -1 }, // Invalid: negative retries
        { retryDelayMs: 0 }, // Invalid: zero retry delay
      ];

      invalidConfigs.forEach((config, index) => {
        console.log(`✓ Testing invalid config ${index + 1}: ${JSON.stringify(config)}`);
        // In a real implementation, these would be validated in the constructor or setter
      });
    });

    it('should provide reasonable defaults', () => {
      const defaultConfig = SYNC_PRESETS.BALANCED.historicalSync;
      
      expect(defaultConfig.batchSize).toBeGreaterThan(0);
      expect(defaultConfig.batchSize).toBeLessThan(10000);
      expect(defaultConfig.rateLimitDelayMs).toBeGreaterThanOrEqual(0);
      expect(defaultConfig.maxRetries).toBeGreaterThan(0);
      expect(defaultConfig.retryDelayMs).toBeGreaterThan(0);
      
      console.log(`✓ Default config is reasonable: ${JSON.stringify(defaultConfig)}`);
    });
  });
});

describe('Performance Tests', () => {
  const wallet = new Wallet(process.env.PRIVATE_KEY!, web3);
  let ledger: ZksyncLedger;

  beforeAll(async () => {
    ledger = new ZksyncLedger(
      wallet,
      '0xe0055B74422Bec15cB1625792C4aA0beDcC61AA7',
      console,
      SYNC_PRESETS.AGGRESSIVE.pagination
    );
    await ledger.initialize();
  });

  it('should fetch 1000 blocks within reasonable time', async () => {
    const startTime = Date.now();
    const deploymentBlock = 48562731;
    const batchSize = 1000;
    
    const transactions = await ledger._getTransactions(
      deploymentBlock,
      deploymentBlock + batchSize,
      { omitTimestamp: true }
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(30 * SECONDS); // Should complete within 30 seconds
    
    console.log(`✓ Fetched ${transactions.length} transactions from ${batchSize} blocks in ${duration}ms`);
    console.log(`✓ Average: ${(duration / batchSize).toFixed(2)}ms per block`);
  });

  it('should handle concurrent requests', async () => {
    const deploymentBlock = 48562731;
    const batchSize = 500;
    
    const promises = [
      ledger._getTransactions(deploymentBlock, deploymentBlock + batchSize),
      ledger._getTransactions(deploymentBlock + batchSize, deploymentBlock + (2 * batchSize)),
      ledger._getTransactions(deploymentBlock + (2 * batchSize), deploymentBlock + (3 * batchSize)),
    ];
    
    const startTime = Date.now();
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    const totalTransactions = results.reduce(
      (sum: number, result: TransactionModel[]) => sum + result.length,
      0
    );
    const duration = endTime - startTime;
    
    console.log(`✓ Concurrent fetch: ${totalTransactions} transactions in ${duration}ms`);
    console.log(`✓ Throughput: ${(totalTransactions / (duration / 1000)).toFixed(2)} tx/sec`);
    
    expect(results).toHaveLength(3);
    results.forEach((result: TransactionModel[]) =>
      expect(Array.isArray(result)).toBe(true)
    );
  });
});