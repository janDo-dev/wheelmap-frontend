// @flow
import * as React from 'react';
import { type DataTableEntry, type AppProps } from './getInitialProps';
import { type Event } from '../lib/cache/EventsCache';

type EventDetailDataProps = {
  event: Event,
};

const EventDetailData: DataTableEntry<EventDetailDataProps> = {
  getHead({ event }) {
    return <title key="title">{event.name}</title>;
  },

  getEvent(eventId: string, appProps: AppProps) {
    return appProps.events.find(event => event._id === eventId);
  },

  async getInitialRouteProps(query, appPropsPromise, isServer) {
    const appProps = await appPropsPromise;

    return {
      ...appProps,
      event: this.getEvent(query.id, appProps),
    };
  },
};

export default EventDetailData;