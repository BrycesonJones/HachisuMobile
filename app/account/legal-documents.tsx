import { useMemo } from 'react';

import {
  AccountListScreen,
  type AccountListItem,
} from '@/components/account/account-list-screen';

export default function LegalDocumentsScreen() {
  const items = useMemo<readonly AccountListItem[]>(
    () => [
      {
        id: 'privacy-notice',
        label: 'Privacy Notice',
        // TODO: open hosted Privacy Notice document (Linking.openURL or in-app web view).
        onPress: undefined,
      },
      {
        id: 'e-sign-consent',
        label: 'E-Sign Consent',
        // TODO: open hosted E-Sign Consent document.
        onPress: undefined,
      },
      {
        id: 'terms-of-service',
        label: 'Terms of Service',
        // TODO: open hosted Terms of Service document.
        onPress: undefined,
      },
    ],
    [],
  );

  return <AccountListScreen title="Legal documents" items={items} />;
}
