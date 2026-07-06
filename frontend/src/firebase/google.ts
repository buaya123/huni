import { GoogleSignin } from "@react-native-google-signin/google-signin";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID!,
});