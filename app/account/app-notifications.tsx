import { useMemo } from 'react';

import {
  SwitchSettingsScreen,
  type SwitchSettingsSection,
} from '@/components/account/switch-settings-screen';
import { useNotificationPreferences } from '@/hooks/use-notification-preferences';

export default function AppNotificationsScreen() {
  const { preferences, loaded, setPreference } = useNotificationPreferences();

  const sections = useMemo<readonly SwitchSettingsSection[]>(
    () => [
      {
        id: 'payments',
        title: 'Payments',
        rows: [
          {
            id: 'payments',
            label: 'Payments',
            subtitle: 'Get notified when a payment is received',
            value: preferences.payments,
            onValueChange: (value) => setPreference('payments', value),
            disabled: !loaded,
          },
          {
            id: 'invoices',
            label: 'Invoices',
            subtitle: 'Get notified when an invoice changes status',
            value: preferences.invoices,
            onValueChange: (value) => setPreference('invoices', value),
            disabled: !loaded,
          },
          {
            id: 'payment-requests',
            label: 'Payment requests',
            subtitle: 'Get notified about payment request activity',
            value: preferences.paymentRequests,
            onValueChange: (value) => setPreference('paymentRequests', value),
            disabled: !loaded,
          },
        ],
      },
    ],
    [preferences, loaded, setPreference],
  );

  return <SwitchSettingsScreen title="App Notifications" sections={sections} />;
}
