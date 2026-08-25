import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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

import { CloseFlowButton } from '@/components/account/close-flow-button';
import { BackButton } from '@/components/auth/back-button';
import { COLORS } from '@/constants/colors';
import {
  previewOnchainWallet,
  previewOnchainWalletReplacement,
} from '@/lib/btcpay/onchain-wallet';

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
  const router = useRouter();
  const { storeId, storeName, mode } = useLocalSearchParams<{
    storeId?: string;
    storeName?: string;
    mode?: string;
  }>();

  const [xpub, setXpub] = useState('');
  const [showMultisig, setShowMultisig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Explicit, validated mode. Only 'connect' and 'replace' are valid; anything
  // else (e.g. a tampered route param) fails safely rather than guessing.
  const isReplace = mode === 'replace';
  const modeValid = mode == null || mode === 'connect' || mode === 'replace';

  const trimmed = xpub.trim();
  // Minimal "valid-looking" gate — BTCPay is the real validator. Accept an
  // output descriptor ("(" anywhere) OR any extended-key token: single-sig &
  // multisig, mainnet & testnet (x/y/z/t/u/v-pub incl. capital Ypub/Zpub…),
  // including suffixed (xpub-[p2sh]), N-of-… multisig, and key-origin forms.
  const looksValid =
    trimmed.includes('(') || /[xyztuv]pub[1-9A-HJ-NP-Za-km-z]{20,}/i.test(trimmed);
  const canContinue = !loading && looksValid;

  async function handleContinue() {
    if (!canContinue || !storeId) return;
    if (!modeValid) {
      setError('This screen was opened incorrectly. Please go back and try again.');
      return;
    }
    setLoading(true);
    setError(null);

    const result = isReplace
      ? await previewOnchainWalletReplacement({
          merchantStoreId: storeId,
          extendedPublicKey: trimmed,
        })
      : await previewOnchainWallet({
          merchantStoreId: storeId,
          extendedPublicKey: trimmed,
        });

    setLoading(false);

    if (!result.ok) {
      // Connect refused because the store already has a wallet (stale UI / route /
      // direct call). Send the merchant to settings to use the replacement flow.
      if (!isReplace && result.code === 'WALLET_ALREADY_CONNECTED') {
        router.replace({
          pathname: '/account/btc-wallet-settings',
          params: { storeId, storeName: storeName ?? '' },
        });
        return;
      }
      setError(result.error ?? 'Could not read that key. Please check it and try again.');
      return;
    }

    router.push({
      pathname: '/account/confirm-addresses',
      params: {
        storeId,
        storeName: storeName ?? '',
        mode: isReplace ? 'replace' : 'connect',
        extendedPublicKey: trimmed,
        addressType: result.addressType ?? '',
        addresses: JSON.stringify(result.addresses),
        // Only replacement carries a server-issued, single-use preview token.
        previewVerificationId: isReplace
          ? ((result as { previewVerificationId?: string }).previewVerificationId ?? '')
          : '',
      },
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <BackButton />
        <CloseFlowButton />
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

          {storeName ? (
            <Text style={styles.storeContext}>
              {isReplace ? 'Replacing wallet for ' : 'Connecting wallet for '}
              <Text style={styles.storeContextName}>{storeName}</Text>
            </Text>
          ) : null}

          <Text style={styles.label}>Extended public key or descriptor</Text>
          <TextInput
            value={xpub}
            onChangeText={(text) => {
              setXpub(text);
              if (error) setError(null);
            }}
            editable={!loading}
            style={styles.input}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.background} size="small" />
                <Text style={styles.continueText}>Checking…</Text>
              </View>
            ) : (
              <Text style={styles.continueText}>Continue</Text>
            )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  storeContext: {
    marginBottom: 16,
    fontSize: 14,
    color: COLORS.secondaryText,
  },
  storeContextName: {
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginBottom: 8,
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    color: '#F87171',
    lineHeight: 18,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
