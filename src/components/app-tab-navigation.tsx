import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type AppTabKey = 'index' | 'centers' | 'map';

export type AppTabParams = {
  category?: string;
  topLevel?: string;
  name?: string;
  centerId?: string;

  // Centers list state
  sort?: string;
  search?: string;
};

type TabParams = Record<AppTabKey, AppTabParams>;

type AppTabNavigationContextValue = {
  currentTab: AppTabKey;
  currentTabParams: AppTabParams;
  tabParams: TabParams;
  navigateToTab: (tab: AppTabKey, params?: AppTabParams) => void;
  resetTabParams: (tab: AppTabKey) => void;
  savedCenterIds: Set<string>;
  toggleSavedCenter: (id: string) => void;
};

const AppTabNavigationContext =
  createContext<AppTabNavigationContextValue | null>(null);

export function AppTabNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [currentTab, setCurrentTab] = useState<AppTabKey>('index');

  // Keep the state of every tab independently.
  const [tabParams, setTabParams] = useState<TabParams>({
    index: {},
    centers: {},
    map: {},
  });
  const [savedCenterIds, setSavedCenterIds] =
    useState<Set<string>>(new Set());

  const navigateToTab = useCallback(
    (tab: AppTabKey, params?: AppTabParams) => {
      setCurrentTab(tab);

      setTabParams((previous) => {
        if (params === undefined) {
          // Centers keeps its existing filters when no params are passed
          // (e.g. switching tabs via swipe or the tab bar). All other tabs
          // reset to default, as before.
          if (tab === 'centers') {
            return previous;
          }

          return {
            ...previous,
            [tab]: {},
          };
        }

        return {
          ...previous,
          [tab]: {
            ...previous[tab],
            ...params,
          },
        };
      });
    },
    [],
  );

  // Explicit reset, independent of navigateToTab's merge-vs-preserve logic.
  // Use this whenever you actually want to clear a tab's params (e.g. the
  // "X" button on an active filter), rather than relying on navigateToTab
  // with no params.
  const resetTabParams = useCallback((tab: AppTabKey) => {
    setTabParams((previous) => ({
      ...previous,
      [tab]: {},
    }));
  }, []);

  const toggleSavedCenter = useCallback((id: string) => {
    setSavedCenterIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const currentTabParams = tabParams[currentTab];

  const value = useMemo(
    () => ({
      currentTab,
      currentTabParams,
      tabParams,
      navigateToTab,
      resetTabParams,
      savedCenterIds,
      toggleSavedCenter,
    }),
    [
      currentTab,
      currentTabParams,
      tabParams,
      navigateToTab,
      resetTabParams,
      savedCenterIds,
      toggleSavedCenter,
    ],
  );

  return (
    <AppTabNavigationContext.Provider value={value}>
      {children}
    </AppTabNavigationContext.Provider>
  );
}

export function useAppTabNavigation() {
  const context = useContext(AppTabNavigationContext);

  if (!context) {
    throw new Error(
      'useAppTabNavigation must be used within AppTabNavigationProvider',
    );
  }

  return context;
}