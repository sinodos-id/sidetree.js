import Web3 from 'web3';
import HDWalletProvider from '@truffle/hdwallet-provider';
import { EthereumLedger } from '@sidetree/ethereum';
import { IpfsCasWithCache } from '@sidetree/cas-ipfs';
import { MockCas } from '@sidetree/cas';
import Quarkid from './Quarkid';

export type QuarkidNodeConfigs = {
  contentAddressableStoreServiceUri: string;
  databaseName: string;
  didMethodName: string;
  ethereumRpcUrl: string;
  mongoDbConnectionString: string;
  batchingIntervalInSeconds: number;
  observingIntervalInSeconds: number;
  maxConcurrentDownloads: number;
  versions: [
    {
      startingBlockchainTime: number;
      version: string;
    }
  ];
  elementAnchorContract?: string;
  ethereumMnemonic?: string;
  ethereumPrivateKey?: string;
};

const getLedger = async (quarkidNodeConfigs: QuarkidNodeConfigs) => {
  let web3 = new Web3(quarkidNodeConfigs.ethereumRpcUrl);
  if (quarkidNodeConfigs.ethereumMnemonic) {
    const provider = new HDWalletProvider({
      mnemonic: {
        phrase: quarkidNodeConfigs.ethereumMnemonic,
      },
      providerOrUrl: quarkidNodeConfigs.ethereumRpcUrl,
    });
    web3 = new Web3(provider);
  } else if (quarkidNodeConfigs.ethereumPrivateKey) {
    const provider = new HDWalletProvider({
      privateKeys: [quarkidNodeConfigs.ethereumPrivateKey],
      providerOrUrl: quarkidNodeConfigs.ethereumRpcUrl,
    });
    web3 = new Web3(provider);
  }
  const ledger = new EthereumLedger(
    web3,
    quarkidNodeConfigs.elementAnchorContract
  );
  await ledger.initialize();
  return ledger;
};

const getTestCas = async () => {
  const cas = new MockCas();
  await cas.initialize();
  return cas;
};

const getCas = async (config: QuarkidNodeConfigs) => {
  const cas = new IpfsCasWithCache(
    config.contentAddressableStoreServiceUri,
    config.mongoDbConnectionString,
    config.databaseName
  );
  await cas.initialize();
  return cas;
};

export const getTestNodeInstance = async (
  quarkidNodeConfigs: QuarkidNodeConfigs
): Promise<Quarkid> => {
  const ledger = await getLedger(quarkidNodeConfigs);
  const cas = await getTestCas();
  const element = new Quarkid(
    quarkidNodeConfigs as any,
    quarkidNodeConfigs.versions,
    cas,
    ledger
  );
  await element.initialize();
  return element;
};

export const getNodeInstance = async (
  quarkidNodeConfigs: QuarkidNodeConfigs
): Promise<Quarkid> => {
  const ledger = await getLedger(quarkidNodeConfigs);
  const cas = await getCas(quarkidNodeConfigs);
  const element = new Quarkid(
    quarkidNodeConfigs as any,
    quarkidNodeConfigs.versions,
    cas,
    ledger
  );
  await element.initialize();
  return element;
};
