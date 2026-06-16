import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/auth/back-button';
import { COLORS } from '@/constants/colors';

export default function ImportCoreDescriptorScreen() {
  const [walletName, setWalletName] = useState('lightning');
  const [descriptor, setDescriptor] = useState('');

  const canImport = walletName.trim().length > 0 && descriptor.trim().length > 0;

  function handleImport() {
    if (!canImport) return;
    // TODO: import the read-only wallet from the core descriptor.
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <BackButton />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Import Readonly L-BTC Wallet</Text>

          <Text style={styles.label}>Wallet Name</Text>
          <TextInput
            value={walletName}
            onChangeText={setWalletName}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={styles.label}>Core descriptor</Text>
          <TextInput
            value={descriptor}
            onChangeText={setDescriptor}
            style={styles.textArea}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
          />

          <Pressable
            onPress={handleImport}
            disabled={!canImport}
            style={({ pressed }) => [
              styles.importButton,
              !canImport && styles.importButtonDisabled,
              pressed && canImport && styles.importButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Import">
            <Text style={styles.importText}>Import</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginTop: 18,
    marginBottom: 8,
  },
  input: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    color: COLORS.primaryText,
    fontSize: 16,
  },
  textArea: {
    minHeight: 96,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.cardAlt,
    color: COLORS.primaryText,
    fontSize: 16,
  },
  importButton: {
    marginTop: 28,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButtonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  importButtonPressed: {
    opacity: 0.85,
  },
  importText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
});
