import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScrollView, StatusBar, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/colors';
import type { LegalBlock } from '@/constants/legal-content.generated';

interface LegalDocumentViewProps {
  title: string;
  blocks: readonly LegalBlock[];
  onBack: () => void;
}

/**
 * Read-only legal document screen: scrollable generated content (from
 * docs/legal via `npm run generate:legal`) with the Account area's header
 * styling. No editing controls by design.
 */
export function LegalDocumentView({ title, blocks, onBack }: LegalDocumentViewProps) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}>
        {blocks.map((block, index) => (
          <LegalBlockText key={index} block={block} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function LegalBlockText({ block }: { block: LegalBlock }) {
  const segments = block.segments.map((segment, index) => (
    <Text key={index} style={segment.bold ? styles.bold : undefined}>
      {segment.text}
    </Text>
  ));

  switch (block.type) {
    case 'title':
      return <Text style={styles.documentTitle}>{segments}</Text>;
    case 'heading':
      return <Text style={styles.sectionHeading}>{segments}</Text>;
    case 'listItem':
      return (
        <View style={styles.listItemRow}>
          <Text style={styles.listBullet}>{'•'}</Text>
          <Text style={styles.listItemText}>{segments}</Text>
        </View>
      );
    case 'paragraph':
    default:
      return <Text style={styles.paragraph}>{segments}</Text>;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  pressed: {
    opacity: 0.7,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  documentTitle: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    color: COLORS.primaryText,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    color: COLORS.primaryText,
    marginTop: 24,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
    marginTop: 10,
  },
  listItemRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingLeft: 4,
    gap: 10,
  },
  listBullet: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
  },
  listItemText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.secondaryText,
  },
  bold: {
    fontWeight: '600',
    color: COLORS.primaryText,
  },
});
