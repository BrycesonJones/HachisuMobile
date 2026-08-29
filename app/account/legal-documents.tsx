import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import {
  AccountListScreen,
  type AccountListItem,
} from '@/components/account/account-list-screen';
import { LEGAL_DOCUMENTS } from '@/constants/legal';

export default function LegalDocumentsScreen() {
  const router = useRouter();

  const items = useMemo<readonly AccountListItem[]>(
    () =>
      LEGAL_DOCUMENTS.map((doc) => ({
        id: doc.slug,
        label: doc.title,
        onPress: () => router.push({ pathname: '/legal/[slug]', params: { slug: doc.slug } }),
      })),
    [router],
  );

  return <AccountListScreen title="Legal documents" items={items} />;
}
