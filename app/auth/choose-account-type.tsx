import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/auth/back-button';
import { ScreenContainer } from '@/components/auth/screen-container';
import { COLORS } from '@/constants/colors';
import { clearOnboardingDraft } from '@/lib/auth/onboarding-draft';

interface AccountTypeCardProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}

function AccountTypeCard({ icon, title, description, onPress }: AccountTypeCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View style={styles.iconTile}>
        <MaterialIcons name={icon} size={28} color={COLORS.background} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
    </Pressable>
  );
}

export default function ChooseAccountTypeScreen() {
  const router = useRouter();

  // Starting a sign-up flow discards answers left over from an abandoned one.
  function startFlow(pathname: '/auth/personal-email' | '/auth/choose-username') {
    clearOnboardingDraft();
    router.push(pathname);
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <BackButton />
      </View>

      <View style={styles.titleArea}>
        <Text style={styles.title}>Choose an account type</Text>
        <Text style={styles.subtitle}>Who are you creating an account for?</Text>
      </View>

      <View style={styles.cards}>
        <AccountTypeCard
          icon="person"
          title="Personal account"
          description="For yourself"
          onPress={() => startFlow('/auth/personal-email')}
        />
        <AccountTypeCard
          icon="business"
          title="Business account"
          description="For your registered business"
          onPress={() => startFlow('/auth/choose-username')}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  titleArea: {
    gap: 12,
    marginBottom: 32,
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
  cards: {
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 16,
    padding: 20,
  },
  pressed: {
    opacity: 0.8,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: COLORS.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  cardDescription: {
    fontSize: 14,
    color: COLORS.secondaryText,
  },
});
