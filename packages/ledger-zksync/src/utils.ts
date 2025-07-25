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

import { TransactionModel, Encoder } from '@sidetree/common';
import { AnchoredDataSerializer } from '@sidetree/core';
import { Provider } from 'zksync-web3';
import { EthereumBlock, ElementEventData } from './types';

const getAccounts = async (provider: Provider): Promise<Array<string>> => {
  return provider.send('eth_accounts', []);
};

const eventLogToSidetreeTransaction = (
  log: ElementEventData
): TransactionModel => {
  const coreIndexFileUri = Encoder.bufferToBase58(
    Buffer.from('1220' + log.args.anchorFileHash.replace('0x', ''), 'hex')
  );
  const anchorObject = {
    coreIndexFileUri,
    numberOfOperations: Number.parseInt(log.args.numberOfOperations),
  };
  const anchorString = AnchoredDataSerializer.serialize(anchorObject);
  return {
    transactionNumber: Number.parseInt(log.args.transactionNumber, 10),
    transactionTime: log.blockNumber,
    transactionTimeHash: log.blockHash,
    anchorString,
    transactionFeePaid: 0,
    normalizedTransactionFee: 0,
    writer: log.args.writer,
  };
};

const getBlock = async (
  provider: Provider,
  blockHashOrBlockNumber: string | number
): Promise<EthereumBlock> => {
  const block = await provider.getBlock(blockHashOrBlockNumber);
  return block;
};

const getBlockchainTime = async (
  provider: Provider,
  blockHashOrBlockNumber: string | number
): Promise<number | null> => {
  const block = await getBlock(provider, blockHashOrBlockNumber);
  if (block) {
    return block.timestamp;
  }
  return null;
};

const extendSidetreeTransactionWithTimestamp = async (
  provider: Provider,
  txns: TransactionModel[]
): Promise<TransactionModel[]> => {
  return Promise.all(
    txns.map(async (txn) => {
      const timestamp = await getBlockchainTime(provider, txn.transactionTime);
      if (typeof timestamp === 'number') {
        return {
          ...txn,
          transactionTimestamp: timestamp,
        };
      }
      return txn;
    })
  );
};

export default {
  eventLogToSidetreeTransaction,
  extendSidetreeTransactionWithTimestamp,
  getAccounts,
  getBlock,
  getBlockchainTime,
};
