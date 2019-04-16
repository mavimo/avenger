import { createBrowserHistory } from 'history';
import { invalidate } from '../invalidate';
import { query } from '../Query';
import { taskEither, TaskEither } from 'fp-ts/lib/TaskEither';
import { refetch, setoidStrict, setoidJSON } from '../Strategy';
import { getSetoid } from '../CacheValue';
import { getStructSetoid, setoidString } from 'fp-ts/lib/Setoid';
import { command } from '../command';
import { Task } from 'fp-ts/lib/Task';
import { right } from 'fp-ts/lib/Either';
import { parse, stringify } from 'qs';
import trim = require('lodash.trim');

export type HistoryLocation = {
  pathname: string;
  search: { [k: string]: string | undefined };
};

let _setListener = false;
const history = createBrowserHistory();

export const location = query(
  (): TaskEither<void, HistoryLocation> => {
    if (!_setListener) {
      setListener();
    }
    const search: HistoryLocation['search'] = parse(
      trim(history.location.search, '?')
    );
    return taskEither.of<void, HistoryLocation>({
      pathname: history.location.pathname,
      search
    });
  }
)(
  refetch<void, void, HistoryLocation>(
    setoidStrict as any,
    getSetoid<void, HistoryLocation>(
      setoidStrict as any,
      getStructSetoid<HistoryLocation>({
        pathname: setoidString,
        search: setoidJSON as any
      })
    )
  )
);

function setListener() {
  history.listen(() => {
    invalidate({ location }, {}).run();
  });
  _setListener = true;
}

export const doUpdateLocation = command(
  ({ search, pathname }: HistoryLocation): TaskEither<void, void> =>
    new TaskEither(
      new Task(
        () =>
          new Promise(resolve => {
            setTimeout(() => resolve(right<void, void>(undefined)));
            const searchQuery =
              Object.keys(search).length > 0
                ? `?${stringify(search, { skipNulls: true })}`
                : '';

            if (
              trim(pathname, ' /') !== trim(history.location.pathname, ' /') ||
              trim(searchQuery, ' ?') !== trim(history.location.search, ' ?')
            ) {
              const url = `/${trim(pathname, ' /')}${searchQuery}`;
              history.push(url);
            }
          })
      )
    ),
  { location }
);