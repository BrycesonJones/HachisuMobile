import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/auth/back-button';
import { COLORS } from '@/constants/colors';

interface AccountPlaceholderScreenProps {
  title: string;
  description?: string;
}

// TODO: replace this placeholder with the real screen content for each account section.
export function AccountPlaceholderScreen({
  title,
  description = 'Coming soon.',
}: AccountPlaceholderScreenProps) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <BackButton />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 20,
  },
  headerRow: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  description: {
    marginTop: 8,
    fontSize: 15,
    color: COLORS.secondaryText,
  },
});
