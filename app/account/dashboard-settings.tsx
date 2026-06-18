import { useMemo } from 'react';

import {
  AccountListScreen,
  type AccountListItem,
} from '@/components/account/account-list-screen';

// Dashboard / store-scoped settings. Distinct from the Profile Hub, which stays
// account/profile focused. Rows are placeholders until each option ships.
export default function DashboardSettingsScreen() {
  const items = useMemo<readonly AccountListItem[]>(
    () => [
      { id: 'display-currency', label: 'Display currency', onPress: undefined },
      { id: 'bitcoin-unit', label: 'Bitcoin unit display', onPress: undefined },
      { id: 'theme', label: 'Theme & display', onPress: undefined },
      {
        id: 'payment-notifications',
        label: 'Payment notifications',
        onPress: undefined,
      },
      { id: 'store-preferences', label: 'Store dashboard preferences', onPress: undefined },
    ],
    [],
  );

  return <AccountListScreen title="Settings" items={items} />;
}
