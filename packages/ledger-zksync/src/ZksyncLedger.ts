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
import {
  Provider,
  Wallet,
  Contract,
} from 'zksync-web3';

import {
  ElementContract,
  ElementEventData,
  EthereumBlock,
  EthereumFilter,
} from './types';
import utils from './utils';

const { version } = require('../package.json');
const anchorContractArtifact = require('../build/contracts/SimpleSidetreeAnchor.json');

export default class ZksyncLedger implements IBlockchain {
  private logger: Console;
  public anchorContract: ElementContract;
  private cachedBlockchainTime: BlockchainTimeModel = { hash: '', time: 0 };
  private wallet: Wallet;
  public provider: Provider;
  public contractAddress?: string;

  constructor(wallet: Wallet, contractAddress?: string, logger?: Console) {
    this.logger = logger || console;
    this.wallet = wallet;
    this.provider = this.wallet.provider as Provider;
    this.contractAddress = contractAddress;
    this.anchorContract = new Contract(
      this.contractAddress || ethers.constants.AddressZero,
      anchorContractArtifact.abi,
      this.wallet
    );
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

  public _getTransactions = async (
    fromBlock: number | string,
    toBlock: number | string,
    options?: { filter?: EthereumFilter; omitTimestamp?: boolean }
  ): Promise<TransactionModel[]> => {
    const contract = await this.getAnchorContract();
    const logs = await contract.provider.getLogs({
      fromBlock,
      toBlock: toBlock || 'latest',
      address: contract.address,
      topics: contract.filters.Anchor().topics,
      ...((options && options.filter) || {}),
    });
    const txns = logs.map((log: any) => {
      const parsedLog = contract.interface.parseLog(log);
      return utils.eventLogToSidetreeTransaction(
        parsedLog as unknown as ElementEventData
      );
    });
    if (options && options.omitTimestamp) {
      return txns;
    }
    return utils.extendSidetreeTransactionWithTimestamp(this.provider, txns);
  };

  public extendSidetreeTransactionWithTimestamp = async (
    transactions: TransactionModel[]
  ): Promise<TransactionModel[]> => {
    return utils.extendSidetreeTransactionWithTimestamp(
      this.provider,
      transactions
    );
  };

  public async read(
    sinceTransactionNumber?: number,
    transactionTimeHash?: string
  ): Promise<{ moreTransactions: boolean; transactions: TransactionModel[] }> {
    const options = {
      omitTimestamp: true,
    };
    let transactions: TransactionModel[];
    if (sinceTransactionNumber !== undefined) {
      const sinceTransaction = await this._getTransactions(
        0,
        'latest',
        options
      );
      if (sinceTransaction.length === 1) {
        transactions = await this._getTransactions(
          sinceTransaction[0].transactionTime,
          'latest',
          options
        );
      } else {
        transactions = [];
      }
    } else if (transactionTimeHash) {
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
      transactions = await this._getTransactions(0, 'latest', options);
    }
    return {
      moreTransactions: false,
      transactions,
    };
  }

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

  public write = async (anchorString: string, _fee = 0): Promise<void> => {
    const contract = await this.getAnchorContract();
    const anchorObject = AnchoredDataSerializer.deserialize(anchorString);
    const { coreIndexFileUri, numberOfOperations } = anchorObject;
    const buffer = Encoder.base58ToBuffer(coreIndexFileUri);

    try {
      const tx = await contract.anchorHash(
        '0x' + buffer.toString('hex').substring(4),
        numberOfOperations
      );
      await tx.wait();
      this.logger.info(
        `Zksync transaction successful: https://goerli.explorer.zksync.io/tx/${tx.hash}`
      );
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `Unable to write to the ledger from: ${this.wallet.address}`
      );
      this.logger.error(error.message);
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
}