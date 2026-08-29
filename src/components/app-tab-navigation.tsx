
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
  navigateToTab: (tab: AppTabKey, params?: AppTabParams) => void;
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

  const navigateToTab = useCallback(
    (tab: AppTabKey, params?: AppTabParams) => {
      setCurrentTab(tab);

      setTabParams((previous) => ({
        ...previous,
        [tab]: params === undefined ? {} : {
          ...previous[tab],
          ...params,
        },
      }));
    },
    [],
  );

  const currentTabParams = tabParams[currentTab];

  const value = useMemo(
    () => ({
      currentTab,
      currentTabParams,
      navigateToTab,
    }),
    [currentTab, currentTabParams, navigateToTab],
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

