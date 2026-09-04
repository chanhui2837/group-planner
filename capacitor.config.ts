import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.familyplanner.app',
  appName: 'Family Planner',
  webDir: 'public',
  server: {
    url: 'https://group-planner-2ul2.onrender.com',
    cleartext: false,
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#FF6B6B'
    }
  }
};

export default config;
