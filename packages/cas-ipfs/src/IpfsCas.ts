/*
 * The code in this file originated from
 * @see https://github.com/decentralized-identity/sidetree
 * For the list of changes that was made to the original code
 * @see https://github.com/transmute-industries/sidetree.js/blob/main/reference-implementation-changes.md
 *
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
  FetchResultCode,
  ICasService,
  FetchResult,
  ServiceVersionModel,
} from '@sidetree/common';
import ipfsClient from 'ipfs-http-client';

const { version } = require('../package.json');

export default class CasIpfs implements ICasService {
  private ipfs: any;

  constructor(multiaddr: string) {
    if (multiaddr.startsWith('http')) {
      const url = new URL(multiaddr);
      this.ipfs = ipfsClient({
        host: url.hostname,
        port: Number(url.port),
        protocol: url.protocol.slice(0, -1),
      });
    } else {
      // It's a multi-address, let the client parse it.
      // Cast to `any` to bypass incorrect type definitions if necessary.
      this.ipfs = ipfsClient(multiaddr as any);
    }
  }
  public async initialize(): Promise<void> {
    return;
  }

  public async close(): Promise<void> {
    return;
  }

  public getServiceVersion: () => Promise<ServiceVersionModel> = () => {
    return Promise.resolve({
      name: 'ipfs',
      version,
    });
  };

  public async write(content: Buffer): Promise<string> {
    const source = await this.ipfs.add(content);
    return source.path;
  }

  public async read(address: string): Promise<FetchResult> {
    try {
      for await (const file of this.ipfs.get(address, { timeout: 10000 })) {
        if (file.content) {
          const chunks = [];
          for await (const chunk of file.content) {
            chunks.push(chunk);
          }
          const content = Buffer.concat(chunks);
          return {
            code: FetchResultCode.Success,
            content: content,
          };
        }
      }
      // If loop completes without returning, it means no file was found.
      return {
        code: FetchResultCode.NotFound,
      };
    } catch (e) {
      const err = e as { name: string; message?: string };
      if (
        err.name === 'TimeoutError' ||
        (err.message && err.message.includes('not found'))
      ) {
        return {
          code: FetchResultCode.NotFound,
        };
      } else {
        throw e;
      }
    }
  }
}
