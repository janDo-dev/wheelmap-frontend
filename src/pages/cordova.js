// @flow

import * as React from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';

import savedState, { saveState } from '../lib/savedState';
import env from '../lib/env';
import {
  getAppInitialProps,
  clientStoreAppInitialProps,
  type AppProps,
} from '../app/getInitialProps';
import {
  applyTranslations,
  expandedPreferredLocales,
  loadExistingLocalizationByPreference,
} from '../lib/i18n';

// dynamically load app only after cordova is ready
const DynamicApp = dynamic(import('../App'), {
  ssr: false,
});

type Props = AppProps & { buildTimeProps: AppProps, isCordovaBuild: boolean };

type State = {
  buildTimeProps: ?$Shape<AppProps>,
  storedInitialProps: ?$Shape<AppProps>,
  isDeviceReady: boolean,
};

/// Takes care of rendering the page in the cordova environment
/// Mostly deals with setting the correct initialProps and storing them for offline usage
class CordovaMain extends React.PureComponent<Props, State> {
  state: State = {
    buildTimeProps: null,
    storedInitialProps: savedState.initialProps,
    isDeviceReady: false,
  };
  constructor(props: Props) {
    super(props);

    // always apply
    if (typeof window !== 'undefined') {
      const languages = [window.navigator.language]
        .concat(window.navigator.languages || [])
        .filter(Boolean);
      const locales = expandedPreferredLocales(languages);
      const translations = loadExistingLocalizationByPreference(locales);
      applyTranslations(translations);
      clientStoreAppInitialProps({ translations });
    }

    // inject the build time data into the initial props, these are only available on the initial route
    if (props.buildTimeProps) {
      const { translations, ...remainingBuildTimeProps } = props.buildTimeProps;
      this.state.buildTimeProps = remainingBuildTimeProps;
      clientStoreAppInitialProps(remainingBuildTimeProps);
    }

    // if we have stored props, use these to override the build time props
    if (savedState.initialProps) {
      clientStoreAppInitialProps(savedState.initialProps);
    }
  }

  componentDidMount() {
    // device ready will always be invoked, there is no way to miss this event
    document.addEventListener(
      'deviceready',
      () => {
        this.fetchInitialProps();
        this.setState({ isDeviceReady: true });
      },
      false
    );
  }

  fetchInitialProps() {
    const userAgentString = window.navigator.userAgent;
    const languages = [window.navigator.language]
      .concat(window.navigator.languages || [])
      .filter(Boolean);

    const hostName = env.public.cordovaHostname;

    // try downloading new initial props after first mount
    getAppInitialProps({ userAgentString, hostName, languages }, false, false)
      .then(this.onInitialPropsFetched)
      .catch(e => {
        console.warn('Failed loading new initial props from server, staying with build props.', e);
      });
  }

  onInitialPropsFetched = (reloadedInitialProps: AppProps) => {
    console.log('Received new initial props from server.', reloadedInitialProps);
    // strip translations, no need to cache them
    const { categories, clientSideConfiguration } = reloadedInitialProps;

    clientStoreAppInitialProps({ categories, clientSideConfiguration });

    this.setState({
      storedInitialProps: { categories, clientSideConfiguration },
    });

    saveState({
      'initialProps.categories': JSON.stringify(categories),
      'initialProps.clientSideConfiguration': JSON.stringify(clientSideConfiguration),
    });
  };

  render() {
    const { isCordovaBuild, ...props } = this.props;
    const { buildTimeProps, storedInitialProps, isDeviceReady } = this.state;

    // do not pre-render this at build time, it is only needed in the real browser
    return (
      <React.Fragment>
        <Head>
          <script src="cordova.js" />
        </Head>
        {isDeviceReady && <DynamicApp {...buildTimeProps} {...storedInitialProps} {...props} />}
      </React.Fragment>
    );
  }
}

export default CordovaMain;