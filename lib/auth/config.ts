export const isAuthDevBypassEnabled =
  __DEV__ &&
  (process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true' ||
    process.env.EXPO_PUBLIC_AUTH_DEV_BYPASS === 'true');

export const isProfileDebugEnabled =
  __DEV__ && process.env.EXPO_PUBLIC_PROFILE_DEBUG === 'true';
