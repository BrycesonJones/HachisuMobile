import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DASHBOARD_COLORS } from '@/constants/dashboard-colors';

export type DashboardTab = 'bitcoin' | 'activity';

interface TabConfig {
  key: DashboardTab;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const TABS: TabConfig[] = [
  { key: 'bitcoin', label: 'Bitcoin', icon: 'currency-bitcoin' },
  { key: 'activity', label: 'Activity', icon: 'schedule' },
];

const CONTAINER_PADDING = 6;

interface DashboardSegmentedToggleProps {
  activeTab: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}

export function DashboardSegmentedToggle({
  activeTab,
  onChange,
}: DashboardSegmentedToggleProps) {
  const insets = useSafeAreaInsets();
  const [segmentWidth, setSegmentWidth] = useState(0);
  const activeIndex = TABS.findIndex((tab) => tab.key === activeTab);
  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withTiming(activeIndex * segmentWidth, { duration: 220 });
  }, [activeIndex, segmentWidth, translateX]);

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  function handleLayout(event: LayoutChangeEvent) {
    const innerWidth = event.nativeEvent.layout.width - CONTAINER_PADDING * 2;
    setSegmentWidth(innerWidth / TABS.length);
  }

  function handlePress(tab: DashboardTab) {
    if (tab !== activeTab && Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onChange(tab);
  }

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
      ]}>
      <View style={styles.container} onLayout={handleLayout}>
        {segmentWidth > 0 ? (
          <Animated.View
            style={[styles.highlight, { width: segmentWidth }, highlightStyle]}
          />
        ) : null}

        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const color = isActive
            ? DASHBOARD_COLORS.primaryText
            : DASHBOARD_COLORS.secondaryText;

          return (
            <Pressable
              key={tab.key}
              style={styles.segment}
              onPress={() => handlePress(tab.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} view`}>
              <MaterialIcons name={tab.icon} size={20} color={color} />
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingTop: 10,
    backgroundColor: DASHBOARD_COLORS.background,
  },
  container: {
    flexDirection: 'row',
    padding: CONTAINER_PADDING,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 30, 30, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  highlight: {
    position: 'absolute',
    top: CONTAINER_PADDING,
    bottom: CONTAINER_PADDING,
    left: CONTAINER_PADDING,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
});
