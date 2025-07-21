// Replace `nextjs-github-pages` with your Github repo project name.
const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  webpack5: true,
  // Use the prefix in production and not development.
  assetPrefix: isProd ? '' : '',
  // https://nextjs.org/docs/messages/import-esm-externals
  experimental: { esmExternals: 'loose', outputFileTracing: true },
  // see https://github.com/vercel/vercel/issues/2569#issuecomment-514865342
  webpack(config, { isServer }) {
    // Add fallbacks for node modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      zlib: require.resolve('browserify-zlib'),
      path: require.resolve('path-browserify'),
      fs: false, // fs cannot be polyfilled
    };
    if (isServer) {
      config.resolve.mainFields = ['module', 'main'];
      // Fix all packages that this change breaks:
      config.resolve.alias['node-fetch'] = 'node-fetch/lib/index.js';
      // Add a new externals function to handle the 'electron' package,
      // instead of replacing the existing externals array.
      config.externals.push((context, request, callback) => {
        if (request === 'electron') {
          return callback(null, `require('${request}')`);
        }
        return callback();
      });
    }
    return config;
  },
};
