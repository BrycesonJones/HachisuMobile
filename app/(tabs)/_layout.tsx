import { Tabs } from 'expo-router';
import React from 'react';

import { DashboardSegmentedToggle } from '@/components/dashboard/dashboard-segmented-toggle';
import {
  DashboardTabProvider,
  useDashboardTab,
} from '@/components/dashboard/dashboard-tab-context';

function DashboardTabBar() {
  const { activeTab, setActiveTab } = useDashboardTab();
  return <DashboardSegmentedToggle activeTab={activeTab} onChange={setActiveTab} />;
}

export default function TabLayout() {
  return (
    <DashboardTabProvider>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={() => <DashboardTabBar />}>
        <Tabs.Screen name="home" options={{ title: 'Activity' }} />
      </Tabs>
    </DashboardTabProvider>
  );
}
