import ElasticAPMSourceMapPlugin from '@hypo808/elastic-apm-sourcemap-webpack-plugin';
import TTagPlugin from 'babel-plugin-ttag';
import withSass from '@zeit/next-sass';
import withCss from '@zeit/next-css';
import withTranspileModules from 'next-transpile-modules';
import webpack from 'webpack';
import env from './src/lib/env';
import withSourceMaps from '@zeit/next-source-maps';

module.exports = withSourceMaps(
  withCss(
    withSass(
      withTranspileModules({
        // Next.js doesn't transpile node_modules content by default.
        // We have to do this manually to make IE 11 users happy.
        transpileModules: [
          '@sozialhelden/twelve-factor-dotenv',
          '@elastic/apm-rum-core',
          '@elastic/apm-rum',
          'dotenv',
        ],
        webpack: config => {
          // Fixes npm packages that depend on `fs` module
          config.node = {
            fs: 'empty',
            dgram: 'empty',
            net: 'empty',
            tls: 'empty',
            child_process: 'empty',
            async_hooks: 'mock',
            'elastic-apm-node': 'empty',
          };

          // if (process.env.NODE_ENV === 'production') {
          //   config.plugins.unshift(new ElasticAPMSourceMapPlugin({
          //     serviceName: 'wheelmap-react-frontend',
          //     serviceVersion: env.npm_package_version,
          //     serverURL: env.REACT_APP_ELASTIC_APM_SERVER_URL,
          //     publicPath: `${env.PUBLIC_URL}/_next/static/chunks`,
          //     secret: env.ELASTIC_APM_SECRET_TOKEN,
          //     logLevel: 'debug'
          //   }));
          // }

          return config;
        },
        // Disabling file-system routing to always use custom server.
        useFileSystemPublicRoutes: false,
      })
    )
  )
);