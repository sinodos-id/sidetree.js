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

import { ethers } from 'ethers';
import { Contract } from 'zksync-web3';

export type EthereumBlock = ethers.providers.Block;

export type EthereumFilter = ethers.EventFilter;

export interface ElementEventData extends ethers.Event {
  args: ethers.utils.Result & {
    anchorFileHash: string;
    numberOfOperations: string;
    transactionNumber: string;
    writer: string;
  };
}

export type ElementContract = Contract;
