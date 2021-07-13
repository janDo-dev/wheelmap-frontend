import * as React from 'react';
import includes from 'lodash/includes';
import findIndex from 'lodash/findIndex';
import get from 'lodash/get';
import { Router } from 'next/router';
import * as queryString from 'query-string';

import config from './lib/config';
import savedState, {
  saveState,
  isFirstStart,
  setJoinedMappingEventData,
  getJoinedMappingEventId as readStoredJoinedMappingEventId,
  setJoinedMappingEventId as storeJoinedMappingEventId,
} from './lib/savedState';
import { hasBigViewport, isOnSmallViewport } from './lib/ViewportSize';
import { isTouchDevice, UAResult } from './lib/userAgent';
import { RouterHistory } from './lib/RouterHistory';
import { SearchResultCollection } from './lib/searchPlaces';
import { Feature, isEquipmentPropertiesWithPlaceInfoId, WheelmapFeature } from "./lib/Feature";
import { SearchResultFeature } from './lib/searchPlaces';
import { EquipmentInfo, EquipmentInfoProperties } from './lib/EquipmentInfo';
import {
  MappingEvents,
  MappingEvent,
  isMappingEventVisible,
  canMappingEventBeJoined,
} from './lib/MappingEvent';
import { Cluster } from './components/Map/Cluster';
import { App as AppModel } from './lib/App';

import MainView, { UnstyledMainView } from './MainView';

import {
  NodeProperties,
  YesNoLimitedUnknown,
  YesNoUnknown,
  isAccessibilityFiltered,
  isToiletFiltered,
  getFeatureId,
} from './lib/Feature';

import {
  accessibilityCloudImageCache,
} from './lib/cache/AccessibilityCloudImageCache';

import { ModalNodeState } from './lib/ModalNodeState';
import { CategoryLookupTables } from './lib/Categories';
import { PhotoModel } from './lib/PhotoModel';
import { PlaceDetailsProps, PotentialPromise } from './app/PlaceDetailsProps';
import { PlaceFilter } from './components/SearchFilter/AccessibilityFilterModel';
import { LocalizedString } from './lib/i18n';
import { RouteProvider } from './components/Link/RouteContext';

import 'react-activity/dist/react-activity.css';
import 'focus-visible';
import { trackModalView, trackEvent } from './lib/Analytics';
import { trackingEventBackend } from './lib/TrackingEventBackend';
import { createGlobalStyle } from 'styled-components';
import { ElasticOrPhotonFeature } from './components/SearchFilter/SearchOmnibar';

import { OmnibarIsOpenContextProvider } from './components/Contexts/OmnibarContext';

export type LinkData = {
  label: LocalizedString,
  badgeLabel?: LocalizedString,
  url: LocalizedString,
  order?: number,
  tags?: string[],
};

interface Props extends PlaceDetailsProps {
  className?: string,
  router: Router,
  routerHistory: RouterHistory,
  routeName: string,
  categories?: CategoryLookupTables,
  userAgent: UAResult,
  searchQuery?: string | null,
  searchResults?: SearchResultCollection | Promise<SearchResultCollection>,
  category?: string,
  app: AppModel,
  lat: string | null,
  lon: string | null,
  zoom: string | null,
  extent: [number, number, number, number] | null,
  inEmbedMode: boolean,
  mappingEvents: MappingEvents,
  mappingEvent?: MappingEvent,

  includeSourceIds: Array<string>,
  excludeSourceIds: Array<string>,
  disableWheelmapSource?: boolean,
  overriddenAppId?: boolean,

  toiletFilter: YesNoUnknown[],
  accessibilityFilter: YesNoLimitedUnknown[],

  toiletsNearby: PotentialPromise<Feature[]>,
}

interface State {
  mappingEvents: MappingEvents,
  isOnboardingVisible: boolean,
  joinedMappingEventId: string | null,
  joinedMappingEvent: MappingEvent | null,
  isMappingEventWelcomeDialogVisible: boolean,
  isMainMenuOpen: boolean,
  modalNodeState: ModalNodeState,
  accessibilityPresetStatus?: YesNoLimitedUnknown | null,
  isSearchBarVisible: boolean,
  isOnSmallViewport: boolean,
  isFilterToolbarExpanded: boolean,
  isMappingEventsToolbarVisible: boolean,
  isMappingEventToolbarVisible: boolean,

  // photo feature
  isPhotoUploadInstructionsToolbarVisible: boolean,
  photosMarkedForUpload: FileList | null,
  waitingForPhotoUpload?: boolean,
  photoFlowNotification?: string,
  photoFlowErrorMessage: string | null,
  photoMarkedForReport: PhotoModel | null,

  activeCluster?: Cluster | null,

  // map controls
  lat?: number | null,
  lon?: number | null,
  isSpecificLatLonProvided: boolean,
  zoom?: number | null,
  extent?: [number, number, number, number] | null,
}

function isStickySearchBarSupported() {
  return hasBigViewport() && !isTouchDevice();
}

// filters mapping events for the active app & shown mapping event
function filterMappingEvents(
  mappingEvents: MappingEvents,
  appId: string,
  activeEventId?: string
): MappingEvents {
  return mappingEvents
    .filter(event => isMappingEventVisible(event) || activeEventId === event._id)
    .filter(event => appId === event.appId);
}

const GlobalStyle = createGlobalStyle`
  html {
    background-color: #6c7374;
  }

  body {
    position: fixed;
    overscroll-behavior: none;
  }

  html,
  body {
    -webkit-tap-highlight-color: transparent;
  }

  html,
  body,
  #__next,
  .main-view {
    /* width: 100%;
    width: 100vw;
    height: 100%;
    height: 100vh; */
    top: 0;
    bottom: 0;
    margin: 0;
    padding: 0;
  }

  /*
      This will hide the focus indicator if the element receives focus via the mouse,
      but it will still show up on keyboard focus.
    */

  .js-focus-visible :focus:not(.focus-visible) {
    outline: none;
  }

  /*
      We use a stronger and consistent focus indicator when an element receives focus via
      keyboard.
    */

  .js-focus-visible .focus-visible {
    outline: none;
    box-shadow: inset 0px 0px 0px 2px #4469e1;
    transition: box-shadow 0.2s;
  }

  .radio-group:focus-within,
  [role="radiogroup"]:focus-within {
    box-shadow: 0px 0px 0px 2px #4469e1;
    transition: box-shadow 0.2s;
  }

  .sr-only {
    position: absolute;
    left: -10000px;
    top: auto;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  #lightboxBackdrop {
    backdrop-filter: blur(10px);
    background-color: rgba(0, 0, 0, 0.9);
  }

  .subtle {
    opacity: 0.6;
  }

  body,
  button,
  input,
  select,
  textarea {
    /* Mix of the two system font stacks used by GitHub and Medium. */
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", Helvetica, Arial,
      sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  }

  kbd {
    background-color: transparent;
    border-radius: 3px;
    border: 1px solid #b4b4b4;
    color: rgba(255, 255, 255, 0.8);
    display: inline-block;
    line-height: 1;
    padding: 2px 4px;
    margin-left: 3px;
    margin-right: 3px;
    white-space: nowrap;
  }

  .ac-result-list,
  .ac-list {
    list-style-type: none;
    margin: 0;
    padding: 0;
    font-weight: 300;
    color: #444;
    line-height: 1.3;
  }

  .ac-result-list a:hover {
    font-weight: 400;
  }

  .ac-result {
    position: relative;
    max-width: 450px;
    margin: 0 0 1.5em 0;
    padding: 0.2em;
    padding-left: 3em;
  }

  .ac-result[aria-controls] {
    cursor: pointer;
  }

  .ac-result img {
    left: 0.5em;
    width: 2em;
    height: 2em;
    position: absolute;
    opacity: 0.8;
  }

  .ac-result a {
    text-decoration: none;
  }

  .ac-result:focus {
    outline: none;
    background-color: rgba(0, 0, 0, 0.05);
  }

  .ac-result-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.98);
    float: left;
  }

  .ac-result-category {
    clear: both;
  }

  .ac-result-distance {
    float: right;
    white-space: nowrap;
    word-spacing: -0.15em;
  }

  .ac-result-distance-icon {
    height: 1em;
    vertical-align: top;
    opacity: 0.2;
  }

  .ac-result-distance-icon polygon {
    fill: currentColor;
  }

  .ac-result-link {
    float: right;
  }

  .ac-summary {
    font-weight: bolder;
  }

  .ac-summary:hover .ac-info-icon {
    opacity: 0.8;
  }

  .ac-result-extra-info {
    font-size: 0.75em;
    line-height: 1.25em;
    opacity: 0.8;
    margin: 0.5em 8em 0.5em 0;
  }

  .ac-info-icon {
    opacity: 0.3;
    height: 1em;
    margin-left: 0.2em;
    margin-bottom: -0.17em;
    transition: opacity 0.3s ease-out;
  }

  .ac-details > dl.ac-group {
    padding: 0;
  }

  .ac-details em {
    font-style: normal;
  }

  .ac-result .ac-group > .subtle {
    font-weight: 400;
  }

  .ac-result dl {
    width: 100%;
    /*display: block;*/
    /*background-color: rgba(0, 0, 0, 0.1);*/
    overflow: auto;
    margin: 0;
  }

  .ac-result dt {
    /*background-color: rgba(255, 0, 0, 0.1);*/
    float: left;
    clear: left;
    margin: 0;
    padding: 0;
  }

  .ac-result dt[data-key] {
    font-weight: bolder;
  }

  .ac-result dd {
    /*background-color: rgba(0, 255, 0, 0.1);*/
    margin-left: 1em;
    display: table-cell;
    padding: 0 0 0 0.3em;
  }

  dt[data-key="areas"] {
    display: none;
  }

  dt[data-key="areas"] + dd {
    padding: 0;
  }

  dt[data-key="entrances"] {
    width: 100%;
  }
  dt[data-key="entrances"] + dd {
    padding-left: 1em;
  }

  .ac-result .ac-group header {
    margin: 0.5em 0 0 0;
  }

  .ac-result {
    display: block;
    outline: none;
    border: none;
    background: none;
    list-style: none;
    font: inherit;
    text-align: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  .ac-result .ac-details {
    display: none;
  }

  @keyframes ac-fadein {
    0% {
      opacity: 0;
      max-height: 0;
    }
    100% {
      opacity: 1;
      max-height: 500px;
    }
  }

  .ac-result[aria-expanded="true"] .ac-details {
    display: block;
    animation: ac-fadein 0.5s ease-out;
  }

  .ac-result[aria-expanded="true"] .ac-info-icon {
    opacity: 0;
  }

  .ac-error {
    color: red;
  }


`;

class App extends React.Component<Props, State> {
  props: Props;

  state: State = {
    lat: null,
    lon: null,
    isSpecificLatLonProvided: false,
    zoom: null,
    mappingEvents: [],
    isSearchBarVisible: isStickySearchBarSupported(),
    isOnboardingVisible: false,
    joinedMappingEventId: null,
    joinedMappingEvent: null,
    isMappingEventWelcomeDialogVisible: false,
    isMainMenuOpen: false,
    modalNodeState: null,
    accessibilityPresetStatus: null,
    isOnSmallViewport: false,
    isFilterToolbarExpanded: false,
    isMappingEventsToolbarVisible: false,
    isMappingEventToolbarVisible: false,

    // photo feature
    isPhotoUploadInstructionsToolbarVisible: false,
    photosMarkedForUpload: null,
    photoMarkedForReport: null,
    photoFlowErrorMessage: null,
  };

  map: any;

  mainView: UnstyledMainView;

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> {
    const newState: Partial<State> = {
      isFilterToolbarExpanded: false,
      isSearchBarVisible: isStickySearchBarSupported(),
    };

    // open search results on search route
    if (props.routeName === 'search') {
      newState.isFilterToolbarExpanded = true;
      newState.isSearchBarVisible = true;
      newState.activeCluster = null;
    }

    if (props.routeName === 'createPlace') {
      newState.modalNodeState = 'create';
      trackModalView('create');
      newState.activeCluster = null;
    }

    if (props.routeName === 'contributionThanks') {
      newState.modalNodeState = 'contribution-thanks';
      trackModalView('contribution-thanks');
      newState.activeCluster = null;
    }

    if (props.routeName === 'map') {
      newState.modalNodeState = null;
    }

    if (props.routeName === 'mappingEvents') {
      newState.isMappingEventsToolbarVisible = true;
      newState.isSearchBarVisible = false;
    } else {
      newState.isMappingEventsToolbarVisible = false;
    }

    if (props.routeName === 'mappingEventDetail' || props.routeName === 'mappingEventJoin') {
      newState.isMappingEventToolbarVisible = true;
      newState.isSearchBarVisible = false;
    } else {
      newState.isMappingEventToolbarVisible = false;
    }

    const placeDetailsRoute = props.routeName === 'placeDetail' || props.routeName === 'equipment';
    if (placeDetailsRoute) {
      const { accessibilityFilter, toiletFilter, category } = props;

      newState.isSearchBarVisible =
        isStickySearchBarSupported() &&
        !isAccessibilityFiltered(accessibilityFilter) &&
        !isToiletFiltered(toiletFilter) &&
        !category;
    }

    const parsedZoom = typeof props.zoom === 'string' ? parseInt(props.zoom, 10) : null;
    const parsedLat = typeof props.lat === 'string' ? parseFloat(props.lat) : null;
    const parsedLon = typeof props.lon === 'string' ? parseFloat(props.lon) : null;

    newState.extent = state.extent || props.extent || null;
    newState.zoom = state.zoom || parsedZoom || Number.parseInt(savedState.map.lastZoom, 10) || null;
    newState.lat =
      state.lat || parsedLat || (savedState.map.lastCenter && Number.parseFloat(savedState.map.lastCenter[0])) || null;
    newState.lon =
      state.lon || parsedLon || (savedState.map.lastCenter && Number.parseFloat(savedState.map.lastCenter[1])) || null;

    newState.isSpecificLatLonProvided = Boolean(parsedLat) && Boolean(parsedLon);

    return newState;
  }

  componentDidMount() {
    const { routeName, inEmbedMode } = this.props;

    const shouldStartInSearch = routeName === 'map' && !inEmbedMode;

    if (isFirstStart()) {
      this.setState({ isOnboardingVisible: true });
    } else if (shouldStartInSearch) {
      this.openSearch(true);
    }

    this.setupMappingEvents();

    trackingEventBackend.track(this.props.app, {
      type: 'AppOpened',
      query: queryString.parse(window.location.search),
    });
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    // update filter, to include change in shown mapping event
    if (prevProps.mappingEvent !== this.props.mappingEvent) {
      this.setupMappingEvents();
    }
  }

  setupMappingEvents() {
    const mappingEvents = filterMappingEvents(
      this.props.mappingEvents,
      this.props.app._id,
      this.props.mappingEvent && this.props.mappingEvent._id
    );
    this.setState({ mappingEvents });
    this.initializeJoinedMappingEvent();
  }

  initializeJoinedMappingEvent() {
    const {
      mappingEvents,
      routeName,
      router: { query },
    } = this.props;

    let joinedMappingEventId = readStoredJoinedMappingEventId();
    const joinedMappingEvent = joinedMappingEventId
      ? mappingEvents.find(event => event._id === joinedMappingEventId)
      : null;
    const state = {
      joinedMappingEvent,
      joinedMappingEventId,
      isMappingEventWelcomeDialogVisible: false,
    };

    if (routeName === 'mappingEventJoin') {
      const mappingEventIdToJoin = query.id;
      const mappingEventToJoin = mappingEvents.find(event => event._id === mappingEventIdToJoin);
      if (mappingEventToJoin && canMappingEventBeJoined(mappingEventToJoin)) {
        state.isMappingEventWelcomeDialogVisible = true;
      }
    }

    // invalidate already locally stored mapping event if it already expired
    if (!joinedMappingEvent || !canMappingEventBeJoined(joinedMappingEvent)) {
      joinedMappingEventId = null;
      storeJoinedMappingEventId(joinedMappingEventId);
      setJoinedMappingEventData();
    }

    this.setState(state);
  }

  trackMappingEventMembershipChanged = (
    reason: 'url' | 'button',
    joinedMappingEventId?: string,
    emailAddress?: string
  ) => {
    storeJoinedMappingEventId(joinedMappingEventId);
    const search: string = window.location.search;

    if (joinedMappingEventId) {
      const token = this.props.router.query.token
      const invitationToken = Array.isArray(token) ? token[0] : token;
      setJoinedMappingEventData(emailAddress, invitationToken);

      trackingEventBackend.track(this.props.app, {
        invitationToken,
        emailAddress,
        type: 'MappingEventJoined',
        joinedMappingEventId: joinedMappingEventId,
        joinedVia: reason,
        query: queryString.parse(search),
      });
      trackEvent({
        category: 'MappingEvent',
        action: 'Joined',
        label: joinedMappingEventId,
      });
    }
  };

  onMappingEventLeave = () => {
    this.trackMappingEventMembershipChanged('button');
    this.setState({ joinedMappingEventId: null });
  };

  onMappingEventJoin = (joinedMappingEventId: string, emailAddress?: string) => {
    this.trackMappingEventMembershipChanged('button', joinedMappingEventId, emailAddress);
    this.setState({
      joinedMappingEventId,
    });
    const params = this.getCurrentParams();
    this.props.routerHistory.replace('mappingEventDetail', params);
  };

  onMappingEventWelcomeDialogOpen = () => {
    const params = this.getCurrentParams();
    this.props.routerHistory.replace('mappingEventJoin', params);
  };

  onMappingEventWelcomeDialogClose = () => {
    const params = this.getCurrentParams();
    this.props.routerHistory.replace('mappingEventDetail', params);
  };

  openSearch(replace: boolean = false) {
    if (this.props.routeName === 'search') {
      return;
    }

    // Manage 'search' router func
    // const params = this.getCurrentParams() as any;

    // delete params.id;
    // delete params.eid;

    // if (replace) {
    //   this.props.routerHistory.replace('search', params);
    // } else {
    //   this.props.routerHistory.push('search', params);
    // }

  }

  closeSearch() {
    if (this.props.routeName !== 'search') {
      return;
    }

    const params = this.getCurrentParams();

    this.props.routerHistory.push('map', params);
  }

  onClickSearchButton = () => this.openSearch();

  onToggleMainMenu = (isMainMenuOpen: boolean) => {
    this.setState({ isMainMenuOpen });
  };

  onMainMenuHomeClick = () => {
    saveState({ onboardingCompleted: 'false' });
    this.setState({ isOnboardingVisible: true });

    const params = this.getCurrentParams() as any;
    delete params.id;
    delete params.eid;
    this.props.routerHistory.push('map', params);
  };

  onMoveEnd = (state: Partial<State>) => {
    let { zoom, lat, lon } = state;

    // Adjust zoom level to be stored in the local storage to make sure the user can
    // see some places when reloading the app after some time.
    const lastZoom = String(
      Math.max(zoom || 0, config.minZoomWithSetCategory, config.minZoomWithoutSetCategory)
    );

    saveState({
      'map.lastZoom': lastZoom,
      'map.lastCenter.lat': String(lat),
      'map.lastCenter.lon': String(lon),
      'map.lastMoveDate': new Date().toString(),
    });

    this.setState({ extent: null, lat, lon, zoom });
  };

  onMapClick = () => {
    if (this.state.isFilterToolbarExpanded) {
      this.closeSearch();
      this.mainView && this.mainView.focusMap();
    }
  };

  showSelectedFeature = (
    featureId: string | number,
    properties?: NodeProperties | EquipmentInfoProperties | null
  ) => {
    const featureIdString = featureId.toString();
    const { routerHistory } = this.props;

    // show equipment inside their place details
    let routeName = 'placeDetail';
    const params = this.getCurrentParams() as any;

    params.id = featureIdString;
    delete params.eid;

    if (isEquipmentPropertiesWithPlaceInfoId(properties)) {
      const placeInfoId = properties.placeInfoId;
      if (includes(['elevator', 'escalator'], properties.category)) {
        routeName = 'equipment';
        params.id = placeInfoId;
        params.eid = featureIdString;
      }
    }

    let activeCluster = null;
    if (this.state.activeCluster) {
      const index = findIndex(
        this.state.activeCluster.features,
        // @ts-ignore
        f => (f.id || f._id) === featureIdString
      );
      activeCluster = index !== -1 ? this.state.activeCluster : null;
    }

    this.setState({ activeCluster }, () => {
      routerHistory.push(routeName, params);
    });
  };

  showSelectedMappingEvent = (eventId: string) => {
    const event =
      this.state.mappingEvents && this.state.mappingEvents.find(event => event._id === eventId);
    const extent = event && event.area && event.area.properties.extent;

    if (extent) {
      this.setState({ extent });
    }

    const params = this.getCurrentParams() as any;
    params.id = eventId;
    this.props.routerHistory.push('mappingEventDetail', params);
  };

  showCluster = (cluster: Cluster) => {
    this.setState({ activeCluster: cluster }, () => {
      const params = this.getCurrentParams() as any;
      delete params.id;
      delete params.eid;
      this.props.routerHistory.push('map', params);
    });
  };

  closeActiveCluster = () => {
    this.setState({ activeCluster: null });
  };

  onAccessibilityFilterButtonClick = (filter: PlaceFilter) => {
    let { routeName } = this.props;
    const params = this.getCurrentParams() as any;

    delete params.accessibility;
    delete params.toilet;

    if (filter.accessibilityFilter.length > 0) {
      params.accessibility = filter.accessibilityFilter.join(',');
    }

    if (filter.toiletFilter.length > 0) {
      params.toilet = filter.toiletFilter.join(',');
    }

    this.props.routerHistory.push(routeName, params);
  };

  // onSearchResultClick = (feature: SearchResultFeature, wheelmapFeature: WheelmapFeature | null) => {
  //   const params = this.getCurrentParams() as any;
  //   let routeName = 'map';

  //   if (wheelmapFeature) {
  //     let id = getFeatureId(wheelmapFeature);
  //     if (id) {
  //       params.id = id;
  //       delete params.eid;
  //       routeName = 'placeDetail';
  //     }
  //   }

  //   if (routeName === 'map') {
  //     delete params.id;
  //     delete params.eid;
  //   }

  //   if (feature.properties.extent) {
  //     const extent = feature.properties.extent;
  //     this.setState({ lat: null, lon: null, extent });
  //   } else {
  //     const [lon, lat] = feature.geometry.coordinates;
  //     this.setState({ lat, lon, extent: null });
  //   }

  //   this.props.routerHistory.push(routeName, params);
  // };

  onSearchResultClick = (feature: SearchResultFeature| null, wheelmapFeature: WheelmapFeature | null, elasticFeature: ElasticOrPhotonFeature | null) => {

    const params = this.getCurrentParams() as any;
    let routeName = 'map';

    if (elasticFeature._index == 'fromPhotonAPI' && elasticFeature?._source?.properties?.extent) { // there are places without extent
      const extent = elasticFeature._source.properties.extent;
      this.setState({ lat: null, lon: null, extent });
    } else {

      const acId = getFeatureId(elasticFeature);

      // Todo: fix osm sync and delete this list
      const isOSMPlace = ["LiBTS67TjmBcXdEmX","uxBG2vp4hN4akkk5v","bELWgM9KtnGWh4gRv","ngFECXr28QQAMmHuF"].includes( elasticFeature._source.properties.sourceId );

      const id = isOSMPlace && elasticFeature._source.properties.originalId || acId;
    
      if (id) {
        params.id = id;
        delete params.eid;
        routeName = 'placeDetail';
      }
      const [lon, lat] = elasticFeature._source.geometry.coordinates;
      this.setState({ lat, lon, extent: null });
    }

    if(routeName == 'map'){
      delete params.id;
      delete params.eid;
    }

    this.props.routerHistory.push(routeName, params);
  };

  onClickFullscreenBackdrop = () => {
    this.setState({ isMainMenuOpen: false, isOnboardingVisible: false, modalNodeState: null });
    trackModalView(null);
    this.onCloseNodeToolbar();
  };

  onStartPhotoUploadFlow = () => {
    this.setState({
      isSearchBarVisible: false,
      waitingForPhotoUpload: false,
      isPhotoUploadInstructionsToolbarVisible: true,
      photosMarkedForUpload: null,
      photoFlowErrorMessage: null,
    });
  };

  onExitPhotoUploadFlow = (notification: string = null, photoFlowErrorMessage: string | null = null) => {
    this.setState({
      photoFlowErrorMessage,
      isSearchBarVisible: !isOnSmallViewport(),
      waitingForPhotoUpload: false,
      isPhotoUploadInstructionsToolbarVisible: false,
      photosMarkedForUpload: null,
      photoFlowNotification: notification,
    });
  };

  onContinuePhotoUploadFlow = (photos: FileList) => {
    if (photos.length === 0) {
      this.onExitPhotoUploadFlow();
      return;
    }

    this.onFinishPhotoUploadFlow(photos);
  };

  onFinishPhotoUploadFlow = (photos: FileList) => {
    console.log('onFinishPhotoUploadFlow');
    const { featureId } = this.props;

    if (!featureId) {
      console.error('No feature found, aborting upload!');
      this.onExitPhotoUploadFlow();
      return;
    }

    this.setState({ waitingForPhotoUpload: true, photoFlowNotification: 'uploadProgress' });

    accessibilityCloudImageCache
      .uploadPhotoForFeature(String(featureId), photos, this.props.app.tokenString)
      .then(() => {
        console.log('Succeeded upload');
        this.onExitPhotoUploadFlow('waitingForReview');
      })
      .catch(reason => {
        console.error('Failed upload', reason);
        this.onExitPhotoUploadFlow('uploadFailed', reason && reason.message);
      });
  };

  onStartReportPhotoFlow = (photo: PhotoModel) => {
    this.setState({ isSearchBarVisible: false, photoMarkedForReport: photo });
  };

  onFinishReportPhotoFlow = (photo: PhotoModel, reason: string) => {
    if (photo.source === 'accessibility-cloud') {
      accessibilityCloudImageCache.reportPhoto(
        String(photo.imageId),
        reason,
        this.props.app.tokenString
      );
      this.onExitReportPhotoFlow('reported');
    }
  };

  onExitReportPhotoFlow = (notification?: string) => {
    this.setState({
      isSearchBarVisible: !isOnSmallViewport(),
      photoMarkedForReport: null,
      photoFlowNotification: notification,
    });
  };

  onOpenReportMode = () => {
    if (this.props.featureId) {
      this.setState({ modalNodeState: 'report' });
      trackModalView('report');
    }
  };

  getCurrentParams() {
    const params = {} as any;
    const {
      app,
      category,
      accessibilityFilter,
      toiletFilter,
      featureId,
      equipmentInfoId,
      disableWheelmapSource,
      includeSourceIds,
      excludeSourceIds,
      overriddenAppId,
      inEmbedMode,
    } = this.props;

    if (category) {
      params.category = category;
    }

    if (isAccessibilityFiltered(accessibilityFilter)) {
      params.accessibility = accessibilityFilter.join(',');
    }

    if (isToiletFiltered(toiletFilter)) {
      params.toilet = toiletFilter.join(',');
    }

    if (featureId) {
      params.id = featureId;
    }

    if (equipmentInfoId) {
      params.eid = equipmentInfoId;
    }

    // ensure to keep widget/custom whitelabel parameters
    if (includeSourceIds && includeSourceIds.length > 0) {
      const includeSourceIdsAsString = includeSourceIds.join(',');
      if (includeSourceIdsAsString !== app.clientSideConfiguration.includeSourceIds.join(',')) {
        params.includeSourceIds = includeSourceIdsAsString;
      }
    }

    if (excludeSourceIds && excludeSourceIds.length > 0) {
      const excludeSourceIdsAsString = excludeSourceIds.join(',');
      if (excludeSourceIdsAsString !== app.clientSideConfiguration.excludeSourceIds.join(',')) {
        params.excludeSourceIds = excludeSourceIdsAsString;
      }
    }

    if (
      typeof disableWheelmapSource !== 'undefined' &&
      disableWheelmapSource !== app.clientSideConfiguration.disableWheelmapSource
    ) {
      params.disableWheelmapSource = disableWheelmapSource ? 'true' : 'false';
    }

    if (overriddenAppId) {
      params.appId = overriddenAppId;
    }

    if (inEmbedMode) {
      params.embedded = 'true';
    }

    return params;
  }

  // this is called also when the report dialog is closed
  onCloseNodeToolbar = () => {
    const currentModalState = this.state.modalNodeState;

    if (!currentModalState) {
      const params = this.getCurrentParams();

      delete params.id;
      delete params.eid;

      this.props.routerHistory.push('map', params);
    } else {
      this.setState({ modalNodeState: null });
      trackModalView(null);
    }
  };

  onCloseMappingEventsToolbar = () => {
    const params = this.getCurrentParams();
    delete params.id;
    this.props.routerHistory.push('map', params);
  };

  onCloseModalDialog = () => {
    const params = this.getCurrentParams();
    this.props.routerHistory.push('map', params);
  };

  onCloseOnboarding = () => {
    saveState({ onboardingCompleted: 'true' });
    this.setState({ isOnboardingVisible: false });

  };

  onFilterToolbarClick = () => {
    this.openSearch();
  };

  onFilterToolbarClose = () => {
    this.closeSearch();

    if (this.mainView) this.mainView.focusMap();
  };

  onFilterToolbarSubmit = (searchQuery: string) => {
    // Enter a command like `locale:de_DE` to set a new locale.
    const setLocaleCommandMatch = searchQuery.match(/^locale:(\w\w(?:_\w\w))/);

    if (setLocaleCommandMatch) {
      const { routeName, routerHistory } = this.props;
      const params = this.getCurrentParams();

      params.locale = setLocaleCommandMatch[1];

      routerHistory.push(routeName, params);
    }
  };

  onOpenWheelchairAccessibility = () => {
    if (this.props.featureId) {
      this.setState({ modalNodeState: 'edit-wheelchair-accessibility' });
      trackModalView('edit-wheelchair-accessibility');
    }
  };

  onOpenToiletAccessibility = () => {
    if (this.props.featureId) {
      this.setState({ modalNodeState: 'edit-toilet-accessibility' });
      trackModalView('edit-toilet-accessibility');
    }
  };

  onShowSelectedFeature = (feature: Feature | EquipmentInfo) => {
    const featureId = getFeatureId(feature);

    if (!featureId) {
      return;
    }

    this.showSelectedFeature(featureId, feature.properties);
  };

  gotoCurrentFeature() {
    if (this.props.featureId) {
      this.setState({ modalNodeState: null });
      trackModalView(null);
    }
  }

  onCloseWheelchairAccessibility = () => {
    this.gotoCurrentFeature();
  };

  onCloseToiletAccessibility = () => {
    this.gotoCurrentFeature();
  };

  onSelectWheelchairAccessibility = (value: YesNoLimitedUnknown) => {
    if (this.props.featureId) {
      this.setState({
        modalNodeState: 'edit-wheelchair-accessibility',
        accessibilityPresetStatus: value,
      });
      trackModalView('edit-wheelchair-accessibility');
    }
  };

  onSearchQueryChange = (newSearchQuery: string | null) => {
    const params = this.getCurrentParams();

    if (!newSearchQuery || newSearchQuery.length === 0) {
      delete params.q;

      return this.props.routerHistory.replace('map', params);
    }

    params.q = newSearchQuery;

    this.props.routerHistory.replace('search', params);
  };

  onEquipmentSelected = (placeInfoId: string, equipmentInfo: EquipmentInfo) => {
    this.props.routerHistory.replace('equipment', {
      id: placeInfoId,
      eid: get(equipmentInfo, 'properties._id'),
    });
  };

  isNodeToolbarDisplayed(props: Props = this.props, state: State = this.state) {
    return (
      props.feature &&
      !props.mappingEvent &&
      !state.isFilterToolbarExpanded &&
      !state.isPhotoUploadInstructionsToolbarVisible &&
      !state.photoMarkedForReport
    );
  }

  onMappingEventsLinkClick = () => {
    this.setState({ isMainMenuOpen: false });
  };

  render() {
    const { isSpecificLatLonProvided } = this.state;
    const isNodeRoute = Boolean(this.props.featureId);
    const isNodeToolbarDisplayed = this.isNodeToolbarDisplayed();
    const mapMoveDate = savedState.map.lastMoveDate;
    // @ts-ignore
    const wasMapMovedRecently = mapMoveDate && new Date() - mapMoveDate < config.locateTimeout;

    const shouldLocateOnStart = !isSpecificLatLonProvided && !isNodeRoute && !wasMapMovedRecently;

    const isSearchBarVisible = this.state.isSearchBarVisible;
    const isMappingEventsToolbarVisible = this.state.isMappingEventsToolbarVisible;
    const isMappingEventToolbarVisible = this.state.isMappingEventToolbarVisible;
    const isSearchButtonVisible =
      // !isSearchBarVisible && 
      !isMappingEventsToolbarVisible && !isMappingEventToolbarVisible;

    const extraProps = {
      isNodeRoute,
      modalNodeState: this.state.modalNodeState,
      isNodeToolbarDisplayed,
      isMappingEventsToolbarVisible,
      isMappingEventToolbarVisible,
      shouldLocateOnStart,
      isSearchButtonVisible,
      isSearchBarVisible,

      featureId: this.props.featureId,
      feature: this.props.feature,
      lightweightFeature: this.props.lightweightFeature,
      equipmentInfoId: this.props.equipmentInfoId,
      equipmentInfo: this.props.equipmentInfo,
      photos: this.props.photos,
      toiletsNearby: this.props.toiletsNearby,
      category: this.props.category,
      categories: this.props.categories,
      sources: this.props.sources,
      userAgent: this.props.userAgent,
      toiletFilter: this.props.toiletFilter,
      accessibilityFilter: this.props.accessibilityFilter,
      searchQuery: this.props.searchQuery,
      lat: this.state.lat,
      lon: this.state.lon,
      zoom: this.state.zoom,
      extent: this.state.extent,
      isOnboardingVisible: this.state.isOnboardingVisible,
      isMappingEventWelcomeDialogVisible: this.state.isMappingEventWelcomeDialogVisible,
      isMainMenuOpen: this.state.isMainMenuOpen,
      isOnSmallViewport: this.state.isOnSmallViewport,
      isFilterToolbarExpanded: this.state.isFilterToolbarExpanded,
      searchResults: this.props.searchResults,
      inEmbedMode: this.props.inEmbedMode,
      mappingEvents: this.state.mappingEvents,
      mappingEvent: this.props.mappingEvent,
      invitationToken: this.props.router.query.token,

      disableWheelmapSource: this.props.disableWheelmapSource,
      includeSourceIds: this.props.includeSourceIds,
      excludeSourceIds: this.props.excludeSourceIds,

      // photo feature
      isPhotoUploadInstructionsToolbarVisible:
        this.props.feature && this.state.isPhotoUploadInstructionsToolbarVisible,
      photosMarkedForUpload: this.state.photosMarkedForUpload,
      waitingForPhotoUpload: this.state.waitingForPhotoUpload,
      photoFlowNotification: this.state.photoFlowNotification,
      photoFlowErrorMessage: this.state.photoFlowErrorMessage,
      photoMarkedForReport: this.state.photoMarkedForReport,

      // simple 3-button status editor feature
      accessibilityPresetStatus: this.state.accessibilityPresetStatus,

      // feature list (e.g. cluster panel)
      activeCluster: this.state.activeCluster,

      app: this.props.app,
    } as any;

    return (
      <RouteProvider
        value={{
          history: this.props.routerHistory,
          params: this.getCurrentParams(),
          name: this.props.routeName,
        }}
      >
        <GlobalStyle />
        <OmnibarIsOpenContextProvider> {/* context for the isOpen flag of the Omnibar */}
        <MainView
          {...extraProps}
          ref={mainView => {
            this.mainView = mainView;
          }}
          onClickSearchButton={this.onClickSearchButton}
          onToggleMainMenu={this.onToggleMainMenu}
          onMoveEnd={this.onMoveEnd}
          onMapClick={this.onMapClick}
          onMarkerClick={this.showSelectedFeature}
          onClusterClick={this.showCluster}
          onCloseClusterPanel={this.closeActiveCluster}
          onSelectFeatureFromCluster={this.onShowSelectedFeature}
          onSearchResultClick={this.onSearchResultClick}
          onClickFullscreenBackdrop={this.onClickFullscreenBackdrop}
          onOpenReportMode={this.onOpenReportMode}
          onCloseNodeToolbar={this.onCloseNodeToolbar}
          onCloseOnboarding={this.onCloseOnboarding}
          onFilterToolbarClick={this.onFilterToolbarClick}
          onFilterToolbarClose={this.onFilterToolbarClose}
          onFilterToolbarSubmit={this.onFilterToolbarSubmit}
          onCloseModalDialog={this.onCloseModalDialog}
          onOpenWheelchairAccessibility={this.onOpenWheelchairAccessibility}
          onOpenToiletAccessibility={this.onOpenToiletAccessibility}
          onOpenToiletNearby={this.onShowSelectedFeature}
          onSelectWheelchairAccessibility={this.onSelectWheelchairAccessibility}
          onCloseWheelchairAccessibility={this.onCloseWheelchairAccessibility}
          onCloseToiletAccessibility={this.onCloseToiletAccessibility}
          onSearchQueryChange={this.onSearchQueryChange}
          onEquipmentSelected={this.onEquipmentSelected}
          onShowPlaceDetails={this.showSelectedFeature}
          onMainMenuHomeClick={this.onMainMenuHomeClick}
          onAccessibilityFilterButtonClick={this.onAccessibilityFilterButtonClick}
          // photo feature
          onStartPhotoUploadFlow={this.onStartPhotoUploadFlow}
          onAbortPhotoUploadFlow={this.onExitPhotoUploadFlow}
          onContinuePhotoUploadFlow={this.onContinuePhotoUploadFlow}
          onFinishPhotoUploadFlow={this.onFinishPhotoUploadFlow}
          onStartReportPhotoFlow={this.onStartReportPhotoFlow}
          onFinishReportPhotoFlow={this.onFinishReportPhotoFlow}
          onAbortReportPhotoFlow={this.onExitReportPhotoFlow}
          // mapping event feature
          onMappingEventsLinkClick={this.onMappingEventsLinkClick}
          onMappingEventClick={this.showSelectedMappingEvent}
          joinedMappingEventId={this.state.joinedMappingEventId}
          joinedMappingEvent={this.state.joinedMappingEvent}
          onCloseMappingEventsToolbar={this.onCloseMappingEventsToolbar}
          onMappingEventJoin={this.onMappingEventJoin}
          onMappingEventLeave={this.onMappingEventLeave}
          onMappingEventWelcomeDialogOpen={this.onMappingEventWelcomeDialogOpen}
          onMappingEventWelcomeDialogClose={this.onMappingEventWelcomeDialogClose}
        />
        </OmnibarIsOpenContextProvider>
      </RouteProvider>
    );
  }
}

export default App;
