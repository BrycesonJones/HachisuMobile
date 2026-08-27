// Polyfill the WHATWG URL API before anything else. Hermes ships only a partial
// URL implementation, and @supabase/functions-js builds request URLs with
// `new URL(...)` — without this, every supabase.functions.invoke() throws
// "Failed to send a request to the Edge Function" even though the REST client
// (which concatenates URLs) works fine.
import 'react-native-url-polyfill/auto';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ActiveStoreProvider } from '@/contexts/active-store-context';
import { AuthProvider } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ActiveStoreProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="transaction-details"
              options={{
                presentation: 'fullScreenModal',
                headerShown: false,
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="activity-details"
              options={{
                presentation: 'fullScreenModal',
                headerShown: false,
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="account"
              options={{
                // Standard push (slide-from-right) rather than a fullScreenModal:
                // iOS reports a 0 top safe-area inset inside a fullScreenModal,
                // which pushes screen headers under the status bar / Dynamic Island
                // and makes their back buttons untappable. A push also restores the
                // native swipe-back gesture.
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="payments"
              options={{
                // Match the account stack: a standard slide-from-right push so the
                // placeholder screens get correct top safe-area insets and the
                // native swipe-back gesture.
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="wallet"
              options={{
                // Match the account/payments stacks: a standard slide-from-right
                // push so the send screens get correct top safe-area insets and
                // the native swipe-back gesture.
                headerShown: false,
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </ActiveStoreProvider>
    </AuthProvider>
  );
}
