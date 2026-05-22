import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

interface AuthTitleBlockProps {
  title: string;
  subtitle: string;
  centered?: boolean;
}

export function AuthTitleBlock({ title, subtitle, centered = false }: AuthTitleBlockProps) {
  return (
    <View style={[styles.container, centered && styles.centered]}>
      <Text style={[styles.title, centered && styles.centeredText]}>{title}</Text>
      <Text style={[styles.subtitle, centered && styles.centeredText]}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginBottom: 32,
  },
  centered: {
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.primaryText,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.secondaryText,
  },
  centeredText: {
    textAlign: 'center',
  },
});
