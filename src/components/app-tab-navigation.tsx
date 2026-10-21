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

  sort?: string;
  search?: string;
};

type TabParams = Record<AppTabKey, AppTabParams>;

type TabNavigationOptions = {
  animated?: boolean;
};

type AppTabNavigationContextValue = {
  currentTab: AppTabKey;
  currentTabParams: AppTabParams;
  tabParams: TabParams;
  animateTabChange: boolean;
  navigateToTab: (
    tab: AppTabKey,
    params?: AppTabParams,
    options?: TabNavigationOptions,
  ) => void;
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
  const [animateTabChange, setAnimateTabChange] = useState(true);

  const [tabParams, setTabParams] = useState<TabParams>({
    index: {},
    centers: {},
    map: {},
  });
  const [savedCenterIds, setSavedCenterIds] =
    useState<Set<string>>(new Set());

  const navigateToTab = useCallback(
    (
      tab: AppTabKey,
      params?: AppTabParams,
      options?: TabNavigationOptions,
    ) => {
      setCurrentTab(tab);
      setAnimateTabChange(options?.animated ?? true);

      setTabParams((previous) => {
        if (params === undefined) {
          // Preserve center filters when switching tabs.
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
      animateTabChange,
      navigateToTab,
      resetTabParams,
      savedCenterIds,
      toggleSavedCenter,
    }),
    [
      currentTab,
      currentTabParams,
      tabParams,
      animateTabChange,
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