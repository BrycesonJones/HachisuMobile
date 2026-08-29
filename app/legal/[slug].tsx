import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalDocumentView } from '@/components/legal/legal-document-view';
import { COLORS } from '@/constants/colors';
import { legalDocumentBySlug } from '@/constants/legal';
import { LEGAL_CONTENT } from '@/constants/legal-content.generated';

/**
 * Read-only legal document route (/legal/terms-of-service, /legal/e-sign-consent,
 * /legal/privacy-notice). Lives outside the auth and account groups so the
 * documents are readable both before sign-up and from Account → Documents.
 */
export default function LegalDocumentScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const doc = legalDocumentBySlug(typeof slug === 'string' ? slug : undefined);
  const blocks = doc ? LEGAL_CONTENT[doc.slug] : undefined;

  if (!doc || !blocks) {
    return (
      <SafeAreaView style={styles.missingContainer}>
        <View style={styles.missingContent}>
          <Text style={styles.missingText}>This document is not available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return <LegalDocumentView title={doc.title} blocks={blocks} onBack={() => router.back()} />;
}

const styles = StyleSheet.create({
  missingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  missingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingText: {
    fontSize: 15,
    color: COLORS.secondaryText,
  },
});
