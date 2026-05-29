import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import {
  AccountListScreen,
  type AccountListItem,
} from '@/components/account/account-list-screen';

export default function DocumentsScreen() {
  const router = useRouter();

  const items = useMemo<readonly AccountListItem[]>(
    () => [
      {
        id: 'account-statements',
        label: 'Account statements',
        // TODO: route to account statements list when available.
        onPress: undefined,
      },
      {
        id: 'tax-forms',
        label: 'Tax forms',
        // TODO: route to tax forms list when available.
        onPress: undefined,
      },
      {
        id: 'legal-documents',
        label: 'Legal documents',
        onPress: () => router.push('/account/legal-documents' as never),
      },
    ],
    [router],
  );

  return <AccountListScreen title="Documents" items={items} />;
}
