import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTabNavigation, type AppTabKey } from './app-tab-navigation';
import CentersList from '../app/(tabs)/centers';
import Home from '../app/(tabs)/index';
import MapScreen from '../app/(tabs)/map';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: {
  key: AppTabKey;
  label: string;
  icon: IconName;
  iconFocused: IconName;
  Component: React.ComponentType<any>;
}[] = [
  { key: 'index', label: 'Donate', icon: 'home-outline', iconFocused: 'home', Component: Home },
  { key: 'centers', label: 'Centers', icon: 'location-outline', iconFocused: 'location', Component: CentersList },
  { key: 'map', label: 'Map', icon: 'map-outline', iconFocused: 'map', Component: MapScreen },
];

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { currentTab, tabParams, navigateToTab } = useAppTabNavigation();

  const goToPage = useCallback((index: number) => {
    pagerRef.current?.setPage(index);
  }, []);

  useEffect(() => {
    const nextIndex = TABS.findIndex((tab) => tab.key === currentTab);

    if (nextIndex >= 0 && nextIndex !== activeIndex) {
      pagerRef.current?.setPage(nextIndex);
    }
  }, [activeIndex, currentTab]);

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(e) => {
          setActiveIndex(e.nativeEvent.position);
          const selectedTab = TABS[e.nativeEvent.position];

          if (selectedTab) {
            navigateToTab(selectedTab.key);
          }
        }}
      >
        {TABS.map(({ key, Component }, index) => {
          const TabComponent = Component as any;

          // Each page always gets its own tab's params directly, regardless
          // of which tab is currently "active" — so the page shows the
          // right content immediately on swipe, without waiting for
          // onPageSelected to update currentTab.
          return (
            <View key={key} style={styles.page}>
              <TabComponent
                tabParams={tabParams[key]}
                isActive={activeIndex === index}
              />
            </View>
          );
        })}
      </PagerView>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {TABS.map(({ key, label, icon, iconFocused }, index) => {
          const focused = activeIndex === index;
          return (
            <Pressable
              key={key}
              onPress={() => {
                navigateToTab(key);
                goToPage(index);
              }}
              style={styles.tab}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <Ionicons
                name={focused ? iconFocused : icon}
                size={23}
                color={focused ? Colors.primary : Colors.textMuted}
              />
              <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pager: { flex: 1 },
  page: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '500', color: Colors.textMuted, marginTop: 6 },
  labelFocused: { fontWeight: '600', color: Colors.primary },
});