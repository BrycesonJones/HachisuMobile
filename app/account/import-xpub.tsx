import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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

interface AddressType {
  type: string;
  examples: string[];
}

const ADDRESS_TYPES: AddressType[] = [
  { type: 'P2WPKH', examples: ['xpub…', 'zpub…', "wpkh([…/84'/0'/0']xpub…/**)"] },
  {
    type: 'P2SH-P2WPKH',
    examples: ['xpub…-[p2sh]', 'ypub…', "sh(wpkh([89abcdef/49'/0'/0']xpub…/**))"],
  },
  { type: 'P2PKH', examples: ['xpub…-[legacy]', "pkh([89abcdef/44'/0'/0']xpub…/**)"] },
  { type: 'P2TR', examples: ['xpub…-[taproot]'] },
];

const MULTISIG_TYPES: AddressType[] = [
  {
    type: 'Multi-sig P2WSH',
    examples: [
      '2-of-xpub1…-xpub2…',
      "wsh(multi(2,[89abcdef/48'/0'/0'/2']xpub…/**,[89abcdef/48'/0'/0'/2']xpub…/**))",
    ],
  },
  {
    type: 'Multi-sig P2SH-P2WSH',
    examples: [
      '2-of-xpub1…-xpub2…-[p2sh]',
      "sh(wsh(multi(2,[89abcdef/48'/0'/0'/1']xpub…/**,[89abcdef/48'/0'/0'/1']xpub…/**)))",
    ],
  },
  {
    type: 'Multi-sig P2SH',
    examples: [
      '2-of-xpub1…-xpub2…-[legacy]',
      "sh(multi(2,[89abcdef/45'/0]xpub…/**,[89abcdef/45'/0]xpub…/**))",
    ],
  },
];

export default function ImportXpubScreen() {
  const [xpub, setXpub] = useState('');
  const [showMultisig, setShowMultisig] = useState(false);

  const canContinue = xpub.trim().length > 0;

  function handleContinue() {
    if (!canContinue) return;
    // TODO: validate the derivation scheme and proceed to the next step.
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
          <Text style={styles.title}>Enter your extended public key</Text>
          <Text style={styles.subtitle}>
            This key, also called &quot;xpub&quot;, is used to generate individual destination
            addresses for your invoices.{' '}
            <MaterialIcons name="info-outline" size={14} color={COLORS.secondaryText} />
          </Text>

          <Text style={styles.label}>Extended public key</Text>
          <TextInput
            value={xpub}
            onChangeText={setXpub}
            style={styles.input}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
          />

          <Pressable
            onPress={handleContinue}
            disabled={!canContinue}
            style={({ pressed }) => [
              styles.continueButton,
              !canContinue && styles.continueButtonDisabled,
              pressed && canContinue && styles.continueButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Continue">
            <Text style={styles.continueText}>Continue</Text>
          </Pressable>

          <View style={styles.tableHeader}>
            <Text style={[styles.columnHeader, styles.typeColumn]}>Address type</Text>
            <Text style={[styles.columnHeader, styles.exampleColumn]}>Example</Text>
          </View>

          {ADDRESS_TYPES.map((row) => (
            <ExampleRow key={row.type} row={row} />
          ))}

          {showMultisig
            ? MULTISIG_TYPES.map((row) => <ExampleRow key={row.type} row={row} />)
            : null}

          <Pressable
            onPress={() => setShowMultisig((v) => !v)}
            style={({ pressed }) => [styles.toggleRow, pressed && styles.togglePressed]}
            accessibilityRole="button"
            accessibilityLabel={showMultisig ? 'Hide multi-sig examples' : 'Show multi-sig examples'}>
            <MaterialIcons
              name={showMultisig ? 'expand-less' : 'expand-more'}
              size={20}
              color={COLORS.primary}
            />
            <Text style={styles.toggleText}>
              {showMultisig ? 'Hide multi-sig examples' : 'Show multi-sig examples'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ExampleRow({ row }: { row: AddressType }) {
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.typeText, styles.typeColumn]}>{row.type}</Text>
      <View style={styles.exampleColumn}>
        {row.examples.map((example, index) => (
          <Text key={index} style={styles.exampleText}>
            {example}
          </Text>
        ))}
      </View>
    </View>
  );
}

const MONOSPACE = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

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
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 24,
    fontSize: 15,
    color: COLORS.secondaryText,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 8,
  },
  input: {
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
  continueButton: {
    marginTop: 20,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  continueButtonPressed: {
    opacity: 0.85,
  },
  continueText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.background,
  },
  tableHeader: {
    flexDirection: 'row',
    marginTop: 36,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.cardBorder,
  },
  columnHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.cardBorder,
  },
  typeColumn: {
    width: 130,
    paddingRight: 12,
  },
  exampleColumn: {
    flex: 1,
  },
  typeText: {
    fontSize: 14,
    color: COLORS.primaryText,
  },
  exampleText: {
    fontFamily: MONOSPACE,
    fontSize: 13,
    color: COLORS.primaryText,
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  togglePressed: {
    opacity: 0.6,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
