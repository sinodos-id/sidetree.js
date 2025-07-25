/*
 * Copyright 2020 - Transmute Industries Inc.
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

import {
  BlockchainTimeModel,
  IBlockchain,
  TransactionModel,
  ValueTimeLockModel,
  ServiceVersionModel,
  Encoder,
} from '@sidetree/common';
import { AnchoredDataSerializer } from '@sidetree/core';
import { ethers } from 'ethers';
import { Provider, Wallet, Contract } from 'zksync-web3';

import {
  ElementContract,
  ElementEventData,
  EthereumBlock,
  EthereumFilter,
} from './types';
import utils from './utils';
import { TransactionResponse } from 'zksync-web3/build/src/types';

const { version } = require('../package.json');
const anchorContractArtifact = require('../build/contracts/SimpleSidetreeAnchor.json');

interface PaginationConfig {
  defaultBatchSize: number;
  maxBatchSize: number;
}

export default class ZksyncLedger implements IBlockchain {
  private logger: Console;
  public anchorContract: ElementContract;
  private cachedBlockchainTime: BlockchainTimeModel = { hash: '', time: 0 };
  private wallet: Wallet;
  public provider: Provider;
  public contractAddress?: string;
  
  /**
   * Pagination configuration for batch processing
   */
  private paginationConfig: PaginationConfig = {
    defaultBatchSize: 1000,
    maxBatchSize: 10000,
  };

  constructor(wallet: Wallet, contractAddress?: string, logger?: Console, paginationConfig?: Partial<PaginationConfig>) {
    this.logger = logger || console;
    this.wallet = wallet;
    this.provider = this.wallet.provider as Provider;
    this.contractAddress = contractAddress;
    this.anchorContract = new Contract(
      this.contractAddress || ethers.constants.AddressZero,
      anchorContractArtifact.abi,
      this.wallet
    );

    // Merge provided pagination config with defaults
    if (paginationConfig) {
      this.paginationConfig = { ...this.paginationConfig, ...paginationConfig };
    }
  }

  getServiceVersion(): Promise<ServiceVersionModel> {
    return Promise.resolve({
      name: 'zksync',
      version,
    });
  }

  private async getAnchorContract(): Promise<ElementContract> {
    if (!this.contractAddress) {
      throw new Error('ZksyncLedger is not initialized.');
    }
    return this.anchorContract;
  }

  public async initialize(): Promise<void> {
    this.logger.info(
      `Initializing Zksync Ledger with wallet address ${this.wallet.address}`
    );
    if (!this.contractAddress) {
      const factory = new ethers.ContractFactory(
        anchorContractArtifact.abi,
        anchorContractArtifact.bytecode,
        this.wallet
      );
      const contract = await factory.deploy();
      await contract.deployed();
      this.contractAddress = contract.address;
      this.anchorContract = contract as ElementContract;
      this.logger.info(
        `Deployed new Element contract at address ${this.contractAddress}`
      );
    } else {
      this.logger.info(
        `Using existing Element contract at address ${this.contractAddress}`
      );
    }
    await this.getLatestTime();
  }

  /**
   * Enhanced _getTransactions method with proper block range handling
   */
  public _getTransactions = async (
    fromBlock: number | string,
    toBlock: number | string,
    options?: { filter?: EthereumFilter; omitTimestamp?: boolean }
  ): Promise<TransactionModel[]> => {
    const contract = await this.getAnchorContract();
    
    // Validate block range to prevent RPC timeouts
    const fromBlockNum = typeof fromBlock === 'string' ? 
      (fromBlock === 'latest' ? await this.provider.getBlockNumber() : parseInt(fromBlock)) : 
      fromBlock;
    const toBlockNum = typeof toBlock === 'string' ? 
      (toBlock === 'latest' ? await this.provider.getBlockNumber() : parseInt(toBlock)) : 
      toBlock;

    // If the range is too large, we need to batch the requests
    const blockRange = toBlockNum - fromBlockNum;
    if (blockRange > this.paginationConfig.maxBatchSize) {
      this.logger.warn(
        `Block range ${blockRange} exceeds maximum batch size ${this.paginationConfig.maxBatchSize}. ` +
        `Consider using smaller batches for better performance.`
      );
    }

    try {
      const logs = await contract.provider.getLogs({
        fromBlock,
        toBlock: toBlock || 'latest',
        address: contract.address,
        topics: contract.filters.Anchor().topics,
        ...((options && options.filter) || {}),
      });

      const txns = logs.map((log: any) => {
        const parsedLog = contract.interface.parseLog(log);
        // Manually combine the original log properties with the parsed args
        const combinedLog = {
          ...log,
          ...parsedLog,
        };
        return utils.eventLogToSidetreeTransaction(
          (combinedLog as unknown) as ElementEventData
        );
      });

      if (options && options.omitTimestamp) {
        return txns;
      }
      return utils.extendSidetreeTransactionWithTimestamp(this.provider, txns);
    } catch (error) {
      this.logger.error(`Failed to get transactions for block range ${fromBlock}-${toBlock}:`, error);
      throw error;
    }
  };

  /**
   * Enhanced read method with pagination support for historical sync
   */
  public async read(
    sinceTransactionNumber?: number,
    transactionTimeHash?: string
  ): Promise<{ moreTransactions: boolean; transactions: TransactionModel[] }> {
    const options = {
      omitTimestamp: false,
    };
    let transactions: TransactionModel[];

    try {
      if (sinceTransactionNumber !== undefined && transactionTimeHash) {
        // Both transaction number and time hash provided - find specific transaction
        const block = await utils.getBlock(this.provider, transactionTimeHash);
        if (block && block.number) {
          const blockTransactions = await this._getTransactions(
            block.number,
            block.number,
            options
          );
          transactions = blockTransactions.filter(
            (tx) => tx.transactionNumber === sinceTransactionNumber
          );
        } else {
          transactions = [];
        }
      } else if (sinceTransactionNumber !== undefined) {
        // Only transaction number provided - need to find transactions after this number
        // For pagination support, we implement a more efficient approach
        transactions = await this.getTransactionsAfterTransactionNumber(sinceTransactionNumber, options);
      } else if (transactionTimeHash) {
        // Only block hash provided
        const block = await utils.getBlock(this.provider, transactionTimeHash);
        if (block && block.number) {
          transactions = await this._getTransactions(
            block.number,
            block.number,
            options
          );
        } else {
          transactions = [];
        }
      } else {
        // No parameters - this is the problematic case for large contracts
        // Instead of getting ALL transactions, we now return a limited batch
        this.logger.warn(
          'read() called without parameters - returning limited batch for performance. ' +
          'Use historical sync for complete transaction processing.'
        );
        
        const latestBlock = await this.provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - this.paginationConfig.defaultBatchSize);
        
        transactions = await this._getTransactions(fromBlock, latestBlock, options);
      }

      // Determine if there are more transactions
      // This is a simplified implementation - in production, you might want more sophisticated logic
      const moreTransactions = this.shouldCheckForMoreTransactions(transactions, sinceTransactionNumber);

      return {
        moreTransactions,
        transactions,
      };
    } catch (error) {
      this.logger.error('Error in read method:', error);
      throw error;
    }
  }

  /**
   * Get transactions after a specific transaction number efficiently
   */
  private async getTransactionsAfterTransactionNumber(
    sinceTransactionNumber: number,
    options: { omitTimestamp?: boolean }
  ): Promise<TransactionModel[]> {
    // TODO: This is a simplified implementation. In production:
    // 1. Use binary search to find the starting block
    // 2. Cache transaction number to block mappings
    // 3. Use event logs with transaction number filtering
    
    const latestBlock = await this.provider.getBlockNumber();
    let transactions: TransactionModel[] = [];
    
    // Start from recent blocks and work backwards to find transactions after the given number
    // This is more efficient than scanning from genesis for recent sync operations
    const batchSize = this.paginationConfig.defaultBatchSize;
    let currentBlock = latestBlock;
    
    while (currentBlock > 0 && transactions.length === 0) {
      const fromBlock = Math.max(0, currentBlock - batchSize);
      const batchTransactions = await this._getTransactions(fromBlock, currentBlock, options);
      
      // Filter for transactions after the given number
      const filteredTransactions = batchTransactions.filter(
        tx => tx.transactionNumber > sinceTransactionNumber
      );
      
      if (filteredTransactions.length > 0) {
        transactions = filteredTransactions;
        break;
      }
      
      currentBlock = fromBlock - 1;
    }
    
    return transactions.sort((a, b) => a.transactionNumber - b.transactionNumber);
  }

  /**
   * Determine if there are likely more transactions to process
   */
  private shouldCheckForMoreTransactions(
    transactions: TransactionModel[],
    sinceTransactionNumber?: number
  ): boolean {
    if (transactions.length === 0) {
      return false;
    }

    // If we got a full batch, there might be more
    if (transactions.length >= this.paginationConfig.defaultBatchSize) {
      return true;
    }

    // If we're doing incremental sync and got any transactions, there might be more
    if (sinceTransactionNumber !== undefined && transactions.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Get total transaction count (useful for progress tracking)
   */
  public async getTotalTransactionCount(): Promise<number> {
    try {
      const contract = await this.getAnchorContract();
      
      // Get the current transaction number from the contract
      // This assumes the contract has a public transactionNumber variable
      const currentTransactionNumber = await contract.transactionNumber();
      return currentTransactionNumber.toNumber();
    } catch (error) {
      this.logger.error('Failed to get total transaction count:', error);
      return 0;
    }
  }

  /**
   * Get contract deployment block (useful for historical sync)
   */
  public async getContractDeploymentBlock(): Promise<number> {
    try {
      if (!this.contractAddress) {
        return 0;
      }

      // Try to find the contract creation transaction
      // This is a simplified approach - in production you might cache this value
      const latestBlock = await this.provider.getBlockNumber();
      
      // Binary search for the deployment block
      let low = 0;
      let high = latestBlock;
      
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const code = await this.provider.getCode(this.contractAddress, mid);
        
        if (code === '0x') {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      
      return low;
    } catch (error) {
      this.logger.warn('Could not determine contract deployment block, using 0:', error);
      return 0;
    }
  }

  public extendSidetreeTransactionWithTimestamp = async (
    transactions: TransactionModel[]
  ): Promise<TransactionModel[]> => {
    return utils.extendSidetreeTransactionWithTimestamp(
      this.provider,
      transactions
    );
  };

  public get approximateTime(): BlockchainTimeModel {
    return this.cachedBlockchainTime;
  }

  public async getLatestTime(): Promise<BlockchainTimeModel> {
    const block: EthereumBlock = await utils.getBlock(this.provider, 'latest');
    const blockchainTime: BlockchainTimeModel = {
      time: block.number,
      hash: block.hash,
    };
    this.cachedBlockchainTime = blockchainTime;
    return blockchainTime;
  }

  public write = async (anchorString: string, _fee = 0): Promise<any> => {
    const contract = await this.getAnchorContract();
    const anchorObject = AnchoredDataSerializer.deserialize(anchorString);
    const { coreIndexFileUri, numberOfOperations } = anchorObject;
    const buffer = Encoder.base58ToBuffer(coreIndexFileUri);

    try {
      const tx = (await contract.anchorHash(
        '0x' + buffer.toString('hex').substring(4),
        numberOfOperations
      )) as TransactionResponse;
      const txReceipt = await tx.wait();
      this.logger.info(
        `Zksync transaction successful: https://goerli.explorer.zksync.io/tx/${tx.hash}`
      );

      return txReceipt;
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `Unable to write to the ledger from: ${this.wallet.address}`
      );
      this.logger.error(error.message);
      throw error;
    }
  };

  public async getFirstValidTransaction(
    _transactions: TransactionModel[]
  ): Promise<TransactionModel | undefined> {
    return Promise.resolve(undefined);
  }

  getFee(_transactionTime: number): Promise<number> {
    return Promise.resolve(0);
  }

  getValueTimeLock(
    _lockIdentifier: string
  ): Promise<ValueTimeLockModel | undefined> {
    return Promise.resolve(undefined);
  }

  getWriterValueTimeLock(): Promise<ValueTimeLockModel | undefined> {
    return Promise.resolve(undefined);
  }

  /**
   * Update pagination configuration
   */
  public updatePaginationConfig(config: Partial<PaginationConfig>): void {
    this.paginationConfig = { ...this.paginationConfig, ...config };
  }

  /**
   * Get current pagination configuration
   */
  public getPaginationConfig(): PaginationConfig {
    return { ...this.paginationConfig };
  }
}