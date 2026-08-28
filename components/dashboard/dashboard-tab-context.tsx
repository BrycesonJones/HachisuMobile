import { createContext, type ReactNode, useContext, useState } from 'react';

import type { DashboardTab } from '@/components/dashboard/dashboard-segmented-toggle';

interface DashboardTabContextValue {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
}

const DashboardTabContext = createContext<DashboardTabContextValue | null>(null);

export function DashboardTabProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('bitcoin');

  return (
    <DashboardTabContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </DashboardTabContext.Provider>
  );
}

export function useDashboardTab() {
  const context = useContext(DashboardTabContext);
  if (!context) {
    throw new Error('useDashboardTab must be used within a DashboardTabProvider');
  }
  return context;
}
